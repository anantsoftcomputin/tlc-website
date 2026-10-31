# Dashboard audit — 1 November 2026

**Implementation follow-up:** The findings below describe the state before the corrections. All seven findings now have local corrections, with added archive/linking/dispatch features. Validation and deployment requirements are tracked in [DASHBOARD_CONFIGURATION.md](./DASHBOARD_CONFIGURATION.md).

The admin, employee and customer workspaces are implemented, but they are not yet consistently configured across page permissions, action visibility, assignment and reporting. This review covers the current local workspace, including the WhatsApp changes. It does not certify deployed configuration or live providers.

## Feature coverage

| Workspace | Implemented features | Assessment |
| --- | --- | --- |
| Owner/admin/management | Business overview, approval queue, team workloads, CRM/customer records, quotes/bookings, inventory, payments, finance, marketing/campaigns/model controls, catalogue, team access, audit, lead/persona/pricing settings | Broad coverage; permission consistency, currency reporting and new-channel routing need correction. |
| Sales/travel consultant | Own leads/customers, follow-ups, quotes, assigned bookings, inventory, conversations, support, traveller history | Main workspace exists; global list limits can hide assigned work, completed bookings inflate the active count, and new unassigned WhatsApp work does not reach employees automatically. |
| Accounts | Collections, receivables/payables, reconciliation, finance documents, settlements/refunds, period close, audit, readable quotes/bookings | Finance features exist; booking operation controls should not appear for this role. Multi-currency totals need separation or a recorded conversion policy. |
| Marketing | Offers, propensity explorer, audiences, approved campaigns, model readiness, content | Main features exist; quote page guards do not match the shared quote-read policy. |
| Content editor | Catalogue and editorial operations | Role-specific workspace exists. The universal header still exposes an Alerts shortcut the role cannot use. |
| Read-only | Readable permitted records, finance and catalogue | Backend write restrictions exist, but booking/conversation/lead screens are not consistently rendered read-only. |
| Customer | Enquiries, published quote links, bookings, dates/status, document checklist, payment links/history, invoices/receipts, support, messages, saved trips, preferences, personal advisor and completed-trip feedback | Main self-service features exist; quote revisions need an explicit pending/superseded state and large histories need archive navigation. |

## Findings

### 1. Quote route permission is broader than the declared role policy — high

The shared policy gives marketing `customers:read` but not `quotes:read`. Quote list/detail pages require `crm:read`, which maps to `customers:read`. Their repositories enforce organization/lead assignment, but do not receive the actor's domain permissions.

A marketing account assigned a synthetic lead can open that lead's quote detail, including its supplier-cost summary. This is a domain-permission mismatch; it is not evidence that marketing can read arbitrary organizations or unassigned quotes.

Relevant sources: `packages/shared/src/auth/permissions.ts`, `apps/web/src/lib/auth/roles.ts`, `apps/web/src/app/admin/quotes/page.tsx`, `apps/web/src/app/admin/quotes/[id]/page.tsx`, `apps/web/src/repositories/firebase/firestore-quote-repository.ts`.

Required change: align route/API/repository checks with the shared domain permission policy, with explicit tests for forbidden roles as well as record ownership.

### 2. Non-writers are offered operational actions — high usability/authorization consistency

`BookingControls` receives only `canApprove` and `canFinance`; supplier updates, document changes and trip completion are not guarded by booking-write permission. Accounts and read-only users therefore see actions that `commerceActor(..., "Booking")` rejects.

Conversation detail also renders takeover/resume/close controls without checking `crm:write`; the corresponding API rejects read-only callers. Lead detail similarly renders Save lead/Add activity without a writer flag. Team management can show disable controls for manager/admin accounts that the current non-owner actor cannot modify.

This review confirms misleading controls and backend denial; it does not claim those denied writes succeeded.

Relevant sources: `apps/web/src/components/admin/booking-controls.tsx`, `apps/web/src/app/admin/bookings/[id]/page.tsx`, `apps/functions/src/commerce-command.ts`, `apps/web/src/app/admin/conversations/[id]/page.tsx`, `apps/web/src/app/api/admin/conversations/route.ts`, `apps/web/src/components/admin/lead-workspace.tsx`, `apps/web/src/components/dashboard/team-manager.tsx`.

Required change: pass explicit per-operation capabilities from the server and hide/disable unavailable actions while retaining server enforcement.

### 3. Finance headline totals combine currencies — high when multiple currencies are used

The finance repository sums receivables, payables, collections and report values across records without grouping by currency. The page labels these aggregates using the first profitability row's currency. Correctly linked INR and USD records can therefore become one misleading INR-labelled amount; no exchange rate is applied.

Relevant sources: `apps/web/src/repositories/firebase/firestore-finance-repository.ts`, `apps/web/src/app/admin/finance/page.tsx`.

Required change: show separate currency totals, or use an explicit, traceable reporting-currency conversion policy. Do not add unlike currencies directly.

### 4. New WhatsApp work lacks an employee assignment path — high operational gap

New channel contacts start with `ownerUid: "unassigned"`; their conversations and review requests inherit that value. Employee conversation/support queries require the current employee's assignment. Managers can see the unassigned records, but conversation controls expose takeover/resume/close/reply, not assignment to another employee.

A known client with an existing consultant can route correctly. A newly registered client is not automatically allocated a consultant or lead by WhatsApp registration. The bot's review request therefore does not, by itself, place that new work in a salesperson's inbox.

Relevant sources: `apps/functions/src/conversation-service.ts`, `apps/functions/src/whatsapp-flow.ts`, `apps/functions/src/whatsapp-planner.ts`, `apps/web/src/repositories/firebase/firestore-conversation-repository.ts`, `apps/web/src/app/api/admin/conversations/route.ts`, `apps/web/src/app/admin/support/page.tsx`.

Required change: connect new WhatsApp clients/review requests to an authorized assignment rule or add a manager dispatch queue with reassignment and notifications.

### 5. Employee “Active bookings” includes completed holidays — medium

The non-manager dashboard reads bookings linked to the employee's leads, then counts every booking whose status is not cancelled. That includes completed holidays. A fixture containing one confirmed and one completed booking displays two active bookings.

Relevant source: `apps/web/src/repositories/firebase/dashboard-repository.ts` (`activeBookings`).

Required change: use the canonical active-status set for the active metric and retain completed/history totals separately. Quote-in-progress counts also count versions rather than distinct latest proposals and should be reviewed for the intended metric.

### 6. Quote/booking list caps can hide an employee's assigned records — medium/high as data grows

The quote and booking repositories fetch the first 100 organization records and only then filter by lead ownership. There is no continuation control in those lists. When earlier records belong to other employees, an employee's own records can be omitted even though the dashboard counts them.

Relevant sources: `apps/web/src/repositories/firebase/firestore-booking-repository.ts`, `apps/web/src/repositories/firebase/firestore-quote-repository.ts`.

Required change: scope the query before pagination, provide a stable cursor/order, and preserve the viewer's assignment restrictions.

### 7. A draft quote revision removes the visible proposal — medium workflow gap

The customer repository selects the highest version before excluding drafts. Sending v1 and saving an unsent v2 therefore removes that lead's itinerary from the customer dashboard. Quote-sharing functions also intentionally invalidate older versions once a newer version exists. This protects against accepting stale terms, but the dashboard provides no “revision being prepared” explanation.

Relevant sources: `apps/web/src/repositories/firebase/client-portal-repository.ts`, `apps/functions/src/quote-sharing.ts`.

Required change: define the intended revision experience, e.g. show a pending-revision state and optionally a read-only superseded proposal. Preserve the prohibition on accepting obsolete versions.

## Role/configuration decisions and production limits

- The manager role intentionally lacks `settings:manage`. It can manage staff within restrictions and see business performance, but cannot open personal travel pricing or Tara persona settings. Those settings currently require owner/admin/super-admin. Confirm this role split before describing them as generally manager-managed features.
- Customer portal identity requires a verified email. WhatsApp registration creates a CRM identity for that number, not a website login. Associating a WhatsApp-only client with a verified website account needs an explicit verified linking process; an email typed into chat must not silently grant access.
- Client history is read in full; archive/pagination and realistic volume measurements remain open.
- Login/session checks cover role/organization consistency, disabled profiles and verified-email customer access. Production management MFA, App Check, deployed rules/indexes, scheduler jobs, provider credentials, live inventory, messaging delivery, payment callbacks and approved inference must still be verified in their deployed environments.
- There is no single expected feature specification for every staff role in this request. Missing self-service operations should be distinguished from intentionally staff-controlled operations. Supplier booking, financial approvals and refunds remain governed staff workflows.

## Verification and scope

The review uses source tracing and a local browser audit against synthetic Auth/Firestore emulator records. It covers ten staff roles: super_admin, owner, admin, manager, sales, travel_consultant, accounts, marketing, content_editor and readonly, plus verified customers, another customer identity and an unverified account.

The browser audit checks role landing pages, visible navigation destinations, selected forbidden actions, record isolation, customer support/reply round trip and customer mobile overflow. Successful browser probes cover active booking counts, quote revision visibility, marketing quote access, read-only conversation controls, unassigned conversations and assigned-record truncation. Finance currency aggregation and the manager pricing restriction are source-confirmed; a supplementary finance-widget render probe was inconclusive and is not counted as a passed browser check.

The first audit pass completed dashboard checks but timed out compiling the unrelated concierge-session endpoint in development. The focused rerun omits that separate concierge test; this timeout is not recorded as a confirmed dashboard defect. No production records were changed, no real messages/payments were sent, and no fixes were made as part of this audit.

Detailed local artifacts: `/tmp/tlc-dashboard-audit-results.json`, `/tmp/tlc-dashboard-audit-final.log`, `/tmp/tlc-dashboard-screenshots/`. The temporary harness is local/ignored at `.cache/dashboard-audit.mjs`.

Final focused browser result: passed for all ten staff roles, 199 navigation-target requests, verified customer isolation, support/reply round trip and mobile overflow. No browser page errors were recorded. With 105 earlier bookings owned by another employee, the salesperson’s booking list omitted their own booking; the active count was 2 for one confirmed and one completed trip. Marketing received the assigned quote detail with its supplier-cost summary; read-only takeover was displayed but returned HTTP 403. Both versions of a customer proposal were absent while the newer version was a draft.
