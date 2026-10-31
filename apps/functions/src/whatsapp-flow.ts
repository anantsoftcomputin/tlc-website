import { randomBytes, createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  personalTripInputSchema,
  vacationInterests,
  vacationAmenities,
  tripServiceKinds,
  type PersonalTripInput,
} from "@tlc/shared";
import {
  trustedWhatsAppThread,
  whatsappActor,
  whatsappPersonalContext,
} from "./whatsapp-identity.js";
import {
  planWhatsAppTrip,
  whatsappPlanSummary,
  requestWhatsAppReview,
} from "./whatsapp-planner.js";
import type { BotAnswer } from "./conversation-service.js";

type Decision = {
  body: string;
  usesPersonal?: boolean;
  handover?: boolean;
  action?: "search" | "review" | "feedback";
  trip?: PersonalTripInput;
  option?: number;
  feedback?: Record<string, any>;
};
const uuidFor = (value: string) => {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};
const words = (value: string) =>
  value
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean);
const prompts: Record<string, string> = {
  name: "Welcome to TLC! Let’s register you here on WhatsApp. What is your full name? We use this number for your travel requests; please do not send passports or payment details.",
  consent:
    "May TLC save and use your travel preferences, past trips and feedback to personalise recommendations? Reply PERSONAL to agree or BASIC for general assistance. Marketing is a separate choice; you can reply STOP PERSONALISATION at any time.",
  offers:
    "Would you also like occasional TLC travel offers on WhatsApp? Reply YES or NO. This is optional and does not affect your travel assistance. STOP unsubscribes from offers.",
  destination: "Which destination would you like to visit?",
  dates:
    "What are your check-in and check-out dates? Use YYYY-MM-DD to YYYY-MM-DD, for example 2027-03-10 to 2027-03-15. I’ll confirm them before searching.",
  rooms:
    "Who is travelling, and how many rooms? For each room send adults / children’s ages. Example: 2 / 6,10 means 2 adults and children aged 6 and 10; 2 / none means two adults. Separate rooms with a semicolon.",
  nationality:
    "What is the travellers’ nationality? Send the two-letter country code, for example IN for India. If nationalities differ, reply CONSULTANT.",
  budget:
    "What is your total budget in INR for everyone and all the services you want included? Send a number, for example 150000.",
  services:
    "Which services must that budget cover? Choose hotel and any of: flight, transfer, activity, insurance, visa, other. Example: hotel, flight, transfer, activity. Anything unselected will be excluded.",
  flights:
    "For return flights, send departure and arrival airport codes and cabin: DEL DXB economy. Cabin choices: economy, premiumEconomy, business, first. Add direct if you require direct flights.",
  interests:
    "What would make this trip special? Choose any: beach, culture, adventure, family, wellness, romance, nature, luxury. Reply NONE if you have no preference. Your current choices take priority over your saved profile.",
  requirements:
    "Any hotel requirements? Send stars; meal; amenities; refund preference. Example: 4; breakfast; pool,spa; refundable. Meals: any, breakfast, allInclusive. Amenities: pool, spa, beach, kids, fitness, wifi, airportTransfer. Reply STANDARD for 3 stars, any meals, no required amenities and any cancellation policy.",
  feedbackBooking:
    "Which completed TLC booking is this feedback for? Send its booking ID. You can ask a consultant if you need help finding it.",
  feedbackRating: "How would you rate that trip from 1 to 5?",
  feedbackInterests:
    "Which experiences would you like more or less of next time? Send liked interests; disliked interests. Example: beach,nature; luxury. Use NONE for either side. Choices: beach, culture, adventure, family, wellness, romance, nature, luxury.",
};
function confirmation(trip: Record<string, any>) {
  const b = trip.brief;
  return `Please confirm this trip:\n${b.destinationSlug}, ${b.checkIn} to ${b.checkOut}\n${b.rooms.map((room: any, i: number) => `Room ${i + 1}: ${room.adults} adults; children’s ages ${room.childrenAges.join(", ") || "none"}`).join("\n")}\nNationality: ${b.nationality}. Total budget: INR ${b.budget}.\nIncluded: ${trip.includedServices.join(", ")}. Excluded: ${tripServiceKinds.filter((kind) => !trip.includedServices.includes(kind)).join(", ") || "none of the listed services"}; personal spending.\n${b.flights ? `Return flights: ${b.flights.origin}–${b.flights.destination}, ${b.flights.cabinClass}, ${b.flights.directOnly ? "direct only" : "connections allowed"}.\n` : ""}Interests: ${b.interests.join(", ") || "none"}. Hotel: ${b.minStars}+ stars, ${b.mealPlan} meals, ${b.amenities.join(", ") || "no required amenities"}, ${b.refundableOnly ? "refundable only" : "any cancellation policy"}.\nReply CONFIRM to search current inventory or NEW TRIP to start again. Nothing will be booked.`;
}

/** Durable deterministic intake. Message-level decisions are saved atomically with state, making webhook/job retries harmless. */
export async function handleWhatsAppTurn(
  db: Firestore,
  orgId: string,
  conversationId: string,
  messageId: string,
  plan = planWhatsAppTrip,
): Promise<BotAnswer | null> {
  const threadRef = db.collection("conversations").doc(conversationId);
  const turnRef = threadRef.collection("whatsappTurns").doc(messageId);
  const decision = await db.runTransaction(
    async (tx): Promise<Decision | null> => {
      const [threadDoc, inbound, cached] = await Promise.all([
        tx.get(threadRef),
        tx.get(threadRef.collection("messages").doc(messageId)),
        tx.get(turnRef),
      ]);
      const thread = threadDoc.data();
      if (thread?.channel !== "whatsapp") return null;
      if (
        !trustedWhatsAppThread(thread, orgId) ||
        inbound.data()?.verifiedTransport !== true ||
        thread?.lastInboundMessageId !== messageId
      )
        return {
          body: "I couldn’t verify this WhatsApp session. Please send a new message through TLC’s official WhatsApp number, or ask a consultant for help.",
        };
      if (cached.exists) return cached.data()!.decision;
      const customerRef = db.collection("customers").doc(thread!.customerId);
      const customer = (await tx.get(customerRef)).data();
      if (
        customer?.orgId !== orgId ||
        !customer.phones?.some(
          (phone: string) =>
            phone.replace(/\D/g, "") === thread!.whatsappAddress,
        )
      )
        return {
          body: "Please ask a TLC consultant to verify this contact.",
          handover: true,
        };
      const text = String(inbound.data()?.body || "").trim();
      const command = text.toLowerCase();
      const now = new Date().toISOString();
      let state = thread!.whatsappFlow || { step: "idle" };
      let next = { ...state };
      const registered =
        customer.whatsappRegistrationStatus === "registered" ||
        (!customer.whatsappRegistrationStatus &&
          !["WhatsApp traveller", "Traveller", ""].includes(
            String(customer.name || customer.fullName || ""),
          ));
      const save = (value: Decision | null) => {
        if (!value) return null;
        value.usesPersonal ??=
          customer.communicationPreferences?.personalization === true &&
          !/^(stop|disable|revoke) personali[sz](ation|e)$/i.test(text);
        if (registered && customer.whatsappRegistrationStatus !== "registered")
          tx.update(customerRef, {
            whatsappRegistrationStatus: "registered",
            whatsappVerifiedAt: now,
          });
        tx.update(threadRef, { whatsappFlow: next });
        tx.create(turnRef, {
          orgId,
          decision: JSON.parse(JSON.stringify(value)),
          createdAt: now,
        });
        return value;
      };
      if (thread!.whatsappIdentityAmbiguous)
        return save({
          usesPersonal: false,
          body: "This number is linked to more than one traveller record. A TLC consultant will help select the right record before I use any private history.",
          handover: true,
        });
      if (/^(stop|disable|revoke) personali[sz](ation|e)$/i.test(text)) {
        tx.update(customerRef, {
          "communicationPreferences.personalization": false,
          communicationPreferencesConfirmedAt: now,
          updatedAt: now,
          updatedBy: "whatsapp-customer",
        });
        next = { step: "idle" };
        return save({
          body: "Personalisation is off. I won’t use your saved history or preferences. General assistance and your separate marketing choices remain available. Reply PERSONALISE if you want to enable it again.",
        });
      }
      if (!registered && state.step !== "name" && state.step !== "consent") {
        next = { step: "name" };
        return save({ body: prompts.name });
      }
      if (state.step === "name") {
        if (
          text.length < 2 ||
          text.length > 120 ||
          /https?:|@|\d{5}|[\r\n]/i.test(text)
        )
          return save({
            body: "Please send just your name, between 2 and 120 characters.",
          });
        next = { step: "consent", name: text };
        return save({ body: prompts.consent });
      }
      if (command === "link website") {
        if (!registered)
          return save({ body: "Complete your WhatsApp registration first." });
        const site = process.env.TLC_SITE_URL
          ? new URL(process.env.TLC_SITE_URL)
          : null;
        if (
          !site ||
          site.protocol !== "https:" ||
          site.username ||
          site.password
        )
          return save({
            body: "Website account linking is not configured yet. Ask a TLC consultant for help.",
          });
        const token = randomBytes(32).toString("hex");
        const tokenId = createHash("sha256").update(token).digest("hex");
        tx.create(db.collection("whatsappAccountLinks").doc(tokenId), {
          orgId,
          customerId: customerRef.id,
          conversationId,
          address: thread!.whatsappAddress,
          used: false,
          createdAt: now,
          expiresAt: new Date(Date.now() + 600000).toISOString(),
        });
        return save({
          usesPersonal: false,
          body: `To connect this traveller to your verified website account, open ${site.origin}/connect-whatsapp?token=${token} and confirm after signing in. The link expires in 10 minutes. Do not forward it. Your marketing and personalisation choices will not change.`,
        });
      }
      if (/^personali[sz]e$/.test(command)) {
        next = { step: "consent" };
        return save({ body: prompts.consent });
      }
      if (state.step === "consent") {
        if (!["personal", "basic"].includes(command))
          return save({ body: prompts.consent });
        const personal = command === "personal";
        tx.update(customerRef, {
          ...(state.name ? { name: state.name } : {}),
          whatsappRegistrationStatus: "registered",
          whatsappRegisteredAt: customer.whatsappRegisteredAt || now,
          whatsappVerifiedAt: now,
          "communicationPreferences.personalization": personal,
          communicationPreferencesConfirmedAt: now,
          updatedAt: now,
          updatedBy: "whatsapp-customer",
        });
        tx.create(
          customerRef.collection("events").doc(`wa-registration-${messageId}`),
          {
            id: `wa-registration-${messageId}`,
            orgId,
            type: "preferenceDeclared",
            channel: "whatsapp",
            ts: now,
            payload: {
              kind: "whatsapp.registration",
              personalization: personal,
              numberVerifiedBy: "signed-meta-inbound",
            },
            createdAt: now,
            updatedAt: now,
            createdBy: "whatsapp-customer",
            updatedBy: "whatsapp-customer",
            modelTrainingAllowed: false,
          },
        );
        next = { step: "offers" };
        return save({
          body: `You’re registered${state.name ? `, ${state.name.split(/\s+/)[0]}` : ""}. ${personal ? "Personalisation is on." : "General assistance selected."}\n\n${prompts.offers}`,
        });
      }
      if (state.step === "offers") {
        if (!["yes", "no"].includes(command))
          return save({ body: prompts.offers });
        tx.update(customerRef, {
          "consent.whatsapp": command === "yes",
          "consent.timestamp": now,
          "consent.source": "whatsapp-explicit",
          "marketingOptOuts.whatsapp": command !== "yes",
          updatedAt: now,
          updatedBy: "whatsapp-customer",
        });
        next = { step: "idle", welcomed: true };
        return save({
          body: `${command === "yes" ? "WhatsApp offers enabled; STOP unsubscribes." : "No WhatsApp offers enabled."} How can I help with your next holiday? Reply NEW TRIP to plan, PREFERENCES to see or update your interests, FEEDBACK after a completed trip, or CONSULTANT for help.`,
        });
      }
      const allowPersonal =
        customer.communicationPreferences?.personalization === true;
      if (command === "preferences") {
        if (!allowPersonal) {
          next = { step: "consent" };
          return save({ body: prompts.consent });
        }
        next = { step: "preferences" };
        return save({
          body: `Your saved interests: ${(customer.communicationPreferences.interests || []).join(", ") || "none yet"}. Reply with interests to save (${vacationInterests.join(", ")}), NONE to clear, or CANCEL.`,
        });
      }
      if (state.step === "preferences") {
        const interests = command === "none" ? [] : [...new Set(words(text))];
        if (command === "cancel") {
          next = { step: "idle" };
          return save({ body: "Preference update cancelled." });
        }
        if (!allowPersonal) {
          next = { step: "consent" };
          return save({ body: prompts.consent });
        }
        if (interests.some((item) => !vacationInterests.includes(item as any)))
          return save({
            body: `Choose from: ${vacationInterests.join(", ")}, or NONE.`,
          });
        tx.update(customerRef, {
          "communicationPreferences.interests": interests,
          communicationPreferencesConfirmedAt: now,
          updatedAt: now,
          updatedBy: "whatsapp-customer",
        });
        next = { step: "idle" };
        return save({
          body: "Your travel interests are saved. Reply NEW TRIP to plan with them, or STOP PERSONALISATION to disable their use.",
        });
      }
      if (/^(new trip|plan|plan trip|start again)$/.test(command)) {
        if (!allowPersonal) {
          next = { step: "consent" };
          return save({ body: prompts.consent });
        }
        next = {
          step: "destination",
          trip: { brief: {}, includedServices: [] },
        };
        const savedDestinations = [
          ...new Set([
            ...(customer.communicationPreferences?.destinations || []),
            ...Object.keys(customer.profile?.destinations || {}),
          ]),
        ].slice(0, 5);
        return save({
          body: `${savedDestinations.length ? `Your saved destinations include ${savedDestinations.join(", ")}; I’ll check what’s available for your new dates. ` : ""}${prompts.destination}`,
        });
      }
      if (command === "cancel") {
        next = { step: "idle", welcomed: true };
        return save({
          body: "Current intake cancelled. Reply NEW TRIP whenever you’re ready.",
        });
      }
      if (command === "refresh") {
        if (!allowPersonal) {
          next = { step: "consent" };
          return save({ body: prompts.consent });
        }
        let pointer = (
          await tx.get(
            db
              .collection("clientAdvisorSessions")
              .doc(whatsappActor(orgId, customerRef.id)),
          )
        ).data();
        if (customer.verifiedClientUid) {
          const websitePointer = (
            await tx.get(
              db
                .collection("clientAdvisorSessions")
                .doc(customer.verifiedClientUid),
            )
          ).data();
          if (
            websitePointer?.orgId === orgId &&
            websitePointer.customerId === customerRef.id &&
            (!pointer ||
              String(websitePointer.updatedAt || "") >
                String(pointer.updatedAt || ""))
          )
            pointer = websitePointer;
        }
        const prior =
          pointer?.orgId === orgId && pointer.customerId === customerRef.id
            ? (
                await tx.get(
                  db.collection("personalTripPlans").doc(pointer.planId),
                )
              ).data()
            : null;
        if (
          prior?.orgId !== orgId ||
          prior.customerId !== customerRef.id ||
          ![whatsappActor(orgId, customerRef.id), customer.verifiedClientUid]
            .filter(Boolean)
            .includes(prior.clientUid)
        )
          return save({
            body: "Please reply NEW TRIP to confirm your dates, travellers and budget first.",
          });
        const trip = {
          ...prior.result.trip,
          requestId: uuidFor(`${conversationId}:${messageId}`),
        };
        next = { step: "idle", welcomed: true };
        return save({
          body: "Refreshing the services and brief you last confirmed.",
          action: "search",
          trip,
        });
      }
      const review = /^review\s+([1-3])$/.exec(command);
      if (review)
        return save({
          body: "Your confirmed trip will be sent to a consultant for review. Nothing is booked.",
          handover: true,
          action: "review",
          option: Number(review[1]),
        });
      if (command === "feedback") {
        next = { step: "feedbackBooking", feedback: {} };
        return save({ body: prompts.feedbackBooking });
      }
      if (state.step === "feedbackBooking") {
        if (!/^[A-Za-z0-9_-]{1,160}$/.test(text))
          return save({ body: prompts.feedbackBooking });
        const booking = (
          await tx.get(db.collection("bookings").doc(text))
        ).data();
        if (
          booking?.orgId !== orgId ||
          booking.customerId !== customerRef.id ||
          booking.status !== "completed"
        )
          return save({
            body: "I couldn’t find that completed booking for this number. Check the ID or ask a consultant.",
          });
        next = { step: "feedbackRating", feedback: { bookingId: text } };
        return save({ body: prompts.feedbackRating });
      }
      if (state.step === "feedbackRating") {
        if (!/^[1-5]$/.test(text))
          return save({ body: prompts.feedbackRating });
        next = {
          ...state,
          step: "feedbackInterests",
          feedback: { ...state.feedback, rating: Number(text) },
        };
        return save({ body: prompts.feedbackInterests });
      }
      if (state.step === "feedbackInterests") {
        const parts = text.split(";");
        if (parts.length !== 2)
          return save({ body: prompts.feedbackInterests });
        const liked = words(parts[0]).filter((x) => x !== "none"),
          disliked = words(parts[1]).filter((x) => x !== "none");
        if (
          [...liked, ...disliked].some(
            (x) => !vacationInterests.includes(x as any),
          ) ||
          liked.some((x) => disliked.includes(x))
        )
          return save({ body: prompts.feedbackInterests });
        next = {
          step: "feedbackConfirm",
          feedback: {
            ...state.feedback,
            liked: [...new Set(liked)],
            disliked: [...new Set(disliked)],
          },
        };
        return save({
          body: `Save rating ${state.feedback.rating}/5 for ${state.feedback.bookingId}? More: ${liked.join(", ") || "none"}; less: ${disliked.join(", ") || "none"}. Reply CONFIRM or CANCEL.`,
        });
      }
      if (state.step === "feedbackConfirm") {
        if (command !== "confirm")
          return save({
            body: "Reply CONFIRM to save your feedback or CANCEL.",
          });
        next = { step: "idle", welcomed: true };
        return save({
          body: "Thank you. Your feedback is saved for your TLC team and future recommendations when personalisation is enabled.",
          action: "feedback",
          feedback: {
            ...state.feedback,
            requestId: uuidFor(`${conversationId}:${messageId}`),
          },
        });
      }
      if (
        [
          "destination",
          "dates",
          "rooms",
          "nationality",
          "budget",
          "services",
          "flights",
          "interests",
          "requirements",
          "confirm",
        ].includes(state.step)
      ) {
        if (!allowPersonal) {
          next = { step: "consent" };
          return save({ body: prompts.consent });
        }
        const trip = structuredClone(state.trip);
        const b = trip.brief;
        const advance = (step: string) => {
          next = { ...state, step, trip };
          return save({ body: prompts[step] });
        };
        if (state.step === "destination") {
          const destinations = await tx.get(
            db
              .collection("destinations")
              .where("orgId", "==", orgId)
              .where("status", "==", "published"),
          );
          const destination = destinations.docs.find((doc) =>
            [doc.data().slug, doc.data().name?.toLowerCase()].includes(command),
          );
          if (!destination)
            return save({
              body: `Choose a destination TLC currently offers: ${
                destinations.docs
                  .map((doc) => doc.data().name || doc.data().slug)
                  .slice(0, 25)
                  .join(", ") || "ask a consultant for options"
              }.`,
            });
          b.destinationSlug = destination.data().slug;
          return advance("dates");
        }
        if (state.step === "dates") {
          const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
          const nights =
            dates?.length === 2
              ? (Date.parse(dates[1]) - Date.parse(dates[0])) / 86400000
              : 0;
          if (
            !dates ||
            dates.length !== 2 ||
            nights < 1 ||
            nights > 30 ||
            !Number.isFinite(nights) ||
            dates[0] <= now.slice(0, 10) ||
            Date.parse(dates[0]) > Date.now() + 365 * 86400000
          )
            return save({
              body:
                "Choose valid future dates within one year, for a stay of 1 to 30 nights. " +
                prompts.dates,
            });
          b.checkIn = dates[0];
          b.checkOut = dates[1];
          return advance("rooms");
        }
        if (state.step === "rooms") {
          const rooms = text.split(";").map((part) => {
            const match =
              /^\s*([1-8])\s*\/\s*(none|-|\d{1,2}(?:\s*,\s*\d{1,2})*)\s*$/i.exec(
                part,
              );
            return match
              ? {
                  adults: Number(match[1]),
                  childrenAges: /none|-/.test(match[2].toLowerCase())
                    ? []
                    : match[2].split(",").map(Number),
                }
              : null;
          });
          if (
            !rooms.length ||
            rooms.length > 4 ||
            rooms.some(
              (room) =>
                !room ||
                room.childrenAges.length > 4 ||
                room.childrenAges.some((age) => age > 17),
            )
          )
            return save({ body: prompts.rooms });
          b.rooms = rooms;
          return advance("nationality");
        }
        if (state.step === "nationality") {
          if (!/^[a-z]{2}$/i.test(text))
            return save({ body: prompts.nationality });
          b.nationality = text.toUpperCase();
          return advance("budget");
        }
        if (state.step === "budget") {
          const amount = Number(text.replace(/,/g, ""));
          if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000)
            return save({ body: prompts.budget });
          b.budget = amount;
          return advance("services");
        }
        if (state.step === "services") {
          const services = [...new Set(words(text))];
          if (
            !services.includes("hotel") ||
            services.some((kind) => !tripServiceKinds.includes(kind as any))
          )
            return save({ body: prompts.services });
          trip.includedServices = services;
          return advance(services.includes("flight") ? "flights" : "interests");
        }
        if (state.step === "flights") {
          const match =
            /^([A-Za-z]{3})\s+([A-Za-z]{3})\s+(economy|premiumEconomy|business|first)(?:\s+(direct))?$/i.exec(
              text,
            );
          if (!match || match[1].toUpperCase() === match[2].toUpperCase())
            return save({ body: prompts.flights });
          b.flights = {
            origin: match[1].toUpperCase(),
            destination: match[2].toUpperCase(),
            cabinClass:
              match[3].toLowerCase() === "premiumeconomy"
                ? "premiumEconomy"
                : match[3].toLowerCase(),
            directOnly: Boolean(match[4]),
          };
          return advance("interests");
        }
        if (state.step === "interests") {
          const interests = command === "none" ? [] : [...new Set(words(text))];
          if (
            interests.some(
              (interest) => !vacationInterests.includes(interest as any),
            )
          )
            return save({ body: prompts.interests });
          b.interests = interests;
          return advance("requirements");
        }
        if (state.step === "requirements") {
          if (command === "standard")
            Object.assign(b, {
              minStars: 3,
              mealPlan: "any",
              amenities: [],
              refundableOnly: false,
            });
          else {
            const parts = text.split(";").map((part) => part.trim());
            const amenities = words(parts[2] || "")
              .filter((item) => item !== "none")
              .map((item) =>
                item === "airporttransfer" ? "airportTransfer" : item,
              );
            if (
              parts.length !== 4 ||
              !/^[1-5]$/.test(parts[0]) ||
              !["any", "breakfast", "allInclusive"].includes(parts[1]) ||
              amenities.some(
                (item) => !vacationAmenities.includes(item as any),
              ) ||
              !["refundable", "any"].includes(parts[3])
            )
              return save({ body: prompts.requirements });
            Object.assign(b, {
              minStars: Number(parts[0]),
              mealPlan: parts[1],
              amenities: [...new Set(amenities)],
              refundableOnly: parts[3] === "refundable",
            });
          }
          const parsed = personalTripInputSchema.safeParse({
            ...trip,
            customerId: customerRef.id,
            confirmed: true,
            requestId: uuidFor(`${conversationId}:${messageId}`),
          });
          if (!parsed.success) {
            next = {
              step: "destination",
              trip: { brief: {}, includedServices: [] },
            };
            return save({
              body: `Please correct the trip brief: ${parsed.error.issues[0]?.message}. ${prompts.destination}`,
            });
          }
          next = { step: "confirm", trip: parsed.data };
          return save({ body: confirmation(parsed.data) });
        }
        if (state.step === "confirm") {
          if (command !== "confirm") return save({ body: confirmation(trip) });
          next = { step: "idle", welcomed: true };
          return save({
            body: "Searching your confirmed trip.",
            action: "search",
            trip,
          });
        }
      }
      if (!state.welcomed) {
        next = { step: "idle", welcomed: true };
        return save({
          body: `Welcome back${allowPersonal ? `, ${String(customer.name || customer.fullName || "traveller").split(/\s+/)[0]}` : ""}! I’m Tara. ${allowPersonal ? "I can use your consented travel preferences; I’ll confirm what you want for this trip." : "Reply PERSONALISE if you want me to use your saved preferences."} Reply NEW TRIP to plan, PREFERENCES to update interests, FEEDBACK after a trip, LINK WEBSITE to connect your verified portal account, or ask me a travel question. You can request a CONSULTANT at any time.`,
        });
      }
      return null;
    },
  );
  if (!decision) return null;
  let body = decision.body;
  let handover = decision.handover || false;
  try {
    if (decision.action === "search")
      body = whatsappPlanSummary(
        await plan(db, orgId, conversationId, decision.trip!, messageId),
      );
    if (decision.action === "review")
      await requestWhatsAppReview(db, orgId, conversationId, decision.option!);
    if (decision.action === "feedback")
      await saveWhatsAppFeedback(db, orgId, conversationId, decision.feedback!);
  } catch (error) {
    body =
      error instanceof Error && /Search limit/.test(error.message)
        ? error.message
        : "I couldn’t complete that request. Please check your consent, trip details and current availability. Reply NEW TRIP to try again, PERSONALISE to review consent, or CONSULTANT for help.";
    handover = false;
  }
  const personal = await whatsappPersonalContext(db, orgId, conversationId);
  if (decision.usesPersonal && !personal) {
    body =
      "Your personalisation permission changed. Reply PERSONALISE to review it, or ask for general travel help.";
    handover = false;
  }
  return {
    body,
    handover,
    grounded: true,
    model: "whatsapp-guided-advisor",
    ...(personal
      ? {
          personalized: true,
          personalCustomerId: personal.customerId,
          verifiedUid: personal.verifiedUid,
          evidenceExpiresAt: personal.expiresAt,
        }
      : {}),
  };
}

async function saveWhatsAppFeedback(
  db: Firestore,
  orgId: string,
  conversationId: string,
  feedback: Record<string, any>,
) {
  await db.runTransaction(async (tx) => {
    const thread = (
      await tx.get(db.collection("conversations").doc(conversationId))
    ).data();
    if (!trustedWhatsAppThread(thread, orgId) || !thread?.customerId)
      throw new Error("Verify your number first.");
    const customerRef = db.collection("customers").doc(thread.customerId);
    const [customerDoc, bookingDoc] = await Promise.all([
      tx.get(customerRef),
      tx.get(db.collection("bookings").doc(feedback.bookingId)),
    ]);
    const customer = customerDoc.data(),
      booking = bookingDoc.data();
    if (
      customer?.orgId !== orgId ||
      booking?.orgId !== orgId ||
      booking.customerId !== customerRef.id ||
      booking.status !== "completed" ||
      !customer.phones?.some(
        (phone: string) => phone.replace(/\D/g, "") === thread.whatsappAddress,
      )
    )
      throw new Error("Completed booking not found.");
    const actor = whatsappActor(orgId, customerRef.id);
    // One contribution per traveller/booking across website and WhatsApp.
    const feedbackRef = bookingDoc.ref
      .collection("feedback")
      .doc(customer.verifiedClientUid || actor);
    const prior = (await tx.get(feedbackRef)).data();
    const eventRef = customerRef
      .collection("events")
      .doc(`wa-feedback-${feedback.requestId}`);
    if ((await tx.get(eventRef)).exists) return;
    const counts = { ...(customer.feedbackInterestCounts || {}) };
    for (const field of ["liked", "disliked"] as const) {
      const dimension = field === "liked" ? "positive" : "negative";
      for (const interest of prior?.[field] || []) {
        counts[interest] = { positive: 0, negative: 0, ...counts[interest] };
        counts[interest][dimension] = Math.max(
          0,
          counts[interest][dimension] - 1,
        );
      }
      for (const interest of feedback[field] || []) {
        counts[interest] = { positive: 0, negative: 0, ...counts[interest] };
        counts[interest][dimension]++;
      }
    }
    const now = new Date().toISOString();
    tx.set(feedbackRef, {
      ...feedback,
      orgId,
      clientUid: actor,
      channel: "whatsapp",
      comment: "",
      createdAt: prior?.createdAt || now,
      updatedAt: now,
      updatedBy: actor,
    });
    tx.update(customerRef, {
      feedbackInterestCounts: counts,
      feedbackAffinities: Object.fromEntries(
        Object.entries(counts).map(([interest, value]) => {
          const count = value as { positive: number; negative: number };
          return [
            interest,
            (count.positive - count.negative) /
              Math.max(1, count.positive + count.negative),
          ];
        }),
      ),
      lastFeedbackAt: now,
      updatedAt: now,
      updatedBy: actor,
    });
    tx.create(eventRef, {
      id: eventRef.id,
      orgId,
      type: "tripFeedback",
      channel: "whatsapp",
      ts: now,
      payload: feedback,
      modelTrainingAllowed: false,
      createdAt: now,
      updatedAt: now,
      createdBy: actor,
      updatedBy: actor,
    });
    tx.create(db.collection("auditLogs").doc(), {
      orgId,
      actorUid: actor,
      action: "whatsapp.trip.feedback",
      collection: "bookings",
      docId: bookingDoc.id,
      ts: now,
    });
  });
}
