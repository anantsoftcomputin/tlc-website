# TLC Travel Intelligence Foundation

## Outcome

TLC now captures travel intent as structured, permissioned evidence at four levels:

1. **Current trip** — origin, destination direction, dates, flexibility, duration, party, rooms, budget, occasion and flight inclusion.
2. **Individual traveller** — relationship, age band, interests, pace, food, seat, airline, room, accessibility, sensory needs, dislikes and notes.
3. **Household** — the family's shared holiday styles, seasons, climate, planning pace, flight/stay preferences, decision factors, must-haves and avoid list.
4. **Observed behaviour** — enquiries, conversations, quotes, bookings and campaign interactions remain immutable time-stamped events.

Explicit answers are never overwritten by a model inference. New evidence creates a preference signal with its source, confidence, timestamp and training permission.

## Storage map

| Location                      | Purpose                                             | Mutation policy                        |
| ----------------------------- | --------------------------------------------------- | -------------------------------------- |
| `inquiries/{id}.intelligence` | Complete trip-specific intake snapshot              | Server created                         |
| `leads/{id}.requirement`      | Sales-operational trip, party and preference brief  | Existing CRM controls                  |
| `customers/{id}`              | Saved shared preference summary and completeness    | Only when profile storage is permitted |
| `households/{id}`             | Per-person and shared family profile                | Server only; travel staff read         |
| `preferenceSignals/{id}`      | Immutable explicit/inferred evidence and provenance | Server only                            |
| `customers/{id}/events/{id}`  | Training/event log with permission snapshot         | Append-only server writes              |
| `voiceSessions/{id}`          | Voice consent, transcript links and latency         | Server only                            |

Marketing staff cannot read raw household profiles. Model jobs run with server credentials and must filter `modelTrainingAllowed == true`. Dietary, accessibility and sensory details require their own permission and are removed from assistant context when it is absent.

## Feature families

### Traveller identity without unnecessary PII

- Stable household-local traveller ID
- Relationship: self, spouse, partner, daughter, son, child, parent, sibling, friend, relative or colleague
- Broad age band rather than date of birth
- Primary contact indicator
- Unknown and `not_shared` remain valid values

Passport numbers, payment details, exact child birth dates and loyalty membership numbers do not belong in an enquiry or chatbot profile.

### Flight preferences

- Preferred and avoided airlines
- Economy through first-class cabin preference
- Window, aisle, middle, extra-legroom, together or no seat preference
- Departure window
- Direct-only, one-stop, shortest-time or best-value routing
- Meal, baggage, airport-assistance preference

### Stay preferences

- Star/category and property type
- Room setup and bed type
- View, amenity, brand and meal-plan preferences
- Quiet, accessible and connecting-room needs

### Experience preferences

- Beach, mountains, nature, wildlife, history, food, adventure, wellness, romance, luxury, family, theme park, cruise, road trip, city, shopping, nightlife, photography, spiritual and sports affinities
- Individual pace and activity level
- Food likes, dietary needs, interests and dislikes
- Shared family must-haves, nice-to-haves, avoid list and decision factors

### Seasonality and commercial context

- Preferred months, seasons, school/festive windows and climate
- Typical trip-length range and current nights/days
- Total/per-person/per-night budget scope
- Origin city/airports, party size, rooms and flight inclusion
- Booking window and actual historical spend continue to come from bookings, not user guesses

## Progressive capture strategy

The form exposes four expandable stages. Only contact permission and the minimum contact fields are compulsory. Rich profiling is voluntary and can be completed over time by the website, travel consultant or assistant. This protects conversion while producing structured data.

The chatbot should ask one high-information question at a time. For example, after “four nights and three days in India”, it should clarify the duration conflict before searching inventory, then ask origin, dates/flexibility, party composition, budget and the family's desired feeling. It should confirm extracted preferences before making them durable.

## Visual and voice response contract

`assistantResponseEnvelopeSchema` provides a single response format for web chat, voice and future WhatsApp rendering:

- Natural-language message plus a shorter speech version
- Grounded destination, hotel, flight, activity, transfer and package cards
- Image URL, alt text, CMS/provider source, entity ID and fetch time
- Day-by-day visual itinerary referencing only returned cards
- Follow-up questions and confirmed preference updates
- Human-handover decision
- Tool-result IDs and ungrounded-claim report

The grounding validator rejects entity IDs, images and prices that were not returned by a current-turn CMS or inventory tool. A hotel image must belong to the same hotel record. Availability is explicitly `live`, `cached`, `on_request` or `unknown`.

## Training rules

- Train only on signals where `modelTrainingAllowed` is true.
- Keep explicit, observed and inferred features separate.
- Use event-time splits; never leak future bookings into earlier examples.
- Do not use protected or sensitive needs to decide price, service priority or eligibility.
- Use accessibility/dietary information only to satisfy the trip requirement.
- Record missingness; never convert “not shared” into a negative preference.
- Evaluate family recommendations both per traveller and for household satisfaction.
- Version schemas, feature transforms, consent policy and model artifacts together.

## Next conversational milestone

The contracts are ready for Phase 6 implementation: persona studio, grounded tool orchestrator, web widget, voice session transport, visual itinerary renderer, WhatsApp conversation adapter, staff handover and conversation-quality evaluations.
