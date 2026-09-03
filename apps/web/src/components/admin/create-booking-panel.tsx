"use client";

import { httpsCallable } from "firebase/functions";
import { CalendarPlus, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseFunctions } from "@/lib/firebase/client";

type TravellerForm = {
  id: string;
  title: "Mr" | "Mrs" | "Ms" | "Master" | "Miss";
  firstName: string;
  lastName: string;
  dob: string;
  nationality: string;
  passportRef: string;
};
const blank = (id = crypto.randomUUID()): TravellerForm => ({
  id,
  title: "Mr",
  firstName: "",
  lastName: "",
  dob: "",
  nationality: "Indian",
  passportRef: "",
});

export function CreateBookingPanel({ quoteId }: { quoteId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [travellers, setTravellers] = useState<TravellerForm[]>([
    blank("traveller-1"),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await httpsCallable<
        typeof undefined,
        { bookingId: string }
      >(
        getFirebaseFunctions(),
        "createBooking",
      )({
        quoteId,
        travellers: travellers.map((item) => ({
          ...item,
          passportRef: item.passportRef || undefined,
        })),
      } as never);
      router.push(`/admin/bookings/${result.data.bookingId}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message.replace(/^Firebase:\s*/i, "")
          : "Booking creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (!open)
    return (
      <button className="button primary" onClick={() => setOpen(true)}>
        <CalendarPlus />
        Create booking
      </button>
    );
  return (
    <form className="booking-create-panel" onSubmit={submit}>
      <header>
        <div>
          <b>Traveller details</b>
          <span>
            Create an approval-controlled booking from this accepted quote.
          </span>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => setTravellers([...travellers, blank()])}
        >
          <Plus />
          Traveller
        </button>
      </header>
      {travellers.map((traveller, index) => (
        <fieldset key={traveller.id}>
          <legend>Traveller {index + 1}</legend>
          <label>
            Title
            <select
              value={traveller.title}
              onChange={(event) =>
                setTravellers(
                  travellers.map((item) =>
                    item.id === traveller.id
                      ? {
                          ...item,
                          title: event.target.value as TravellerForm["title"],
                        }
                      : item,
                  ),
                )
              }
            >
              {["Mr", "Mrs", "Ms", "Master", "Miss"].map((title) => (
                <option key={title}>{title}</option>
              ))}
            </select>
          </label>
          {(
            [
              "firstName",
              "lastName",
              "dob",
              "nationality",
              "passportRef",
            ] as const
          ).map((field) => (
            <label key={field}>
              {field === "passportRef"
                ? "Secure passport file reference"
                : field.replace(/([A-Z])/g, " $1")}
              <input
                required={field !== "passportRef"}
                type={field === "dob" ? "date" : "text"}
                value={traveller[field]}
                onChange={(event) =>
                  setTravellers(
                    travellers.map((item) =>
                      item.id === traveller.id
                        ? { ...item, [field]: event.target.value }
                        : item,
                    ),
                  )
                }
              />
            </label>
          ))}
          {travellers.length > 1 && (
            <button
              type="button"
              aria-label="Remove traveller"
              onClick={() =>
                setTravellers(
                  travellers.filter((item) => item.id !== traveller.id),
                )
              }
            >
              <Trash2 />
            </button>
          )}
        </fieldset>
      ))}
      {error && <p className="form-error">{error}</p>}
      <footer>
        <button
          type="button"
          className="button secondary"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
        <button className="button primary" disabled={busy}>
          {busy ? "Creating…" : "Submit for approval"}
        </button>
      </footer>
    </form>
  );
}
