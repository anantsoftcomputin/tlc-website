**TLC Travel OS — project study, 29 October 2026**

Historical snapshot. Follow-up implementation and current remaining work are tracked in [REMAINING_GAPS.md](./REMAINING_GAPS.md).

This study covers the current working tree, including the existing uncommitted communications and email-design work. It combines source inspection, comparison with earlier documentation, fresh lint/type checks and unit tests, demo Firestore rule and workflow tests, and Python training-tool tests. Application source was not changed. Production credentials, records, provider readiness and deployed behavior were not inspected. No external messages, payments or deployments were initiated.

**Product and project size**

TLC Travel OS combines the TLC Holidays public website, a staff operations console, a customer portal, and AI-assisted planning and marketing. The main business flow is:

Discovery → enquiry → customer and assigned lead → versioned quote → customer response → booking approval → supplier fulfilment → collection, settlement and finance.

The current source inventory has 388 TypeScript/TSX files and 45,732 lines across application/package source, including 67 test files. The web app has 64 page routes and 24 route handlers. CSS totals 16,361 lines; Firestore configuration defines 90 composite indexes. Counts exclude dependencies, compiled outputs and vendored package copies.

| Location | Actual responsibility |
| --- | --- |
| `apps/web` | Next.js 15.5.25 / React 19.2.8 App Router; public pages, staff/client workspaces, HTTP handlers, Firebase repositories, planning orchestration |
| `apps/functions` | Firebase Functions v2; privileged commands, signed webhooks, triggers, durable communication workers, scheduled jobs; Node 22 target |
| `packages/shared` | Zod schemas, domain types, permissions, customer search/import, travel contracts, quote arithmetic, journals, tax and reports |
| `packages/integrations` | Supplier/payment/accounting/messaging adapters, deterministic mocks, shared inference client, email renderer and catalogue |
| `packages/ai-core` | Feature engineering, segmentation, explainable recommendations, TensorFlow.js model and evaluation |
| `packages/ai-chat` | Conversation context, preference helpers and grounding contracts |
| `packages/ui` | Four-line design-token export; actual components primarily live in the web app |
| `firebase`, `scripts`, `training` | Rules/indexes, operations and smoke scripts, seeds/migrations, local/cloud model-training tools |

pnpm 10.33 and Turborepo coordinate seven workspaces. Netlify configuration builds the web application; Firebase configuration deploys Functions, Firestore rules/indexes and Storage rules. Functions target `asia-south1`; Firestore configuration specifies `nam5`. Those are checked-in settings, not independent verification of the deployed service.

**Public website and design**

The website covers destinations, tours, hotels, holiday styles, saved trips, trip planning, travel stories, services, about and contact. Slug routes provide detail pages. Metadata, sitemap, robots and legacy PHP redirects are present. The homepage leads with a natural-language planning prompt and then shows travel categories, trips, destinations, assurances and consultant contact.

Fraunces and Manrope are configured through Next fonts. CSS tokens establish TLC red, wine, ivory and blush, with photography, rounded cards, responsive rails and separate staff/client workspace styling. The design implementation is mainly application components and global styles, despite the presence of a shared UI package. CSS import order and broad selectors deserve attention when changing common layouts.

`apps/web/src/lib/public-content.ts` queries published catalogue records for the configured organization, caches successful results for five minutes, and respects catalogue migration state. During failure it serves the last good in-process catalogue, or checked-in destinations/trips/styles. Hotels have no equivalent checked-in fallback. This improves availability but means a cold instance during an outage can show older static content.

The staff CMS supports destinations, hotels, trips, styles and categories with publishing status, ordering, SEO, media and audits. Dedicated stories/testimonials/FAQ editors and navigation/global-settings editors remain unchecked in the delivery plan. Some public content remains static.

**Identity, authorization and data ownership**

Firebase browser authentication exchanges a recently authenticated ID token for a five-day HTTP-only, same-site session cookie. Server components verify revoked sessions. Managers require a second factor in production, with emulator exceptions. Role routing sends managers to `/admin/owner`, other staff to `/admin/employee`, and verified customers to `/client`.

Business records carry `orgId`; staff queries and commands also enforce ownership or assignment where appropriate. The canonical permission policy is in `packages/shared/src/auth/permissions.ts`; the web layer maps its legacy permission names into that policy. Function-local role sets and Firestore rules remain additional policy implementations.

There are two authentication paths to preserve when making changes: the server cookie protects pages and HTTP handlers, while browser Firebase tokens authenticate callable commands. The callable wrapper checks disabled accounts and profile/token role or organization mismatches. The server-session reader checks disabled state but does not perform that same explicit profile/claim comparison; normal team administration relies on session revocation. Keep both paths aligned when adding account-management operations.

Firestore denies browser writes to core business records, finance, outbox and model state. Browser saved-trip records under the user's own path are an exception. Admin SDK code bypasses rules, so repository and command checks are part of the security boundary. Customer portal queries match verified email addresses against same-organization CRM records, then return explicit customer-safe projections.

**Intake, CRM and travel intelligence**

`/api/inquiries` validates origin/App Check and input, applies rate limits, resolves saved journey or supplier-shortlist evidence, then delegates to `FirestoreInquiryRepository`. Intake transactionally creates an enquiry, lead, initial activity and audit evidence, while creating or reusing a customer. It supports retry identifiers, repeat-contact matching and conversation-to-lead linkage.

Assignment uses organization specialist/default/team settings. The mode called round robin distributes requests through a deterministic hash rather than a rotating queue. This is stable distribution, without a guarantee of equal sequential assignment.

Rich intake separates current-trip details, household preferences, individual traveller preferences and consent. Service contact, saved profiles, training eligibility and promotional channels have distinct permissions. CRM provides pipeline/list views, activities, ownership, response SLAs, follow-ups, customer profiles and CSV/XLSX import with duplicate review. A trigger maintains indexed customer search terms, with a backfill command for older records.

**Planning, inventory, quoting and booking**

The journey workspace supports structured trip details, catalogue-based day-by-day ideas, saved revisions, sharing and quote handoff. Signed conversation sessions establish anonymous ownership; revision checks detect competing edits. Model-generated changes are schema-validated and constrained to known destinations and experiences. Deterministic parsing/planning remains available when inference fails or is absent.

Public vacation search combines published hotel content with TBO evidence, room/age constraints, optional flights and rules/model ranking. Model hotel ranking must return a complete permutation of supplied candidate IDs. Catalogue descriptions are separate from supplier availability. Missing supplier results produce consultant-check notices rather than invented rates.

The integration registry includes mock providers and credential-gated TBO, Amadeus, Hotelbeds, Razorpay, Zoho Books and Tally adapters. Provider code existing in the repository does not establish that its production account is configured or certified.

Quote commands resolve supplier-backed items against server-owned evidence, recalculate totals and enforce approval rules. Commercial revisions use separate documents; lifecycle status remains mutable. Explicit manual services are supported. Sanitized supplier identity is preserved for later fulfilment, addressing the identity-loss issue described in the 6 October study. Evidence freshness and live repricing are separate: quote validation itself is not a guarantee of current provider availability.

Public itinerary tokens resolve to customer-safe projections. Only eligible accepted quotes become bookings, with manager approval before collection and fulfilment. Supplier fulfilment re-finds/reprices services and records uncertain outcomes for review. The normal quote/booking flow therefore depends on both internal state checks and supplier evidence.

**Finance**

Finance includes payment links, manual receipts, verified Razorpay callbacks, reconciliation, supplier settlement reservations/approval, cancellation/refund approval, numbered invoices/credit notes/receipts, external accounting sync and period close/reopen.

Operational balances and append-only journals have distinct roles. Finance postings and period-close commands share an organization transaction lock; corrections preserve journal history. Tax documents snapshot tax identity and receive transactional numbering. Accounting is an idempotent projection of internal records. Provider payments that cannot be posted become exception alerts for reconciliation.

The emulator suite passed the final-day period-close/payment race and idempotent/concurrent collection workflows. That verifies the covered internal scenarios; it does not verify live banking, supplier settlement or statutory correctness.

**Communications and the current email changes**

The current uncommitted work adds a 43-design email catalogue, shared HTML/plain-text rendering, offline exports, an authenticated email design studio and campaign template selection. Designs cover account, planning, booking, payment, support and marketing scenarios. The renderer escapes content, validates links, enforces required fields, limits HTML size and supplies unsubscribe headers for marketing.

Three existing delivery paths use the renderer: explicit quote sends/revisions, email conversation replies, and approved email campaigns. Most other designs are renderable assets awaiting event adapters. Authentication designs still need provider-generated action links and a custom delivery path. Selecting a birthday or unfinished-plan design does not implement a scheduler or abandoned-plan detector.

External replies enter a durable Firestore outbox. Workers claim jobs transactionally; missing credentials remain pending, and ambiguous network outcomes become uncertain rather than being resent blindly. WhatsApp uses signed inbound events and a service-window check. Resend handles signed email events, delivery status and suppression. Campaign delivery rechecks consent/frequency and requires approval. Client messages and preferences use authenticated server routes.

Provider account setup, DNS/MX, verified senders, approved WhatsApp templates, callbacks and designated-recipient inbox testing remain deployment/activation work. Tests intercept outbound provider requests.

**AI systems and their limits**

There are two distinct model systems. `packages/ai-core` implements a TensorFlow.js marketing recommender with send-time features, masked long-horizon targets, evaluation evidence and human activation. Rules scoring remains the safe fallback when evidence thresholds are unmet.

The conversational client in `packages/integrations/src/tlc-model.ts` supports a TLC-hosted compatible inference endpoint, with an explicit optional OpenAI provider. It enforces transport/response constraints and returns token/provider metadata. Grounding restricts structured entities and prices, but cannot establish the truth of every sentence of generated prose.

`training/` contains corpus construction, local MLX training/evaluation/serving and a cloud training recipe. The 8 October owned-AI report documents a small adapted Qwen candidate and explicitly states that it fails the application-prompt gate and is inactive. This study did not rerun GPU inference or independently reproduce those model-quality measurements. Voice remains deferred in the plan.

**Fresh verification**

| Check | Result |
| --- | --- |
| `pnpm exec turbo run lint typecheck test --force` | 24 tasks passed without cache reuse; 195 tests passed, 19 skipped |
| Firestore rule suite | 19 passed against `demo-tlc-holidays` |
| Functions integration suite | 17 passed across commerce, catalogue, communications and campaign delivery |
| Python training-tool suite | 2 passed |
| Production build and browser smoke checks | Not run during this study |
| Real provider/model/deployed checks | Not run |

The ordinary verification used the shell's Node 23.4.0, which emits the repository's Node 22 engine warning. Emulator suites used Node 22.23.2; Firebase reported Java 23.0.2. CI requests Node 22 and Java 21. A pre-existing web process was listening on port 3000 and was left untouched. Test logs are at `/tmp/tlc-study-checks-20261029.log` and `/tmp/tlc-study-emulators-20261029.log`. The emulator exited successfully and was shut down after testing.

**Remaining issues and practical priorities**

1. Tour-list controls are incomplete. `apps/web/src/app/trips/page.tsx` applies text/style filters, while duration checkboxes, sorting and the mobile Filters button have no working behavior. The date parameter is displayed without filtering and traveller count is unused. Define meaningful catalogue filters and connect or remove each visible control.
2. Customer search can omit valid multiword matches. `FirestoreCustomerRepository.searchCustomers` fetches at most 200 candidates for one indexed term before filtering remaining words in memory. There is no search cursor for additional candidates. Add complete search pagination or a suitable index strategy.
3. Historical workloads remain a scaling concern. Client dashboards load related history and query payments per booking; marketing dataset construction reads organization populations and repeatedly matches events/bookings. Finance-wide locking deliberately favors consistency but can contend as volume grows. Measure realistic workloads before expanding volume.
4. Authorization has multiple enforcement surfaces. Shared permissions improve consistency, but function-local role sets, rules, server sessions and repositories still need coordinated changes and role/organization tests. Public published-document reads also expose whole documents through Firestore, so keep secrets/internal fields outside public catalogue records.
5. Documentation has conflicting generations. Root `ARCHITECTURE.md` still describes Next.js 16 and an in-memory repository. The September/6 October studies contain both fixed and outstanding findings. Use `docs/ARCHITECTURE.md`, current source and fresh checks together. CI now explicitly runs the integration suite, fixing another earlier finding.
6. Production readiness is not established by the plan's checked boxes. The plan still leaves index deployment, MFA enablement and search backfill outstanding. Verify deployment state, provider readiness, authenticated portal behavior, real inbox rendering and model gates before activation claims.

For future changes, trace the shared contract and permission through the route/repository or callable, UI caller, rules/indexes and tests. Functions consume vendored compiled shared packages: the documented `prepare:ci` workflow refreshes these copies. A direct Turbo run, as used here for inspection, does not replace that preparation step after shared-package changes.
