"use client";
import { useState } from "react";
export function TripFeedback({ bookingId }: { bookingId: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <details className="trip-feedback">
      <summary>Tell us what you loved about this trip</summary>
      <form
        className="workspace-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const data = new FormData(event.currentTarget);
          try {
            const response = await fetch("/api/client/trip-feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                bookingId,
                requestId: crypto.randomUUID(),
                rating: Number(data.get("rating")),
                liked: data.getAll("liked"),
                disliked: data.getAll("disliked"),
                comment: data.get("comment"),
              }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error);
            setStatus(
              "Thank you. Your feedback is saved. With personalisation enabled, it will help shape future recommendations.",
            );
          } catch (error) {
            setStatus(
              error instanceof Error
                ? error.message
                : "Could not save feedback.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Overall experience
          <select name="rating" required>
            <option value="">Choose a rating</option>
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {value} / 5
              </option>
            ))}
          </select>
        </label>
        {(["liked", "disliked"] as const).map((field) => (
          <fieldset key={field}>
            <legend>
              {field === "liked"
                ? "More of this next time"
                : "Less of this next time"}
            </legend>
            {[
              "beach",
              "culture",
              "adventure",
              "family",
              "wellness",
              "romance",
              "nature",
              "luxury",
            ].map((item) => (
              <label key={item}>
                <input type="checkbox" name={field} value={item} />
                {item}
              </label>
            ))}
          </fieldset>
        ))}
        <label>
          Anything else for your consultant?
          <textarea name="comment" maxLength={2000} />
        </label>
        <p>
          Your comment goes to TLC. Only your selected travel interests are used
          as recommendation signals. This does not opt you into model training.
        </p>
        <button className="button button-gold" disabled={busy}>
          {busy ? "Saving…" : "Save trip feedback"}
        </button>
        <p role="status">{status}</p>
      </form>
    </details>
  );
}
