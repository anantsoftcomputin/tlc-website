# TBO (Tek Travels) integration

TBO supplies two things to TLC Travel OS: **flights** (Air API) and **hotels** (Universal Hotel API, including static property content). This integration uses flight and hotel inventory. Vacation packages remain TLC-authored trips in the CMS, tailored by a consultant around the client’s shortlisted stays, flights and experiences. The agreed client flow is **shortlist → request a TLC quote**.

## What lives where

| Piece | Location |
|---|---|
| HTTP client, daily token, redacted logging | `packages/integrations/src/tbo/client.ts` |
| Endpoints and environment config | `packages/integrations/src/tbo/config.ts` |
| Static content (country, city, hotel list, details) | `packages/integrations/src/tbo/static-content.ts` |
| Hotel search, prebook, book, cancel | `packages/integrations/src/tbo/hotels.ts` (`tbo-hotel`) |
| Air search, fare rule/quote, book, ticket, details, cancel | `packages/integrations/src/tbo/flights.ts` (`tbo-flight`) |
| Catalogue import and 15-day refresh | `apps/functions/src/tbo-catalogue.ts` |
| Inventory search, live re-price, rate observations | `apps/functions/src/inventory.ts` |
| Staff catalogue screen | `/admin/content/suppliers` |
| Client vacation designer | `/plan-my-trip`, `apps/web/src/components/vacation-designer.tsx` |
| Search and private evidence | `apps/web/src/repositories/firebase/vacation-repository.ts` |
| Matching rules and safe shortlist schema | `packages/shared/src/travel/vacation-ranking.ts`, `packages/shared/src/schemas/vacation.ts` |

## Data stored in Firestore

- `supplierCities` – each imported TBO city, its website destination and import filters. A daily job refreshes cities whose last successful import is at least 14 days old, meeting the documented 15-day cadence. Import status, attempt time, counts, error and a ten-minute concurrency lease are stored on the city. Failed imports can be retried; a partial import is recorded as failed, not completed.
- `supplierHotels` – the full TBO property record: description, facilities, attractions, photos, coordinates, check-in times, plus numeric `features` (stars, pool, spa, beach, kids, transfers and so on) for recommendations and modelling.
- `hotels` (CMS) – one record per imported property (`{orgId}-tbo-{HotelCode}`, retaining legacy `tbo-{HotelCode}` IDs only for their existing owner). The public `/hotels` pages render these. Properties with a photo and a description are published when the staff member ticks *Publish*; the rest are drafts. Once staff edit a record, later syncs no longer change its content, and archived records stay archived.
- `inventoryOffers` – short-lived priced offers from searches; quote creation validates dates, currency, provider and expiry and uses the trusted cost from this evidence. A live supplier reprice is a separate staff action. TBO hotel minimum selling rates are enforced when validating fresh evidence.
- `vacationSearches` – server-only search snapshots with a safe display projection and separate supplier evidence. Opaque search IDs expire after 48 hours; references are validated against the server record and organization when an enquiry is submitted. Configure a Firestore TTL policy on `vacationSearches.deleteAfter` for cleanup; expiry is enforced even without TTL.
- `inquiries.vacationShortlist` and `leads.requirement.vacationShortlist` – the client’s chosen alternatives and exact brief. `leads.vacationInventory` retains selected supplier evidence for staff; clients cannot submit their own offer payloads.
- `supplierRateObservations` – one aggregated row per search: market, travel date, nights, party size, lead days and the min/median/max price. No customer data.
- `tboApiLogs` – redacted request/response pairs, only while `TBO_LOG_TRAFFIC=true`; deleted after 30 days.

## Configuration

Set these for **Functions** (apps/functions/.env or Secret Manager) and the **website** (Netlify). See `.env.example`.

- `TBO_API_USERNAME`, `TBO_API_PASSWORD` – the agency API login TBO issued (not the B2B portal login).
- `TBO_STATIC_USERNAME`, `TBO_STATIC_PASSWORD` – static content login. Staging uses TBO's published test account; production uses the one TBO issues.
- `TBO_END_USER_IP` – the server's public IP; TBO whitelists it in production.
- `TBO_ENV=staging|production`. Production refuses to start until every `TBO_*_URL` is set from TBO's certification email; staging uses the documented URLs. Staging air is HTTP-only on TBO's side.
- `TBO_LOG_TRAFFIC=true` while running certification cases.

Provider credentials must be configured separately in both runtimes; the website now performs public searches on its server. They must never use `NEXT_PUBLIC_` environment variables. Set the same `TLC_ORG_ID` for the website and its content.

Then a manager opens **Website content → Supplier catalogue**, selects `tbo-flight` and `tbo-hotel` as live inventory providers, and imports cities.

## Client flow

1. Choose a published destination, future stay of 1–30 nights, 1–4 rooms, adults and children’s ages at arrival, nationality and optional total INR budget.
2. Choose interests, preferred facilities, minimum stars, meals and refund preference. Optional return flights use airport codes and the same dates; flight age categories are derived from the room ages.
3. Search published CMS hotels linked to that destination (up to 40 relevant properties), then request TBO availability by stored hotel code. Ranking uses recorded facilities/styles and prioritizes available stays whose INR supplier cost is within the whole-party budget. This is not a retail package estimate; final pricing is in TLC’s quote. Matching is deterministic and explainable, not a trained-model recommendation.
4. Shortlist up to eight alternatives. Supplier net costs, booking codes and tokens are omitted from public cards. Pay-at-property supplements returned by TBO appear in room details. Test availability is labelled as a preview. Failed/unconfigured hotel availability falls back to catalogue choices labelled “Availability on request”; an actual successful search with no matching rooms does not invent availability. Mock providers are never shown as live client options. Public supplier calls are capped at 25 seconds each (authentication plus air search fits within the 60-second route budget); slow calls fall back to consultant assistance. Staff inventory retains its longer search deadline.
5. Review the shortlist, enter contact details and actively consent to a service response. The server resolves selected IDs, saves the complete brief and selected alternatives, and creates the CRM lead idempotently. Selections do not reserve rooms or seats. No payment or supplier-booking call occurs in this flow.
6. Staff open the lead’s shortlist panel and follow “Search inventory with this brief”. Dates, room occupancy, nationality and optional flight details are prefilled; quote creation stays linked to that lead. Supplier rates expire sooner than the 48-hour shortlist, so staff must re-search and price-check before quoting.

Availability access should be enabled only after TBO accepts the account’s credentials and production setup. Catalogue choices and the simple travel-brief fallback remain usable independently.

## Staff flow

1. Import a city: choose country, city, the website destination it belongs to, minimum stars and how many properties to bring in. A bounded import samples across star categories, rather than only importing the most expensive category. Supplier and CMS writes are scoped to the organization; staff edits are preserved transactionally.
2. Search inventory as before. Hotel searches use the synced property codes for the destination (TBO searches by code, in parallel batches of 100). Flight searches use TBO's Search; domestic returns pair the cheapest outbound and inbound fares.
3. *Price check* calls TBO live: FareQuote for flights, PreBook for hotels. The cached offer is updated, so the quote uses the confirmed supplier cost. Flight cost is TBO's OfferedFare (agency net); the published fare is kept alongside.
4. Booking with suppliers stays human-confirmed, as in the rest of TLC Travel OS. The adapters implement TBO Book/Ticket/Cancel so this can be automated later behind the existing approval controls.

## Certification with TBO

TBO's flow: Authenticate → Search → FareRule → FareQuote → SSR (optional) → Book → Ticket → GetBookingDetails. TBO first wants the sample case, DEL–BOM return for 2 adults, 1 child and 1 infant, then mandatory test cases 1–7.

1. Set `TBO_LOG_TRAFFIC=true` on Functions in staging.
2. Run each case from the staff inventory screen, noting the start time.
3. Export the logs: `pnpm tbo:export-logs -- 2026-10-06T10:00:00Z tbo-logs/sample-case`. This writes one request and one response JSON file per call, with passwords and tokens redacted.
4. Send them to TBO with the request ID, then book the 30-minute call (Tue–Thu, 12:00 or 16:00).

The automated tests in `packages/integrations/src/tbo/tbo.test.ts` cover the documented request shapes for these calls, but they don't replace TBO's live sample verification.

## How this data relates to the neural network

The TLC model learns from **how customers respond** to offers: deliveries, conversions and bookings, captured with each customer's consent. Supplier catalogues and prices contain no customer behaviour, so they can't train it on their own. What they add:

- **Item features.** `supplierHotels.features` and star ratings describe what is being offered, so offers built on TBO properties can be compared with each other.
- **Market context.** `supplierRateObservations` record price levels by destination, season and lead time, which helps with price-band and demand features.
- **Outcome labels.** Bookings made through TBO become real labelled outcomes once customers book them.

Adding these as model inputs changes the model's input contract. It belongs in a new model version once enough labelled bookings exist, not in the current 120/48-feature model.


## Verification recorded on 2026-10-06

Read-only staging checks with the workspace configuration:

- Static content: 249 countries, 29 UAE cities, Dubai code `115936`, 4,902 hotel records; detailed descriptions, photos and facilities returned for sample properties.
- Real static-data persistence: two Dubai hotels imported into the isolated demo Firestore emulator, with supplier records and draft CMS records; all sampled image hosts were `www.tboholidays.com`.
- Shared authentication: passed.
- Flight search: DEL–BOM return, 10–15 December 2026, two adults and one child: 25 options in INR.
- Hotel availability: TBO rejected the agency credentials with `Access Credentials is incorrect`. This is unresolved. Confirm the HotelAPI account credentials/entitlement with TBO; successful static-content login and shared flight authentication do not prove hotel-search access.
- `TBO_END_USER_IP` is absent in the workspace configuration. Production configuration now rejects a missing/invalid/loopback IP. Production still requires TBO-issued endpoints, approved egress IP and certification.

Local verification passed: build, lint, all workspace type checks, 158 unit tests, 19 Firestore rule tests, five emulator integration tests and the desktop/mobile browser enquiry flow. Coverage includes schema/ranking/privacy, supplier adapters, quote evidence, catalogue storage and staff-edit preservation, tenant isolation, explicit consent, idempotent submissions and stale/forged selections. All supplier booking, payment and cancellation tests use fixtures/emulators; no real reservations were made. No production database was seeded and nothing was deployed.

Repeat the browser smoke test after building, with a running demo Firestore emulator:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8185 GCLOUD_PROJECT=demo-tlc-holidays node scripts/vacation-smoke.mjs
```

The script starts its own website on port 3105, disables provider credentials, writes only emulator fixtures, verifies consent, saved rooms/ages, duplicate submissions, invalid selections and expired searches, and saves desktop/mobile screenshots under `/tmp/tlc-vacation-smoke`. Integration tests are included in CI through `pnpm test:integration`.

## Supplier documentation

- [Hotel static content and refresh guidance](https://apidoc.tektravels.com/hotelnew/hoteldetails.aspx)
- [Hotel search contract, occupancy, minimum selling rate and supplements](https://apidoc.tektravels.com/hotelnew/HotelSearch.aspx)
- [Hotel PreBook contract](https://apidoc.tektravels.com/hotelnew/HotelPreBook.aspx)
