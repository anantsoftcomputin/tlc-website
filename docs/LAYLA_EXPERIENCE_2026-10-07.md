# TLC conversational vacation planner

Reviewed 7 October 2026. The product direction is a conversational planning workspace inspired by Layla, using TLC branding, published destination content and a consultant quote handoff. Clients do not purchase or reserve inventory in this flow.

## Reference review

Reviewed Layla’s [public homepage](https://layla.ai/) and a [public example itinerary](https://layla.ai/trip/7-day-budget-family-tokyo-adventure/01M4942NS9FXZ5K0HYGW28CRPG?force=render). The public experience combines a natural-language starting prompt, inspiration, a conversation alongside a daily itinerary, route exploration, accommodation/transport choices and refinement prompts. This review did not verify authenticated, paid or booking flows. TLC uses its own copy, catalogue and imagery.

## Implemented experience

| Capability | TLC implementation |
| --- | --- |
| Start with an idea | Homepage prompt and starter suggestions open `/plan-my-trip`. |
| Plan through conversation | Tara extracts preferences into a validated trip brief. With an OpenAI key, the server uses structured responses; without it, a clearly labelled parser builds a catalogue-based starting plan. |
| Multi-stop itinerary | Up to five published destinations, one to thirty nights, transfer suggestions and a departure day. Clients can reorder stops and allocate nights to each; stop dates and hotel searches follow that allocation. Existing plans retain even distribution until edited. |
| Tailoring | Dates or flexible travel, budget, pace, interests, room occupancy, children’s ages, nationality, hotel rating and flight preference. |
| Daily editing | Rename days, reorder or remove activities, add private notes, save or undo changes. Rebuilding the route or pace preserves private notes. |
| Route exploration | Stop cards and external Google Maps searches. Embedded maps, travel-time calculations and route optimisation are not implemented. |
| Stays and flights | Existing TBO vacation designer, prefilled for the chosen stop; supplier results and curated fallback remain distinguishable. |
| Saved trips | Private Firestore records protected by the browser’s signed session cookie, with revision conflicts checked on save. This is not account-based cross-device sync. |
| Sharing | Explicit, revocable, expiring read-only snapshot links. The shared projection excludes party details, budget, private notes and conversation. Later edits require sharing again to refresh the snapshot. |
| Export | Browser print/save-as-PDF for the itinerary. No custom server-generated travel document. |
| Consultant handoff | Quote submission resolves the exact saved revision server-side, records the complete itinerary in the inquiry/CRM lead and requires contact consent. The inventory flow can attach its shortlist alongside the itinerary. |
| Responsive interface | Side-by-side desktop conversation and itinerary; mobile conversation/plan tabs. |

## Data and service boundaries

- `journeyPlans` contains private plans and recent conversation messages. Access requires the matching signed session and organisation. Application expiry is 90 days after saving.
- `journeyShares` contains public projections behind random tokens, stored under token hashes. Links expire after 30 days and can be revoked. Configure Firestore TTL on each collection’s `deleteAfter` field for physical cleanup; application expiry is enforced independently.
- Both collections deny direct client Firestore access. Server handlers validate origin/App Check according to existing deployment settings, enforce rate limits and validate schemas.
- Experiences must match published TLC catalogue entries. The model chooses catalogue identifiers; the server builds and validates the itinerary. Availability, prices, transfers and inclusions remain subject to TLC confirmation.
- Saved itinerary and supplier shortlist are separate snapshots. Both browser search and the server quote handler check that the selected destination, stay length, room composition, children’s ages and nationality match the itinerary. Fixed dates must match that stop exactly. For flexible trips, proposed hotel dates remain in the shortlist without setting dates for the whole journey. Hotel preferences can still be refined separately.
- Browser session expiry or clearing cookies makes private plans inaccessible. Shared links expose only their public snapshot. Account recovery and ownership transfer need a future authenticated trip library.

## Configuration and remaining work

The implementation is a working core planning flow, not full Layla feature parity.

1. **Enable and verify conversational AI.** This workspace had no `OPENAI_API_KEY` during implementation. Configure the existing `OPENAI_CHAT_MODEL` setting and test real planning conversations, model refusals, latency and cost before launch. Responses use [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses); schemas do not guarantee the factual correctness of free-text assistant messages.
2. **Complete supplier approval.** Existing TBO staging checks fetched static hotel data and flight results, but hotel availability returned `Access Credentials is incorrect`. Valid hotel availability credentials, approved end-user IP settings, certification and production endpoints remain prerequisites. See [TBO integration notes](TBO_INTEGRATION.md).
3. **Broaden destination evidence.** Current suggestions use published TLC experiences. Global places, dining, bookable activities, opening hours and verified geographic coordinates require additional content or a licensed data provider.
4. **Improve geographic routing.** Per-stop nights and route ordering are implemented. Geographic maps, travel-time checks and transport selection between stops remain. Current transfers are planning suggestions.
5. **Add richer assistant edits.** Conversation changes the trip brief and suggested experience order. Arbitrary day-specific rescheduling is currently handled through manual itinerary controls. Voice, image/document inspiration and group collaboration are not implemented.
6. **Add account-backed trip ownership** for cross-device history, collaborator permissions and recovery.
7. **Persist a combined shortlist across stops.** The current inventory view submits one search shortlist with the full itinerary. Switching stops resets that view’s selection. A saved basket of hotel and flight alternatives across the entire route is still needed for richer package comparison.

## Verification

`scripts/journey-smoke.mjs` runs the production UI against an isolated demo Firestore emulator, with external model/supplier calls disabled. It covers creation, persistence, private notes, sharing and revocation, cross-session denial, stale revisions, multi-stop editing, occupancy handoff, mobile layout and the exact itinerary saved in the CRM quote request. `scripts/vacation-smoke.mjs` retains regression coverage for the existing shortlist flow through `?mode=search`.

Unit tests cover preference extraction, grounded experiences, invalid plans, private share projections, notes surviving route changes, legacy/custom night allocations, leap-day dates and supplier consistency. Browser checks also cover route reordering, hotel date propagation, keyboard navigation in Trip details, rejection of mismatched supplier snapshots and flexible-date quote persistence. Firestore rules tests cover denial of direct access to private plans and shares. These checks do not certify live model output or TBO production availability.
