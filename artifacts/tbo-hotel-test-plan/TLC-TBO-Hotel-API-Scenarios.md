# TLC VACATIONS LLP

# Hotel API scenarios — Phase 1

Version 1.0 · 4 November 2026 · 40 scenarios · Not run

**Purpose.** Please review this hotel-only scenario pack and return the account-specific request/response fixtures, supported methods, reproducible inventory or error triggers, and expected supplier states. Prioritize cases 1–8, then the applicable functional and recovery cases.

**Scope and status.** 40 numbered scenarios: 8 published hotel occupancy cases, 24 additional hotel cases and 8 hotel access/resilience cases. The extra cases are TLC proposals, not an assertion that TBO mandates all 40. Every case is Not run.

**Test dates and guests.** Use the actual execution date D, check-in D+30 and check-out D+35 (five nights). Example for 4 November 2026: 4–9 December 2026; reconfirm bookable staging dates. Nationality IN unless varied; use synthetic guest details and child ages 6 and 10 at check-in.

**Hotel workflow.** Current static hotel codes → agreed authorization → Search → PreBook → consultant review → approved Book → booking retrieval → voucher only where appropriate. Use the agreed cancellation/status path for cancellation cases.

**How the files match.** The scenario number and scenario ID are identical in the numbered document and JSON. JSON includes exact Search occupancy bodies for cases 1–8 and six illustrative request templates. Placeholder values and unresolved numeric types must be replaced before execution. TBO supplies the response fixtures; none are fabricated here.

## Confirm with the company before execution

1. Confirm TLC's entitled hotel API family, versions and separate staging URLs for every method; map any Room/Block terminology to the supplied contract.
2. Confirm hotel account entitlement, static-content versus hotel credentials, per-service authorization and approved egress IPs. Supply secrets through the agreed secure channel.
3. Provide current city/hotel codes, available test dates, sufficient test credit and TBO-approved synthetic guest/contact/document fixtures.
4. Resolve the public documentation differences: Search child ages versus Book acceptance, NetAmount scalar versus array wording, and the hold/voucher field names.
5. Confirm pending-state polling, expiry, retry limits and lookup after a lost Book response. Confirm whether client-reference reconciliation is available for this account.
6. Mark partial cancellation, amendments, special requests and any unsupported capability explicitly; supply the supported alternative and fixture owner/delivery date.

## A. Hotel certification occupancy cases

### 1. Domestic: one room, one adult

**ID:** HTL-C01 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A; New Delhi; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 1; TBO to confirm the binding checklist for TLC. [H1]

### 2. Domestic: one room, two adults and two children

**ID:** HTL-C02 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 2A + 2C (6,10); New Delhi; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 2; TBO to confirm the binding checklist for TLC. [H1]

### 3. Domestic: two rooms, one adult in each

**ID:** HTL-C03 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A; R2: 1A; New Delhi; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 3; TBO to confirm the binding checklist for TLC. [H1]

### 4. Domestic: one adult and two children in room 1; two adults in room 2

**ID:** HTL-C04 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A + 2C (6,10); R2: 2A; New Delhi; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 4; TBO to confirm the binding checklist for TLC. [H1]

### 5. International: one room, one adult

**ID:** HTL-C05 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A; Dubai; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 5; TBO to confirm the binding checklist for TLC. [H1]

### 6. International: one room, two adults and two children

**ID:** HTL-C06 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 2A + 2C (6,10); Dubai; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 6; TBO to confirm the binding checklist for TLC. [H1]

### 7. International: two rooms, one adult in each

**ID:** HTL-C07 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A; R2: 1A; Dubai; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 7; TBO to confirm the binding checklist for TLC. [H1]

### 8. International: one adult and two children in room 1; two adults in room 2

**ID:** HTL-C08 · **Priority:** P0 · **Status:** Not run

- **Test data:** R1: 1A + 2C (6,10); R2: 2A; Dubai; five nights; current static IDs.
- **Steps:** Resolve current hotel codes and details → Authorize each service with its agreed account credentials → Search for the exact stay and room occupancy → PreBook the selected bookable unit → Review current amount, restrictions and cancellation terms → Submit Book after consultant approval → Retrieve the reservation and reconcile its final status → Retrieve or generate a voucher only when applicable to a confirmed reservation
- **Company to provide:** One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence.
- **Expected result:** Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking.

Basis: Published hotel occupancy case 8; TBO to confirm the binding checklist for TLC. [H1]

## B. Functional and recovery scenarios

### 9. City and hotel identifier mapping

**ID:** HTL-01 · **Priority:** P0 · **Status:** Not run

- **Test data:** New city ID and hotel codes from current static feed; retired ID variant.
- **Steps:** Resolve city → properties → search.
- **Company to provide:** Current mappings and invalid/retired code response.
- **Expected result:** No airport-code/city-ID confusion; retired property cannot silently map to another hotel.

### 10. Room combinations remain intact

**ID:** HTL-02 · **Priority:** P1 · **Status:** Not run

- **Test data:** Two rooms, different adults/children and room types.
- **Steps:** Search then select one bookable combination and the agreed hotel booking workflow.
- **Company to provide:** Combination code, ordered room/guest mapping and per-room/whole-unit prices.
- **Expected result:** Do not split or recombine rates from unrelated booking codes.

### 11. Child ages and occupancy limits

**ID:** HTL-03 · **Priority:** P0 · **Status:** Not run

- **Test data:** Missing age, age-count mismatch, extra child, infant, no adult; positive control.
- **Steps:** Local validation plus agreed Search/PreBook error fixtures.
- **Company to provide:** Allowed ranges and supplier-specific occupancy/extra-bed conditions.
- **Expected result:** Exact age at check-in preserved; no assumed free infant or guaranteed extra bed.

### 12. Stay/date boundaries

**ID:** HTL-04 · **Priority:** P0 · **Status:** Not run

- **Test data:** Checkout same/before check-in, past stay, minimum stay, maximum stay, leap-day boundary.
- **Steps:** Separate Search/PreBook variants.
- **Company to provide:** Validation errors and supported date/stay limits.
- **Expected result:** Nights calculated correctly; invalid stay cannot be booked.

### 13. Nationality/residency restrictions

**ID:** HTL-05 · **Priority:** P1 · **Status:** Not run

- **Test data:** Same property/dates for IN and AE guest profiles; rate restricted to one.
- **Steps:** Search and the agreed hotel booking workflow using actual declared nationality/residency.
- **Company to provide:** Applicable rate/eligibility and mismatch rejection.
- **Expected result:** Nationality not changed to obtain a cheaper rate; constraints visible to consultant.

### 14. Room-only versus meal plans

**ID:** HTL-06 · **Priority:** P1 · **Status:** Not run

- **Test data:** Same hotel with room-only, breakfast and all-inclusive options.
- **Steps:** Search/PreBook each distinct rate.
- **Company to provide:** Exact meal inclusion, guest coverage and rate identifiers.
- **Expected result:** Do not assume breakfast covers every guest or all-inclusive includes all extras.

### 15. Refundability and deadline boundary

**ID:** HTL-07 · **Priority:** P0 · **Status:** Not run

- **Test data:** Refundable/non-refundable; cancellation one minute before/after deadline.
- **Steps:** PreBook; quote applicable cancellation charge in separate fixtures.
- **Company to provide:** Policy ladder, timezone, indexed room scope, fixed/percent/night rules.
- **Expected result:** Correct policy presented for selected rate; no inferred timezone or free cancellation.

### 16. Price changes at PreBook

**ID:** HTL-08 · **Priority:** P0 · **Status:** Not run

- **Test data:** Higher/lower total, changed tax or supplement since Search.
- **Steps:** Search → PreBook → review.
- **Company to provide:** Updated cost/currency and whether new booking code is returned/required.
- **Expected result:** Reconcile final amount; require review before Book.

### 17. Policy changes without price change

**ID:** HTL-09 · **Priority:** P0 · **Status:** Not run

- **Test data:** Same total; refundable becomes restricted or meal inclusion changes.
- **Steps:** Search then changed PreBook fixture.
- **Company to provide:** Changed policy/inclusions and validity metadata.
- **Expected result:** Terms change triggers review even when total is unchanged.

### 18. Selected room no longer available

**ID:** HTL-10 · **Priority:** P0 · **Status:** Not run

- **Test data:** Search success; room sold out or booking code expires.
- **Steps:** PreBook/Book controlled failure; retrieve if commit outcome uncertain.
- **Company to provide:** Sold-out/expired code and permitted re-search path.
- **Expected result:** No different hotel/room substituted automatically; no false confirmation.

### 19. Taxes, supplements and currency

**ID:** HTL-11 · **Priority:** P0 · **Status:** Not run

- **Test data:** Multi-room stay; included tax, pay-at-property city fee and extra guest charge.
- **Steps:** Search → PreBook → confirmed retrieval.
- **Company to provide:** Charge scope, currency, inclusion flags, nightly/total values and settlement amount.
- **Expected result:** No double-counted tax; payable-now and payable-at-property clearly separated.

### 20. Minimum selling restriction

**ID:** HTL-12 · **Priority:** P0 · **Status:** Not run

- **Test data:** Rate with RecommendedSellingRate, zero/absent variant and currency mismatch.
- **Steps:** PreBook → TLC quote validation.
- **Company to provide:** Restriction applicability and authoritative currency/amount semantics.
- **Expected result:** Applicable floor enforced; never convert or omit it without an agreed rule.

### 21. Mandatory PAN/passport/GST/name fields

**ID:** HTL-13 · **Priority:** P1 · **Status:** Not run

- **Test data:** PreBook varies document flags and guest naming restrictions.
- **Steps:** the agreed hotel booking workflow with one missing/invalid field per variant, then corrected payload.
- **Company to provide:** Required-field flags, supported formats, rejection code and accepted guest mapping.
- **Expected result:** Collect required data securely; no invented identifiers; validation follows returned rules.

### 22. Package-only rate and transfers

**ID:** HTL-14 · **Priority:** P1 · **Status:** Not run

- **Test data:** Package fare with mandatory arrival/departure details; transfer inclusion variant.
- **Steps:** PreBook then Book with valid/omitted details.
- **Company to provide:** Package restrictions, transport fields and transfer coverage/charges.
- **Expected result:** No package-only rate sold standalone; transfers not promised from hotel description alone.

### 23. Special requests and accessibility

**ID:** HTL-15 · **Priority:** P1 · **Status:** Not run

- **Test data:** Twin beds, adjoining rooms, late arrival, wheelchair-accessible room.
- **Steps:** Submit only supported request fields; retrieve.
- **Company to provide:** Accepted request versus guaranteed amenity; unsupported field response.
- **Expected result:** Requested features remain unconfirmed unless explicit supplier evidence supports them.

### 24. Booking pending/on request

**ID:** HTL-16 · **Priority:** P0 · **Status:** Not run

- **Test data:** Book accepted but supplier confirmation delayed.
- **Steps:** the agreed hotel booking workflow then agreed polling/status retrieval.
- **Company to provide:** Pending→confirmed and pending→failed sequences with polling guidance.
- **Expected result:** No voucher or confirmed notice while pending; timeout escalates to consultant.

### 25. Timeout after Book

**ID:** HTL-17 · **Priority:** P0 · **Status:** Not run

- **Test data:** Supplier created reservation but response lost; alternate no-booking variant.
- **Steps:** LOCAL response loss with TBO reconciliation fixtures.
- **Company to provide:** Lookup using client reference/session/known IDs; eventual final states.
- **Expected result:** No blind duplicate reservation; unresolved stays unknown.

### 26. Duplicate and concurrent hotel Book

**ID:** HTL-18 · **Priority:** P0 · **Status:** Not run

- **Test data:** Two identical requests, same room code/reference.
- **Steps:** LOCAL concurrency test and approved staging duplicate fixture.
- **Company to provide:** Deduplication contract, duplicate error or existing reservation retrieval.
- **Expected result:** One logical reservation; de-duplication does not block a deliberate separate booking.

### 27. Multi-room partial failure

**ID:** HTL-19 · **Priority:** P0 · **Status:** Not run

- **Test data:** One of two rooms unavailable during commitment.
- **Steps:** TBO-provided atomic-failure or partial-success fixture.
- **Company to provide:** Document whether whole unit fails or partial reservation exists; exact financial state.
- **Expected result:** Never assume atomicity; reconcile and display every room’s actual status.

### 28. Voucher issuance and retrieval

**ID:** HTL-20 · **Priority:** P1 · **Status:** Not run

- **Test data:** Confirmed reservation; pending state; duplicate voucher request.
- **Steps:** GetBookingDetails and GenerateVoucher where applicable.
- **Company to provide:** Voucher availability, confirmation/reference fields and premature-request error.
- **Expected result:** Voucher reflects confirmed dates, guests and room scope; no duplicate booking from reprint.

### 29. Full/partial cancellation

**ID:** HTL-21 · **Priority:** P1 · **Status:** Not run

- **Test data:** Whole booking and one room; free/penalty/non-refundable variants.
- **Steps:** Approved cancel/change path → status → retrieve.
- **Company to provide:** Supported scope, charge, request/final status and remaining rooms.
- **Expected result:** No automatic full cancellation when partial unsupported; reconcile deductions.

### 30. Amendment, shortening and extension

**ID:** HTL-22 · **Priority:** P1 · **Status:** Not run

- **Test data:** Guest correction, arrival shift, one-night shortening/extension.
- **Steps:** Use supported amendment or explicit cancel/rebook alternative.
- **Company to provide:** Availability, fare/policy changes and unsupported operation response.
- **Expected result:** Never treat an email request as supplier-approved change; re-approve costs.

### 31. No-show, early checkout and refund

**ID:** HTL-23 · **Priority:** P1 · **Status:** Not run

- **Test data:** Confirmed stay not used or guest leaves early.
- **Steps:** Use supplier-supported change/refund status workflow.
- **Company to provide:** Policy outcome, penalty, approved/refused refund and settlement evidence.
- **Expected result:** No promised refund without supplier outcome; avoid duplicate financial posting.

### 32. Stale/missing booking details

**ID:** HTL-24 · **Priority:** P1 · **Status:** Not run

- **Test data:** Unknown reference, eventual consistency, changed supplier status.
- **Steps:** Retrieve using supported identifiers and bounded retries.
- **Company to provide:** Not-found versus pending versus final failure; updated booking details.
- **Expected result:** Do not mark cancelled from transient not-found; escalate unresolved mismatch.

## C. Hotel access and API resilience

### 33. Hotel service authorization succeeds

**ID:** HTL-A01 · **Priority:** P0 · **Status:** Not run

- **Test data:** TBO-issued hotel staging login, approved agency profile and whitelisted egress IP.
- **Steps:** Authorize each entitled hotel service and call an enabled hotel read method. Use Basic Auth or a session token only where specified for that service.
- **Company to provide:** Successful authorization/read examples for the hotel account; session expiry metadata where applicable. Supply credentials separately.
- **Expected result:** Static-content access and hotel availability access are verified independently; no secret is included in the sharing pack.

### 34. Invalid or incomplete hotel credentials

**ID:** HTL-A02 · **Priority:** P0 · **Status:** Not run

- **Test data:** Incorrect hotel credentials, omitted required authentication value, and incorrect agency/profile identifier as separate variants.
- **Steps:** Make one TBO-approved negative request per variant, followed by a corrected request.
- **Company to provide:** The exact authorization errors and the supported correction procedure.
- **Expected result:** A rejected identity cannot proceed to a hotel reservation; distinguish authentication failure from zero availability.

### 35. Hotel session or selection expires

**ID:** HTL-A03 · **Priority:** P0 · **Status:** Not run

- **Test data:** Expired session token where required, and a selected hotel BookingCode that has expired.
- **Steps:** Test the session-based method and stale selection separately; follow the account-specific renewal and re-search procedure.
- **Company to provide:** Expiry errors, applicable lifetimes and approved recovery paths.
- **Expected result:** Do not apply token renewal rules to Basic Auth calls; refresh expired selections and reconcile any uncertain booking first.

### 36. Hotel account entitlement denied

**ID:** HTL-A04 · **Priority:** P0 · **Status:** Not run

- **Test data:** Static hotel content is accessible but Search, PreBook or Book entitlement is not enabled.
- **Steps:** Call each hotel service using its own entitled credentials and isolate the denied capability.
- **Company to provide:** Entitlement-specific response and the account enablement procedure.
- **Expected result:** A configuration/access error is not displayed as a successful search with no rooms.

### 37. Hotel egress IP or agency profile rejected

**ID:** HTL-A05 · **Priority:** P0 · **Status:** Not run

- **Test data:** TBO-approved allowed and denied IP/profile fixtures.
- **Steps:** Use TBO-controlled denial fixtures; verify a corrected hotel request with the approved egress IP.
- **Company to provide:** The exact rejection and diagnostic fields, plus whitelisting requirements.
- **Expected result:** The rejection is actionable and no reservation is reported as confirmed.

### 38. Hotel throttling or temporary read outage

**ID:** HTL-A06 · **Priority:** P1 · **Status:** Not run

- **Test data:** Controlled rate-limit, timeout and service-unavailable fixtures; no uncontrolled load test.
- **Steps:** Exercise Search or static lookup with bounded retries under TBO's documented policy.
- **Company to provide:** HTTP/application errors, retry headers and permitted retry intervals.
- **Expected result:** Back off within the request deadline; never convert an outage into a no-availability result.

### 39. Insufficient hotel wallet or credit

**ID:** HTL-A07 · **Priority:** P0 · **Status:** Not run

- **Test data:** Staging credit below the selected hotel's final amount.
- **Steps:** Use balance lookup if supported, then one approved hotel Book attempt and authoritative reconciliation.
- **Company to provide:** Insufficient-credit response, any debit/release details, and the final reservation state.
- **Expected result:** No false confirmation, repeated debit or blind booking retry.

### 40. Malformed, partial or interrupted hotel response

**ID:** HTL-A08 · **Priority:** P1 · **Status:** Not run

- **Test data:** Separate fixtures for a business error in HTTP 200, missing required field, invalid JSON and a lost response.
- **Steps:** Use TBO fixtures or local fault injection at read and booking boundaries.
- **Company to provide:** Documented error contracts and a reconciliation fixture for uncertain Book results.
- **Expected result:** Reject incomplete success data. Preserve an unknown booking outcome until supplier retrieval resolves it.

## JSON example and submission format

The companion JSON contains all 40 numbered definitions, baseline Search bodies, reusable request templates and blank company-response fields. Illustrative PreBook body:

```json
{
  "BookingCode": "{{BOOKING_CODE_FROM_SEARCH}}"
}
```

After execution, return each certification case separately with actual request/response files, timestamps, API version, supplier identifiers and retrieval evidence. Record support status, fixture owner and target delivery date in the JSON company_response fields.

## Hotel documentation references

Checked 4 November 2026. Exact applicability remains subject to TBO's account-specific confirmation.

- [H1] Hotel certification occupancy cases: https://apidoc.tektravels.com/hotelnew/Certification.aspx
- [H2] Hotel API guide: https://apidoc.tektravels.com/hotelnew/apiguide.aspx
- [H3] Hotel search: https://apidoc.tektravels.com/hotelnew/HotelSearch.aspx
- [H4] Hotel PreBook: https://apidoc.tektravels.com/hotelnew/HotelPreBook.aspx
- [H5] Hotel Book fields: https://apidoc.tektravels.com/hotelnew/HotelBook.aspx
- [H6] Hotel Book JSON example: https://apidoc.tektravels.com/hotelnew/HotelBook_Json.aspx
- [H7] Booking retrieval: https://apidoc.tektravels.com/hotelnew/HotelGetbookingdetail.aspx
- [H8] Cancellation request: https://apidoc.tektravels.com/hotelnew/HotelSendChange.aspx
- [H9] Cancellation status: https://apidoc.tektravels.com/hotelnew/HotelGetChangeRequestStatus.aspx
- [H10] Per-service authorization: https://apidoc.tektravels.com/hotelnew/Authorization.aspx
