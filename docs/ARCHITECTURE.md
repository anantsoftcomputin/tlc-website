# TLC Travel OS Architecture

## Purpose

TLC Travel OS is an organization-aware travel sales and operations platform. The existing TLC Holidays marketing website remains the public surface while the staff console grows into the CRM, commerce, finance, analytics, and AI platform described in the master brief.

## Website-to-CRM intake

All public planning and enquiry forms post to `apps/web/src/app/api/inquiries/route.ts`. The server validates and rate-limits the request, then performs one atomic Firestore transaction that creates:

- the website enquiry record used by the intake inbox;
- a CRM customer linked to that enquiry;
- an assigned CRM lead with its first-response SLA;
- the lead's initial activity and a platform audit record.

Assignment follows the organization's destination-specialist or round-robin policy, falling back to the configured default or an active CRM team member. A successful website response therefore cannot exist without the corresponding CRM work item. Legacy enquiries can still be converted from the admin inbox.

## Runtime topology

```text
Browser / mobile web
  -> apps/web (Next.js App Router)
       -> authenticated server actions and route handlers
       -> packages/shared schemas and policies
       -> Firebase Auth / Firestore / Storage
  -> apps/functions (Firebase Functions v2, asia-south1)
       -> privileged commands, triggers, webhooks, schedules
       -> integration adapter interfaces
       -> audit log and aggregate writers

Firestore -> trigger functions -> auditLogs / analytics / alerts
Scheduler -> feature store / supervisor / scoring / reminders
```

## Workspace boundaries

- `apps/web`: public website, staff console, management and system administration.
- `apps/functions`: privileged APIs, Firestore triggers, webhooks and scheduled jobs.
- `packages/shared`: canonical Zod schemas, inferred domain types, permissions, money/date utilities.
- `packages/ui`: shared design tokens and UI components.
- `packages/integrations`: provider contracts and deterministic mocks. Provider SDKs never leak into domain code.
- `packages/ai-core`: feature engineering, TLC-owned TensorFlow.js models, explainability and supervisor rules.
- `packages/ai-chat`: grounded conversational engine, persona and tool registry.
- `firebase`: rules, indexes and emulator configuration sources.

## Data ownership and tenancy

Every business document carries an `orgId`. Authentication tokens carry `orgId` and `role`. Browser access requires both an allowed role and an organization match. Subcollections inherit organization ownership from their parent. Global platform administration is limited to the transitional `super_admin` role.

The initial organization ID is `tlc-vacations`. This is stable and must not be replaced by a display name.

## Command/query boundary

Reads may be performed by server components or typed query repositories. Writes to customers, leads, quotes, bookings and payments pass through command services. Each command:

1. validates input with the shared Zod schema;
2. verifies role, organization and entity assignment;
3. executes in a Firestore transaction where invariants cross documents;
4. records an immutable audit event;
5. emits follow-up work through a trigger or task rather than calling integrations inline.

Browser clients never write audit logs, financial totals or AI scores.

Phase 2 commerce routes are `/admin/inventory`, `/admin/quotes`, `/i/{token}`, `/admin/bookings`, and `/admin/payments`. Quote acceptance is the boundary between sales and operations. Booking approval opens receivable/payable records; verified or manually authorized payment commands update collection state. Firestore denies browser writes to quotes, bookings, payments, ledger, provider rate limits, and webhook idempotency records.

## AI guardrails

AI outputs are advisory and include `reasoning` plus feature attributions where applicable. Prices and availability originate only from adapter results with `source` and `fetchedAt`. Price changes, discounts, bookings, refunds and broadcasts require explicit human approval unless an organization automation setting deliberately enables that workflow.

## Phase 3 finance boundary

Phase 2 payment and ledger records remain the operational source for booking balances. Phase 3 adds an append-only journal and explicit allocation records as the finance system of record: posted entries are reversed, never edited; supplier settlements and customer refunds require authorized server commands; accounting providers receive idempotent document keys; and finance reports are derived from posted records rather than mutable booking totals. This preserves a stable audit chain from accepted quote to booking, collection, supplier payment, refund, and external-accounting sync.

Phase 3 completion adds four bounded aggregates around that journal: cancellation requests calculate but cannot approve themselves; numbered finance documents snapshot the applicable tax identity; accounting sync records isolate external-provider failure from internal posting; and finance periods prevent new postings after reconciliation close. Provider callbacks are idempotent through immutable payment-event identifiers.

## Phase 4 content boundary

The public travel catalogue is owned by Firestore collections `destinations`, `hotels`, `trips`, `travelStyles`, and `tripCategories`. Catalogue documents share a validated publishing contract: draft/published/archived status, featured placement, deterministic display order, SEO metadata, organization ownership, and immutable audit attribution. Trips may link to hotels and both styles and categories without duplicating hotel operational inventory.

Content reads and writes follow different paths. Public pages read only published records through a cached server repository, with the checked-in catalogue retained as a migration-safe fallback. Staff read all organization records through authenticated server components. Creates, updates, publishing and archive operations pass through `/api/admin/content`; the command validates the collection-specific Zod schema and commits the content record and audit evidence atomically. Browser Firestore writes remain denied. Public images are validated and uploaded by `/api/admin/media`, then recorded in the media registry.

The editorial hotel catalogue is deliberately separate from temporary provider inventory. CMS hotels describe TLC-curated stays and their destination, facilities, room/meal options and internal supplier reference. Live rates and availability still come only from a configured hotel adapter and are never inferred from CMS content.

## Phase 5 marketing boundary

Marketing intelligence reads organization-scoped offers, campaigns, propensity scores, model evidence and customer consent through server repositories. Until TLC's neural model has enough positive events and passes its validation threshold, the explainable rules recommender remains active and is labelled as such. A score is advisory evidence, never authorization to contact a customer.

Audience generation and delivery are separate operations. The audience layer filters on recorded channel consent and opt-outs; the command layer requires an authorized human approval; the delivery adapter rechecks consent immediately before sending. Campaign reporting is derived only from immutable delivery, engagement and booking events, so empty production data remains zero rather than being replaced with demo metrics.

## Security baseline

- Firebase Auth sessions are stored in secure, HTTP-only cookies.
- Owner and manager roles require MFA before production launch.
- Firestore rules enforce `orgId`, role, ownership and assignment.
- Passport and government ID values are encrypted outside normal document fields.
- Secrets are server-only and ultimately stored in Google Secret Manager.
- Sensitive writes are audited; audit records are immutable to browser clients.
- Public endpoints use validation, rate limiting and App Check.

## Deployment regions

Functions and scheduled workloads use `asia-south1`. The existing Firestore database is already provisioned in `nam5`; moving an existing Firestore database is not an in-place operation. This mismatch is recorded as a production architecture decision and must be resolved through a planned data migration if India residency is required.

## Evolution strategy

The public site and current admin pages are migrated into the workspace first. Canonical schemas and rules are introduced before feature screens. Old lead fields are mapped at repository boundaries during the transition; new writes use the canonical schema. Each later phase adds modules behind stable interfaces rather than rewriting the foundation.
