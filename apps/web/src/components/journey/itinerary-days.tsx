"use client";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  MapPin,
  Plus,
  Trash2,
} from "lucide-react";
import { journeyDate, type JourneyPlan } from "@tlc/shared";

type Days = JourneyPlan["days"];
export function ItineraryDays({
  days,
  startDate,
  names = {},
  onChange,
}: {
  days: Days;
  startDate: string | null;
  names?: Record<string, string>;
  onChange?: (days: Days) => void;
}) {
  function update(index: number, change: Partial<Days[number]>) {
    onChange?.(
      days.map((day, i) => (i === index ? { ...day, ...change } : day)),
    );
  }
  return (
    <div className="journey-days">
      {days.map((day, index) => (
        <section
          className="journey-day"
          id={`itinerary-${day.id}`}
          key={day.id}
        >
          <div className="journey-day-marker">
            <b>{day.day}</b>
            <span />
          </div>
          <div className="journey-day-content">
            <header>
              <small>
                DAY {day.day}
                {startDate ? ` · ${journeyDate(startDate, index)}` : ""}{" "}
                <span>
                  {" "}
                  · {names[day.destinationSlug] || day.destinationSlug}
                </span>
              </small>
              {onChange ? (
                <input
                  aria-label={`Day ${day.day} title`}
                  value={day.title}
                  maxLength={180}
                  onChange={(event) =>
                    update(index, { title: event.target.value })
                  }
                />
              ) : (
                <h3>{day.title}</h3>
              )}
            </header>
            {day.activities.map((activity, position) => (
              <article
                className={`journey-activity kind-${activity.kind}`}
                key={activity.id}
              >
                <span className="journey-activity-icon">
                  <MapPin size={17} />
                </span>
                <div>
                  {onChange && activity.kind === "note" ? (
                    <>
                      <input
                        aria-label={`Note title on day ${day.day}`}
                        value={activity.title}
                        maxLength={180}
                        onChange={(event) =>
                          update(index, {
                            activities: day.activities.map((item) =>
                              item.id === activity.id
                                ? { ...item, title: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                      <textarea
                        aria-label={`Note details on day ${day.day}`}
                        maxLength={1600}
                        value={activity.description}
                        onChange={(event) =>
                          update(index, {
                            activities: day.activities.map((item) =>
                              item.id === activity.id
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </>
                  ) : (
                    <>
                      <h4>{activity.title}</h4>
                      <p>{activity.description}</p>
                    </>
                  )}
                  {activity.kind === "experience" && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${activity.title} ${names[day.destinationSlug] || day.destinationSlug}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Explore on map <ExternalLink size={12} />
                    </a>
                  )}
                  {activity.kind === "note" && (
                    <small>
                      Your private note · excluded from shared links
                    </small>
                  )}
                </div>
                {onChange && (
                  <div className="journey-activity-controls">
                    <button
                      title="Move up"
                      aria-label={`Move ${activity.title} up`}
                      disabled={position === 0}
                      onClick={() => {
                        const items = [...day.activities];
                        [items[position - 1], items[position]] = [
                          items[position],
                          items[position - 1],
                        ];
                        update(index, { activities: items });
                      }}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      title="Move down"
                      aria-label={`Move ${activity.title} down`}
                      disabled={position === day.activities.length - 1}
                      onClick={() => {
                        const items = [...day.activities];
                        [items[position + 1], items[position]] = [
                          items[position],
                          items[position + 1],
                        ];
                        update(index, { activities: items });
                      }}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      title="Remove"
                      aria-label={`Remove ${activity.title}`}
                      onClick={() =>
                        update(index, {
                          activities: day.activities.filter(
                            (item) => item.id !== activity.id,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </article>
            ))}
            {onChange && day.activities.length < 10 && (
              <button
                className="journey-add-note"
                onClick={() =>
                  update(index, {
                    activities: [
                      ...day.activities,
                      {
                        id: crypto.randomUUID(),
                        kind: "note",
                        title: "Your idea",
                        description: "",
                      },
                    ],
                  })
                }
              >
                <Plus size={14} /> Add a note or an idea
              </button>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
