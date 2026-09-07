"use client";

import { UsersRound } from "lucide-react";
import {
  travelIntelligenceInputSchema,
  type TravelIntelligenceInput,
  type TravellerPreferenceInput,
} from "@tlc/shared";
import { newTraveller } from "./travel-profile-utils";
import { TripProfileSection } from "./travel-profile-trip-section";
import { TravellerProfileSection } from "./travel-profile-traveller-section";
import { SharedAndPermissionSections } from "./travel-profile-shared-section";

export function createTravelIntelligence(
  seed?: Partial<{
    destinations: string[];
    month: string;
    travellerType: string;
  }>,
): TravelIntelligenceInput {
  const family = seed?.travellerType?.toLowerCase() === "family";
  const season = seed?.month?.toLowerCase() || "";
  // Parse with service consent enabled so Zod can apply every nested default,
  // then deliberately return an unconsented draft. Consent must always be an
  // active choice in the UI; only the submission path validates the final draft.
  const initialized = travelIntelligenceInputSchema.parse({
    answeredFields: [
      ...(seed?.destinations?.length ? ["trip.destinations"] : []),
      ...(seed?.month ? ["sharedPreferences.preferredSeasons"] : []),
      ...(seed?.travellerType ? ["trip.partyType"] : []),
    ],
    trip: {
      destinations: seed?.destinations ?? [],
      destinationScope: seed?.destinations?.length ? "specific" : "either",
      adults: family
        ? 2
        : seed?.travellerType?.toLowerCase() === "solo"
          ? 1
          : 2,
      children: family ? 1 : 0,
    },
    sharedPreferences: {
      preferredSeasons:
        season.includes("october") || season.includes("festiv")
          ? ["festive"]
          : season.includes("january")
            ? ["winter"]
            : season.includes("april")
              ? ["summer"]
              : [],
      tripLength: {},
      flight: {},
      stay: {},
    },
    travellers: [newTraveller("self", true)],
    permissions: { serviceContact: true },
  });
  return {
    ...initialized,
    permissions: { ...initialized.permissions, serviceContact: false },
  };
}

export function TravelProfileCapture({
  value,
  onChange,
  compact = false,
}: {
  value: TravelIntelligenceInput;
  onChange: (value: TravelIntelligenceInput) => void;
  compact?: boolean;
}) {
  const markAnswered = (...paths: string[]) => [
    ...new Set([...value.answeredFields, ...paths]),
  ];
  const updateTrip = (next: Partial<TravelIntelligenceInput["trip"]>) =>
    onChange({
      ...value,
      trip: { ...value.trip, ...next },
      answeredFields: markAnswered(
        ...Object.keys(next).map((key) => `trip.${key}`),
      ),
    });
  const updateShared = (
    next: Partial<TravelIntelligenceInput["sharedPreferences"]>,
  ) =>
    onChange({
      ...value,
      sharedPreferences: { ...value.sharedPreferences, ...next },
      answeredFields: markAnswered(
        ...Object.keys(next).map((key) => `sharedPreferences.${key}`),
      ),
    });
  const updateTraveller = (
    index: number,
    next: Partial<TravellerPreferenceInput>,
  ) => {
    const travellers = [...value.travellers];
    travellers[index] = { ...travellers[index], ...next };
    onChange({
      ...value,
      travellers,
      answeredFields: markAnswered(
        ...Object.keys(next).map((key) => `travellers.${index}.${key}`),
      ),
    });
  };

  return (
    <section
      className={`travel-profile-capture ${compact ? "is-compact" : ""}`}
    >
      <header>
        <span>
          <UsersRound />
        </span>
        <div>
          <b>Build your travel profile</b>
          <p>
            Tell us once. TLC can remember what matters to each traveller and to
            your family as a whole.
          </p>
        </div>
      </header>
      <TripProfileSection value={value.trip} onChange={updateTrip} />
      <TravellerProfileSection
        travellers={value.travellers}
        onChange={(travellers) => onChange({ ...value, travellers })}
        onUpdate={updateTraveller}
      />
      <SharedAndPermissionSections
        shared={value.sharedPreferences}
        permissions={value.permissions}
        onSharedChange={updateShared}
        onPermissionChange={(permissions) =>
          onChange({ ...value, permissions })
        }
      />
    </section>
  );
}
