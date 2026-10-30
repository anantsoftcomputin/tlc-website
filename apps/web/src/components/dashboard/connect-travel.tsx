"use client";
import { useState } from "react";
export function ConnectTravel({
  token,
  clients,
}: {
  token: string;
  clients: { id: string; name: string }[];
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const data = new FormData(event.currentTarget);
        try {
          const response = await fetch("/api/client/connect-travel", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token,
              customerId: data.get("customerId"),
              confirmed: data.has("confirmed"),
            }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          setStatus(
            "Connected for 24 hours. Return to your conversation and ask Tara for personal travel suggestions. You can revoke personalisation in Preferences.",
          );
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Could not connect.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Traveller
        <select name="customerId" required>
          <option value="">Choose your traveller record</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <input type="checkbox" name="confirmed" required /> I want Tara to use
        my saved travel preferences and confirmed trip estimates in this
        WhatsApp or email conversation for the next 24 hours.
      </label>
      <p>
        Exact trip choices and live price refreshes are confirmed in your secure
        personal advisor. Your marketing and model-training choices are
        separate.
      </p>
      <button disabled={busy} className="button button-gold">
        Connect this conversation
      </button>
      <p role="status">{status}</p>
    </form>
  );
}
