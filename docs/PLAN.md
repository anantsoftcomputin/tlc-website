# Phase 1 Plan

Updated: 2026-09-02

## Step 1 — Foundation

- [x] Preserve and audit the existing website and Firebase project.
- [x] Define target architecture and migration decisions.
- [x] Convert to a pnpm/Turborepo workspace.
- [x] Move the existing website to `apps/web` without changing public URLs.
- [x] Scaffold Firebase Functions v2 in `asia-south1`.
- [x] Establish shared UI and integration package boundaries.
- [x] Implement canonical organization-aware roles and permissions.
- [x] Bootstrap the TLC organization and owner profile.
- [x] Make Auth, Firestore and Storage emulators runnable together.
- [x] Add CI commands for lint, typecheck, unit tests and rules tests.

## Step 2 — Shared data model

- [x] Implement all canonical Zod schemas in `packages/shared`.
- [x] Add timestamp, audit, money and organization base schemas.
- [x] Add quote total computation as a pure tested function.
- [x] Generate `docs/DATA_MODEL.md` from schema metadata.

## Step 3 — Customers

- [x] CSV/XLSX import mapping and validation.
- [x] Deduplication and merge review.
- [x] Customer 360, consent, travel history and event timeline.
- [x] Organization-scoped repository and authenticated server import endpoints.
- [x] Immutable audit entries for customer creates and merges.
- [x] Customer query index and server-owned import security policy.

## Step 4 — Leads

- [x] Secure website inquiry capture and idempotent inquiry-to-lead conversion.
- [x] Add Gmail, mock WhatsApp and social inbox adapters behind the integration boundary.
- [x] Organization- and assignment-scoped lead repository.
- [x] Manual assignment, SLA fields, overdue visibility, kanban/list and lead detail.
- [x] Add scheduled SLA breach alerts and configurable manual, round-robin and destination-specialist assignment policies.
- [x] Append-only activity timeline, follow-ups and lost-reason workflow.

## Step 5 — AI Core v1

- [x] Feature engineering contract and documented 120-feature index with presence masks.
- [x] Deterministic 2,000-customer synthetic seed generator and explainable rules recommender.
- [x] Explainable segmentation and 15-rule AI supervisor with deduplication and escalation.
- [x] Scheduled feature-store refresh and supervisor execution in `asia-south1`.
- [x] Responsive alerts centre with acknowledge, resolve and deep-link workflows.

## Step 6 — Management

- [x] Pre-aggregated daily and staff analytics.
- [x] Management dashboard and staff performance.
- [x] Audit log viewer.

## Checkpoint 1 exit criteria

- [ ] `pnpm dev` starts the web app.
- [ ] `pnpm emulators` starts local Firebase services.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, and rules tests pass.
- [ ] Seed data makes all Phase 1 screens demonstrable.
- [ ] `docs/DEMO.md` provides a repeatable demo script.

# Phase 2 Plan — Commerce

## Step 7 — Live inventory foundation

- [x] Define normalized flight and hotel provider contracts.
- [x] Add deterministic mock flight and hotel adapters with source and fetch-time provenance.
- [x] Add provider registry and organization-level selection.
- [x] Add retry, rate-limit, usage, and cost logging around provider calls.
- [x] Add one credential-backed flight adapter and one credential-backed hotel adapter.
- [x] Expose authenticated inventory search and price-check commands.
- [x] Add a responsive staff inventory-search workspace.

## Step 8 — Quotes and itineraries

- [x] Build the quote/cart command service with server-recomputed totals and approval guardrails.
- [x] Add immutable quote creation, revision, approval, and send workflows.
- [x] Add customer view, accept, reject, and scheduled expiry workflows.
- [x] Build the staff quote builder with flight/hotel inventory selection.
- [x] Build secure shareable itinerary pages and printable PDF output.

## Step 9 — Booking workflow

- [x] Convert accepted quotes into bookings with traveller details.
- [x] Add per-item supplier confirmation, PNR, failure, and partial-confirmation states.
- [x] Add booking timeline, document checklist, and human approval controls.

## Step 10 — Payments and ledger

- [x] Define payment provider contracts and deterministic mock.
- [x] Add Razorpay payment links, verified webhooks, partial payments, and reminders.
- [x] Add receivable/payable ledger entries and payment reconciliation.

## Checkpoint 2 exit criteria

- [x] A staff user can search sourced inventory, build and version a quote, and share an itinerary.
- [x] A customer can view and accept an itinerary without accessing internal pricing.
- [x] An authorized staff user can create a booking and collect advance/balance payments.
- [x] Every quote, booking, and payment mutation is organization-scoped and audited.
- [x] Mocks make the full commerce flow demonstrable without provider credentials.
- [x] Tests, emulator rules, seed data, and `docs/DEMO.md` cover the complete flow.

# Phase 3 Plan — Finance

## Step 11 — Finance foundation and supplier settlements

- [x] Promote operational ledger records into immutable journal-grade finance entries.
- [x] Add supplier settlement creation, approval, payment, and allocation workflows.
- [x] Add booking-wise actual-versus-planned profitability and outstanding balances.
- [x] Build a responsive finance workspace for receivables, payables, and settlements.
- [x] Keep every finance mutation server-owned, organization-scoped, and audited.

## Step 12 — Cancellations and refunds

- [x] Add booking cancellation requests with item-level supplier penalties.
- [x] Add customer refund calculation with retained fees and profitability impact.
- [x] Require manager approval before cancellation or refund execution.
- [x] Add payment-provider refund commands, webhook handling, and refund reconciliation.

## Step 13 — Accounting integrations

- [x] Define accounting provider contracts with a deterministic mock.
- [x] Add credential-gated Zoho Books and Tally adapters.
- [x] Push invoices, bills, payments, credit notes, and supplier settlements idempotently.
- [x] Add sync status, retry controls, error visibility, and usage logging.

## Step 14 — GST invoices and receipts

- [x] Add organization tax profile, place-of-supply, SAC, GST split, and rounding rules.
- [x] Generate immutable numbered invoices, credit notes, and payment receipts.
- [x] Add printable customer-safe finance documents and document audit history.

## Step 15 — Finance reporting and close

- [x] Build ageing, collections, supplier dues, GST, profitability, and cash-position reports.
- [x] Add finance-period reconciliation and controlled close/reopen workflows.
- [x] Export finance reports in CSV and accounting-friendly formats.

## Checkpoint 3 exit criteria

- [x] Finance can trace every booking from quote economics through collection and supplier settlement.
- [x] Refunds and cancellations require explicit approval and preserve a complete audit trail.
- [x] GST invoices, receipts, and credit notes are reproducible and immutable after issue.
- [x] Zoho Books, Tally, and mock accounting providers share one tested contract.
- [x] Finance reports reconcile to underlying journal entries and payment records.
- [x] Tests, emulator rules, seed data, and `docs/DEMO.md` cover the complete finance flow.

# Phase 4 Plan — Content & Product CMS

## Step 16 — Canonical travel content

- [x] Define validated destination, hotel, holiday-style, category and tour-package schemas.
- [x] Add draft, published and archived lifecycle states, featuring, ordering and SEO metadata.
- [x] Preserve organization and audit fields on every content record.

## Step 17 — Secure content operations

- [x] Route all content writes through an authenticated, role-controlled server command.
- [x] Record immutable before/after audit evidence for create, update and archive operations.
- [x] Add validated public image uploads with media records and audit evidence.
- [x] Keep browser writes to catalogue documents and media metadata disabled in Firestore rules.

## Step 18 — Staff CMS

- [x] Add the Travel Catalogue dashboard to the TLC Operations navigation.
- [x] Add searchable status-filtered lists for destinations, hotels, packages, styles and categories.
- [x] Add responsive editors for destination experiences, hotel facilities and rooms, package itineraries, linked hotels, taxonomy, publishing and SEO.
- [x] Add public preview links and archive controls.

## Step 19 — Public website integration

- [x] Read published catalogue records through a cached Firestore repository.
- [x] Keep a safe static fallback while the initial production catalogue is migrated.
- [x] Connect homepage, destinations, tours, holiday styles, saved trips and sitemap to the CMS.
- [x] Add public hotel directory and hotel detail pages.

## Checkpoint 4 exit criteria

- [x] Content staff can create, edit, publish and archive all five catalogue record types.
- [x] A published destination, package, style or hotel becomes available to the public website.
- [x] Draft and archived content never appears through public Firestore access.
- [x] Every content mutation is validated, organization-scoped and audited.
- [x] Existing website content is migrated without replacing later editorial changes.
- [x] Unit tests, rules tests, production build and demo instructions cover the complete CMS flow.

## Phase 4 follow-on editorial extensions

These are not blockers for the completed product-catalogue checkpoint, but remain visible rather than being implied complete:

- [ ] Add dedicated editors for travel stories, testimonials and FAQs.
- [ ] Add navigation, redirects and global site-settings editors.
- [ ] Complete client content-editor training after real catalogue owners are nominated.

# Phase 5 Plan — AI Marketing & Customer Intelligence

Phase numbering note: the original master brief's AI marketing phase moves here because the content and product CMS was inserted as Phase 4. Conversational autonomy and the persona-driven chatbot follow in Phase 6.

## Step 20 — Marketing intelligence foundation

- [x] Reuse the canonical offer, campaign, propensity and model schemas from the shared data model.
- [x] Add explicit marketing read/write permissions for owners, managers, administrators and marketing staff.
- [x] Add a real-data Marketing Cockpit for offer, campaign, audience, consent and model readiness.
- [ ] Route offer and campaign mutations through audited, organization-scoped server commands.

## Step 21 — TLC-owned scoring pipeline

- [ ] Build the TensorFlow.js two-tower network and multi-task prediction heads.
- [ ] Build time-based training datasets from customer events and bookings.
- [ ] Add evaluation, calibration, model registry and safe activation thresholds.
- [ ] Keep the explainable rules recommender active until positive-event and validation thresholds are met.
- [ ] Store model weights in Firebase Storage and all model evidence in Firestore.

## Step 22 — Offers and propensity

- [ ] Build governed offer creation, approval, activation, pause and expiry workflows.
- [ ] Generate offer vectors and explainable customer-to-offer propensity scores.
- [ ] Add propensity explorer, audience previews and consent-aware customer exclusions.
- [ ] Add predictive travel, dormant and upgrade lists using recorded data only.

## Step 23 — Campaign operations

- [ ] Build the segment-to-offer-to-channel campaign builder.
- [ ] Require explicit approval before every campaign send or schedule action.
- [ ] Add WhatsApp template, email and mock messaging adapters with opt-out enforcement.
- [ ] Track sent, delivered, read, reply, conversion and attributable revenue events.
- [ ] Add campaign ROI and source reporting without invented metrics.

## Checkpoint 5 exit criteria

- [ ] Model activation is evidence-based, reversible and monitored.
- [ ] Every score includes reasoning and feature attributions.
- [ ] Every campaign audience enforces recorded channel consent and opt-outs.
- [ ] No customer-facing campaign can send without an authorized human approval.
- [ ] Campaign results reconcile to immutable customer events and actual bookings.
- [ ] Unit tests, rules tests, synthetic demo data and operating documentation cover the full marketing flow.
