"use client";

import { Plus, Trash2 } from "lucide-react";
import type { TravellerPreferenceInput } from "@tlc/shared";
import { csv, csvValue, newTraveller } from "./travel-profile-utils";

const relationships = [
  "self",
  "spouse",
  "partner",
  "daughter",
  "son",
  "child",
  "parent",
  "sibling",
  "friend",
  "relative",
  "colleague",
  "other",
] as const;
export function TravellerProfileSection({
  travellers,
  onChange,
  onUpdate,
}: {
  travellers: TravellerPreferenceInput[];
  onChange: (travellers: TravellerPreferenceInput[]) => void;
  onUpdate: (index: number, next: Partial<TravellerPreferenceInput>) => void;
}) {
  return (
    <details>
      <summary>
        <span>2</span>
        <div>
          <b>Each traveller</b>
          <small>
            Separate preferences for you, your partner, children or parents
          </small>
        </div>
      </summary>
      <div className="traveller-stack">
        {travellers.map((traveller, index) => (
          <article className="traveller-card" key={traveller.clientId}>
            <header>
              <b>
                {index === 0 ? "Primary traveller" : `Traveller ${index + 1}`}
              </b>
              {index > 0 && (
                <button
                  type="button"
                  aria-label="Remove traveller"
                  onClick={() =>
                    onChange(
                      travellers.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 />
                </button>
              )}
            </header>
            <div className="preference-grid">
              <label>
                <span>First name / nickname</span>
                <input
                  value={traveller.firstName}
                  onChange={(event) =>
                    onUpdate(index, { firstName: event.target.value })
                  }
                  placeholder="Optional"
                />
              </label>
              <label>
                <span>Relationship</span>
                <select
                  value={traveller.relationship}
                  onChange={(event) =>
                    onUpdate(index, {
                      relationship: event.target
                        .value as TravellerPreferenceInput["relationship"],
                    })
                  }
                >
                  {relationships.map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Age group</span>
                <select
                  value={traveller.ageBand}
                  onChange={(event) =>
                    onUpdate(index, {
                      ageBand: event.target
                        .value as TravellerPreferenceInput["ageBand"],
                    })
                  }
                >
                  <option value="not_shared">Prefer not to share</option>
                  <option value="infant_0_2">Infant (0–2)</option>
                  <option value="child_3_7">Child (3–7)</option>
                  <option value="child_8_12">Child (8–12)</option>
                  <option value="teen_13_17">Teen (13–17)</option>
                  <option value="adult_18_39">Adult (18–39)</option>
                  <option value="adult_40_59">Adult (40–59)</option>
                  <option value="senior_60_plus">Senior (60+)</option>
                </select>
              </label>
              <label>
                <span>Flight seat</span>
                <select
                  value={traveller.flight.seat}
                  onChange={(event) =>
                    onUpdate(index, {
                      flight: {
                        ...traveller.flight,
                        seat: event.target
                          .value as TravellerPreferenceInput["flight"]["seat"],
                      },
                    })
                  }
                >
                  <option value="no_preference">No preference</option>
                  <option value="window">Window</option>
                  <option value="aisle">Aisle</option>
                  <option value="middle">Middle</option>
                  <option value="extra_legroom">Extra legroom</option>
                  <option value="together">Keep us together</option>
                </select>
              </label>
              <label>
                <span>Favourite things</span>
                <input
                  value={csvValue(traveller.interests)}
                  onChange={(event) =>
                    onUpdate(index, { interests: csv(event.target.value) })
                  }
                  placeholder="Swimming, animals, museums"
                />
              </label>
              <label>
                <span>Food preferences</span>
                <input
                  value={csvValue(traveller.foodPreferences)}
                  onChange={(event) =>
                    onUpdate(index, {
                      foodPreferences: csv(event.target.value),
                    })
                  }
                  placeholder="Gujarati, local food, familiar meals"
                />
              </label>
              <label>
                <span>Dietary needs</span>
                <input
                  value={csvValue(traveller.dietaryRequirements)}
                  onChange={(event) =>
                    onUpdate(index, {
                      dietaryRequirements: csv(event.target.value),
                    })
                  }
                  placeholder="Vegetarian, Jain, allergies"
                />
              </label>
              <label>
                <span>Accessibility / sensory needs</span>
                <input
                  value={csvValue([
                    ...traveller.accessibilityNeeds,
                    ...traveller.sensoryNeeds,
                  ])}
                  onChange={(event) =>
                    onUpdate(index, {
                      accessibilityNeeds: csv(event.target.value),
                      sensoryNeeds: [],
                    })
                  }
                  placeholder="Step-free, low walking, quiet spaces"
                />
              </label>
              <label className="form-wide">
                <span>Dislikes or non-negotiables</span>
                <input
                  value={csvValue(traveller.dislikes)}
                  onChange={(event) =>
                    onUpdate(index, { dislikes: csv(event.target.value) })
                  }
                  placeholder="Early starts, spicy food, boats"
                />
              </label>
            </div>
          </article>
        ))}
        <button
          className="add-traveller"
          type="button"
          onClick={() => onChange([...travellers, newTraveller()])}
        >
          <Plus /> Add another family member or traveller
        </button>
      </div>
    </details>
  );
}
