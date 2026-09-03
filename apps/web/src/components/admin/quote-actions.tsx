"use client";

import { httpsCallable } from "firebase/functions";
import { CheckCircle2, CopyPlus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/^Firebase:\s*/i, "")
    : "The quote action failed.";
}

export function QuoteActions({
  quoteId,
  leadId,
  status,
  hasPending,
  canApprove,
  canWrite,
}: {
  quoteId: string;
  leadId: string;
  status: string;
  hasPending: boolean;
  canApprove: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"approve" | "send">();
  const [error, setError] = useState<string>();

  async function command(
    name: "approveQuote" | "sendQuote",
    busyState: "approve" | "send",
  ) {
    setBusy(busyState);
    setError(undefined);
    try {
      await httpsCallable(getFirebaseFunctions(), name)({ quoteId });
      router.refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <section className="quote-action-bar">
      <div>
        <b>Quote controls</b>
        <span>
          {hasPending
            ? "Approval is required before this quote can be shared."
            : status === "draft"
              ? "This revision is ready for its final review."
              : "This revision is locked in the audit trail."}
        </span>
        {error && <small>{error}</small>}
      </div>
      <div>
        {canWrite && (
          <Link
            className="button secondary"
            href={`/admin/quotes/new?revise=${quoteId}&leadId=${leadId}`}
          >
            <CopyPlus />
            Create revision
          </Link>
        )}
        {status === "draft" && hasPending && canApprove && (
          <button
            className="button secondary"
            disabled={Boolean(busy)}
            onClick={() => command("approveQuote", "approve")}
          >
            <CheckCircle2 />
            {busy === "approve" ? "Approving…" : "Approve exceptions"}
          </button>
        )}
        {canWrite && status === "draft" && !hasPending && (
          <button
            className="button primary"
            disabled={Boolean(busy)}
            onClick={() => command("sendQuote", "send")}
          >
            <Send />
            {busy === "send" ? "Preparing…" : "Mark ready to share"}
          </button>
        )}
      </div>
    </section>
  );
}
