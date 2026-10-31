# Dashboard configuration and gap closure — 1 November 2026

The gaps identified in the [dashboard audit](./DASHBOARD_AUDIT_2026-11-01.md) are implemented in the local project. Deployment and real provider verification remain separate operational steps.

## Implemented corrections

| Audit gap | Result |
| --- | --- |
| Quote access derived from customer access | Quote and booking routes/repositories require quote-read permission. Lead routes use lead-read permission. Navigation and Firestore rules follow those domain boundaries. Marketing customer access does not grant quote/lead/booking access. |
| Non-writers offered operational actions | Booking fulfilment/completion/documents, lead edits/AI generation, conversation controls, alert actions and staff access changes respect actor capabilities. Finance staff retain finance operations. Read-only access does not gain write actions. Completed/cancelled supplier operations are read-only and trip completion is offered only after the services end. |
| Mixed-currency headline/report totals | Finance has an explicit reporting-currency selector. Monetary sources are filtered before totals, ageing, GST and cash reports are calculated. CSV exports retain the selected currency. No currency conversion is assumed. |
| Unassigned WhatsApp work | Signed inbound work uses configured organization routing, verified against active eligible staff. Existing valid ownership is retained. New contacts without a configured route enter a manager dispatch queue. Managers can assign/reassign conversations and requests, update linked customer/lead ownership and open support requests, and create an employee alert. |
| Misleading active counts | Completed/cancelled bookings are excluded from the active metric. Quotes in progress and approval candidates use the latest version of each proposal. |
| Global limits hide assigned records | Quote/booking list queries are scoped to the viewer's assigned leads before limiting. Stable document-order cursors support next pages. Broad access is restricted to permitted management/finance/read-only roles. |
| Draft revisions disappear without explanation | Customer overview displays an itinerary/revision-in-preparation state. Archived proposals show superseded status and omit obsolete acceptance links. Draft prices, share tokens and terms are not exposed. |

## Additional customer and management features

- `/client/history` provides paginated bookings, enquiries, itinerary history, finance documents, payments and support history, with completed-trip feedback. Page size is bounded and continuation queries remain within owned records.
- The customer overview keeps a bounded booking/document/enquiry/support/payment working set and uses aggregate counts for totals. Active bookings and open support take priority. Quote version resolution reads metadata rather than full itinerary carts; overview proposals and pending revisions are capped, with the archive available for the rest.
- `LINK WEBSITE` in a verified registered WhatsApp conversation creates a ten-minute, account-scoped redemption link. The customer signs into a verified website account and explicitly confirms linking the exact phone-proven traveller. Another bound account, changed contact, ambiguous contact or expired token is rejected. Consent and model-training choices are preserved. No unverified email supplied in chat is treated as account proof.
- Existing WhatsApp support requests are made visible to the successfully linked website identity, and future review requests use that linked identity. Website and WhatsApp advisor contexts can resume the most recently confirmed owned plan.
- Managers can administer personal travel pricing through a dedicated `personalization:manage` capability. General system/persona settings remain restricted to owner/admin/super-admin. This does not grant managers unrestricted settings access.
- Empty create menus and unavailable Alerts shortcuts are hidden from roles without the relevant capabilities. Sign-out clears any retained personal chat state.

## Assignment operations

Configure the existing Lead settings screen's default staff member or approved assignment policy. Only same-organization, active sales/consultant/management staff are eligible. Disabled, foreign-organization and unrelated roles are excluded.

The manager dispatch queue is `/admin/dispatch`; individual conversation and support detail screens also support assignment. Assignments check the expected current owner and reject conflicting edits instead of silently overwriting another manager's decision. API requests check both Firebase account claims and the staff profile; mutations are audited. Client data remains scoped to the assigned employee, while management retains dispatch visibility.

Employee assignment alerts are internal application records. Creating an alert does not send an email or WhatsApp notification to staff.

## Deployment requirements

1. Build/vendor the shared packages using `pnpm prepare:ci`; deploy the web, Functions and accompanying Firestore rules/indexes together.
2. Include the inbound routing worker changes and existing WhatsApp normalization trigger. Reuse the organization's approved routing configuration and inspect unassigned records in Dispatch. Historical ownership is not bulk-migrated by deployment.
3. Preserve verified-email website login, role/organization session checks, disabled-account enforcement, production management MFA and App Check. The new linking flow requires the configured HTTPS `TLC_SITE_URL`.
4. Configure actual production supplier, messaging, payment/accounting and approved model endpoints as applicable. Validate with designated accounts and verify deployed scheduler jobs/index readiness before enabling real traffic or outreach. These integrations were not activated by this implementation.
5. Test an actual new WhatsApp client, a known client, staff dispatch/reassignment, cross-channel linking, a quote revision, an issued invoice and payment callbacks using the deployed release. Provider test fixtures do not establish production connectivity.

## Verification

A dedicated `scripts/dashboard-smoke.mjs` uses a demo project, synthetic users/data and schema-checked commerce/finance fixtures. It exercises ten staff roles, forbidden quote/lead access, restricted action visibility, currency-separated UI/CSV output, booking/proposal counts, assigned-record pagination beyond 100 other employees' records, quote revision states, client archives, support replies, dispatch authorization/conflict handling, and verified phone-account linking with expired/replayed-token rejection. It checks customer ownership and mobile overflow.

The existing personal-advisor browser suite is rerun to cover pricing, identity, feedback and consent withdrawal. Rule tests cover domain boundaries and private link collections. Workflow tests cover routing eligibility/deduplication and read-only alert denial in addition to the WhatsApp advisor and existing commerce/messaging suites.

Local checks run with Node 22 and the pinned pnpm version:

```sh
pnpm prepare:ci
pnpm exec turbo run lint typecheck test --force
pnpm exec firebase emulators:exec --only auth,firestore --project demo-tlc-holidays --non-interactive 'pnpm --filter @tlc/web test:rules && pnpm --filter @tlc/functions test:integration'
pnpm exec firebase emulators:exec --only auth,firestore --project demo-tlc-holidays --non-interactive 'node scripts/dashboard-smoke.mjs && node scripts/personalization-smoke.mjs'
```

Current unit/type/lint and rule/workflow results: 213 unit tests, all 24 lint/type/test tasks, 21 Firestore rule cases and 48 integration cases passed. The production build passed across all seven packages. The dashboard browser suite passed for all ten staff roles and 199 navigation targets, including the dispatch/link/archive/currency checks; the existing personal-advisor browser suite also passed. No production data, real messages or money were used.
