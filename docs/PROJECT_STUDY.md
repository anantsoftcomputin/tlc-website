TLC Travel OS — project study

Reviewed on 17 September 2026. This assessment combines repository inspection, fresh automated checks, and local HTTP smoke checks. It describes the checked-out code, not the configuration or operating status of the deployed service. No production records, external messages, payments, or deployments were created during this review.

**What the project is**

TLC Travel OS combines the TLC Holidays public website with a staff operations platform. The central business journey is discovery → enquiry → customer and lead → quote → customer acceptance → booking approval → supplier fulfilment → collection and finance. Marketing and the Tara concierge feed into that journey.

The source inventory contains 272 TypeScript/TSX files and approximately 30,000 lines across application and package source, including tests. The Next.js application has 50 page routes and 12 route handlers, including finance export. The main global stylesheet is another 12,883 lines.

| Area | Implementation and purpose |
| --- | --- |
| `apps/web` | Next.js 15.5.25, React 19.2.8, App Router, public pages, authenticated staff pages, HTTP endpoints, Firebase repositories |
| `apps/functions` | Firebase Functions v2, Node 22 target, callable business commands, signed webhooks, triggers and scheduled jobs |
| `packages/shared` | Zod domain schemas, domain types, permissions, customer import utilities, quote arithmetic, tax, journals and finance reports |
| `packages/integrations` | Flight, hotel, payment, accounting and messaging interfaces, mock providers and credential-backed adapters |
| `packages/ai-core` | Feature engineering, segmentation, rules recommendations, supervisor alerts, TensorFlow.js model and evaluation |
| `packages/ai-chat` | Assistant context, preference extraction, response contracts and grounding validation |
| `packages/ui` | Small design-token export; it is not yet a reusable component library |
| `firebase` | Firestore and Storage rules, Firestore indexes |
| `scripts` | Seed data, content migration, role assignment and password setup utilities |

The workspace uses pnpm 10.33 and Turborepo. Firebase provides authentication, Firestore and object storage. Netlify is the configured web build target; Firebase CLI handles backend deployment. Functions use `asia-south1`, while the configured Firestore location is `nam5`.

**How the main flows work**

The public website offers destinations, trips, hotels, holiday styles, saved trips, trip planning, contact and informational pages. Dynamic detail pages use slugs; legacy PHP paths redirect into the new routes. Server-rendered catalogue data comes from published Firestore documents and is cached for five minutes. Checked-in destinations, trips and styles are used when their collections are empty or loading fails. Hotels have an empty-state experience instead of equivalent static fallback content.

The visual implementation uses Fraunces and Manrope, travel photography, red/wine/ivory CSS tokens, responsive navigation and motion helpers. Most components live directly under `apps/web/src/components`; the installed Tailwind dependencies do not make the shared UI package the actual design-system source. Testimonials and some informational content remain checked in.

All ordinary website intake goes through [the enquiry endpoint](../apps/web/src/app/api/inquiries/route.ts). It validates with Zod, applies an in-memory rate limit and delegates to [FirestoreInquiryRepository](../apps/web/src/repositories/firebase/firestore-inquiry-repository.ts). A single Firestore transaction creates the enquiry, customer, lead, initial activity and audit record. Rich intake can also create customer events, a household profile and preference signals. Lead ownership is selected before the transaction from organization assignment settings or eligible staff. The policy called round robin uses a deterministic hash to distribute requests rather than a rotating counter.

Staff sign in through Firebase Auth, exchange an ID token for a five-day HTTP-only session cookie, and enter `/admin`. Server components verify the session and read through Firebase Admin repositories. Interactive command components commonly call Firebase callable functions with the browser's Firebase identity. These are two distinct authorization paths: a server session controls page access, while the Firebase ID token controls callable commands.

CRM supports a lead pipeline, assignment, response SLAs, activity history, follow-ups, customer detail, and CSV/XLSX import with duplicate review. Lead repositories apply organization and assignment filters. Customer repositories and customer pages apply broader access, discussed below. Legacy fields are normalized at repository boundaries, including status, timestamp and assignment fields.

Inventory search chooses organization-configured flight and hotel providers. The registry includes mocks and adapters for Amadeus and Hotelbeds. Results carry source and fetch-time metadata and are cached server-side. The staff quote builder moves cart items through browser local storage and submits them to quote commands. The server recalculates totals, assesses discount and margin approvals, creates a new document for each revision, and generates a random bearer token for `/i/{token}`. The public sharing workflow returns a reduced customer projection and supports viewing, acceptance, rejection and expiry. Revision documents have versioned commercial content, while lifecycle fields still change.

Only the latest accepted quote can become a booking. Booking creation checks the linked lead and existing bookings; manager approval opens receivables, supplier payables and a booking journal. Supplier confirmations, references, failures and document checklist entries are tracked per booking. Live supplier fulfilment is human-confirmed rather than fully automated ticketing.

Finance includes payment links, offline receipts, signed Razorpay callbacks, reconciliation, supplier settlements, cancellation approval, refunds, numbered finance documents, accounting sync and period close/reopen. Shared pure functions handle arithmetic; server commands apply organization and role checks and write audits. Append-only finance journals coexist with the operational ledger. Accounting adapters include mock, Zoho Books and a Tally bridge. The existence of an adapter does not establish that the production credentials or provider account scopes are enabled.

The CMS provides authenticated editors for destinations, hotels, trips, styles and categories. Creates, updates and archives go through a validated HTTP command with an atomic audit write and public cache invalidation. Image uploads have a separate command. Dedicated editors for stories, testimonials, FAQs, navigation and global settings remain listed as follow-up work.

Marketing supports offers, scoring, audience construction, campaigns, approval, delivery and event attribution. Consent is checked during audience selection and again before delivery. Rules recommendations are the default. The neural model has 120 customer inputs, 48 offer inputs, two towers and five output heads. Candidate evaluation requires at least 500 positive events, ROC AUC of 0.72 and Brier score no higher than 0.25, followed by human activation. Scheduled training and scoring are implemented, but no real production model or its quality was inspected.

Tara searches the published catalogue, renders application-owned cards and generates structured text through a configured model, falling back to deterministic responses. Requests contain up to 12 history turns. Preferences can be confirmed, satisfaction recorded, and contact details handed into CRM. Staff have conversation and persona screens; WhatsApp has a separate signed webhook and delivery path. Voice remains deferred, and live supplier search and full generated itineraries are not complete customer surfaces.

**Verification performed**

| Check | Result |
| --- | --- |
| Fresh unit tests | 96 passed across 40 test files; shared UI has no tests |
| Fresh lint and TypeScript checks | Passed across all workspace packages |
| Firestore emulator rules tests | 16 passed |
| Fresh production build | All seven workspace build tasks passed |
| Production server startup | Started successfully on local port 3100 |
| Public HTTP smoke checks | Home, destinations, trips, hotels, planner, login, robots and sitemap returned 200 |
| Anonymous admin access | Redirected to login |
| Legacy `/about_us.php` | Returned a permanent redirect to `/about` |
| Local concierge greeting | Returned 200 with Tara's response and catalogue cards |
| Vendored backend packages | Built shared, AI-core and integration artifacts matched their vendored copies |

Tests and builds were rerun with the Turbo cache bypassed. The machine used Node 23.4.0, producing an engine warning against the backend's Node 22 requirement, and Java 23.0.2. CI specifies Node 22 and Java 21. Other nonblocking output included `punycode` deprecation, TensorFlow backend advice and Turbo output declarations for tasks that emit no files.

These checks do not establish authenticated end-to-end business correctness, live provider readiness, production security configuration, or visual/accessibility quality. No browser interaction suite was run. Existing function tests frequently verify helpers rather than complete commands: booking tests cover status derivation, payment tests cover webhook signatures, and conversation tests cover WhatsApp signature validation.

**Priority findings supported by the code**

1. **Server-rendered customer access is broader than the intended rules.** The [customer detail page](../apps/web/src/app/admin/customers/[id]/page.tsx) requires only `crm:read`, then loads both customer and household data through the Admin SDK. [The repository](../apps/web/src/repositories/firebase/firestore-customer-repository.ts) checks organization but not viewer role or ownership. Marketing, accounts and readonly have `crm:read`; Firestore rules intentionally restrict household reads to travel staff and customer ownership. Admin SDK reads bypass those rules. Sales can also inspect same-organization customers beyond their assignment through these pages. Apply the same explicit access policy to server repositories and page projections.

2. **Direct CRM writes bypass the documented command boundary.** [Firestore rules](../firebase/firestore.rules) allow browser creates/updates for customers and leads. They do not constrain changed fields to protect computed profiles, scores, assignment and status invariants. Inquiry updates are allowed to CRM readers, including readonly when its other conditions match, without checking the resulting organization field. Command validation and command-created audit evidence therefore do not cover every permitted write path. Passing rules tests cover selected cases, not this complete boundary.

3. **Catalogue tenancy is incomplete.** [Public catalogue reads](../apps/web/src/lib/public-content.ts) filter only `status == published`, not `orgId`, and share one cache key. Multiple organizations would have their published records combined. Content-staff Firestore read rules also omit organization checks for drafts; several legacy content write rules and Storage media rules are role-only. Scope queries, caches and rules consistently before supporting multiple tenants.

4. **Web human takeover is not enforced end to end.** [The chat endpoint](../apps/web/src/app/api/concierge/chat/route.ts) generates replies without loading conversation status. [Turn persistence](../apps/web/src/repositories/firebase/firestore-concierge-repository.ts) then writes `bot` or `human` based on that reply, potentially undoing staff takeover or closure. [The widget](../apps/web/src/components/concierge/concierge-chat.tsx) has no subscription or polling path for staff messages. Handover links the lead but does not copy its assigned consultant to the conversation, although consultant inbox reads require that assignment. Staff takeover controls exist, but the public web conversation needs the corresponding state and delivery behavior.

5. **Provider provenance is not enforced when saving a quote.** [Quote creation](../apps/functions/src/quote-workflow.ts) accepts cart items and recalculates their arithmetic but does not resolve provider-backed items against `inventoryOffers` or invoke server-side revalidation there. A client-supplied supplier cost/source is therefore not equivalent to verified provider evidence. Manual items are a valid workflow; provider-backed items need their own trusted validation boundary.

6. **Finance close has a date-boundary error and a concurrency gap.** [Period reconciliation](../apps/functions/src/finance-period-workflow.ts) compares full payment/settlement/refund timestamps directly with date-only boundaries. An event such as `2026-09-17T10:00:00Z` sorts after an end date of `2026-09-17`, excluding activity on that last day. Reconciliation reads also occur before the close transaction, and [posting guards](../apps/functions/src/finance-period-guard.ts) check periods outside posting transactions. A close racing with a posting is not serialized by a shared transactional guard. Normalize dates and test concurrent close/post behavior.

7. **Model validation can include future information in historical features.** [Dataset construction](../apps/functions/src/marketing-model-lifecycle.ts) attaches the customer's current profile and CLV values to historical campaign events. Sorting rows chronologically does not restore the features that existed at event time. Some auxiliary targets are proxies rather than independently observed outcomes. The documented event-time evaluation guarantee needs historical snapshots and target definitions before neural metrics are treated as evidence of predictive performance.

8. **AI telemetry does not reflect actual failures or cost.** Grounding validates card IDs and currency amounts, but does not verify every prose claim. The response initializes `ungroundedClaims` as empty; when validation fails, a fallback is returned without recording the rejected issues. Persistence counts every returned turn as successful, increments failure by zero, records cost as zero, and labels the provider from key presence rather than the actual fallback path. Consequently, dashboard grounding, provider success and spend metrics are incomplete.

**Development and maintenance findings**

- Authorization is duplicated across web permissions, shared permissions, function-local role sets and Firebase rules. One visible mismatch is that accounts receives `quotes:write` in the web policy while quote-writing functions reject accounts. Consolidating policy and testing a role/action matrix would reduce drift.
- The browser emulator flag connects only Functions. Auth, Firestore and Storage emulator connections are absent from the client wrapper. The Admin SDK wrapper also requires service-account fields even for emulator use. A fully local demo needs explicit configuration work.
- `.env` exists at the workspace root; the web package runs from `apps/web`, and its scripts show no explicit root environment loader. `.env.example` omits actual concierge and messaging variables such as `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL` and Meta/Resend settings. The local checks validate startup, not the completeness of Firebase or provider configuration.
- Public rate limiting uses a process-local `Map`; limits are not shared across server instances and expired keys are not proactively removed. The enquiry endpoint lacks the origin check used by concierge endpoints. App Check verification and owner/manager MFA enforcement are stated in architecture documentation but were not found in the inspected runtime code.
- Catalogue fallback activates on empty results as well as failures. Intentionally archiving every destination, trip or style would make the static catalogue reappear. There is no separate migration-complete flag in this loader.
- Normal website intake generates a fresh customer for each submission. Import has duplicate review, but website retries and repeat enquiries do not reuse that mechanism. Concierge lead creation and conversation attachment are separate operations, so partial failure can leave a lead created despite an error response.
- Several list pages and jobs use hard limits without pagination. Examples include 200 customers in the directory, 1,000 customers in feature refresh and 2,000 leads in supervisor processing. The supervisor resolves alerts absent from its current result set, so a truncated scan needs special care to avoid treating unprocessed leads as resolved.
- The 12,883-line global stylesheet, large workflow files and duplicated timestamp/legacy-field conversions increase change risk. The shared UI tokens also differ from the actual web brand tokens.
- Functions consume vendored package builds through `file:` dependencies. Deployment and CI preparation refresh these explicitly; ordinary development should account for stale copies after shared-package changes. The copies matched during this review.
- Some planning documents conflict in maturity: Phase 1 verification boxes remain unchecked while later checkpoints are marked complete, and travel-intelligence documentation still describes parts of the existing conversation system as future work. Treat source and demonstrated behavior as the basis for status.

**Suggested order for subsequent work**

First align server reads and Firebase rules with the intended role, assignment and organization boundaries. Next complete public conversation takeover and staff-message delivery. Then strengthen provider-backed quote validation, finance date/concurrency behavior and transaction-level tests for booking, payment, refund and settlement workflows. After these, address reproducible emulator setup, event-time model datasets, honest operational telemetry, pagination and incremental UI/CSS consolidation.

The code has substantial functional breadth and passes its existing checks. The strongest implemented foundations are shared domain schemas, atomic website intake, versioned quotes, explicit financial command workflows and provider interfaces. The largest gap is consistent enforcement and verification of those foundations across every access path.
