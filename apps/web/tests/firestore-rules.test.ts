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
  });
});

afterAll(async () => environment.cleanup());

describe("public and content rules", () => {
  it("publishes only approved destination records", async () => {
    const database = environment.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(database, "destinations", "published")));
    await assertFails(getDoc(doc(database, "destinations", "draft")));
  });

  it("allows editors to manage content but not read CRM intake", async () => {
    const database = environment
      .authenticatedContext("editor", { role: "content_editor" })
      .firestore();
    await assertSucceeds(
      setDoc(doc(database, "destinations", "new"), {
        status: "draft",
        name: "New",
      }),
    );
    await assertFails(getDoc(doc(database, "inquiries", "one")));
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
