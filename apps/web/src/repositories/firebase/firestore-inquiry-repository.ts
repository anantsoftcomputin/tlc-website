import { createHash } from "node:crypto";
import { mergeHouseholdProfile } from "@/lib/travel/household-merge";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase/admin";
import type { InquiryRepository } from "@/repositories/interfaces/inquiry-repository";

const ORG_ID = process.env.TLC_ORG_ID || "tlc-vacations";

function stableIndex(value: string, length: number) {
  const hash = [...value].reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    7,
  );
  return length ? hash % length : 0;
}

function profileCompleteness(
  input: NonNullable<
    Parameters<InquiryRepository["create"]>[0]["intelligence"]
  >,
) {
  const checks = [
    input.trip.originCity,
    input.trip.destinations.length,
    input.trip.startDate || input.trip.nights,
    input.trip.budgetMax,
    input.travellers.length,
    input.travellers.some((traveller) => traveller.ageBand !== "not_shared"),
    input.travellers.some(
      (traveller) =>
        traveller.interests.length || traveller.foodPreferences.length,
    ),
    input.travellers.some(
      (traveller) => traveller.flight.seat !== "no_preference",
    ),
    input.sharedPreferences.holidayStyles.length,
    input.sharedPreferences.stay.amenities.length ||
      input.sharedPreferences.stay.categories.length,
    input.sharedPreferences.flight.preferredAirlines.length ||
      input.sharedPreferences.flight.routing !== "flexible",
    input.sharedPreferences.mustHaves.length ||
      input.sharedPreferences.avoid.length,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

async function resolveWebsiteAssignee(key: string, destination?: string) {
  const database = getAdminFirestore();
  const org = (await database.collection("orgs").doc(ORG_ID).get()).data();
  const policy = org?.settings?.leadAssignment || {};
  const autoAssign = Boolean(org?.settings?.automation?.autoAssignLeads);
  const destinationOwner =
    destination &&
    (policy.destinationOwners?.[destination.toLowerCase()] ||
      policy.destinationOwners?.[destination]);
  const responseMinutes = Number(policy.firstResponseMinutes || 60);
  if (
    autoAssign &&
    policy.mode === "destination_specialist" &&
    destinationOwner
  )
    return { assignedUid: String(destinationOwner), responseMinutes };
  const eligible = Array.isArray(policy.eligibleUids)
    ? policy.eligibleUids.map(String).filter(Boolean)
    : [];
  if (autoAssign && policy.mode === "round_robin" && eligible.length)
    return {
      assignedUid: eligible[stableIndex(key, eligible.length)],
      responseMinutes,
    };
  if (policy.defaultUid)
    return { assignedUid: String(policy.defaultUid), responseMinutes };
  if (eligible.length)
    return {
      assignedUid: eligible[stableIndex(key, eligible.length)],
      responseMinutes,
    };

  const users = await database
    .collection("users")
    .where("orgId", "==", ORG_ID)
    .limit(50)
    .get();
  const team = users.docs
    .filter(
      (item) =>
        item.data().disabled !== true &&
        [
          "super_admin",
          "owner",
          "manager",
          "admin",
          "sales",
          "travel_consultant",
        ].includes(String(item.data().role)),
    )
    .map((item) => item.id)
    .sort();
  return {
    assignedUid: team[stableIndex(key, team.length)] || "unassigned",
    responseMinutes,
  };
}

export class FirestoreInquiryRepository implements InquiryRepository {
  async create(
    input: Parameters<InquiryRepository["create"]>[0],
    context: Parameters<InquiryRepository["create"]>[1],
  ) {
    const database = getAdminFirestore();
    const now = new Date().toISOString();
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const key = context.idempotencyKey || `${digest}:${Math.floor(Date.now()/600000)}`;
    const inquiryRef = database.collection("inquiries").doc(createHash("sha256").update(`${ORG_ID}:${key}`).digest("hex"));
    const leadRef = database
      .collection("leads")
      .doc(`inquiry-${inquiryRef.id}`);
    const phone = input.phone.replace(/[^+0-9]/g, "");
    const email = input.email?.toLowerCase() || "";
    const contactKey = createHash("sha256").update(`${ORG_ID}:${phone}:${email}`).digest("hex");
    const candidates = await database.collection("customers").where("orgId","==",ORG_ID).where("phones","array-contains-any",[...new Set([phone,input.phone])]).get();
    const match = candidates.docs.find(doc=>email && (doc.data().emails || []).map((value:string)=>value.toLowerCase()).includes(email));
    const customerRef = match?.ref || database.collection("customers").doc(`web-${contactKey}`);
    const activityRef = leadRef.collection("activities").doc();
    const auditRef = database.collection("auditLogs").doc();
    const brief = context.vacation?.shortlist.brief;
    // The saved search is authoritative; hidden form defaults must not replace it.
    const intelligence = input.intelligence && brief ? {
      ...input.intelligence,
      trip: {
        ...input.intelligence.trip,
        destinations: [brief.destinationSlug], destinationScope: "specific" as const,
        startDate: brief.checkIn, endDate: brief.checkOut, flexibleDays: 0,
        nights: Math.round((Date.parse(brief.checkOut) - Date.parse(brief.checkIn)) / 86400000),
        adults: brief.rooms.reduce((sum, room) => sum + room.adults, 0),
        children: brief.rooms.flatMap(room => room.childrenAges).filter(age => age >= 2).length,
        infants: brief.rooms.flatMap(room => room.childrenAges).filter(age => age < 2).length,
        rooms: brief.rooms.length, includeFlights: Boolean(brief.flights),
        originAirports: brief.flights ? [brief.flights.origin] : [],
        ...(brief.budget ? { budgetMax: brief.budget } : {}), budgetScope: "total" as const,
      },
    } : input.intelligence;
    const destinationIds = context.vacation ? [context.vacation.shortlist.brief.destinationSlug] : intelligence?.trip.destinations.length
      ? intelligence.trip.destinations
      : input.destinationIds || [];
    const { assignedUid, responseMinutes } = await resolveWebsiteAssignee(
      inquiryRef.id,
      destinationIds[0],
    );
    const actor = "public-website";
    const householdRef = database.collection("households").doc(customerRef.id);
    const preferenceSignalRef = database
      .collection("preferenceSignals")
      .doc(inquiryRef.id);
    const customerEventRef = customerRef
      .collection("events")
      .doc(inquiryRef.id);
    const completeness = intelligence ? profileCompleteness(intelligence) : 0;

    let savedCustomerId = customerRef.id;
    await database.runTransaction(async (transaction) => {
      const [existing, customer, conversation, household] = await Promise.all([
        transaction.get(inquiryRef), transaction.get(customerRef), context.conversationId ? transaction.get(database.collection("conversations").doc(context.conversationId)) : Promise.resolve(null),
        intelligence?.permissions.saveProfile ? transaction.get(householdRef) : Promise.resolve(null),
      ]);
      if (existing.exists) {
        if (existing.data()?.requestDigest !== digest) throw new Error("This request has already been submitted with different details.");
        savedCustomerId = String(existing.data()?.customerId);
        return;
      }
      if (context.conversationId && (!conversation?.exists || conversation.data()?.orgId !== ORG_ID)) throw new Error("Conversation was not found.");
      transaction.create(inquiryRef, {
        ...(context.vacation ? { vacationShortlist: context.vacation.shortlist } : {}),
        requestDigest: digest, customerId: customerRef.id,
        id: inquiryRef.id,
        orgId: ORG_ID,
        source: input.source,
        customer: {
          fullName: input.fullName,
          phone: input.phone,
          ...(input.email ? { email: input.email.toLowerCase() } : {}),
          preferredContact: input.preferredContact,
        },
        ...(destinationIds.length ? { destinationIds } : {}),
        ...(input.interests?.length ? { interests: input.interests } : {}),
        ...(input.travelMonth
          ? { travelDates: { month: input.travelMonth, flexible: true } }
          : {}),
        ...(input.travellerType ? { travellerType: input.travellerType } : {}),
        ...(input.requirements ? { requirements: input.requirements } : {}),
        ...(intelligence
          ? { intelligence, profileCompleteness: completeness }
          : {}),
        ...(context.attribution && Object.keys(context.attribution).length
          ? { utm: context.attribution }
          : {}),
        status: "converted",
        assignedTo: assignedUid,
        leadId: leadRef.id,
        createdBy: actor,
        updatedBy: actor,
        userAgent: context.userAgent?.slice(0, 300) || null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!customer.exists) transaction.create(customerRef, {
        id: customerRef.id,
        orgId: ORG_ID,
        name: input.fullName,
        phones: [phone],
        emails: input.email ? [input.email.toLowerCase()] : [],
        tags: [
          input.source === "ai_concierge"
            ? "chatbot-inquiry"
            : "website-inquiry",
        ],
        consent: {
          whatsapp: intelligence?.permissions.marketingWhatsapp || false,
          email: intelligence?.permissions.marketingEmail || false,
          sms: false,
          timestamp: now,
          source: "website-inquiry",
        },
        source: input.source === "ai_concierge" ? "chatbot" : "website",
        ownerUid: assignedUid,
        modelTrainingAllowed: intelligence?.permissions.modelTraining === true,
        segments: [],
        lifecycleStage: "new",
        mergedFrom: [],
        lastActivityAt: now,
        ...(intelligence?.permissions.saveProfile
          ? {
              householdId: householdRef.id,
              declaredPreferences: intelligence.sharedPreferences,
              preferenceCompleteness: completeness,
            }
          : {}),
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
      if (customer.exists) transaction.update(customerRef, {lastActivityAt:now,updatedAt:now,updatedBy:actor});
      if (context.conversationId) transaction.set(database.collection("conversations").doc(context.conversationId), {customerId:customerRef.id,leadId:leadRef.id,inquiryId:inquiryRef.id,assignedUid,status:"human",handoverAt:now,updatedAt:now,updatedBy:actor},{merge:true});
      transaction.create(leadRef, {
        ...(context.vacation ? { vacationInventory: context.vacation.evidence } : {}),
        id: leadRef.id,
        orgId: ORG_ID,
        customerId: customerRef.id,
        title: `${destinationIds[0] || "Custom holiday"} — ${input.fullName}`,
        source: input.source === "ai_concierge" ? "chatbot" : "website",
        status: "new",
        priority: "normal",
        assignedUid,
        assignedTo: assignedUid,
        requirement: {
          destinations: destinationIds,
          ...(intelligence?.trip.startDate
            ? { startDate: intelligence.trip.startDate }
            : {}),
          ...(intelligence?.trip.endDate
            ? { endDate: intelligence.trip.endDate }
            : {}),
          flexible: Boolean(intelligence?.trip.flexibleDays ?? true),
          pax: intelligence
            ? {
                adults: intelligence.trip.adults,
                children: intelligence.trip.children,
                infants: intelligence.trip.infants,
              }
            : {
                adults: input.travellerType === "Solo" ? 1 : 2,
                children: 0,
                infants: 0,
              },
          ...(intelligence?.trip.budgetMin !== undefined
            ? { budgetMin: intelligence.trip.budgetMin }
            : {}),
          ...(intelligence?.trip.budgetMax !== undefined
            ? { budgetMax: intelligence.trip.budgetMax }
            : {}),
          preferences:
            intelligence?.sharedPreferences.holidayStyles ||
            input.interests ||
            [],
          notes: input.requirements || "",
          ...(intelligence
            ? {
                tripBrief: intelligence.trip,
                travellers: intelligence.travellers,
                sharedPreferences: intelligence.sharedPreferences,
              }
            : {}),
          ...(context.vacation ? {
            vacationShortlist: context.vacation.shortlist,
            startDate: context.vacation.shortlist.brief.checkIn,
            endDate: context.vacation.shortlist.brief.checkOut,
            flexible: false,
            pax: {
              adults: context.vacation.shortlist.brief.rooms.reduce((sum, room) => sum + room.adults, 0),
              children: context.vacation.shortlist.brief.rooms.flatMap((room) => room.childrenAges).filter((age) => age >= 2).length,
              infants: context.vacation.shortlist.brief.rooms.flatMap((room) => room.childrenAges).filter((age) => age < 2).length,
            },
            ...(context.vacation.shortlist.brief.budget ? { budgetMax: context.vacation.shortlist.brief.budget } : {}),
            preferences: context.vacation.shortlist.brief.interests,
          } : {}),
        },
        valueEstimate: 0,
        expectedMargin: 0,
        sla: {
          firstResponseDueAt: new Date(
            Date.now() + responseMinutes * 60_000,
          ).toISOString(),
        },
        ageDays: 0,
        flags: [],
        inquiryId: inquiryRef.id,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
      transaction.create(activityRef, {
        id: activityRef.id,
        orgId: ORG_ID,
        leadId: leadRef.id,
        type: "note",
        body: `Lead automatically captured from the ${input.source === "ai_concierge" ? "TLC AI concierge" : `${input.source} website form`}.`,
        by: actor,
        ts: now,
        attachments: [],
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
      if (intelligence) {
        transaction.create(customerEventRef, {
          id: customerEventRef.id,
          orgId: ORG_ID,
          type: "preferenceDeclared",
          payload: {
            schemaVersion: intelligence.schemaVersion,
            trip: intelligence.trip,
            sharedPreferences: intelligence.sharedPreferences,
            travellers: intelligence.travellers,
            permissions: intelligence.permissions,
            inquiryId: inquiryRef.id,
          },
          channel: "website",
          ts: now,
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
        });
      }
      if (intelligence?.permissions.saveProfile) {
        // Repeat enquiries enrich the stored household instead of replacing it.
        const stored = household?.exists && household.data()?.orgId === ORG_ID ? household.data() : undefined;
        const merged = mergeHouseholdProfile(stored as Parameters<typeof mergeHouseholdProfile>[0], {
          homeCity: intelligence.trip.originCity,
          travellers: intelligence.travellers,
          sharedPreferences: intelligence.sharedPreferences as Record<string, unknown>,
        });
        const mergedCompleteness = Math.max(
          Number(stored?.completeness || 0),
          profileCompleteness({ ...intelligence, travellers: merged.travellers, sharedPreferences: merged.sharedPreferences as typeof intelligence.sharedPreferences }),
        );
        transaction.set(householdRef, {
          id: householdRef.id,
          orgId: ORG_ID,
          primaryCustomerId: customerRef.id,
          homeCity: merged.homeCity,
          travellers: merged.travellers,
          sharedPreferences: merged.sharedPreferences,
          // Consent is always the most recent explicit answer.
          permissions: intelligence.permissions,
          completeness: mergedCompleteness,
          lastConfirmedAt: now,
          createdAt: merged.createdAt || now,
          updatedAt: now,
          createdBy: merged.createdBy || actor,
          updatedBy: actor,
        });
        transaction.create(preferenceSignalRef, {
          id: preferenceSignalRef.id,
          orgId: ORG_ID,
          customerId: customerRef.id,
          householdId: householdRef.id,
          path: "travelProfile",
          value: intelligence,
          origin: "explicit_form",
          confidence: 1,
          capturedAt: now,
          validFrom: now,
          modelTrainingAllowed: intelligence.permissions.modelTraining,
          createdAt: now,
          updatedAt: now,
          createdBy: actor,
          updatedBy: actor,
        });
      }
      transaction.create(auditRef, {
        id: auditRef.id,
        orgId: ORG_ID,
        actorUid: actor,
        actorRole: "system",
        action: "lead.website.capture",
        collection: "leads",
        docId: leadRef.id,
        before: null,
        after: {
          inquiryId: inquiryRef.id,
          customerId: customerRef.id,
          assignedUid,
          source: input.source,
          householdProfileSaved: Boolean(intelligence?.permissions.saveProfile),
          modelTrainingAllowed: Boolean(
            intelligence?.permissions.modelTraining,
          ),
          profileCompleteness: completeness,
        },
        ts: now,
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
    });
    return { id: inquiryRef.id, createdAt: now, customerId: savedCustomerId, leadId: leadRef.id };
  }

  /**
   * Adds a later handover from the same conversation to its existing lead instead of
   * creating a duplicate enquiry. Retrying the same request is a no-op.
   */
  async appendHandover(input: {
    conversationId: string;
    fullName: string;
    phone: string;
    email?: string;
    preferredContact?: string;
    summary: string;
  }) {
    const database = getAdminFirestore();
    const conversationRef = database.collection("conversations").doc(input.conversationId);
    const digest = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 40);
    const now = new Date().toISOString();
    const actor = "public-concierge";
    return database.runTransaction(async (transaction) => {
      const conversation = await transaction.get(conversationRef);
      const data = conversation.data();
      if (!data || data.orgId !== ORG_ID || !data.leadId) throw new Error("Conversation has no linked lead.");
      const leadRef = database.collection("leads").doc(String(data.leadId));
      const activityRef = leadRef.collection("activities").doc(`handover-${digest}`);
      const [lead, activity] = await Promise.all([transaction.get(leadRef), transaction.get(activityRef)]);
      if (!lead.exists || lead.data()?.orgId !== ORG_ID) throw new Error("Linked lead was not found.");
      const result = { id: String(data.inquiryId || ""), leadId: leadRef.id, customerId: String(data.customerId || "") };
      if (activity.exists) return result;
      transaction.create(activityRef, {
        id: activityRef.id,
        orgId: ORG_ID,
        leadId: leadRef.id,
        type: "note",
        body: [
          "The traveller asked for the TLC team again from the AI concierge.",
          `Name: ${input.fullName}`,
          `Phone: ${input.phone}`,
          input.email ? `Email: ${input.email}` : "",
          input.preferredContact ? `Preferred contact: ${input.preferredContact}` : "",
          "",
          input.summary,
        ].filter((line, index, lines) => line || lines[index - 1]).join("\n").slice(0, 4000),
        by: actor,
        ts: now,
        attachments: [],
        createdAt: now,
        updatedAt: now,
        createdBy: actor,
        updatedBy: actor,
      });
      transaction.update(leadRef, { updatedAt: now, updatedBy: actor });
      transaction.set(conversationRef, { status: "human", handoverAt: now, updatedAt: now, updatedBy: actor }, { merge: true });
      const auditRef = database.collection("auditLogs").doc();
      transaction.create(auditRef, {
        id: auditRef.id, orgId: ORG_ID, actorUid: actor, actorRole: "system",
        action: "conversation.handover.repeat", collection: "leads", docId: leadRef.id,
        before: null, after: { activityId: activityRef.id, conversationId: input.conversationId },
        ts: now, createdAt: now, updatedAt: now, createdBy: actor, updatedBy: actor,
      });
      return result;
    });
  }
}
