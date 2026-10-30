"use client";
import { useState } from "react";
import type { PlanningRate, PricingPolicy } from "@tlc/shared";
export function PersonalizationSettings({
  pricing,
  initialRates,
}: {
  pricing: PricingPolicy | null;
  initialRates: PlanningRate[];
}) {
  const [rates, setRates] = useState<Partial<PlanningRate>[]>(initialRates);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setBusy(true);
        setStatus("");
        try {
          const response = await fetch("/api/admin/personalization", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pricing: {
                markupPct: Number(form.get("markup")),
                serviceFee: Number(form.get("fee")),
                serviceTaxPct: Number(form.get("tax")),
                currency: "INR",
              },
              rates: rates.map((rate) => ({
                ...rate,
                taxesIncluded: true,
                validUntil: new Date(rate.validUntil!).toISOString(),
              })),
            }),
          });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error);
          setStatus(
            "Pricing saved. Future searches use these rates; existing estimates retain their expiry and must be refreshed.",
          );
        } catch (error) {
          setStatus(
            error instanceof Error ? error.message : "Could not save pricing.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset>
        <legend>Retail planning policy (INR)</legend>
        <p>
          Enter the rates approved by your finance team. Supplier totals already
          include their stated taxes. The service tax below applies only to
          TLC’s markup and flat service fee.
        </p>
        <label>
          Markup on supplier totals (%)
          <input
            type="number"
            step="0.01"
            name="markup"
            min="0"
            max="100"
            required
            defaultValue={pricing?.markupPct}
          />
        </label>
        <label>
          Flat TLC service fee (INR)
          <input
            type="number"
            step="0.01"
            name="fee"
            min="0"
            required
            defaultValue={pricing?.serviceFee}
          />
        </label>
        <label>
          Tax on TLC services (%)
          <input
            type="number"
            step="0.01"
            name="tax"
            min="0"
            max="100"
            required
            defaultValue={pricing?.serviceTaxPct}
          />
        </label>
      </fieldset>
      <h2>Tax-inclusive extras and experiences</h2>
      <p>
        Add actual sourced prices for the travel period. Unpriced services are
        shown to clients as missing, and paused or expired rates are excluded.
      </p>
      {rates.map((rate, index) => {
        const update = (patch: Partial<PlanningRate>) =>
          setRates((current) =>
            current.map((item, i) =>
              i === index ? { ...item, ...patch } : item,
            ),
          );
        return (
          <fieldset key={index}>
            <legend>Rate {index + 1}</legend>
            <label>
              Unique rate reference
              <input
                required
                value={rate.id || ""}
                pattern="[a-zA-Z0-9_-]{1,120}"
                onChange={(event) => update({ id: event.target.value })}
              />
            </label>
            <label>
              Destination slug
              <input
                required
                value={rate.destinationSlug || ""}
                onChange={(event) =>
                  update({ destinationSlug: event.target.value })
                }
                placeholder="dubai"
              />
            </label>
            <label>
              Service
              <select
                value={rate.kind || "transfer"}
                onChange={(event) =>
                  update({ kind: event.target.value as PlanningRate["kind"] })
                }
              >
                {["transfer", "activity", "insurance", "visa", "other"].map(
                  (kind) => (
                    <option key={kind}>{kind}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              Client-facing description
              <input
                required
                value={rate.title || ""}
                onChange={(event) => update({ title: event.target.value })}
              />
            </label>
            <label>
              Tax-inclusive retail amount (INR)
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={rate.amount ?? ""}
                onChange={(event) =>
                  update({
                    amount:
                      event.target.value === ""
                        ? undefined
                        : Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Price covers
              <select
                value={rate.unit || "trip"}
                onChange={(event) =>
                  update({ unit: event.target.value as PlanningRate["unit"] })
                }
              >
                <option value="trip">Whole trip</option>
                <option value="person">Each traveller</option>
                <option value="night">Each night</option>
                <option value="roomNight">Each room per night</option>
              </select>
            </label>
            <label>
              Interest tags
              <input
                value={rate.interests?.join(", ") || ""}
                onChange={(event) =>
                  update({
                    interests: event.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="beach, culture"
              />
            </label>
            <label>
              Supplier or rate source
              <input
                required
                value={rate.source || ""}
                onChange={(event) => update({ source: event.target.value })}
              />
            </label>
            <label>
              First travel date
              <input
                required
                type="date"
                value={rate.validFrom || ""}
                onChange={(event) => update({ validFrom: event.target.value })}
              />
            </label>
            <label>
              Last travel date
              <input
                required
                type="date"
                value={rate.travelUntil || ""}
                onChange={(event) =>
                  update({ travelUntil: event.target.value })
                }
              />
            </label>
            <label>
              Price confirmation expires
              <input
                required
                type="datetime-local"
                value={
                  rate.validUntil
                    ? rate.validUntil.endsWith("Z")
                      ? new Date(
                          Date.parse(rate.validUntil) -
                            new Date(rate.validUntil).getTimezoneOffset() *
                              60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : rate.validUntil
                    : ""
                }
                onChange={(event) => update({ validUntil: event.target.value })}
              />
            </label>
            <label>
              Status
              <select
                value={rate.status || "active"}
                onChange={(event) =>
                  update({
                    status: event.target.value as PlanningRate["status"],
                  })
                }
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                setRates((current) => current.filter((_, i) => i !== index))
              }
            >
              Remove / pause this rate
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        onClick={() =>
          setRates((current) => [
            ...current,
            {
              kind: "transfer",
              currency: "INR",
              unit: "trip",
              status: "active",
              interests: [],
              taxesIncluded: true,
            },
          ])
        }
      >
        Add a sourced rate
      </button>
      <button className="button primary" disabled={busy}>
        {busy ? "Saving…" : "Save pricing and rates"}
      </button>
      <p role="status">{status}</p>
    </form>
  );
}
