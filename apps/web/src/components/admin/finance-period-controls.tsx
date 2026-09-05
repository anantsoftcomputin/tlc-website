"use client";

import type { FinancePeriod } from "@tlc/shared";
import { httpsCallable } from "firebase/functions";
import { CalendarCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

export function FinancePeriodControls({
  periods,
  canApprove,
}: {
  periods: FinancePeriod[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function call(name: string, data: Record<string, unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await httpsCallable(getFirebaseFunctions(), name)(data);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message.replace(/^Firebase:\s*/i, "")
          : "Period action failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel finance-section" id="period-close">
      <header>
        <div>
          <b>Finance period close</b>
          <span>
            Close only after journals balance and payments, settlements, and
            refunds reconcile.
          </span>
        </div>
      </header>
      {error && <p className="form-error">{error}</p>}
      {canApprove && (
        <form
          className="finance-period-form"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void call("closeFinancePeriod", {
              label: data.get("label"),
              startDate: data.get("startDate"),
              endDate: data.get("endDate"),
            });
          }}
        >
          <input
            name="label"
            placeholder="Period label"
            required
            defaultValue="September 2026"
          />
          <label>
            From
            <input
              name="startDate"
              type="date"
              required
              defaultValue="2026-09-01"
            />
          </label>
          <label>
            To
            <input
              name="endDate"
              type="date"
              required
              defaultValue="2026-09-30"
            />
          </label>
          <button className="button primary" disabled={busy}>
            <CalendarCheck /> Reconcile & close
          </button>
        </form>
      )}
      <div className="finance-settlement-list">
        {periods.map((period) => (
          <article key={period.id}>
            <div>
              <span className={`status-pill status-${period.status}`}>
                {period.status}
              </span>
              <b>{period.label}</b>
              <small>
                {period.startDate} to {period.endDate} · debits{" "}
                {period.reconciliation.journalDebits.toLocaleString("en-IN")} ·
                credits{" "}
                {period.reconciliation.journalCredits.toLocaleString("en-IN")}
              </small>
            </div>
            {period.status === "closed" && canApprove && (
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => {
                  const reason = window.prompt("Reason for reopening?");
                  if (reason)
                    void call("reopenFinancePeriod", {
                      periodId: period.id,
                      reason,
                    });
                }}
              >
                Reopen
              </button>
            )}
          </article>
        ))}
        {!periods.length && (
          <p className="panel-empty">No periods have been closed.</p>
        )}
      </div>
    </section>
  );
}
