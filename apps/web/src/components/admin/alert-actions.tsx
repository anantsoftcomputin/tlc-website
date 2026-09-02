"use client";
import { Check, LoaderCircle } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

export function AlertActions({ alertId, status }: { alertId: string; status: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  async function update(next: "acknowledged" | "resolved") { setBusy(next); setError(""); try { await httpsCallable(getFirebaseFunctions(), "updateAlertStatus")({ alertId, status: next }); router.refresh(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed."); } finally { setBusy(""); } }
  return <div className="alert-actions">{error && <small>{error}</small>}{status === "open" && <button disabled={Boolean(busy)} onClick={() => update("acknowledged")}>{busy === "acknowledged" ? <LoaderCircle className="spin"/> : null}Acknowledge</button>}{status !== "resolved" && <button className="resolve" disabled={Boolean(busy)} onClick={() => update("resolved")}>{busy === "resolved" ? <LoaderCircle className="spin"/> : <Check/>}Resolve</button>}</div>;
}
