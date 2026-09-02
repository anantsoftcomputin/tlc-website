# Architecture Decisions

## ADR-001 — Evolve the existing site in place

The current public website and Firebase project are production assets. They will be moved into the monorepo without replacing routes, design assets or deployed data.

## ADR-002 — Keep Next.js 15 for specification compatibility

The workspace web app targets the current patched Next.js 15 release requested by the master brief. React remains on the compatible React 19 line.

## ADR-003 — Transitional role compatibility

Canonical CRM roles are `owner`, `manager`, `sales`, `accounts`, `marketing`, and `readonly`. The existing `super_admin` claim remains a platform-level alias with owner permissions so the bootstrapped account is not locked out. Legacy `admin`, `content_editor`, and `travel_consultant` claims are accepted during migration and will be mapped before removal.

## ADR-004 — Organization identity

The initial organization ID is `tlc-vacations`. New business records require this `orgId`; repository readers temporarily support legacy records while migration scripts backfill them.

## ADR-005 — Existing Firestore region

The master brief requests `asia-south1`, but the existing Firestore database is located in `nam5`. Functions will use `asia-south1`. Firestore remains in `nam5` until a separately approved export/import migration is planned because its location cannot be changed in place.

## ADR-006 — Human approval is the default

Automation flags default to false. AI may recommend and draft but cannot price, discount, book, refund or broadcast without an authorized human command.

## ADR-007 — Quote financial calculation

All quote items use one currency. Customer sell total is base sell plus service fees and tax, less discount. Tax is treated as pass-through. Gross profit is net revenue plus supplier commission, less cost. Margin percentage is gross profit divided by net revenue. All outputs are rounded to two decimal places by `computeQuoteTotals()` and quote validation rejects altered totals.

## ADR-008 — Physical analytics collection names

The brief's conceptual `analytics/daily/{id}` and `analytics/staff/{id}` paths do not alternate collection and document segments and therefore are not valid Firestore document paths. Physical collections are `analyticsDaily/{orgId_date}` and `analyticsStaff/{uid_month}`.
