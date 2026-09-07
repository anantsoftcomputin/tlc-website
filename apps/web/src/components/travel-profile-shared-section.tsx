"use client";

import {
  holidayStyles,
  type SharedTravelPreference,
  type TravelDataPermission,
} from "@tlc/shared";
import { csv, csvValue, styleLabels } from "./travel-profile-utils";

export function SharedAndPermissionSections({
  shared,
  permissions,
  onSharedChange,
  onPermissionChange,
}: {
  shared: SharedTravelPreference;
  permissions: TravelDataPermission;
  onSharedChange: (next: Partial<SharedTravelPreference>) => void;
  onPermissionChange: (permissions: TravelDataPermission) => void;
}) {
  const permission = (next: Partial<TravelDataPermission>) =>
    onPermissionChange({ ...permissions, ...next });
  const toggleStyle = (style: (typeof holidayStyles)[number]) =>
    onSharedChange({
      holidayStyles: shared.holidayStyles.includes(style)
        ? shared.holidayStyles.filter((item) => item !== style)
        : [...shared.holidayStyles, style],
    });
  return (
    <>
      <details>
        <summary>
          <span>3</span>
          <div>
            <b>Your family’s shared style</b>
            <small>What should the holiday feel like overall?</small>
          </div>
        </summary>
        <div className="preference-block">
          <span>Holiday styles</span>
          <div className="preference-chips">
            {holidayStyles.map((style) => (
              <label
                key={style}
                className={
                  shared.holidayStyles.includes(style) ? "selected" : ""
                }
              >
                <input
                  type="checkbox"
                  checked={shared.holidayStyles.includes(style)}
                  onChange={() => toggleStyle(style)}
                />
                {styleLabels[style]}
              </label>
            ))}
          </div>
        </div>
        <div className="preference-grid">
          <label>
            <span>Overall pace</span>
            <select
              value={shared.pace}
              onChange={(event) =>
                onSharedChange({
                  pace: event.target.value as SharedTravelPreference["pace"],
                })
              }
            >
              <option value="flexible">Flexible</option>
              <option value="slow">Slow and restful</option>
              <option value="balanced">Balanced</option>
              <option value="active">Active</option>
              <option value="packed">See as much as possible</option>
            </select>
          </label>
          <label>
            <span>Climate</span>
            <select
              value={shared.climate}
              onChange={(event) =>
                onSharedChange({
                  climate: event.target
                    .value as SharedTravelPreference["climate"],
                })
              }
            >
              <option value="flexible">Flexible</option>
              <option value="cool">Cool</option>
              <option value="warm">Warm</option>
              <option value="tropical">Tropical</option>
              <option value="snow">Snow</option>
              <option value="dry">Dry</option>
            </select>
          </label>
          <label>
            <span>Airlines you prefer</span>
            <input
              value={csvValue(shared.flight.preferredAirlines)}
              onChange={(event) =>
                onSharedChange({
                  flight: {
                    ...shared.flight,
                    preferredAirlines: csv(event.target.value),
                  },
                })
              }
              placeholder="IndiGo, Air India, Emirates"
            />
          </label>
          <label>
            <span>Flight routing</span>
            <select
              value={shared.flight.routing}
              onChange={(event) =>
                onSharedChange({
                  flight: {
                    ...shared.flight,
                    routing: event.target
                      .value as SharedTravelPreference["flight"]["routing"],
                  },
                })
              }
            >
              <option value="flexible">Flexible</option>
              <option value="direct_only">Direct only</option>
              <option value="one_stop_ok">One stop is fine</option>
              <option value="shortest_time">Shortest journey</option>
              <option value="best_value">Best value</option>
            </select>
          </label>
          <label>
            <span>Stay categories</span>
            <input
              value={shared.stay.categories.join(", ")}
              onChange={(event) =>
                onSharedChange({
                  stay: {
                    ...shared.stay,
                    categories: csv(event.target.value).filter(
                      (
                        item,
                      ): item is SharedTravelPreference["stay"]["categories"][number] =>
                        [
                          "3_star",
                          "4_star",
                          "5_star",
                          "boutique",
                          "luxury",
                          "villa",
                          "apartment",
                          "homestay",
                          "resort",
                        ].includes(item),
                    ),
                  },
                })
              }
              placeholder="5_star, resort, villa"
            />
          </label>
          <label>
            <span>Hotel must-haves</span>
            <input
              value={csvValue(shared.stay.amenities)}
              onChange={(event) =>
                onSharedChange({
                  stay: { ...shared.stay, amenities: csv(event.target.value) },
                })
              }
              placeholder="Pool, kids club, beach access"
            />
          </label>
          <label>
            <span>Family must-haves</span>
            <input
              value={csvValue(shared.mustHaves)}
              onChange={(event) =>
                onSharedChange({ mustHaves: csv(event.target.value) })
              }
              placeholder="Private transfers, free evenings"
            />
          </label>
          <label>
            <span>Please avoid</span>
            <input
              value={csvValue(shared.avoid)}
              onChange={(event) =>
                onSharedChange({ avoid: csv(event.target.value) })
              }
              placeholder="Long drives, crowded tours"
            />
          </label>
        </div>
      </details>
      <details open>
        <summary>
          <span>4</span>
          <div>
            <b>How TLC may use this information</b>
            <small>
              Your choices control profile storage and model training
            </small>
          </div>
        </summary>
        <div className="permission-list">
          <Permission
            checked={permissions.serviceContact}
            onChange={(checked) => permission({ serviceContact: checked })}
            title="Respond to this trip request *"
          >
            Required so a TLC expert can contact you about this enquiry.
          </Permission>
          <Permission
            checked={permissions.saveProfile}
            onChange={(checked) =>
              permission({
                saveProfile: checked,
                modelTraining: checked ? permissions.modelTraining : false,
              })
            }
            title="Remember our travel profile"
          >
            Reuse these preferences for future TLC trips. You can ask us to
            update or delete them.
          </Permission>
          <Permission
            checked={permissions.modelTraining}
            onChange={(checked) =>
              permission({
                modelTraining: checked,
                saveProfile: checked || permissions.saveProfile,
              })
            }
            title="Improve personalised recommendations"
          >
            Allow preference signals to train TLC’s recommendation models.
          </Permission>
          <Permission
            checked={permissions.sensitivePreferences}
            onChange={(checked) =>
              permission({ sensitivePreferences: checked })
            }
            title="Store dietary, accessibility and sensory needs"
          >
            Required only when those optional details are provided.
          </Permission>
          <Permission
            checked={permissions.guardianAuthority}
            onChange={(checked) => permission({ guardianAuthority: checked })}
            title="I am authorised to provide a child’s preferences"
          >
            Required before TLC saves a profile for a traveller under 18.
          </Permission>
        </div>
      </details>
    </>
  );
}

function Permission({
  checked,
  onChange,
  title,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  children: string;
}) {
  return (
    <label>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        <b>{title}</b>
        <small>{children}</small>
      </span>
    </label>
  );
}
