"use client";

import type { Booking, Payment } from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import {
  BadgeCheck,
  CreditCard,
  FileCheck2,
  Link2,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

function message(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/i, "")
    : "The action failed.";
}

export function BookingControls({
  booking,
  payments,
  canApprove,
  canFinance,
}: {
  booking: Booking;
  payments: Payment[];
  canApprove: boolean;
  canFinance: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [documentLabel, setDocumentLabel] = useState("Visa documentation");
  const [documentKind, setDocumentKind] = useState("visa");
  const [amount, setAmount] = useState(
    String(
      Math.max(
        0,
        booking.totals.sell -
          payments
            .filter((item) => item.status === "captured")
            .reduce((sum, item) => sum + item.amount, 0),
      ),
    ),
  );
  async function call(name: string, data: Record<string, unknown>) {
    setBusy(name + String(data.itemId || data.paymentId || ""));
    setError(undefined);
    try {
      const result = (await httpsCallable(
        getFirebaseFunctions(),
        name,
      )(data)) as { data: { linkUrl?: string } };
      if (result.data.linkUrl)
        window.open(result.data.linkUrl, "_blank", "noopener,noreferrer");
      router.refresh();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(undefined);
    }
  }
  return (
    <div className="booking-controls">
      {error && <p className="form-error">{error}</p>}
      {booking.status === "pendingApproval" && canApprove && (
        <section className="booking-command-card">
          <div>
            <BadgeCheck />
            <span>
              <b>Human approval required</b>
              <small>
                Approving creates customer receivable and supplier payables.
              </small>
            </span>
          </div>
          <button
            className="button primary"
            disabled={Boolean(busy)}
            onClick={() => call("approveBooking", { bookingId: booking.id })}
          >
            Approve booking
          </button>
        </section>
      )}
      <section className="admin-panel">
        <header>
          <div>
            <b>Supplier fulfilment</b>
            <span>
              Record confirmation, PNR or failure independently for each
              service.
            </span>
          </div>
        </header>
        <div className="booking-item-controls">
          {booking.items.map((item) => (
            <form
              key={item.id}
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void call("updateBookingItem", {
                  bookingId: booking.id,
                  itemId: item.id,
                  status: data.get("status"),
                  pnr: data.get("pnr") || undefined,
                  bookingRef: data.get("bookingRef") || undefined,
                  failureReason: data.get("failureReason") || undefined,
                });
              }}
            >
              <div>
                <span className={`status-pill status-${item.itemStatus}`}>
                  {item.itemStatus}
                </span>
                <b>{item.description}</b>
                <small>
                  {item.kind} · {item.source}
                </small>
              </div>
              <label>
                Status
                <select
                  name="status"
                  defaultValue={item.itemStatus}
                  disabled={!booking.approvedAt}
                >
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="failed">Failed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label>
                PNR
                <input name="pnr" defaultValue={item.pnr} />
              </label>
              <label>
                Supplier ref
                <input name="bookingRef" defaultValue={item.bookingRef} />
              </label>
              <label>
                Failure note
                <input name="failureReason" defaultValue={item.failureReason} />
              </label>
              <button
                className="button secondary"
                disabled={!booking.approvedAt || Boolean(busy)}
              >
                <RefreshCw />
                Update
              </button>
            </form>
          ))}
        </div>
      </section>
      <section className="admin-panel">
        <header>
          <div>
            <b>Document checklist</b>
            <span>
              Track traveller and fulfilment documents without exposing private
              files publicly.
            </span>
          </div>
        </header>
        <div className="booking-documents">
          {booking.documents.map((item) => (
            <div key={`${item.kind}-${item.label}`}>
              <FileCheck2 />
              <span>
                <b>{item.label}</b>
                <small>{item.kind}</small>
              </span>
              <select
                value={item.status}
                onChange={(event) =>
                  call("updateBookingDocument", {
                    bookingId: booking.id,
                    kind: item.kind,
                    label: item.label,
                    status: event.target.value,
                    storageRef: item.storageRef,
                    note: item.note,
                  })
                }
              >
                <option value="required">Required</option>
                <option value="received">Received</option>
                <option value="verified">Verified</option>
                <option value="waived">Waived</option>
              </select>
            </div>
          ))}
        </div>
        <form
          className="booking-add-document"
          onSubmit={(event) => {
            event.preventDefault();
            void call("updateBookingDocument", {
              bookingId: booking.id,
              kind: documentKind,
              label: documentLabel,
              status: "required",
            });
          }}
        >
          <select
            value={documentKind}
            onChange={(event) => setDocumentKind(event.target.value)}
          >
            {[
              "passport",
              "visa",
              "ticket",
              "hotelVoucher",
              "insurance",
              "invoice",
              "other",
            ].map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
          <input
            value={documentLabel}
            onChange={(event) => setDocumentLabel(event.target.value)}
            required
          />
          <button className="button secondary">Add document</button>
        </form>
      </section>
      {canFinance && booking.approvedAt && (
        <section className="admin-panel">
          <header>
            <div>
              <b>Payment collection</b>
              <span>
                Create provider links, record offline receipts, and reconcile
                captured payments.
              </span>
            </div>
          </header>
          <form
            className="booking-payment-create"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void call("createPaymentLink", {
                bookingId: booking.id,
                amount: Number(data.get("amount")),
                type: data.get("type"),
                dueAt: data.get("dueAt")
                  ? new Date(String(data.get("dueAt"))).toISOString()
                  : undefined,
              });
            }}
          >
            <label>
              Amount
              <input
                name="amount"
                type="number"
                min="1"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <label>
              Collection
              <select name="type">
                <option value="advance">Advance</option>
                <option value="balance">Balance</option>
                <option value="full">Full</option>
              </select>
            </label>
            <label>
              Due
              <input name="dueAt" type="datetime-local" />
            </label>
            <button className="button primary" disabled={Boolean(busy)}>
              <Link2 />
              Create payment link
            </button>
          </form>
          <div className="booking-payments">
            {payments.map((payment) => (
              <div key={payment.id}>
                <CreditCard />
                <span>
                  <b>
                    {payment.currency} {payment.amount.toLocaleString("en-IN")}
                  </b>
                  <small>
                    {payment.gateway} · {payment.type} · {payment.status}
                  </small>
                </span>
                {payment.linkUrl && (
                  <a href={payment.linkUrl} target="_blank" rel="noreferrer">
                    Open link
                  </a>
                )}
                {payment.status !== "captured" && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      call("recordPayment", {
                        paymentId: payment.id,
                        gatewayRef: `manual-${Date.now()}`,
                        method: "bankTransfer",
                      })
                    }
                  >
                    Record received
                  </button>
                )}
                {payment.status === "captured" && !payment.reconciledAt && (
                  <button
                    className="button secondary"
                    onClick={() =>
                      call("reconcilePayment", { paymentId: payment.id })
                    }
                  >
                    Reconcile
                  </button>
                )}
                {payment.reconciledAt && (
                  <span className="status-pill status-confirmed">
                    Reconciled
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
