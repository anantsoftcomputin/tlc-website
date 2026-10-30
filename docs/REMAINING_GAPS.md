# Gap follow-up — 30 October 2026

The five personal-advisor connections requested subsequently are implemented locally; see [PERSONAL_TRAVEL_ADVISOR.md](./PERSONAL_TRAVEL_ADVISOR.md) for their behavior and activation requirements.

This is the current follow-up to the 29 October project study. The work is local; production resources and provider settings have not been changed.

| Gap | Current result |
| --- | --- |
| Inactive tour controls | Implemented combined text/destination/style/duration filters, stable sorting, query restoration, reset links and accessible mobile expansion. Unsupported date/party catalogue controls were replaced with duration/style; dates and party details remain in custom planning. |
| Customer search candidate cap | Implemented document-order scans with continuation cursors. Each request reads at most 1,000 candidates, returning up to 50 matches; a zero-match scan can still continue. Search pagination retains the query and full email addresses are checked without truncation. |
| Expensive historical queries | Client identities resolve once, related records and payments use batches of up to 30 identifiers, finance close reads the selected period, and marketing outcomes are indexed before matching deliveries. Full client-history pagination and production-volume measurements remain open. |
| Authorization drift | Server sessions now reject profile/token role and organization mismatches, matching callable checks. Shared permission policy, repository checks and Firestore rules remain separate enforcement surfaces that require coordinated review. |
| Conflicting documentation | Replaced the obsolete root architecture, added this tracker, updated canonical architecture, delivery plan and communication setup, and labelled the project study as historical. |
| Unconnected email designs | Added four opt-in, deduplicated adapters: linked enquiry, captured payment, fully confirmed booking, issued finance document. Existing quote/reply/campaign adapters remain. Other scenarios still need their own authoritative events. |
| Unapproved local model | Remains unapproved. No model-quality result was fabricated and no production model was activated. The existing application-prompt failures require a better candidate and independent evaluation. |

## Verification

Final checks used Node 22 and demo Firebase emulators. Outbound provider calls were intercepted; browser fixtures were synthetic.

| Check | Result |
| --- | --- |
| Workspace preparation | Passed after repairing the local dependency installation with the unchanged pinned lockfile |
| Fresh lint, typecheck and unit tests | 24 tasks passed without cache reuse; 202 tests passed; 19 emulator cases and 2 live-model cases skipped in the ordinary unit run |
| Firestore rules | 19 passed |
| Workflow integration | 19 passed, including lifecycle email deduplication/delivery/tenant isolation and indexed marketing-dataset outcome/consent checks |
| Portal browser suite | Passed for six staff roles, client ownership, support round trip, mobile layout, concierge privacy and takeover |
| Gap browser suite | Passed for combined filters, URL restoration, sorting, mobile expansion, search continuation beyond 1,000 candidates, and full long email matching |
| Production build | All 7 workspace build tasks passed, using isolated web output |
| Email export | Refreshed the 43-design offline collection with current integration metadata |

Build and type checks were rerun sequentially after an earlier verification race over generated Next types. The browser harness now uses dedicated catalogue fixtures, a fresh isolated cache and a stable mobile-toggle selector. Generated changes to `next-env.d.ts` and `tsconfig.json` were removed. The owned demo servers/emulators were shut down. No production deployment or live provider/model validation was performed.

Logs: `/tmp/tlc-gap-verified-checks.log`, `/tmp/tlc-gap-final-build.log`, `/tmp/tlc-gap-emulators.log` (rules), `/tmp/tlc-gap-emulators-recheck.log` (19 integration cases), `/tmp/tlc-gap-browser-final.log`, and `/tmp/tlc-gap-email-export.log`. Portal screenshots are in `/tmp/tlc-dashboard-screenshots`.


## Activation and work that remains

- Deploy the accompanying finance range-query indexes together with the code. Existing production indexes, MFA setup and customer-search backfill must still be verified by the production operator.
- Configure/verify Resend sender, inbound domain, callbacks and designated-recipient delivery, then opt into the four new triggers using `EMAIL_LIFECYCLE_ENABLED=true`. The default is false. This enables new eligible events; it is not a historical backfill.
- Authentication templates need server-generated Firebase action links and a custom delivery path. Reminders, expiry, refund, booking changes/cancellations, saved-plan recovery, birthday/anniversary and post-trip scenarios need dedicated event adapters or approved campaign schedules. A reusable design is not an enabled automation.
- Expand the local model corpus to the exact application schemas and prompts, train a new candidate, and pass the live application tests plus independent grounding/conversation review. See [TLC_OWNED_AI_2026-10-08.md](./TLC_OWNED_AI_2026-10-08.md). Deployment, licensing, approved training evidence and provider certification were not established in this code pass.
- Design archive navigation and pagination for very large client histories, and measure finance lock contention and dataset memory at realistic volumes. The query changes reduce repeated work without silently dropping historical customer records or changing finance invariants.

## Local commands

```sh
pnpm prepare:ci
pnpm exec turbo run lint typecheck test --force
pnpm test:rules
pnpm test:integration
# Auth and Firestore demo emulators are required for the browser suite:
GCLOUD_PROJECT=demo-tlc-holidays FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node scripts/gaps-smoke.mjs
```

The browser script runs the existing portal/role suite, then checks tour filters, sorting, mobile expansion, search beyond 1,000 candidates and exact long email matching. Its owned demo web server uses port 3120 and `.next/gap-review`, leaving an existing port-3000 app alone. `TLC_NEXT_DIST_DIR` allows isolated development/build output.
