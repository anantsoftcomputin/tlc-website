export function seedPhase3Finance({ database, batch, orgId, ownerUid, now }) {
  batch.set(
    database.collection("cancellationRequests").doc("demo-cancellation"),
    {
      id: "demo-cancellation",
      orgId,
      requestNumber: "TLC-CAN-2026-DEMO001",
      bookingId: "demo-booking",
      currency: "INR",
      items: [
        {
          itemId: "hotel-demo",
          supplierPenalty: 25000,
          serviceFeeRetained: 5000,
          reason: "Traveller requested a date change",
        },
      ],
      collectedAmount: 200000,
      supplierPenalty: 25000,
      retainedFees: 5000,
      refundAmount: 170000,
      profitImpact: 195000,
      status: "pendingApproval",
      reason: "Traveller requested a date change",
      requestedBy: ownerUid,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    },
  );
  const seller = {
    legalName: "TLC Vacations LLP",
    gstin: "27AAAAA0000A1Z5",
    address: "Mumbai, Maharashtra, India",
    stateCode: "27",
    placeOfSupply: "Maharashtra",
    sac: "998551",
    defaultGstRatePct: 5,
  };
  const documents = [
    {
      id: "demo-booking-invoice",
      type: "invoice",
      number: "TLC/INV/26-27/00001",
      total: 715600,
      taxableValue: 681523.81,
    },
    {
      id: "demo-advance-payment-receipt",
      type: "receipt",
      number: "TLC/RCP/26-27/00001",
      total: 200000,
      taxableValue: 190476.19,
      paymentId: "demo-advance-payment",
    },
  ];
  for (const document of documents)
    batch.set(database.collection("financeDocuments").doc(document.id), {
      ...document,
      orgId,
      bookingId: "demo-booking",
      issueDate: now.slice(0, 10),
      currency: "INR",
      customer: { id: "customer-shah", name: "Krupa Shah", stateCode: "24" },
      seller,
      gstRatePct: 5,
      cgst: 0,
      sgst: 0,
      igst: document.total - document.taxableValue,
      sac: seller.sac,
      placeOfSupply: seller.placeOfSupply,
      status: "issued",
      issuedAt: now,
      issuedBy: ownerUid,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    });
  batch.set(
    database
      .collection("accountingSyncs")
      .doc("mock-invoice-demo-booking-invoice"),
    {
      id: "mock-invoice-demo-booking-invoice",
      orgId,
      provider: "mock",
      documentType: "invoice",
      sourceCollection: "financeDocuments",
      sourceId: "demo-booking-invoice",
      idempotencyKey: `${orgId}:invoice:financeDocuments:demo-booking-invoice`,
      status: "synced",
      attempts: 1,
      externalId: "mock_demo-booking-invoice",
      syncedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    },
  );
  batch.set(
    database.collection("financePeriods").doc(`${orgId}-2026-08-01-2026-08-31`),
    {
      id: `${orgId}-2026-08-01-2026-08-31`,
      orgId,
      label: "August 2026",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      status: "closed",
      reconciliation: {
        journalDebits: 0,
        journalCredits: 0,
        unreconciledPayments: 0,
        pendingSettlements: 0,
        pendingRefunds: 0,
      },
      closedBy: ownerUid,
      closedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: ownerUid,
      updatedBy: ownerUid,
    },
  );
}
