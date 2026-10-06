**TLC Travel OS — project study, 6 October 2026**

This study describes the current working tree, including its substantial uncommitted changes, rather than just the latest commit (`e8a1dfc`). It combines source inspection, documentation comparison, fresh automated verification, and local public-page checks. Application source was not changed. Provider credentials, production data, deployed configuration, and live commercial integrations were not inspected or exercised.

**What the product does**

TLC Travel OS combines a travel discovery website, a staff operations console, a customer portal, and an AI-assisted sales and marketing system. Its central journey is:

Discovery → enquiry → customer and assigned lead → versioned quote → customer acceptance → booking approval → supplier fulfilment → collection, settlement and finance.

The source inventory contains 330 TypeScript/TSX files and approximately 35,171 lines across application and package source, including tests. The web application has 58 page routes and 17 route handlers. Stylesheets total approximately 14,147 lines. These counts exclude generated package output and dependencies.

| Workspace | Responsibility |
| --- | --- |
| `apps/web` | Next.js 15.5.25, React 19.2.8, App Router, public and authenticated pages, HTTP commands, Firebase repositories |
| `apps/functions` | Firebase Functions v2: privileged commands, webhooks, triggers, scheduled jobs; Node 22 target |
| `packages/shared` | Zod schemas, domain types, permissions, customer import/search, quote calculations, journals, tax and reports |
| `packages/integrations` | Flight, hotel, payment, accounting and messaging contracts; mocks and credential-backed adapters |
| `packages/ai-core` | Customer features, segmentation, recommendations, supervisor rules, TensorFlow.js training and evaluation |
| `packages/ai-chat` | Assistant context, preference extraction, response schemas and grounding validation |
| `packages/ui` | A small token export; most actual components remain in the web application |
| `firebase`, `scripts` | Security rules, indexes, emulator configuration, seeds, migrations and operational utilities |

pnpm 10.33 and Turborepo coordinate the seven packages. Firebase supplies authentication, Firestore and storage. Netlify configuration builds the web application; Firebase CLI deploys Functions and rules. Functions target `asia-south1`; Firestore configuration specifies `nam5`. Production location and deployment status were not independently verified.

**Website and content**

Public routes cover destinations, tours, hotels, holiday styles, saved trips, trip planning, contact, services and travel stories. Detail pages use slugs. Metadata, sitemap, robots and legacy PHP redirects are implemented. Anonymous saved trips use browser storage.

The homepage uses travel photography, a prominent search form, horizontal trip cards, destination tiles, assurances, holiday styles and an expert-planning call to action. Fraunces and Manrope are configured; CSS controls their use across the different page sections. Branding uses TLC red, dark surfaces and light backgrounds. `globals.css` now imports sixteen smaller stylesheets, alongside commerce and dashboard styling.

Published content is loaded through [public-content.ts](../apps/web/src/lib/public-content.ts), scoped to the configured organization and cached for five minutes. A migration flag controls the transition away from checked-in catalogue content. On a Firestore failure, the loader serves the last good in-process catalogue, or static fallback content if none exists. Hotels have no equivalent static catalogue fallback.

The CMS handles destinations, hotels, trips, styles and categories, with publishing state, ordering, SEO, media and audit writes. Dedicated stories, testimonial, FAQ, navigation and global-settings editors remain follow-up work in the plan.

**Identity and workspaces**

Firebase browser sign-in exchanges an ID token for a five-day HTTP-only server session. Owners, managers and administrators route to `/admin/owner`; other staff to `/admin/employee`; verified customers to `/client`.

Shared permissions drive web access. Customer repositories separately enforce organization and ownership, and household access has a narrower policy. Business records deny browser writes in Firestore rules. Callables also apply an active-account check and compare profile claims with token claims. Management sessions require a second factor in production, with emulator exceptions.

The client portal matches the verified email address to same-organization customer records, then projects enquiries, customer-visible quotes, bookings, payments and documents. Support requests have client ownership and staff reply workflows. Team administration updates Auth claims, user profiles and audit records, and revokes sessions.

The server session and browser Firebase identity are separate access paths. Changes to authorization still need coverage across server repositories, callables and rules, even with the shared permission package.

**Intake and CRM**

The enquiry endpoint checks origin/application attestation, uses Firestore-backed rate limiting when configured, validates with Zod, and delegates to [FirestoreInquiryRepository](../apps/web/src/repositories/firebase/firestore-inquiry-repository.ts).

Intake uses deterministic identifiers for retry handling and repeat-contact matching. A transaction creates the enquiry, lead, initial activity and audit evidence, and creates or reuses the customer. Permissioned household/profile evidence can be merged. Concierge handover can attach the conversation and assigned consultant in the same transaction. Repeat conversation handovers can update the existing lead.

CRM includes pipeline and list views, ownership, follow-ups, response SLAs, activity history, customer profiles, household preferences and CSV/XLSX import with duplicate review. Customer listing uses cursors; indexed prefix search is maintained by a trigger and has a backfill utility. Assignment labelled “round robin” uses deterministic hashing rather than a rotating counter.

**Commerce and finance**

Inventory adapters normalize flight and hotel results with provider provenance, timestamps and short-lived server evidence. The registry includes mocks, Amadeus, Hotelbeds and TBO. TBO also imports static hotels into supplier collections and the editorial CMS.

Quote commands validate supplier-backed items against server-owned inventory evidence, recompute economics, derive approval exceptions and create immutable commercial revisions. Manual services have an explicit source. Sending verifies evidence again and permits previously verified prices within a configurable freshness window, defaulting to 72 hours when cached offers have expired. Quote creation itself does not call a live provider repricing API; the separate price-check command does.

Random bearer-token itinerary links return a customer-safe projection. Only the latest accepted quote can become a booking. A manager approves that booking before collection and fulfilment. Approval creates receivable/payable records and a balanced journal.

Finance covers payment links, offline receipts, signed Razorpay events, reconciliation, supplier settlement reservations, cancellations, refunds, numbered invoices/receipts/credit notes, accounting sync and period close/reopen. Posting and close operations share an organization-level transaction lock. Date comparisons now include the last day of a finance period. Unpostable provider payments become finance exception alerts.

A new manager-operated TBO fulfilment command re-finds and reprices the service, checks price tolerance, invokes booking, and records uncertain outcomes for manual investigation. Its normal quote-to-booking path currently has the blocking issue described below. Supplier cost increases create an alert for finance review rather than automatically revising the payable.

**AI and marketing**

Tara searches published catalogue content, constructs application-owned cards, and optionally generates structured text through a configured language model. Deterministic responses remain available when generation is unavailable. Conversation cookies carry a secret verified against a server-side hash. Chat checks conversation status, turn persistence respects takeover, and the widget polls for staff replies.

Preference confirmation, CRM handover, persona versions, satisfaction, staff assist and WhatsApp continuity are implemented. Telemetry now distinguishes actual provider/fallback paths, token usage, failures, grounding issues and unpriced usage. Grounding checks cover structured entities, result references, image identity and currency amounts; they do not prove every natural-language claim.

Marketing separates audience selection, consent, approval and delivery. Rules-based scoring is the default. The neural model has 120 customer inputs, 48 offer inputs and five output heads. Training uses send-time snapshots and mature outcome windows; unavailable long-horizon labels are masked. Candidate eligibility includes 500 positive events, ROC AUC ≥ 0.72 and Brier score ≤ 0.25, followed by human activation. No deployed model or real-world predictive quality was verified.

Voice remains deferred. Public live-supplier search and full generative day-by-day itineraries remain incomplete customer experiences.

**Fresh verification**

| Check | Result |
| --- | --- |
| Workspace preparation | Passed; built shared packages and refreshed Functions vendors |
| Lint and TypeScript | 14 tasks passed, cache bypassed |
| Unit tests | 143 passed across 54 files; 3 emulator integration cases skipped in this run |
| Firestore rules | 19 passed |
| Commerce integration | All 3 passed separately against an isolated Firestore emulator |
| Production build | All 7 tasks passed, cache bypassed |
| Public HTTP | Home, destinations, trips, hotels, planner, login, robots and sitemap returned 200 |
| Anonymous protected routes | Admin and client redirected to their login routes |
| Legacy URL | `/about_us.php` returned 308 to `/about` |
| Browser homepage | Chrome desktop/mobile checks; no initial page exceptions or horizontal document overflow at 1440px/390px |

The integration cases exercise accepted quote → booking approval → concurrent/idempotent payment capture → supplier settlement; approved cancellation/refund; and a race between period close and payment on the final day.

The existing emulator ports were occupied. Rules and integration checks therefore ran on isolated port 8185. A temporary rules-test copy changed only its hardcoded emulator port and was removed afterward. The existing emulator was left running. Expected permission-denied assertions and transaction contention generated emulator diagnostics; the suites passed.

Local runtime was Node 23.4.0 and Java 23.0.2, producing a Node engine warning. The project and CI target Node 22 and Java 21. These results do not establish provider certification, production MFA/App Check setup, authenticated portal end-to-end correctness, or comprehensive accessibility. The existing `portal-smoke.mjs` was inspected but not run.

**Confirmed issues and remaining limits**

1. **TBO supplier identity is removed before booking.** [Quote inventory validation](../apps/functions/src/quote-inventory.ts) builds a trusted `raw` supplier identity, then deletes it in both creation and send validation. Booking creation copies quote items. The [booking control](../apps/web/src/components/admin/booking-controls.tsx) displays “Book with TBO” only when `item.raw.provider` starts with `tbo-`, and [fulfilment](../apps/functions/src/supplier-fulfilment.ts) requires that identity. A local reproduction returned `tbo-hotel` from the trusted helper but no identity from `verifyQuoteInventory`, making the button condition false. Preserve a sanitized server-owned identity through the lifecycle and test the full provider-backed path. Existing commerce integration fixtures use manual items and miss this break.

2. **Several tour-search controls do not affect results.** [TripsPage](../apps/web/src/app/trips/page.tsx) filters only by text and travel style. The selected date period is displayed but does not filter; traveller count is unused. Duration checkboxes, sorting and the mobile Filters button have no implemented action. The search component also initializes empty/default values rather than restoring the current query. These are visible product gaps.

3. **CI omits the commerce integration suite.** The [workflow](../.github/workflows/ci.yml) runs unit tests and rules tests, but not `test:integration` or the portal smoke script. The three transaction tests are skipped in ordinary unit runs. Add an explicit emulator integration step so their coverage runs on pull requests.

4. **Customer search can miss matches after its candidate cap.** The repository fetches at most 200 records matching one indexed term, then applies remaining search words in memory and returns at most 50. Valid matches outside that initial candidate set remain invisible. Normal directory pagination does not solve search pagination.

5. **Some operations still grow with all historical data.** Finance close reads organization-wide journals, payments, settlements and cancellation requests inside a transaction before filtering dates. The client dashboard loads all related records and performs per-booking payment queries. Supervisor/profile jobs page through their data, but still process complete populations. Measure these paths at realistic volume and introduce bounded queries or aggregates where necessary.

6. **Documentation needs reconciliation.** The root architecture file still describes Next.js 16 and an in-memory repository. The September study contains issues that current code has addressed. TBO documentation says supplier booking remains manual even though a fulfilment command now exists, and describes quote-time repricing more strongly than the implementation supports. Use source plus demonstrated checks as the current status. The plan still marks production index deployment, MFA enablement and customer-search backfill outstanding.

**Practical follow-up order**

First repair and test the supplier-identity lifecycle. Then complete the visible tour-search controls and add the existing commerce integration suite to CI. Follow with authenticated portal/role tests, customer search pagination, and scaling checks on finance and portal queries. Reconcile the deployment/runbook documents before treating a release as operationally verified.

For subsequent changes, begin with the shared schema and permission, trace the repository or command, follow its UI caller, and inspect the relevant rules/index and tests. Functions consume vendored builds of shared packages, so run workspace preparation after shared-package changes.
