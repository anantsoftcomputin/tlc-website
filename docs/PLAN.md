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
- [ ] Add retry, rate-limit, usage, and cost logging around provider calls.
- [ ] Add one credential-backed flight adapter and one credential-backed hotel adapter.
- [x] Expose authenticated inventory search and price-check commands.
- [x] Add a responsive staff inventory-search workspace.

## Step 8 — Quotes and itineraries

- [x] Build the quote/cart command service with server-recomputed totals and approval guardrails.
- [x] Add immutable quote creation, revision, approval, and send workflows.
- [x] Add customer view, accept, reject, and scheduled expiry workflows.
- [x] Build the staff quote builder with flight/hotel inventory selection.
- [x] Build secure shareable itinerary pages and printable PDF output.

## Step 9 — Booking workflow

- [ ] Convert accepted quotes into bookings with traveller details.
- [ ] Add per-item supplier confirmation, PNR, failure, and partial-confirmation states.
- [ ] Add booking timeline, document checklist, and human approval controls.

## Step 10 — Payments and ledger

- [ ] Define payment provider contracts and deterministic mock.
- [ ] Add Razorpay payment links, verified webhooks, partial payments, and reminders.
- [ ] Add receivable/payable ledger entries and payment reconciliation.

## Checkpoint 2 exit criteria

- [ ] A staff user can search sourced inventory, build and version a quote, and share an itinerary.
- [ ] A customer can view and accept an itinerary without accessing internal pricing.
- [ ] An authorized staff user can create a booking and collect advance/balance payments.
- [ ] Every quote, booking, and payment mutation is organization-scoped and audited.
- [ ] Mocks make the full commerce flow demonstrable without provider credentials.
- [ ] Tests, emulator rules, seed data, and `docs/DEMO.md` cover the complete flow.
