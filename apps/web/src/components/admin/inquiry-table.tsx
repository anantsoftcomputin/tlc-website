"use client";

import { ArrowRight, LoaderCircle } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import type { AdminInquirySummary } from "@/repositories/interfaces/admin-repository";

const sourceLabels: Record<string, string> = { plan_my_trip: "Trip planner", trip: "Trip page", contact: "Contact", destination: "Destination", whatsapp: "WhatsApp", ai_concierge: "Ask TLC" };

export function InquiryTable({ inquiries, compact = false, canConvert = false }: { inquiries: AdminInquirySummary[]; compact?: boolean; canConvert?: boolean }) {
  const router = useRouter(); const [busyId, setBusyId] = useState(""); const [error, setError] = useState("");
  async function convert(inquiryId: string) {
    setBusyId(inquiryId); setError("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "createLeadFromInquiry");
      const response = await call({ inquiryId }); const result = response.data as { leadId: string };
      router.push(`/admin/crm/${result.leadId}`); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The inquiry could not be converted."); setBusyId(""); }
  }
  if (!inquiries.length) return <div className="admin-empty"><span>0</span><h3>No enquiries yet</h3><p>New website enquiries will appear here as soon as the secure submission flow is live.</p></div>;
  return <>{error && <p className="lead-form-error inquiry-error" role="alert">{error}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Traveller</th><th>Source</th><th>Destination</th><th>Status</th><th>Received</th>{!compact && <th/>}</tr></thead><tbody>{inquiries.map((item) => <tr key={item.id}><td><b>{item.fullName}</b><span>{item.phone}{item.email ? ` · ${item.email}` : ""}</span></td><td>{sourceLabels[item.source] || item.source}</td><td>{item.destinationIds.length ? item.destinationIds.join(", ") : "Open brief"}</td><td><span className={`status-pill status-${item.status}`}>{item.status.replaceAll("_", " ")}</span></td><td>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(new Date(item.createdAt))}</td>{!compact && <td>{item.leadId ? <Link href={`/admin/crm/${item.leadId}`}>Open lead</Link> : canConvert ? <button className="table-action" disabled={Boolean(busyId)} onClick={() => convert(item.id)}>{busyId === item.id ? <LoaderCircle className="spin"/> : <ArrowRight/>}Create lead</button> : <span>Awaiting assignment</span>}</td>}</tr>)}</tbody></table></div></>;
}
