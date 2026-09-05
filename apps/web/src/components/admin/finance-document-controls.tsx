"use client";

import type {
  AccountingSync,
  Booking,
  CancellationRequest,
  FinanceDocument,
  LedgerEntry,
  Payment,
  SupplierSettlement,
  TaxProfile,
} from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import { FileCheck2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

export function FinanceDocumentControls({
  bookings,
  payments,
  cancellations,
  documents,
  syncs,
  ledger,
  settlements,
  taxProfile,
  canWrite,
  canManage,
}: {
  bookings: Booking[];
  payments: Payment[];
  cancellations: CancellationRequest[];
  documents: FinanceDocument[];
  syncs: AccountingSync[];
  ledger: LedgerEntry[];
  settlements: SupplierSettlement[];
  taxProfile: TaxProfile;
  canWrite: boolean;
  canManage: boolean;
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
  const documentKeys = new Set(
    documents.map(
      (item) =>
        `${item.type}:${item.bookingId}:${item.paymentId || item.cancellationId || ""}`,
    ),
  );
  return (
    <section className="admin-panel finance-section" id="documents">
      <header>
        <div>
          <b>GST documents & accounting</b>
          <span>
            Immutable numbered invoices, receipts, credit notes, and idempotent
            provider synchronization.
          </span>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      {canManage && (
        <details className="finance-tax-profile">
          <summary>
            <b>GST organization profile</b>
            <span>
              {taxProfile.legalName} · {taxProfile.gstin}
            </span>
          </summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void call(
                "updateTaxProfile",
                {
                  legalName: data.get("legalName"),
                  gstin: data.get("gstin"),
                  address: data.get("address"),
                  stateCode: data.get("stateCode"),
                  placeOfSupply: data.get("placeOfSupply"),
                  sac: data.get("sac"),
                  defaultGstRatePct: Number(data.get("defaultGstRatePct")),
                },
                "tax-profile",
              );
            }}
          >
            <input
              name="legalName"
              defaultValue={taxProfile.legalName}
              placeholder="Legal name"
              required
            />
            <input
              name="gstin"
              defaultValue={taxProfile.gstin}
              placeholder="GSTIN"
              required
            />
            <input
              name="address"
              defaultValue={taxProfile.address}
              placeholder="Registered address"
              required
            />
            <input
              name="stateCode"
              defaultValue={taxProfile.stateCode}
              placeholder="State code"
              required
              pattern="[0-9]{2}"
            />
            <input
              name="placeOfSupply"
              defaultValue={taxProfile.placeOfSupply}
              placeholder="Place of supply"
              required
            />
            <input
              name="sac"
              defaultValue={taxProfile.sac}
              placeholder="SAC"
              required
            />
            <input
              name="defaultGstRatePct"
              type="number"
              min="0"
              max="28"
              step="0.01"
              defaultValue={taxProfile.defaultGstRatePct}
              required
            />
            <button className="button primary" disabled={Boolean(busy)}>
              Save GST profile
            </button>
          </form>
        </details>
      )}
      {canWrite && (
        <div className="finance-action-list">
          {bookings
            .filter(
              (item) =>
                item.approvedAt && !documentKeys.has(`invoice:${item.id}:`),
            )
            .map((item) => (
              <button
                key={`invoice-${item.id}`}
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void call(
                    "issueFinanceDocument",
                    { bookingId: item.id, type: "invoice" },
                    `invoice-${item.id}`,
                  )
                }
              >
                <FileCheck2 /> Invoice {item.bookingNumber}
              </button>
            ))}
          {payments
            .filter(
              (item) =>
                item.status === "captured" &&
                !documentKeys.has(`receipt:${item.bookingId}:${item.id}`),
            )
            .map((item) => (
              <button
                key={`receipt-${item.id}`}
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void call(
                    "issuePaymentReceipt",
                    { paymentId: item.id },
                    `receipt-${item.id}`,
                  )
                }
              >
                <FileCheck2 /> Receipt {item.id.slice(0, 8)}
              </button>
            ))}
          {cancellations
            .filter(
              (item) =>
                item.status === "completed" &&
                !documentKeys.has(`creditNote:${item.bookingId}:${item.id}`),
            )
            .map((item) => (
              <button
                key={`credit-${item.id}`}
                className="button secondary"
                disabled={Boolean(busy)}
                onClick={() =>
                  void call(
                    "issueFinanceDocument",
                    {
                      bookingId: item.bookingId,
                      cancellationId: item.id,
                      type: "creditNote",
                    },
                    `credit-${item.id}`,
                  )
                }
              >
                <FileCheck2 /> Credit note {item.requestNumber}
              </button>
            ))}
        </div>
      )}
      {canWrite && (
        <div className="finance-action-list finance-accounting-queue">
          {ledger
            .filter((item) => item.type === "payable")
            .map((item) => (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                key={`bill-${item.id}`}
                onClick={() =>
                  void call(
                    "syncAccountingDocument",
                    {
                      provider: "mock",
                      documentType: "bill",
                      sourceCollection: "ledger",
                      sourceId: item.id,
                    },
                    `bill-${item.id}`,
                  )
                }
              >
                <RefreshCw /> Sync bill · {item.party.name}
              </button>
            ))}
          {payments
            .filter((item) => item.status === "captured")
            .map((item) => (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                key={`payment-${item.id}`}
                onClick={() =>
                  void call(
                    "syncAccountingDocument",
                    {
                      provider: "mock",
                      documentType: "payment",
                      sourceCollection: "payments",
                      sourceId: item.id,
                    },
                    `payment-${item.id}`,
                  )
                }
              >
                <RefreshCw /> Sync payment · {item.id.slice(0, 8)}
              </button>
            ))}
          {settlements
            .filter((item) => item.status === "paid")
            .map((item) => (
              <button
                className="button secondary"
                disabled={Boolean(busy)}
                key={`settlement-${item.id}`}
                onClick={() =>
                  void call(
                    "syncAccountingDocument",
                    {
                      provider: "mock",
                      documentType: "supplierSettlement",
                      sourceCollection: "supplierSettlements",
                      sourceId: item.id,
                    },
                    `settlement-${item.id}`,
                  )
                }
              >
                <RefreshCw /> Sync settlement · {item.settlementNumber}
              </button>
            ))}
        </div>
      )}
      <div className="finance-document-grid">
        {documents.map((document) => {
          const lastSync = syncs.find((sync) => sync.sourceId === document.id);
          return (
            <article key={document.id}>
              <div>
                <span className={`status-pill status-${document.type}`}>
                  {document.type}
                </span>
                <Link href={`/admin/finance/documents/${document.id}`}>
                  <b>{document.number}</b>
                </Link>
                <small>
                  {document.customer.name} · {document.currency}{" "}
                  {document.total.toLocaleString("en-IN")}
                </small>
              </div>
              {canWrite && (
                <div className="finance-sync-actions">
                  {(["mock", "zohoBooks", "tally"] as const).map((provider) => (
                    <button
                      className="button secondary"
                      key={provider}
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void call(
                          "syncAccountingDocument",
                          {
                            provider,
                            documentType: document.type,
                            sourceCollection: "financeDocuments",
                            sourceId: document.id,
                          },
                          `sync-${provider}-${document.id}`,
                        )
                      }
                    >
                      <RefreshCw />{" "}
                      {provider === "mock"
                        ? "Mock"
                        : provider === "zohoBooks"
                          ? "Zoho"
                          : "Tally"}
                    </button>
                  ))}
                </div>
              )}
              {lastSync && (
                <small
                  className={
                    lastSync.status === "failed"
                      ? "finance-negative"
                      : "finance-positive"
                  }
                >
                  {lastSync.provider}: {lastSync.status} · attempt{" "}
                  {lastSync.attempts}
                </small>
              )}
            </article>
          );
        })}
        {!documents.length && (
          <p className="panel-empty">No finance documents issued yet.</p>
        )}
      </div>
    </section>
  );
}
