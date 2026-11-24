# TBO hotel certification

Use the real application adapter to generate staging evidence. Unit-test fixtures are not certification logs. The public customer flow remains shortlist → consultant quote; these cases exercise the supplier adapter used by staff fulfilment. They do not prove that portal validation is complete.

## Actual certification logs: 13 November 2026

All eight required booking cases were executed through TLC's actual TBO backend adapter against the staging APIs. Four domestic Delhi cases and four international Dubai cases are confirmed and vouchered; Get Booking Details independently confirms room occupancy and booking status. These are captured HTTP requests and responses, not mocked responses or example JSON.

| Case | Destination | Booking ID | Confirmation number | Status |
| --- | --- | --- | --- | --- |
| 1 | Delhi | 2227777 | 7353256339237 | Confirmed |
| 2 | Delhi | 2227779 | 7567830509648 | Confirmed |
| 3 | Delhi | 2227780 | 7656985111614 | Confirmed |
| 4 | Delhi | 2227781 | 7453171443276 | Confirmed |
| 5 | Dubai | 2227783 | 7707013656157 | Confirmed |
| 6 | Dubai | 2227786 | 7051339359676 | Confirmed |
| 7 | Dubai | 2227785 | 7900590247959 | Confirmed |
| 8 | Dubai | 2227787 | 7211894365568 | Confirmed |

The copies at the repository root (`TLC-TBO-Actual-Hotel-API-Logs/` and its `.zip`) are also git-ignored because they contain the supplied PAN.

Evidence directory: `tbo-logs/tlc-hotel-certification-20261113/TLC-TBO-Actual-Hotel-API-Logs/`.
Archive: `tbo-logs/tlc-hotel-certification-20261113/TLC-TBO-Actual-Hotel-API-Logs.zip`.
All 439 offline evidence checks pass. Each folder contains individual request/response JSON files, a consolidated `api-exchanges.json`, timestamps, endpoint URLs, session/trace IDs, body checksums, a booking summary and verification results. `summary.csv` lists all confirmations. Authentication exchanges are shared within execution groups and referenced from each case summary.

Case 01 preserves the previously executed transaction, including its original run ID; it was not booked again. The remaining cases were executed after the user requested the complete actual logs. International cases use the user-supplied PAN with personal classification (`IsCorporate=false`). Repeated adult test entries use the matching supplied name and are allowed by `SamePaxNameAllowed=true`. Child entries use `GuardianDetail` with that named personal PAN. Get Booking Details records those guardian details. Identity values are kept only in ignored local evidence/input files; none are copied into this runbook or the example templates.

Earlier unsuccessful attempts are preserved separately under `attempts/`, including PreBook-only attempts missing PAN and explicit Book validation rejections (`ResponseStatus=3`, `ErrorCode=3`, `BookingId=0`, "PAN is mandatory"). They are excluded from the clean eight-case submission archive. Retries used fresh searches and were allowed only after inspecting the explicit rejection; no confirmed or uncertain booking was repeated.

Passwords and tokens are redacted, while supplied PAN and booking identifiers are retained for verification. The archive has not been emailed to TBO. No production booking or deployment occurred.

## Run another case

Build first:

```sh
pnpm --filter @tlc/shared build
pnpm --filter @tlc/integrations build
pnpm tbo:hotel-certify -- smoke
```

Copy a `hotel-case-NN.example.json` to an ignored local directory. These eight templates mirror the domestic/international occupancy matrix. Review travel dates and test guest data before execution. Replace examples with TBO-approved test identity details if PAN/passport is required. Never manufacture PAN/passport values, take customer identity data for test cases, or put secrets in tracked files.

Set `TBO_ENV=staging` and `TBO_END_USER_IP` to the public IPv4 used for these requests. The staging execution used the current machine's public IPv4 only in the process environment; `.env` was not modified. Production egress/whitelisting remains separate. Do not change endpoints to live URLs for certification.

```sh
pnpm tbo:hotel-certify -- book tbo-logs/inputs/case-02.json tlc-hotel-run-02
node scripts/verify-tbo-hotel-case.mjs tbo-logs/tlc-hotel-run-02/case-02
```

Each case creates an exclusive `run.lock` and records a booking-attempt marker. An existing run/case directory cannot be reused. Never evade this guard by picking a new ID after an uncertain result. Reconcile Get Booking Details or the TBO portal first. The provider does not retry Book after a transport failure; it looks up the transaction trace instead. A pending result remains pending. Supplier pending statuses need later status checks per TBO's documented intervals (Book: 120 seconds; voucher: 5–10 minutes); the runner does not schedule those checks automatically.

The default selection is the first refundable available rate, or the first rate if none is refundable. An optional `bookingCode` must exist in that run's fresh Search. A Hold request (`isVoucherBooking: false`) needs a refundable rate with a future cancellation deadline. Use `generateVoucher` after confirmation before the deadline. Use `cancel` and `getChangeRequestStatus` for separate cancellation evidence. Booking and cancellation methods require an approving actor.

## Implemented safeguards

- Full PreBook ValidationInfo retained on the staff offer; missing rules block booking.
- Valid PAN structure and holder classification, corporate permission, PAN/guardian details on every passenger when mandatory, unique PAN count, names, room lead contacts, child ages, mandatory passports, package transports and GST eligibility checked before Book.
- Agency/TBO corporate PAN prohibition supports an explicit `extras.forbiddenCorporatePans` list; verifying guest ownership still requires staff review and the relevant PAN values. Named personal guardian PAN is supported via `GuardianDetail` for passengers without their own PAN; guardian PAN is prohibited for corporate bookings.
- Final PreBook NetAmount is required. A stale caller amount or changed BookingCode is rejected. Searched occupancy and child ages must match passenger data.
- Get Booking Details after Book success or transport failure; no automatic repeat booking. Staff fulfilment does not mark unresolved/pending results confirmed.
- Real GET/POST responses and network failures logged; credentials redacted; certification logging fails if evidence cannot be saved.
- Cloud-log payloads are compressed and chunked without cutting JSON, within Firestore's commit size. An exchange too large to store keeps its metadata with `payloadOmitted`. Parent and payload documents use the same TTL-enabled collection.

## Cloud export

Set `TBO_LOG_TRAFFIC=true` on Functions for traffic capture. Staff booking fulfilment supplies run ID `booking-<bookingId>` and case ID `<itemId>-<attempt timestamp>`. The local certification runner writes directly to disk; it needs no Firestore setup.

```sh
pnpm tbo:export-logs -- run:booking-BOOKING_ID tbo-logs/exported-booking
```

Deploy the new runId/startedAt index before querying cloud logs by run ID. Export supports legacy logs and chunked payloads. Trace-only export can omit Authenticate/Search calls, so use run-based export for correlated booking attempts. The cloud export has metadata but not the local runner's SHA-256 review format.

## Remaining verification

The full eight-case actual log package is ready for TBO review. General queries and portal verification remain after log verification. The example templates are starting inputs; the actual captured evidence in the ignored `tbo-logs` directory is the submission.

Hold/voucher, cancellation, timeout recovery, duplicate prevention and validation failures have local automated coverage; no additional staging bookings/cancellations were performed for those scenarios. Confirm ambiguous documentation details with TBO, especially cancellation-deadline timezone and PaxNameMinLength interpretation. The current date mapping retains the existing UTC interpretation; do not rely on it for bookings near a hold deadline until confirmed.

When PreBook demands PAN, passport or arrival/departure transport details, **Book with TBO** now asks the manager for exactly those fields (`identity-required`), including a responsible traveller's PAN for travellers without their own. The values travel with that one request to TBO and are not written to bookings, audit records or `tboApiLogs` (PAN, passport and GST numbers are masked there). They must be re-entered on a retry. Travellers are placed in the searched rooms by exact age at check-in; a mismatch with the priced occupancy stops before Book. Not yet in the form: GST details for corporate bookings and an agency-PAN block list (`extras.forbiddenCorporatePans`), so corporate PAN ownership still needs staff review. This flow has unit coverage only; it has not been exercised against staging, and portal certification still requires reviewing the end-to-end staff experience.

Sources: https://apidoc.tektravels.com/hotelnew/Certification.aspx, https://apidoc.tektravels.com/hotelnew/apivalidation.aspx, https://apidoc.tektravels.com/hotelnew/apiguide.aspx.
