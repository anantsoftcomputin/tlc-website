"use client";

import { leadPriorities, leadStatuses, type Lead } from "@tlc/shared";
import { Check, LoaderCircle, MessageSquarePlus } from "lucide-react";
import { httpsCallable } from "firebase/functions";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";
import type { LeadAssignee, LeadRecord } from "@/repositories/interfaces/lead-repository";

const labels: Record<Lead["status"], string> = { new: "New", contacted: "Contacted", quoted: "Quoted", negotiating: "Negotiating", won: "Won", lost: "Lost", dormant: "Dormant" };

function localDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value); date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

export function LeadWorkspace({ lead, assignees, canReassign }: { lead: LeadRecord; assignees: LeadAssignee[]; canReassign: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"lead" | "activity" | null>(null);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const [status, setStatus] = useState(lead.status); const [priority, setPriority] = useState(lead.priority);
  const [assignedUid, setAssignedUid] = useState(lead.assignedUid); const [followUp, setFollowUp] = useState(localDateTime(lead.sla.nextFollowUpAt));
  const [lostReason, setLostReason] = useState(lead.lostReason || ""); const [activityType, setActivityType] = useState("note"); const [body, setBody] = useState("");

  async function saveLead(event: FormEvent) {
    event.preventDefault(); setBusy("lead"); setError(""); setMessage("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "updateLead");
      await call({ leadId: lead.id, status, priority, ...(canReassign ? { assignedUid } : {}), nextFollowUpAt: followUp ? new Date(followUp).toISOString() : null, lostReason: status === "lost" ? lostReason : null });
      setMessage("Lead updated."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The lead could not be updated."); }
    finally { setBusy(null); }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault(); if (!body.trim()) return; setBusy("activity"); setError(""); setMessage("");
    try {
      const call = httpsCallable(getFirebaseFunctions(), "addLeadActivity");
      await call({ leadId: lead.id, type: activityType, body });
      setBody(""); setMessage("Activity added."); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The activity could not be added."); }
    finally { setBusy(null); }
  }

  return <div className="lead-workspace-forms">{error && <p className="lead-form-error" role="alert">{error}</p>}{message && <p className="lead-form-success"><Check/>{message}</p>}
    <form className="lead-control-card" onSubmit={saveLead}><h2>Lead controls</h2><p>Keep ownership, sales state and the next action current.</p><div className="lead-form-grid"><label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value as Lead["status"])}>{leadStatuses.map((item) => <option value={item} key={item}>{labels[item]}</option>)}</select></label><label><span>Priority</span><select value={priority} onChange={(event) => setPriority(event.target.value as Lead["priority"])}>{leadPriorities.map((item) => <option value={item} key={item}>{item}</option>)}</select></label><label><span>Next follow-up</span><input type="datetime-local" value={followUp} onChange={(event) => setFollowUp(event.target.value)}/></label><label><span>Owner</span><select disabled={!canReassign} value={assignedUid} onChange={(event) => setAssignedUid(event.target.value)}>{assignees.length ? assignees.map((item) => <option value={item.uid} key={item.uid}>{item.displayName}</option>) : <option value={lead.assignedUid}>{lead.assignedUid}</option>}</select></label>{status === "lost" && <label className="lead-field-wide"><span>Lost reason *</span><textarea required value={lostReason} onChange={(event) => setLostReason(event.target.value)} placeholder="Why was this opportunity lost?"/></label>}</div><button className="button primary" disabled={Boolean(busy)}>{busy === "lead" ? <LoaderCircle className="spin"/> : <Check/>}Save lead</button></form>
    <form className="lead-control-card" onSubmit={addActivity}><h2>Add activity</h2><p>Record calls, WhatsApp conversations, emails and internal notes.</p><label><span>Activity type</span><select value={activityType} onChange={(event) => setActivityType(event.target.value)}>{["note", "call", "email", "whatsapp", "quote", "followUp"].map((item) => <option value={item} key={item}>{item.replace(/([A-Z])/g, " $1")}</option>)}</select></label><label><span>Summary</span><textarea required minLength={1} value={body} onChange={(event) => setBody(event.target.value)} placeholder="What happened and what should the team know?"/></label><button className="button secondary" disabled={Boolean(busy)}>{busy === "activity" ? <LoaderCircle className="spin"/> : <MessageSquarePlus/>}Add to timeline</button></form>
  </div>;
}
