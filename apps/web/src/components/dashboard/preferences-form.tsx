"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommunicationPreferences } from "@tlc/shared";
export function PreferencesForm({
  initial,
  hasPhone,
}: {
  initial: CommunicationPreferences;
  hasPhone: boolean;
}) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setBusy(true);
        setStatus("");
        try {
          const response = await fetch("/api/client/preferences", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              destinations: String(data.get("destinations") || "")
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
              interests: data.getAll("interests"),
              budget: data.get("budget"),
              preferredChannel: data.get("preferredChannel"),
              frequency: data.get("frequency"),
              emailOffers: data.has("emailOffers"),
              whatsappOffers: data.has("whatsappOffers"),
            }),
          });
          if (!response.ok)
            throw new Error(
              (await response.json()).error || "Could not save preferences.",
            );
          setStatus(
            "Your preferences are saved. You can change them at any time.",
          );
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Please try again.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Destinations on your wish list
        <input
          name="destinations"
          defaultValue={initial.destinations.join(", ")}
          placeholder="Bali, Dubai, Japan"
          maxLength={800}
        />
        <small>Separate up to ten destinations with commas.</small>
      </label>
      <fieldset>
        <legend>What do you enjoy?</legend>
        <div className="preference-options">
          {[
            "beach",
            "culture",
            "food",
            "adventure",
            "wellness",
            "family",
            "luxury",
            "wildlife",
          ].map((interest) => (
            <label key={interest}>
              <input
                type="checkbox"
                name="interests"
                value={interest}
                defaultChecked={initial.interests.includes(
                  interest as CommunicationPreferences["interests"][number],
                )}
              />
              {interest}
            </label>
          ))}
        </div>
      </fieldset>
      <label>
        Your travel style
        <select name="budget" defaultValue={initial.budget}>
          <option value="flexible">Flexible</option>
          <option value="value">Great value</option>
          <option value="comfort">Extra comfort</option>
          <option value="luxury">Luxury</option>
        </select>
      </label>
      <label>
        Preferred way to talk
        <select name="preferredChannel" defaultValue={initial.preferredChannel}>
          <option value="web">My TLC inbox</option>
          <option value="email">Email</option>
          <option value="whatsapp" disabled={!hasPhone}>
            WhatsApp
          </option>
        </select>
      </label>
      <fieldset>
        <legend>Holiday inspiration & offers</legend>
        <p>
          Choose the channels where TLC can send personalised offers based on
          your preferences and travel history. Booking support remains available
          regardless of these choices.
        </p>
        <div className="preference-options">
          <label>
            <input
              type="checkbox"
              name="emailOffers"
              defaultChecked={initial.emailOffers}
            />
            Email offers
          </label>
          <label>
            <input
              type="checkbox"
              name="whatsappOffers"
              disabled={!hasPhone}
              defaultChecked={hasPhone && initial.whatsappOffers}
            />
            WhatsApp offers
          </label>
        </div>
        {!hasPhone && (
          <p>
            Ask TLC to link your WhatsApp number to your traveller record to
            enable WhatsApp offers.
          </p>
        )}
        <label>
          Maximum frequency across channels
          <select name="frequency" defaultValue={initial.frequency}>
            <option value="weekly">Once a week</option>
            <option value="monthly">Once a month</option>
            <option value="never">No promotional messages</option>
          </select>
        </label>
      </fieldset>
      <button disabled={busy} className="button button-gold">
        {busy ? "Saving…" : "Save my preferences"}
      </button>
      <p role="status">{status}</p>
    </form>
  );
}
