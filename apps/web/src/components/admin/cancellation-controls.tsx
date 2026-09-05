"use client";

import type { Booking, CancellationRequest } from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import { BadgeCheck, CircleX, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

export function CancellationControls({
  bookings,
  cancellations,
  canWrite,
  canApprove,
}: {
  bookings: Booking[];
  cancellations: CancellationRequest[];
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
      setError(
        caught instanceof Error
          ? caught.message.replace(/^Firebase:\s*/i, "")
          : "Finance action failed.",
      );
    } finally {
      setBusy(undefined);
    }
  }
  const activeBookingIds = new Set(
    cancellations
      .filter((item) => !["rejected", "failed"].includes(item.status))
      .map((item) => item.bookingId),
  );
  const cancellable = bookings.filter(
    (item) =>
      item.approvedAt &&
      item.status !== "cancelled" &&
      !activeBookingIds.has(item.id),
  );
  return (
    <section className="admin-panel finance-section" id="cancellations">
      <header>
        <div>
          <b>Cancellations & refunds</b>
          <span>
            Item-level penalties, retained fees, manager approval, execution,
            and reconciliation.
          </span>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      {canWrite && (
        <div className="finance-request-grid">
          {cancellable.map((booking) => (
            <details key={booking.id} className="finance-request-card">
              <summary>
                <b>{booking.bookingNumber}</b>
                <span>
                  {booking.totals.currency}{" "}
                  {booking.totals.sell.toLocaleString("en-IN")}
                </span>
              </summary>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void call(
                    "createCancellationRequest",
                    {
                      bookingId: booking.id,
                      reason: data.get("reason"),
                      items: booking.items
                        .filter((item) => data.get(`select-${item.id}`))
                        .map((item) => ({
                          itemId: item.id,
                          supplierPenalty: Number(
                            data.get(`penalty-${item.id}`),
                          ),
                          serviceFeeRetained: Number(
                            data.get(`fee-${item.id}`),
                          ),
                          reason: String(
                            data.get(`reason-${item.id}`) ||
                              "Customer requested cancellation",
                          ),
                        })),
                    },
                    `create-${booking.id}`,
                  );
                }}
              >
                {booking.items.map((item) => (
                  <div className="finance-cancel-item" key={item.id}>
                    <label className="finance-check">
                      <input
                        name={`select-${item.id}`}
                        type="checkbox"
                        defaultChecked
                      />{" "}
                      {item.description}
                    </label>
                    <label>
                      Supplier penalty
                      <input
                        name={`penalty-${item.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue="0"
                        required
                      />
                    </label>
                    <label>
                      Retained fee
                      <input
                        name={`fee-${item.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue="0"
                        required
                      />
                    </label>
                    <input
                      name={`reason-${item.id}`}
                      placeholder="Item cancellation reason"
                      defaultValue="Customer requested cancellation"
                      required
                    />
                  </div>
                ))}
                <textarea
                  name="reason"
                  placeholder="Overall cancellation reason"
                  required
                  minLength={3}
                />
                <button className="button primary" disabled={Boolean(busy)}>
                  Request approval
                </button>
              </form>
            </details>
          ))}
          {!cancellable.length && (
            <p className="panel-empty">
              No booking currently needs a new cancellation request.
            </p>
          )}
        </div>
      )}
      <div className="finance-settlement-list">
        {cancellations.map((item) => (
          <article key={item.id}>
            <div>
              <span className={`status-pill status-${item.status}`}>
                {item.status}
              </span>
              <b>{item.requestNumber}</b>
              <small>
                Refund {item.currency}{" "}
                {item.refundAmount.toLocaleString("en-IN")} · penalties{" "}
                {item.supplierPenalty.toLocaleString("en-IN")} · retained{" "}
                {item.retainedFees.toLocaleString("en-IN")}
              </small>
            </div>
            {item.status === "pendingApproval" && canApprove && (
              <div className="finance-inline-actions">
                <button
                  className="button primary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void call(
                      "approveCancellationRequest",
                      { cancellationId: item.id },
                      `approve-${item.id}`,
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
                        "rejectCancellationRequest",
                        { cancellationId: item.id, reason },
                        `reject-${item.id}`,
                      );
                  }}
                >
                  <CircleX /> Reject
                </button>
              </div>
            )}
            {item.status === "approved" && canWrite && (
              <form
                className="finance-payment-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void call(
                    "executeCancellationRefund",
                    {
                      cancellationId: item.id,
                      method: data.get("method"),
                      reference: data.get("reference") || undefined,
                    },
                    `execute-${item.id}`,
                  );
                }}
              >
                <select name="method" defaultValue="provider">
                  <option value="provider">Payment provider</option>
                  <option value="bankTransfer">Bank transfer</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="other">Other</option>
                </select>
                <input
                  name="reference"
                  placeholder="Offline reference (optional)"
                />
                <button className="button primary" disabled={Boolean(busy)}>
                  <RotateCcw /> Execute refund
                </button>
              </form>
            )}
            {item.status === "completed" &&
              item.refundPaymentId &&
              canWrite && (
                <button
                  className="button secondary"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void call(
                      "reconcileRefund",
                      { cancellationId: item.id },
                      `reconcile-${item.id}`,
                    )
                  }
                >
                  Reconcile refund
                </button>
              )}
          </article>
        ))}
        {!cancellations.length && (
          <p className="panel-empty">No cancellation requests yet.</p>
        )}
      </div>
    </section>
  );
}
