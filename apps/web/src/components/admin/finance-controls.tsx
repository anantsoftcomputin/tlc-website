"use client";

import type { LedgerEntry, SupplierSettlement } from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import { BadgeCheck, Banknote, CircleX, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/i, "")
    : "The finance action failed.";
}

export function FinanceControls({
  payables,
  settlements,
  missingJournalBookingIds,
  canWrite,
  canApprove,
}: {
  payables: LedgerEntry[];
  settlements: SupplierSettlement[];
  missingJournalBookingIds: string[];
  canWrite: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  async function call(
    name: string,
    data: Record<string, unknown>,
    key: string,
  ) {
    setBusy(key);
    setError(undefined);
    try {
      await httpsCallable(getFirebaseFunctions(), name)(data);
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <div className="finance-controls">
      {error && <p className="form-error">{error}</p>}
      {canWrite && missingJournalBookingIds.length > 0 && (
        <section className="admin-panel finance-initialization">
          <header>
            <div>
              <b>Finance migration</b>
              <span>Post opening journals for approved Phase 2 bookings.</span>
            </div>
          </header>
          <div className="finance-action-list">
            {missingJournalBookingIds.map((bookingId) => (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                key={bookingId}
                onClick={() =>
                  void call(
                    "initializeBookingFinance",
                    { bookingId },
                    `initialize-${bookingId}`,
                  )
                }
              >
                <Send /> Post journal for {bookingId.slice(0, 10)}
              </button>
            ))}
          </div>
        </section>
      )}
      {canWrite && (
        <section className="admin-panel">
          <header>
            <div>
              <b>Open supplier payables</b>
              <span>
                Create an allocation request; a manager must approve it before
                payment.
              </span>
            </div>
          </header>
          <div className="finance-payable-grid">
            {payables.map((entry) => {
              const available = Math.max(
                0,
                entry.amount -
                  (entry.settledAmount || 0) -
                  (entry.pendingSettlementAmount || 0),
              );
              return (
                <form
                  key={entry.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void call(
                      "createSupplierSettlement",
                      {
                        bookingId: entry.bookingId,
                        supplierId: entry.party.id,
                        supplierName: entry.party.name,
                        allocations: [
                          {
                            ledgerEntryId: entry.id,
                            amount: Number(data.get("amount")),
                          },
                        ],
                      },
                      `create-${entry.id}`,
                    );
                  }}
                >
                  <div>
                    <b>{entry.party.name}</b>
                    <span>Booking {entry.bookingId.slice(0, 10)}</span>
                  </div>
                  <label>
                    Available {entry.currency}{" "}
                    {available.toLocaleString("en-IN")}
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      max={available}
                      step="0.01"
                      defaultValue={available}
                      required
                    />
                  </label>
                  <button
                    className="button primary"
                    disabled={Boolean(busy) || available <= 0}
                  >
                    Request settlement
                  </button>
                </form>
              );
            })}
            {!payables.length && (
              <p className="panel-empty">No supplier balance is available.</p>
            )}
          </div>
        </section>
      )}
      <section className="admin-panel">
        <header>
          <div>
            <b>Settlement approvals</b>
            <span>
              Request, approval, and payment evidence remain distinct.
            </span>
          </div>
        </header>
        <div className="finance-settlement-list">
          {settlements.map((settlement) => (
            <article key={settlement.id}>
              <div>
                <span className={`status-pill status-${settlement.status}`}>
                  {settlement.status}
                </span>
                <b>{settlement.settlementNumber}</b>
                <small>
                  {settlement.supplierName} · {settlement.currency}{" "}
                  {settlement.amount.toLocaleString("en-IN")}
                </small>
              </div>
              {settlement.status === "pendingApproval" && canApprove && (
                <div className="finance-inline-actions">
                  <button
                    className="button primary"
                    disabled={Boolean(busy)}
                    onClick={() =>
                      void call(
                        "approveSupplierSettlement",
                        { settlementId: settlement.id },
                        `approve-${settlement.id}`,
                      )
                    }
                  >
                    <BadgeCheck /> Approve
                  </button>
                  <button
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      const reason = window.prompt("Reason for rejection?");
                      if (reason)
                        void call(
                          "rejectSupplierSettlement",
                          { settlementId: settlement.id, reason },
                          `reject-${settlement.id}`,
                        );
                    }}
                  >
                    <CircleX /> Reject
                  </button>
                </div>
              )}
              {settlement.status === "approved" && canWrite && (
                <form
                  className="finance-payment-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void call(
                      "paySupplierSettlement",
                      {
                        settlementId: settlement.id,
                        method: data.get("method"),
                        paymentReference: data.get("paymentReference"),
                      },
                      `pay-${settlement.id}`,
                    );
                  }}
                >
                  <select name="method" defaultValue="bankTransfer">
                    <option value="bankTransfer">Bank transfer</option>
                    <option value="upi">UPI</option>
                    <option value="cheque">Cheque</option>
                    <option value="cash">Cash</option>
                    <option value="other">Other</option>
                  </select>
                  <input
                    name="paymentReference"
                    placeholder="Payment reference"
                    required
                  />
                  <button className="button primary" disabled={Boolean(busy)}>
                    <Banknote /> Mark paid
                  </button>
                </form>
              )}
            </article>
          ))}
          {!settlements.length && (
            <p className="panel-empty">No settlement requests yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
