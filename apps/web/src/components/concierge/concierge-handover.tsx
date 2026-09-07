"use client";

import { CheckCircle2, LoaderCircle, UserRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { DisplayMessage } from "./concierge-types";

export function ConciergeHandover({
  sessionId,
  messages,
  destinationIds,
}: {
  sessionId: string;
  messages: DisplayMessage[];
  destinationIds: string[];
}) {
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/concierge/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          fullName: data.get("fullName"),
          phone: data.get("phone"),
          email: data.get("email"),
          preferredContact: data.get("preferredContact"),
          destinationIds,
          summary: messages
            .slice(-10)
            .map((message) => `${message.role}: ${message.content}`)
            .join("\n"),
        }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(payload.error || "Could not send your request.");
      setState("done");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send your request.",
      );
      setState("idle");
    }
  }
  if (state === "done")
    return (
      <div className="concierge-handover-done" role="status">
        <CheckCircle2 />
        <div>
          <b>Your TLC planner has the conversation.</b>
          <span>We’ll contact you using your chosen method.</span>
        </div>
      </div>
    );
  return (
    <form className="concierge-handover" onSubmit={submit}>
      <header>
        <UserRound />
        <div>
          <b>Continue with a TLC expert</b>
          <span>Your planner will receive this conversation.</span>
        </div>
      </header>
      <input
        name="fullName"
        required
        minLength={2}
        placeholder="Your name"
        autoComplete="name"
      />
      <input
        name="phone"
        required
        placeholder="Phone / WhatsApp"
        autoComplete="tel"
        inputMode="tel"
      />
      <input
        name="email"
        type="email"
        placeholder="Email (optional)"
        autoComplete="email"
      />
      <select
        name="preferredContact"
        defaultValue="whatsapp"
        aria-label="Preferred contact method"
      >
        <option value="whatsapp">Contact me on WhatsApp</option>
        <option value="phone">Call me</option>
        <option value="email">Email me</option>
      </select>
      {error && <p role="alert">{error}</p>}
      <button disabled={state === "sending"}>
        {state === "sending" ? (
          <LoaderCircle className="spin" />
        ) : (
          <UserRound />
        )}
        Send to a travel expert
      </button>
      <small>No payment, passport or ID details are needed here.</small>
    </form>
  );
}
