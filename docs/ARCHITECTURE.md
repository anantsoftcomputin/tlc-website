# TLC Travel OS Architecture

## Purpose

TLC Travel OS is an organization-aware travel sales and operations platform. The existing TLC Holidays marketing website remains the public surface while the staff console grows into the CRM, commerce, finance, analytics, and AI platform described in the master brief.

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
