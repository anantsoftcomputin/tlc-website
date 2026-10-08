import {
  matchesVacationRoom,
  rankVacationProperties,
  vacationParty,
  type HotelContent,
  type VacationBrief,
  type VacationOption,
} from "@tlc/shared";
import type {
  FlightOffer,
  FlightProvider,
  FlightSearchRequest,
  HotelOffer,
  HotelSearchRequest,
  SourcedResult,
} from "@tlc/integrations";

type HotelSearchProvider = {
  search: (request: HotelSearchRequest) => Promise<SourcedResult<HotelOffer[]>>;
};
type Trip = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  destinationSlug?: string;
  days: number;
  image: string;
  styles: string[];
};
export type VacationEvidence = {
  optionId: string;
  kind: "hotel" | "flight";
  source: string;
  fetchedAt: string;
  offer: HotelOffer | FlightOffer;
  request: HotelSearchRequest | FlightSearchRequest;
};

/** Public cards are explicit projections. Supplier economics/session identifiers stay in evidence. */
export async function findVacationOptions(input: {
  brief: VacationBrief;
  hotels: HotelContent[];
  trips: Trip[];
  hotelProvider?: HotelSearchProvider;
  flightProvider?: Pick<FlightProvider, "search">;
  environment: "staging" | "production";
  now?: number;
  rankHotels?: (
    brief: VacationBrief,
    hotels: HotelContent[],
  ) => Promise<{
    ids: string[];
    method: "tlc-model" | "rules";
    model?: string;
  }>;
}) {
  const { brief } = input;
  const now = input.now ?? Date.now();
  const nights = Math.round(
    (Date.parse(brief.checkOut) - Date.parse(brief.checkIn)) / 86_400_000,
  );
  const ranked = rankVacationProperties(
    input.hotels.filter(
      (hotel) =>
        hotel.status === "published" &&
        hotel.destinationSlug === brief.destinationSlug,
    ),
    brief,
  ).slice(0, 40);
  let recommendation: { method: "tlc-model" | "rules"; model?: string } = {
    method: "rules",
  };
  if (input.rankHotels && ranked.length > 1) {
    try {
      const result = await input.rankHotels(
        brief,
        ranked.map((item) => item.property),
      );
      if (
        result.method === "tlc-model" &&
        result.ids.length === ranked.length &&
        new Set(result.ids).size === ranked.length &&
        result.ids.every((id) => ranked.some((item) => item.property.id === id))
      ) {
        ranked.sort(
          (a, b) =>
            result.ids.indexOf(a.property.id) -
            result.ids.indexOf(b.property.id),
        );
        recommendation = { method: result.method, model: result.model };
      }
    } catch {
      /* Supplier search still works when model inference is unavailable. */
    }
  }
  const properties = ranked.filter(({ property }) =>
    /^tbo:\d+$/.test(property.supplierRef),
  );
  const options: VacationOption[] = [];
  const evidence: VacationEvidence[] = [];
  const notices: string[] = [];
  const availability =
    input.environment === "production" ? ("live" as const) : ("test" as const);
  const hotelRequest: HotelSearchRequest = {
    destination: brief.destinationSlug,
    checkIn: brief.checkIn,
    checkOut: brief.checkOut,
    rooms: brief.rooms,
    guestNationality: brief.nationality,
    currency: "INR",
    hotelCodes: properties.map(({ property }) => property.supplierRef.slice(4)),
  };
  const flightRequest: FlightSearchRequest | undefined = brief.flights
    ? {
        ...brief.flights,
        departureDate: brief.checkIn,
        returnDate: brief.checkOut,
        ...vacationParty(brief),
        currency: "INR",
      }
    : undefined;

  const [hotelResult, flightResult] = await Promise.allSettled([
    input.hotelProvider && properties.length
      ? input.hotelProvider.search(hotelRequest)
      : Promise.resolve(undefined),
    input.flightProvider && flightRequest
      ? input.flightProvider.search(flightRequest)
      : Promise.resolve(undefined),
  ]);
  const liveHotels =
    hotelResult.status === "fulfilled" ? hotelResult.value : undefined;
  if (liveHotels && liveHotels.source !== "tbo-hotel")
    throw new Error("Unexpected hotel provider.");
  if (!liveHotels)
    notices.push(
      hotelResult.status === "rejected"
        ? "Live room availability is temporarily unavailable. You can still shortlist stays for TLC to check."
        : "Shortlist stays you like; TLC will confirm rooms and rates for your dates.",
    );
  else if (!liveHotels.data.length)
    notices.push(
      "No rooms were returned for these dates and room details. Try other dates or ask TLC to source alternatives.",
    );

  // Penalise stays whose supplier cost alone exceeds the whole holiday budget.
  // This does not estimate or publish TLC's final retail package price.
  if (brief.budget && liveHotels) {
    const withinBudget = (code: string) =>
      liveHotels.data.some(
        (offer) =>
          offer.hotelId === code &&
          offer.price.currency === "INR" &&
          offer.price.total <= brief.budget! &&
          Date.parse(offer.expiresAt) > now &&
          matchesVacationRoom(offer, brief),
      );
    ranked.sort(
      (a, b) =>
        Number(withinBudget(b.property.supplierRef.slice(4))) -
        Number(withinBudget(a.property.supplierRef.slice(4))),
    );
  }

  // Live availability is mandatory for requested refund/meal conditions. Catalogue-only
  // choices can still be shortlisted, but are explicitly marked for consultant checking.
  for (const rankedHotel of ranked) {
    if (options.length >= 18) break;
    const { property, reasons } = rankedHotel;
    const base = {
      kind: "hotel" as const,
      title: property.name,
      description: property.summary,
      image: property.image,
      href: `/hotels/${property.slug}`,
      starRating: property.starRating,
    };
    const matching = (liveHotels?.data || []).filter(
      (offer) =>
        offer.hotelId === property.supplierRef.slice(4) &&
        Date.parse(offer.expiresAt) > now &&
        offer.checkIn === brief.checkIn &&
        offer.checkOut === brief.checkOut &&
        Number.isFinite(offer.price.total) &&
        offer.price.total > 0 &&
        matchesVacationRoom(offer, brief),
    );
    // Budget is a ranking signal, never a promise of a retail package price.
    matching.sort((a, b) => {
      const penalty = (offer: HotelOffer) =>
        brief.budget &&
        offer.price.currency === "INR" &&
        offer.price.total > brief.budget
          ? 1
          : 0;
      return penalty(a) - penalty(b) || a.price.total - b.price.total;
    });
    if (matching.length) {
      for (const offer of matching.slice(0, Math.min(2, 18 - options.length))) {
        const id = `hotel-${options.length}`;
        options.push({
          ...base,
          id,
          roomName: offer.roomName.slice(0, 1000),
          mealPlan: offer.mealPlan.slice(0, 200),
          refundable: offer.refundable,
          availability,
          checkedAt: liveHotels!.fetchedAt,
          expiresAt: offer.expiresAt,
          reasons,
          details: [
            `${nights} nights · ${brief.rooms.length} room(s) · your entered guests`,
            ...(offer.details?.inclusions || [])
              .slice(0, 4)
              .map((item) => item.slice(0, 400)),
            ...(offer.details?.supplements || [])
              .filter((item) => item.type === "AtProperty")
              .slice(0, 6)
              .map((item) =>
                `Pay at property: ${item.description} (${item.currency} ${item.price})`.slice(
                  0,
                  400,
                ),
              ),
            "Final cancellation conditions and package price confirmed in your TLC quote.",
          ],
        });
        evidence.push({
          optionId: id,
          kind: "hotel",
          source: liveHotels!.source,
          fetchedAt: liveHotels!.fetchedAt,
          offer,
          request: hotelRequest,
        });
      }
    } else if (!liveHotels || !property.supplierRef.startsWith("tbo:")) {
      options.push({
        ...base,
        id: `hotel-${options.length}`,
        availability: "on_request",
        reasons,
        details: [
          "Room, meal and cancellation preferences will be checked by TLC.",
        ],
      });
    }
  }
  if (liveHotels && !options.length && liveHotels.data.length)
    notices.push(
      "No returned rooms matched your star, meal or cancellation choices. Adjust your preferences or ask TLC for help.",
    );

  const liveFlights =
    flightResult.status === "fulfilled" ? flightResult.value : undefined;
  if (liveFlights && liveFlights.source !== "tbo-flight")
    throw new Error("Unexpected flight provider.");
  if (brief.flights && !liveFlights)
    notices.push(
      "TLC will source flights for your route; live flight options are unavailable right now.",
    );
  if (liveFlights) {
    const flights = liveFlights.data.filter(
      (offer) =>
        Date.parse(offer.expiresAt) > now &&
        offer.itineraries.length > 0 &&
        (!brief.flights?.directOnly ||
          offer.itineraries.every((leg) => leg.segments.length === 1)),
    );
    flights.sort((a, b) => a.price.total - b.price.total);
    for (const offer of flights.slice(0, 6)) {
      const id = `flight-${options.length}`;
      const segments = offer.itineraries.flatMap((leg) => leg.segments);
      if (!segments.length) continue;
      options.push({
        id,
        kind: "flight",
        title: `${brief.flights!.origin} ↔ ${brief.flights!.destination}`,
        description: segments
          .map((leg) => `${leg.carrierCode} ${leg.flightNumber}`)
          .join(" · ")
          .slice(0, 1800),
        availability,
        checkedAt: liveFlights.fetchedAt,
        expiresAt: offer.expiresAt,
        reasons: [
          offer.cabinClass,
          brief.flights!.directOnly
            ? "Direct in each direction"
            : "Matches your requested route",
        ],
        details: [
          ...segments
            .slice(0, 8)
            .map(
              (segment) =>
                `${segment.origin} → ${segment.destination}: ${segment.departureAt.replace("T", " ").slice(0, 16)} – ${segment.arrivalAt.replace("T", " ").slice(0, 16)}`,
            ),
          offer.baggage.slice(0, 400),
          "Schedules, baggage and fare conditions will be reconfirmed by TLC.",
        ],
      });
      evidence.push({
        optionId: id,
        kind: "flight",
        source: liveFlights.source,
        fetchedAt: liveFlights.fetchedAt,
        offer,
        request: flightRequest!,
      });
    }
    if (!flights.length)
      notices.push(
        "No flights matched this route and your stop preference. TLC can help find alternatives.",
      );
  }
  const trips = input.trips
    .filter((trip) => trip.destinationSlug === brief.destinationSlug)
    .map((trip) => ({
      trip,
      score:
        trip.styles.filter((style) =>
          brief.interests.includes(
            style.toLowerCase() as VacationBrief["interests"][number],
          ),
        ).length *
          4 -
        Math.abs(trip.days - nights - 1),
    }))
    .sort((a, b) => b.score - a.score);
  for (const { trip } of trips.slice(0, 3))
    options.push({
      id: `trip-${trip.id}`,
      kind: "trip",
      title: trip.title,
      description: trip.summary,
      image: trip.image,
      href: `/trips/${trip.slug}`,
      availability: "on_request",
      reasons: [`${trip.days}-day itinerary to personalise`],
      details: [
        "Choose this as a starting point; TLC will adapt the route, stays and experiences.",
      ],
    });
  if (availability === "test" && (liveHotels || liveFlights))
    notices.unshift(
      "Preview: availability comes from TBO’s test environment. TLC must confirm real availability before quoting.",
    );
  return { options, evidence, notices, recommendation };
}
