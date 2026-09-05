import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

let environment: RulesTestEnvironment;

beforeAll(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-tlc-holidays",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(
        new URL("../../../firebase/firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "destinations", "published"), {
      status: "published",
      name: "Published",
    });
    await setDoc(doc(context.firestore(), "destinations", "draft"), {
      status: "draft",
      name: "Draft",
    });
    await setDoc(doc(context.firestore(), "hotels", "published"), { status:"published", name:"Published hotel" });
    await setDoc(doc(context.firestore(), "hotels", "draft"), { status:"draft", name:"Draft hotel" });
    await setDoc(doc(context.firestore(), "inquiries", "one"), {
      orgId: "tlc-vacations",
      status: "new",
      assignedUid: "sales",
      customer: { fullName: "Test" },
    });
    await setDoc(doc(context.firestore(), "leads", "other-salesperson"), {
      orgId: "tlc-vacations",
      status: "new",
      assignedUid: "other",
    });
    await setDoc(doc(context.firestore(), "leads", "assigned-sales"), {
      orgId: "tlc-vacations",
      status: "new",
      assignedUid: "sales",
    });
    await setDoc(doc(context.firestore(), "leads", "other-org"), {
      orgId: "another-org",
      status: "new",
      assignedUid: "sales",
    });
    await setDoc(doc(context.firestore(), "auditLogs", "one"), {
      orgId: "tlc-vacations",
      actorId: "system",
      action: "seed",
    });
    await setDoc(doc(context.firestore(), "propensity", "one"), {
      orgId: "tlc-vacations",
      customerId: "customer-1",
      score: 80,
    });
    await setDoc(doc(context.firestore(), "imports", "one"), {
      orgId: "tlc-vacations",
      status: "review",
    });
    await setDoc(doc(context.firestore(), "inventoryOffers", "one"), {
      orgId: "tlc-vacations",
      kind: "flight",
      offerId: "provider-offer",
    });
    await setDoc(doc(context.firestore(), "quotes", "assigned-quote"), {
      orgId: "tlc-vacations",
      leadId: "assigned-sales",
      status: "draft",
    });
    await setDoc(doc(context.firestore(), "quotes", "other-quote"), {
      orgId: "tlc-vacations",
      leadId: "other-salesperson",
      status: "draft",
    });
    await setDoc(doc(context.firestore(), "bookings", "booking-one"), {
      orgId: "tlc-vacations",
      leadId: "assigned-sales",
      status: "processing",
    });
    await setDoc(doc(context.firestore(), "payments", "payment-one"), {
      orgId: "tlc-vacations",
      bookingId: "booking-one",
      status: "captured",
    });
    await setDoc(doc(context.firestore(), "ledger", "ledger-one"), {
      orgId: "tlc-vacations",
      bookingId: "booking-one",
      type: "receivable",
    });
    await setDoc(doc(context.firestore(), "financeJournals", "journal-one"), {
      orgId: "tlc-vacations",
      sourceType: "booking",
      status: "posted",
    });
    await setDoc(
      doc(context.firestore(), "supplierSettlements", "settlement-one"),
      {
        orgId: "tlc-vacations",
        bookingId: "booking-one",
        status: "pendingApproval",
      },
    );
    for (const collection of [
      "cancellationRequests",
      "financeDocuments",
      "accountingSyncs",
      "financePeriods",
    ])
      await setDoc(doc(context.firestore(), collection, "finance-one"), {
        orgId: "tlc-vacations",
        status: "pendingApproval",
      });
  });
});

afterAll(async () => environment.cleanup());

describe("public and content rules", () => {
  it("publishes only approved destination records", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(database, "destinations", "published")));
    await assertFails(getDoc(doc(database, "destinations", "draft")));
  });

  it("allows editors to review content while keeping audited writes server-owned", async () => {
    const database = environment
      .authenticatedContext("editor", { role: "content_editor" })
      .firestore();
    await assertFails(
      setDoc(doc(database, "destinations", "new"), {
        status: "draft",
        name: "New",
      }),
    );
    await assertSucceeds(getDoc(doc(database, "destinations", "draft")));
    await assertFails(getDoc(doc(database, "inquiries", "one")));
  });

  it("publishes hotels while protecting drafts", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(database, "hotels", "published")));
    await assertFails(getDoc(doc(database, "hotels", "draft")));
  });
});

describe("CRM and audit rules", () => {
  it("rejects browser-created public inquiries", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertFails(
      setDoc(doc(database, "inquiries", "public"), { status: "new" }),
    );
  });

  it("allows sales staff to read inquiries and create leads", async () => {
    const database = environment
      .authenticatedContext("sales", { role: "sales", orgId: "tlc-vacations" })
      .firestore();
    await assertSucceeds(getDoc(doc(database, "inquiries", "one")));
    await assertSucceeds(
      setDoc(doc(database, "leads", "new"), {
        orgId: "tlc-vacations",
        status: "new",
        assignedUid: "sales",
      }),
    );
    await assertFails(getDoc(doc(database, "leads", "other-salesperson")));
    await assertFails(getDoc(doc(database, "leads", "other-org")));
  });

  it("allows assigned staff to append but not rewrite lead activity", async () => {
    const database = environment
      .authenticatedContext("sales", { role: "sales", orgId: "tlc-vacations" })
      .firestore();
    const activity = doc(
      database,
      "leads",
      "assigned-sales",
      "activities",
      "call-one",
    );
    await assertSucceeds(
      setDoc(activity, {
        orgId: "tlc-vacations",
        leadId: "assigned-sales",
        type: "call",
        body: "Called customer",
      }),
    );
    await assertFails(updateDoc(activity, { body: "Rewritten history" }));
  });

  it("keeps audit logs immutable to browser clients", async () => {
    const database = environment
      .authenticatedContext("admin", { role: "owner", orgId: "tlc-vacations" })
      .firestore();
    await assertSucceeds(getDoc(doc(database, "auditLogs", "one")));
    await assertFails(
      setDoc(doc(database, "auditLogs", "browser"), { action: "forged" }),
    );
  });

  it("keeps AI scores server-owned", async () => {
    const database = environment
      .authenticatedContext("admin", { role: "owner", orgId: "tlc-vacations" })
      .firestore();
    await assertSucceeds(getDoc(doc(database, "propensity", "one")));
    await assertFails(
      setDoc(doc(database, "propensity", "forged"), {
        orgId: "tlc-vacations",
        score: 100,
      }),
    );
  });

  it("keeps temporary supplier inventory server-only", async () => {
    const database = environment
      .authenticatedContext("admin", { role: "owner", orgId: "tlc-vacations" })
      .firestore();
    await assertFails(getDoc(doc(database, "inventoryOffers", "one")));
    await assertFails(
      setDoc(doc(database, "inventoryOffers", "forged"), {
        orgId: "tlc-vacations",
        kind: "flight",
      }),
    );
  });

  it("scopes quote reads to assigned leads and keeps quote writes server-owned", async () => {
    const database = environment
      .authenticatedContext("sales", { role: "sales", orgId: "tlc-vacations" })
      .firestore();
    await assertSucceeds(getDoc(doc(database, "quotes", "assigned-quote")));
    await assertFails(getDoc(doc(database, "quotes", "other-quote")));
    await assertFails(
      setDoc(doc(database, "quotes", "forged"), {
        orgId: "tlc-vacations",
        leadId: "assigned-sales",
        status: "sent",
      }),
    );
    await assertFails(
      updateDoc(doc(database, "quotes", "assigned-quote"), {
        status: "accepted",
      }),
    );
  });

  it("does not expose quote documents directly to public itinerary visitors", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(database, "quotes", "assigned-quote")));
  });

  it("keeps booking and finance mutations server-owned", async () => {
    const manager = environment
      .authenticatedContext("manager", {
        role: "manager",
        orgId: "tlc-vacations",
      })
      .firestore();
    const accounts = environment
      .authenticatedContext("accounts", {
        role: "accounts",
        orgId: "tlc-vacations",
      })
      .firestore();
    await assertSucceeds(getDoc(doc(manager, "bookings", "booking-one")));
    await assertSucceeds(getDoc(doc(accounts, "payments", "payment-one")));
    await assertSucceeds(getDoc(doc(accounts, "ledger", "ledger-one")));
    await assertSucceeds(
      getDoc(doc(accounts, "financeJournals", "journal-one")),
    );
    await assertSucceeds(
      getDoc(doc(manager, "supplierSettlements", "settlement-one")),
    );
    for (const collection of [
      "cancellationRequests",
      "financeDocuments",
      "accountingSyncs",
      "financePeriods",
    ]) {
      await assertSucceeds(getDoc(doc(accounts, collection, "finance-one")));
      await assertFails(
        updateDoc(doc(accounts, collection, "finance-one"), {
          status: "forged",
        }),
      );
    }
    await assertFails(
      updateDoc(doc(manager, "bookings", "booking-one"), {
        status: "confirmed",
      }),
    );
    await assertFails(
      updateDoc(doc(accounts, "payments", "payment-one"), {
        status: "refunded",
      }),
    );
    await assertFails(
      updateDoc(doc(accounts, "financeJournals", "journal-one"), {
        status: "reversed",
      }),
    );
    await assertFails(
      updateDoc(doc(manager, "supplierSettlements", "settlement-one"), {
        status: "approved",
      }),
    );
  });

  it("lets managers review imports but keeps import writes server-owned", async () => {
    const database = environment
      .authenticatedContext("admin", { role: "owner", orgId: "tlc-vacations" })
      .firestore();
    await assertSucceeds(getDoc(doc(database, "imports", "one")));
    await assertFails(
      setDoc(doc(database, "imports", "forged"), {
        orgId: "tlc-vacations",
        status: "completed",
      }),
    );
  });
});
