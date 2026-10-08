import { journeyDate, type JourneySnapshot } from "@tlc/shared";
import { ItineraryDays } from "@/components/journey/itinerary-days";
export function JourneyPlanPanel({ journey }: { journey: JourneySnapshot }) {
  const { plan, revision } = journey;
  return (
    <section className="profile-panel">
      <header>
        <h2>Client’s planned itinerary</h2>
        <p>
          Saved revision {revision} · {plan.brief.nights} nights ·{" "}
          {plan.brief.pace} pace
        </p>
      </header>
      <h3>{plan.title}</h3>
      <p>
        {plan.brief.startDate
          ? `${plan.brief.startDate} to ${journeyDate(plan.brief.startDate, plan.brief.nights)}`
          : "Flexible travel dates"}
      </p>
      <p>{plan.brief.destinationSlugs.join(" → ")}</p>
      {plan.brief.rooms.map((room, index) => (
        <p key={index}>
          Room {index + 1}: {room.adults} adults
          {room.childrenAges.length
            ? ` · children’s ages ${room.childrenAges.join(", ")}`
            : ""}
        </p>
      ))}
      {plan.brief.budget && (
        <p>Total budget: ₹{plan.brief.budget.toLocaleString("en-IN")}</p>
      )}
      <p>
        {plan.brief.includeFlights
          ? "Include flights in quote"
          : "Flights not yet requested"}
      </p>
      {plan.brief.notes && <p>Private planning notes: {plan.brief.notes}</p>}
      <details>
        <summary>Review the daily plan and client notes</summary>
        <ItineraryDays days={plan.days} startDate={plan.brief.startDate} />
      </details>
      <p>
        Client planning draft: confirm routing, availability and inclusions
        before quoting.
      </p>
    </section>
  );
}
