import Link from "next/link";
import type { VacationShortlist } from "@tlc/shared";

export function VacationShortlistPanel({
  shortlist,
  leadId,
}: {
  shortlist: VacationShortlist;
  leadId: string;
}) {
  const { brief } = shortlist;
  return (
    <section className="profile-panel">
      <header>
        <div>
          <div>
            <h2>Client’s holiday shortlist</h2>
            <p>
              {brief.checkIn} → {brief.checkOut} · {brief.nationality}{" "}
              nationality · {brief.rooms.length} room(s)
            </p>
          </div>
        </div>
      </header>
      <div className="lead-party-brief">
        {brief.rooms.map((room, index) => (
          <article key={index}>
            <b>Room {index + 1}</b>
            <span>
              {room.adults} adults
              {room.childrenAges.length
                ? ` · children’s ages: ${room.childrenAges.join(", ")}`
                : ""}
            </span>
          </article>
        ))}
      </div>
      <p>
        Preferences:{" "}
        {[
          ...brief.interests,
          ...brief.amenities,
          brief.mealPlan !== "any" ? brief.mealPlan : "",
          brief.refundableOnly ? "refundable rooms" : "",
        ]
          .filter(Boolean)
          .join(" · ") || "Open to recommendations"}
      </p>
      {brief.budget && (
        <p>Total holiday budget: ₹{brief.budget.toLocaleString("en-IN")}</p>
      )}
      <div className="lead-party-brief">
        {shortlist.options.map((option) => (
          <article key={option.id}>
            <b>{option.title}</b>
            <span>{option.roomName || option.description}</span>
            {option.mealPlan && <small>{option.mealPlan}</small>}
            <small>
              {option.availability === "test"
                ? "Staging result — check production availability"
                : option.availability === "on_request"
                  ? "Availability not yet checked"
                  : `Availability checked ${option.checkedAt?.slice(0, 16).replace("T", " ")}`}
            </small>
          </article>
        ))}
      </div>
      <p>
        These are alternatives, not a combined package. Re-search and
        price-check the chosen services before sending a quote.
      </p>
      <Link
        className="button primary"
        href={`/admin/inventory?leadId=${encodeURIComponent(leadId)}`}
      >
        Search inventory with this brief
      </Link>
    </section>
  );
}
