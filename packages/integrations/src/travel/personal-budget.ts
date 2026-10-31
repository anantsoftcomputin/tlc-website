import {
  tripServiceKinds,
  type PersonalTripInput,
  type PersonalBudget,
  type PlanningRate,
  type PricingPolicy,
} from "@tlc/shared";
import type { VacationEvidence } from "./vacation-search.js";
import type { HotelOffer, FlightOffer } from "../index.js";
const round = (amount: number) =>
  Math.round((amount + Number.EPSILON) * 100) / 100;
/** Costs never leave this function. Public lines contain retail prices and explicitly priced scope. */
export function buildPersonalBudgets(input: {
  trip: PersonalTripInput;
  evidence: VacationEvidence[];
  policy?: PricingPolicy;
  rates: PlanningRate[];
  live: boolean;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  const { brief, includedServices } = input.trip;
  const nights =
    (Date.parse(brief.checkOut) - Date.parse(brief.checkIn)) / 86400000;
  const people = brief.rooms.reduce(
    (sum, room) => sum + room.adults + room.childrenAges.length,
    0,
  );
  const fresh = input.evidence.filter(
    (item) =>
      item.offer.price.currency === "INR" &&
      Number.isFinite(item.offer.price.total) &&
      item.offer.price.total >= 0 &&
      Date.parse(item.offer.expiresAt) > now,
  );
  const flights = fresh
    .filter((item) => item.kind === "flight")
    .sort((a, b) => a.offer.price.total - b.offer.price.total);
  const hotels = fresh.filter((item) => item.kind === "hotel");
  return (hotels.length ? hotels : [undefined])
    .map((hotel, preferenceRank) => {
      const budget: PersonalBudget = {
        currency: "INR",
        status: "incomplete",
        lines: [],
        subtotal: 0,
        total: null,
        budget: brief.budget!,
        remaining: null,
        withinBudget: null,
        missing: [],
        exclusions: tripServiceKinds.filter(
          (kind) => !includedServices.includes(kind),
        ),
        disclaimer:
          "An itemised planning estimate for the confirmed scope, not a reservation. Availability and final prices are rechecked in your TLC quote. Excluded services and personal spending are not included.",
      };
      if (!input.live)
        budget.missing.push(
          "Production supplier availability is not configured or this is test inventory.",
        );
      if (!input.policy)
        budget.missing.push(
          "TLC retail pricing policy has not been configured.",
        );
      const used: VacationEvidence[] = [];
      let margin = 0;
      if (!hotel)
        budget.missing.push("A live room price for your dates and party.");
      if (hotel) {
        const offer = hotel.offer as HotelOffer;
        if (
          brief.rooms.length > 1 &&
          offer.details?.rooms !== brief.rooms.length
        )
          budget.missing.push(
            "Supplier confirmation that the hotel price covers every requested room.",
          );
        if (offer.details?.supplements?.length)
          budget.missing.push(
            "Confirmation of hotel supplements and any pay-at-property charges.",
          );
        used.push(hotel);
      }
      if (includedServices.includes("flight")) {
        const flight = flights.find(
          (item) => (item.offer as FlightOffer).itineraries.length >= 2,
        );
        if (flight) used.push(flight);
        else budget.missing.push("A return flight price for every traveller.");
      }
      if (input.policy)
        for (const item of used) {
          const cost = item.offer.price.total;
          const minimum =
            item.kind === "hotel"
              ? Number(
                  (item.offer as HotelOffer).details?.minimumSellingRate || 0,
                )
              : 0;
          const retail = round(
            Math.max(cost * (1 + input.policy.markupPct / 100), minimum),
          );
          margin += retail - cost;
          budget.lines.push({
            kind: item.kind,
            title:
              item.kind === "hotel"
                ? (item.offer as HotelOffer).hotelName
                : "Return flights for your party",
            amount: retail,
            source: item.source,
          });
        }
      const units = (rate: PlanningRate) =>
        rate.unit === "person"
          ? people
          : rate.unit === "night"
            ? nights
            : rate.unit === "roomNight"
              ? nights * brief.rooms.length
              : 1;
      const fixedRetail =
        budget.lines.reduce((sum, line) => sum + line.amount, 0) +
        (input.policy
          ? input.policy.serviceFee +
            round(
              ((margin + input.policy.serviceFee) *
                input.policy.serviceTaxPct) /
                100,
            )
          : 0);
      type Choice = { rates: PlanningRate[]; amount: number; quality: number };
      let choices: Choice[] = [{ rates: [], amount: 0, quality: 0 }];
      for (const kind of includedServices.filter(
        (kind) => kind !== "hotel" && kind !== "flight",
      )) {
        const eligible = input.rates.filter(
          (rate) =>
            rate.kind === kind &&
            rate.status === "active" &&
            rate.destinationSlug === brief.destinationSlug &&
            rate.validFrom <= brief.checkIn &&
            rate.travelUntil >= brief.checkOut &&
            Date.parse(rate.validUntil) > now,
        );
        if (!eligible.length) {
          budget.missing.push(`A current tax-inclusive ${kind} price.`);
          continue;
        }
        // Integer preference scores allow exact cost/fit optimisation without enumerating every combination.
        const bestAtQuality = new Map<number, Choice>();
        for (const choice of choices)
          for (const rate of eligible) {
            const quality =
              choice.quality +
              new Set(
                rate.interests.filter((interest) =>
                  brief.interests.includes(
                    interest as (typeof brief.interests)[number],
                  ),
                ),
              ).size;
            const candidate = {
              rates: [...choice.rates, rate],
              amount: round(choice.amount + rate.amount * units(rate)),
              quality,
            };
            if (
              !bestAtQuality.has(quality) ||
              bestAtQuality.get(quality)!.amount > candidate.amount
            )
              bestAtQuality.set(quality, candidate);
          }
        choices = [...bestAtQuality.values()];
      }
      const affordable = choices.filter(
        (choice) => round(fixedRetail + choice.amount) <= brief.budget!,
      );
      const best = affordable.length
        ? affordable.sort(
            (a, b) => b.quality - a.quality || a.amount - b.amount,
          )[0]
        : choices.sort(
            (a, b) => a.amount - b.amount || b.quality - a.quality,
          )[0];
      const chosenRates = best.rates;
      for (const rate of chosenRates)
        budget.lines.push({
          kind: rate.kind,
          title: rate.title,
          amount: round(rate.amount * units(rate)),
          source: rate.source,
        });

      if (input.policy) {
        budget.lines.push({
          kind: "tlcFees",
          title: "TLC service fee",
          amount: input.policy.serviceFee,
          source: "TLC configured pricing",
        });
        budget.lines.push({
          kind: "serviceTax",
          title: "Tax on TLC services",
          amount: round(
            ((margin + input.policy.serviceFee) * input.policy.serviceTaxPct) /
              100,
          ),
          source: "TLC configured tax policy",
        });
      }
      budget.subtotal = round(
        budget.lines.reduce((sum, line) => sum + line.amount, 0),
      );
      if (!budget.missing.length) {
        budget.status = "complete";
        budget.total = budget.subtotal;
        budget.remaining = round(budget.budget - budget.total);
        budget.withinBudget = budget.remaining >= 0;
        budget.expiresAt = new Date(
          Math.min(
            ...used.map((item) => Date.parse(item.offer.expiresAt)),
            ...chosenRates.map((rate) => Date.parse(rate.validUntil)),
          ),
        ).toISOString();
      }
      return {
        preferenceRank,
        hotelOptionId: hotel?.optionId,
        flightOptionId: used.find((item) => item.kind === "flight")?.optionId,
        rateIds: chosenRates.map((rate) => rate.id),
        budget,
      };
    })
    .sort(
      (a, b) =>
        Number(b.budget.status === "complete") -
          Number(a.budget.status === "complete") ||
        Number(b.budget.withinBudget) - Number(a.budget.withinBudget) ||
        a.preferenceRank - b.preferenceRank ||
        (a.budget.total ?? Infinity) - (b.budget.total ?? Infinity),
    );
}
