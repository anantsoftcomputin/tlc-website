# TLC VACATIONS LLP

# TBO API integration — comprehensive test scenarios

Version 1.0 · 17 October 2026 · 97 scenarios · Not executed


## 1. Request to the TBO integration team

TLC VACATIONS LLP requests an account-specific staging test pack for flight and hotel integration. Please map the scenarios below to supported API methods and provide reproducible request/response JSON, seeded inventory or trigger instructions, and the expected status transitions. Where a capability is not supported, please mark it Unsupported and provide the supported alternative.

This is a proposed test specification and response-fixture request, not an execution report or a claim of certification. Every scenario starts as Not run. It does not ask TBO to change its production API schema. No API login, booking, ticketing, cancellation or live payment is performed in preparing this document.

TLC’s client experience is: explore destinations → compare and save hotels/flights → request a tailored TLC quote → consultant review and supplier revalidation → approved fulfilment. A shortlist or quote acceptance must never be presented as a confirmed reservation. Booking scenarios below support supplier certification and controlled staff fulfilment, not instant client checkout.

Prepared 17 October 2026 • Version 1.0 • Audience: TBO integration/support team and TLC engineering/QA. Passwords, tokens and customer records are deliberately excluded. The referenced email was available; separate attachments were not available for review.

## 2. Confirm these items before preparing the fixtures

Q01 — Flight certification scope: the onboarding email specifies cases 1–7; the public Flight Certification page specifies 1–5, with later cases conditional; the Flight API Guide says 1–10. Please confirm the binding checklist/version for TLC in writing. This plan includes cases 1–12, with 1–7 treated as onboarding-required pending confirmation. [S1–S3]

Q02 — Flight paths: public sample guidance distinguishes LCC direct Ticket from non-LCC Book → Ticket. Confirm exceptions, special-return handling and NDC flow for this account. Do not require a generic Book call on every LCC itinerary. [S1]

Q03 — Hotel product/version: the email lists Hotel Info → Hotel Room → Hotel Block, while the current hotel documentation exposes Search → PreBook → Book with BookingCode. Confirm TLC’s entitled family, staging base URLs, authentication for each service and the exact method mapping. Do not mix identifiers or payloads between families. The hotel guide URL in the email appears malformed; this plan references the guide linked from the documentation navigation. [S4–S7]

Q04 — Hotel access: a prior TLC project verification record dated 6 October 2026 reports successful static-content and flight authentication but hotel availability rejecting access credentials. This is historical evidence, not a new test result. Please confirm Hotel Search/PreBook/Book entitlement and whether separate hotel credentials are required.

Q05 — Test setup: provide permitted egress IPs, ClientId, API versions, airline/source enablement, test wallet/credit, bookable dates and synthetic traveller details. Specify safe staging issue/cancel/refund rules and how to clean up test reservations.

Q06 — Sessions and retry rules: confirm token/session lifetime, trace and booking-code expiry, retryable error codes, polling intervals, request-reference deduplication, timeout reconciliation and duplicate prevention across all booking methods.

Q07 — Static data: supply current city IDs and hotel codes, de-duplication mappings, incremental/full-refresh guidance, retirement handling and update cadence. Please identify which content/rates can be retained and for how long.

Q08 — Financial semantics: confirm currency, rounding, per-passenger/per-room/whole-booking totals, agent net versus selling amounts, minimum selling restrictions, taxes, supplements, commission and refund settlement fields. These are API data-contract questions, not proposed tax calculations.

Q09 — Evidence and support: confirm the staging support recipient, because the supplied email’s visible address and mailto target differ. Confirm a secure channel for raw certification logs and whether correlation IDs must remain unredacted. Never include API passwords or access tokens in the general test-plan pack.

Q10 — Data/AI rights: confirm contractual rights for storage, client display, caching, embeddings and model training on supplier content, including images. TLC will keep changing prices and availability live-grounded; a trained model will not be the authority for booking facts. These permissions are not assumed.

Q11 — Please return supported/unsupported status, owner and target delivery date for each case. For negative cases that cannot be seeded in staging, provide an explicitly labelled mock fixture and the production error contract; such fixtures do not constitute certification evidence.

## 3. Shared data and execution conventions

D = actual execution date in the agreed test timezone. Standard departure/check-in = D+30; return/check-out = D+35. Recalculate dates each run; TBO may nominate other available dates. Boundary cases deliberately vary those dates. Store timestamps with timezone and UTC equivalent.

Adult/child/infant counts are shown as A/C/I. Default test ages on travel date: adults 34 and 32; children 6 and 10 (single child 8); infant 1. Generate synthetic DOBs to match those ages and exercise return-date birthdays separately. TBO must confirm airline and hotel age-band rules; hotel child occupancy is not assumed to equal airline child/infant classification.

Domestic candidates: DEL–BOM flights and New Delhi hotels. International candidates: DEL–DXB flights and Dubai hotels. These are requested fixtures, not guaranteed staging inventory. TBO should return accepted airport codes, new city IDs, hotel codes, nationalities and replacement routes if necessary. Default nationality is IN; nationality variants are specified explicitly.

Use TBO-approved synthetic names, contacts, passports and tax identifiers, with exactly the required lead traveller designation and complete required fields. No real customer data is needed. Do not invent realistic document numbers and send them to suppliers.

P0 = certification baseline, reservation correctness, money or recovery blocker. P1 = required functional/regression coverage before the applicable feature launches. P2 = optional capability, enabled only when agreed. Priority is TLC’s risk classification; it is not TBO’s mandatory-case numbering.

Execution modes: STAGING = TBO-backed controlled integration run; MOCK = explicitly synthetic contract/fault fixture; LOCAL = TLC application test. Negative/high-volume cases require TBO-approved seeds or local fault injection, not uncontrolled requests against a supplier. Record the mode for every result.

Common evidence E: case ID, run ID, prerequisite fixture version, environment, execution time, API version/method, redacted request/response JSON, HTTP status/headers, latency, correlation identifiers, final supplier state, TLC assertion and operator. Complete booking cases include retrieval evidence; failed pre-booking cases stop at the expected error and must not manufacture a booking ID.

## 4. Workflow keys used in the scenario tables

G — Non-LCC/GDS: Authenticate → Search → FareRule → FareQuote → SSR when selected/supported → Book → Ticket → GetBookingDetails. L — LCC: Authenticate → Search → FareRule → FareQuote → SSR when selected/supported → Ticket → GetBookingDetails. Apply the selected result’s provider-confirmed flow. [S1]

R — Return execution: standard domestic returns may require separate outbound and inbound chains; international returns and special returns can have different grouping. TBO must supply the applicable result-index transition and PNR structure. Carry forward current response identifiers rather than creating or reusing unrelated ones. [S3]

N — NDC: run only after TBO provides the enabled airline, request schema, booking/ticket path and ancillary restrictions. Do not assume NDC is interchangeable with a GDS or LCC payload.

H — Hotel: use current static IDs/content, Authenticate/Authorize as required by the agreed endpoint family, Search, details enrichment, PreBook (or the family’s Room/Block operations), Book and GetBookingDetails. Confirm voucher and cancellation steps separately. The published current guide uses BookingCode, with session/trace diagnostics. [S5–S7]

For all successful baseline cases: check selected itinerary/room and party consistency, valid price/currency, correct traveller mapping, required rules, final identifiers and status, and reconciliation in booking retrieval. For repricing or policy changes, require explicit TLC review before committing. Never retry an uncertain Book/Ticket blindly.

## A. Flight sample verification

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| AIR-SAMPLE / P0 | DEL–BOM return sample — 2A + 1C + 1I; D+30 outbound, D+35 return; standard domestic return. | Run G or L according to seeded result, then R. Capture both directions through final retrieval. | One complete successful chain with party fares, rules, valid result-index transitions, SSR variant if selected, and PNR/ticket retrieval. | All four travellers and both directions reconcile. Keep the same valid session/trace within each chain; do not submit certification until TBO verifies the sample. |

## B. Flight certification crosswalk

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| AIR-C01 / P0 | GDS domestic one-way — 1A; DEL–BOM; standard dates unless stated. | G; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C02 / P0 | LCC domestic one-way with SSR — 1A + 1C + 1I; DEL–BOM; standard dates unless stated. | L; selected SSR; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C03 / P0 | LCC domestic return — 2A + 2C + 1I; DEL–BOM–DEL; standard dates unless stated. | L + R; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C04 / P0 | LCC international one-way with SSR — 1A + 1C + 1I; DEL–DXB; standard dates unless stated. | L; selected SSR; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C05 / P0 | GDS international return — 2A + 2C + 1I; DEL–DXB–DEL; standard dates unless stated. | G + R; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C06 / P0 | LCC domestic special return — 2A + 1C; DEL–BOM–DEL; standard dates unless stated. | L + special-return R; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C07 / P0 | GDS domestic special return with SSR — 2A + 2C + 1I; DEL–BOM–DEL; standard dates unless stated. | G + special-return R; SSR; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C08 / P2 | GDS multi-city — 2A; DEL–BOM D+30, BOM–BLR D+33, BLR–DEL D+36; standard dates unless stated. | G; linked multi-city segments; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C09 / P2 | Domestic fare calendar — 2A; DEL–BOM; flexible departure D+28…D+32; standard dates unless stated. | Calendar query → refresh selected day → applicable G/L; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C10 / P2 | GDS advanced search / PriceRBD — 2A; DEL–BOM; TBO-supported class; standard dates unless stated. | Advanced search → PriceRBD → agreed G chain; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C11 / P2 | NDC international one-way with SSR — 2A + 2C; DEL–DXB; standard dates unless stated. | N; selected SSR; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

| AIR-C12 / P2 | NDC international return — 2A + 2C; DEL–DXB–DEL; standard dates unless stated. | N + applicable R; retrieve completed booking. | Seeded supported inventory and complete success JSON; show fares, carrier/source, ancillary results and final booking/ticket identifiers. | Common baseline assertions; reconcile every segment and passenger. TBO to confirm applicability of this numbered case. |

## C. Hotel certification crosswalk

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| HTL-C01 / P0 | Domestic hotel occupancy — R1: 1A; New Delhi; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C02 / P0 | Domestic hotel occupancy — R1: 2A + 2C (6,10); New Delhi; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C03 / P0 | Domestic hotel occupancy — R1: 1A; R2: 1A; New Delhi; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C04 / P0 | Domestic hotel occupancy — R1: 1A + 2C (6,10); R2: 2A; New Delhi; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C05 / P0 | International hotel occupancy — R1: 1A; Dubai; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C06 / P0 | International hotel occupancy — R1: 2A + 2C (6,10); Dubai; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C07 / P0 | International hotel occupancy — R1: 1A; R2: 1A; Dubai; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

| HTL-C08 / P0 | International hotel occupancy — R1: 1A + 2C (6,10); R2: 2A; Dubai; five nights; current static IDs. | H; retrieve final booking and issue voucher where applicable. | One available room combination matching this occupancy; full price/policy, guest-room mapping and confirmation evidence. | Exact occupancy preserved per room. No unrequested extra room; room totals reconcile with confirmed booking. |

## D. Access and common API contracts

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| AUTH-01 / P0 | API authentication succeeds — Approved staging API login, agreed ClientId and egress IP. | Authenticate; call one enabled read method. | Success body, token metadata/expiry and authorized profile; secrets supplied securely. | API login is separate from portal login; no credentials exposed in UI/log export. |

| AUTH-02 / P0 | Invalid credentials or missing field — Wrong password, omitted username and wrong ClientId as separate variants. | One controlled authentication attempt per variant. | Exact HTTP/application error, error message and retry guidance. | No token cached and no downstream search/booking attempted. |

| AUTH-03 / P0 | Token expires during a journey — Expired token before search and after selection. | Call read step, renew auth, then recover using TBO-approved rules. | Expired-session response and supported recovery chain. | No silent reuse of expired selection; uncertain booking reconciled before retry. |

| AUTH-04 / P0 | Hotel entitlement differs from flight access — Valid flight auth; static content allowed; hotel availability denied. | Call each separately with its agreed authentication. | Entitlement-specific failures and the account enablement procedure. | Report hotel unavailable without claiming that all credentials are invalid. |

| AUTH-05 / P0 | Egress IP or profile denied — Approved and unapproved staging egress/profile fixtures. | Use approved denial simulation or TBO-controlled environment. | Whitelist/profile denial and diagnostic fields. | Configuration failure is distinguished from zero availability. |

| AUTH-06 / P1 | Rate limit and retryable read outage — TBO-provided throttling/503 fixtures; no load flood. | Replay on Search/static retrieval with bounded retry. | HTTP status, retry headers and application code; retry limits. | Backoff and stop within deadline; do not convert error to empty success. |

| AUTH-07 / P0 | Wallet/credit insufficient — Test balance below a selected booking amount. | Query balance where supported, then approved issue attempt. | Insufficient-credit error and final financial/reservation state. | No success notice or repeated debit; consultant sees actionable failure. |

| AUTH-08 / P1 | Malformed/partial transport response — HTTP 200 business error, missing mandatory field, invalid JSON, timeout. | Inject each fixture at read and commit boundaries. | Representative documented error body and required-field schema. | Reject invalid success; preserve unknown commit outcome for reconciliation. |

## E. Additional flight scenarios

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| AIR-01 / P1 | Nonstop, connection and overnight results — 1A; domestic and international; include overnight arrival. | Search; inspect every segment. | Nonstop/connecting results, local date-times, terminals, operating carrier and duration. | No lost connection leg or wrong arrival day; stop count derived consistently. |

| AIR-02 / P1 | Search filters and empty inventory — 1A; cabin/carrier/direct-flight constraints, then impossible availability. | Search each variant independently. | Matching results, documented unsupported filter, and genuine no-results success. | Unsupported filter is disclosed; empty success remains distinct from an error. |

| AIR-03 / P0 | Invalid route/date/party — Same origin/destination, past date, return before departure, zero adults, infant excess. | Validate locally; use approved negative fixture where API validation is needed. | Field-level errors and allowed passenger/count limits. | Invalid request cannot reach booking; error points to correct field. |

| AIR-04 / P0 | Age boundary and return birthday — Child near adult cutoff; infant turns two between outbound and return. | Search/quote with DOB and both journey dates. | Accepted age classification or documented rejection; airline-specific rule. | No underpriced or invalid passenger category; request clarification if unsupported. |

| AIR-05 / P0 | Passenger/name/document validation — International party; missing child DOB, passport expiry, title mismatch, long/Unicode names. | Run independent negative and corrected variants at G/L validation step. | Exact required fields, name constraints and supplier-specific error responses. | No silent truncation; corrected traveller data remains consistent through retrieval. |

| AIR-06 / P0 | Fare rules differ by leg/type — Refundable outbound, restricted inbound; adult/child/infant fare breakdown. | FareRule and FareQuote for selected products. | Full rules with fare basis, restrictions and available penalty fields. | Display applicable leg/rate terms; never infer free cancellation from missing fields. |

| AIR-07 / P0 | Price increase and decrease — Same selected result; FareQuote higher then lower than Search. | Run independent price-change fixtures. | IsPriceChanged with updated totals/breakdown and current result identifier. | Reconcile new totals and obtain review before any issue call. |

| AIR-08 / P0 | Sold out or stale result index — Previously valid selection removed or trace/result expired. | FareQuote/SSR with TBO-approved expired fixture. | Availability/expiry error and whether new search is required. | No substitute flight is booked without selection; clear refresh path. |

| AIR-09 / P0 | Fare allocation and rounding — 2A + 1C + 1I with different fares and fractional tax. | FareQuote → build passenger fares → issue/retrieve. | Worked per-type FareBreakdown mapping and authoritative rounding rules. | Use each type’s passenger count; summed passenger totals reconcile, never average all types. |

| AIR-10 / P1 | GST/business traveller details — Business trip with mandatory flag true, false and missing GST fields. | Quote then submit valid/invalid business details independently. | Mandatory/optional status, field validation and retrieval/invoice representation. | Collect required details only; no false confirmation after rejection. |

| AIR-11 / P1 | Paid meal, baggage and seat — 2A + 1C + 1I on seeded LCC; distinct adult/child selections per segment. | SSR immediately before issue as directed; map selections to travellers/segments. | Eligible SSR codes, prices, currencies, quantity rules and final ancillary confirmation. | No baggage/seat allocated to infant; supported infant meal handled separately. [S1,S9] |

| AIR-12 / P1 | No SSR and unavailable SSR — No optional selection; chosen seat becomes unavailable; stale baggage code. | Separate omit-SSR and stale-SSR issue fixtures. | Accepted omission shape and unavailable/stale ancillary errors. | No blank placeholder nodes or unapproved substitution/charge. |

| AIR-13 / P1 | GDS SSR request versus confirmation — Requested meal/seat on GDS inventory. | G with supported SSR fields; retrieve final status. | Request/confirmation status and unsupported options. | Do not label a requested service confirmed unless supplier confirms it. |

| AIR-14 / P0 | Domestic return grouping — Two priced directions with independent result indices. | Execute R and retrieve each issued record. | Both chains with leg-to-PNR/ticket mapping; separate failure variant. | Totals and state tracked per leg; no fabricated combined PNR. |

| AIR-15 / P0 | Special return result transition — Seed a combined outbound/inbound fare. | Quote paired selection using agreed syntax, then use returned identifier. | Exact input/output result-index transformation and single/combined booking structure. | Preserve linkage and total; never mix ordinary-return and special-return flows. |

| AIR-16 / P0 | Book succeeds, Ticket fails — GDS PNR created; issue rejected or deadline reached. | G through Book; trigger ticket failure; retrieve. | PNR, unticketed state, deadline, release/retry procedure and financial effect. | Record reserved/unticketed, not ticketed; consultant sees recovery action. |

| AIR-17 / P0 | Ticket response times out — Supplier issues ticket but TLC receives no response; alternate fixture not issued. | Inject timeout after issue; reconcile through approved lookup. | Both final states and lookup by known identifiers/client reference. | No blind duplicate issue; unknown state retained until authoritative resolution. |

| AIR-18 / P0 | Repeated/concurrent submission — Identical client request submitted twice and by two workers. | LOCAL lock test plus TBO-approved duplicate request fixture. | Duplicate handling, supported idempotency/reference scope and lookup path. | One logical booking/charge; unsupported supplier dedupe covered by TLC locking. |

| AIR-19 / P0 | Only one return leg issues — Outbound confirmed; inbound sold out/issue failure. | Two-direction flow with controlled second-leg failure. | Separate final statuses, costs and permitted release/cancel options. | Show partial fulfilment; never announce complete trip or auto-cancel without approval. |

| AIR-20 / P1 | Full and partial cancellation — Ticketed group; whole booking, one passenger and one segment variants. | Charges → approved change request → status → retrieve. | Eligibility, penalty, request ID, pending/final state and refund amounts if supported. | Unaffected travellers/legs preserved; cancellation request is not refund completion. |

| AIR-21 / P1 | Reissue, schedule change and no-show — Date change; airline cancellation; no-show after departure. | Use enabled amendment/status methods or documented manual handoff. | Fare difference/penalty, updated itinerary and unsupported/change-pending cases. | Re-quote and approve costs; retain old/new ticket linkage; route unsupported changes to staff. |

| AIR-22 / P1 | Refund settlement lifecycle — Cancelled ticket with requested, approved, rejected and settled refund states. | Poll/status or account reconciliation as TBO supports. | Authoritative state, net refund, deductions and settlement reference. | Bank-credit claims require actual settlement evidence; ledger cannot double-count. |

| AIR-23 / P1 | Booking retrieval consistency — Valid PNR/ID; invalid ID; delayed retrieval; changed status. | GetBookingDetails across fixtures. | Full itinerary, traveller/ticket map, state changes and not-found response. | Latest valid supplier state wins; no cross-customer disclosure. |

| AIR-24 / P2 | Branded/corporate fares and fare upsell — Same itinerary with two fare brands or private/corporate fare. | Enabled search/upsell path; quote selected brand. | Brand inclusions, eligibility, price and entitlement rejection. | Never merge fares with different baggage/refund conditions or expose private fares publicly. |

## F. Additional hotel scenarios

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| HTL-01 / P0 | City and hotel identifier mapping — New city ID and hotel codes from current static feed; retired ID variant. | Resolve city → properties → search. | Current mappings and invalid/retired code response. | No airport-code/city-ID confusion; retired property cannot silently map to another hotel. |

| HTL-02 / P1 | Room combinations remain intact — Two rooms, different adults/children and room types. | Search then select one bookable combination and H. | Combination code, ordered room/guest mapping and per-room/whole-unit prices. | Do not split or recombine rates from unrelated booking codes. |

| HTL-03 / P0 | Child ages and occupancy limits — Missing age, age-count mismatch, extra child, infant, no adult; positive control. | Local validation plus agreed Search/PreBook error fixtures. | Allowed ranges and supplier-specific occupancy/extra-bed conditions. | Exact age at check-in preserved; no assumed free infant or guaranteed extra bed. |

| HTL-04 / P0 | Stay/date boundaries — Checkout same/before check-in, past stay, minimum stay, maximum stay, leap-day boundary. | Separate Search/PreBook variants. | Validation errors and supported date/stay limits. | Nights calculated correctly; invalid stay cannot be booked. |

| HTL-05 / P1 | Nationality/residency restrictions — Same property/dates for IN and AE guest profiles; rate restricted to one. | Search and H using actual declared nationality/residency. | Applicable rate/eligibility and mismatch rejection. | Nationality not changed to obtain a cheaper rate; constraints visible to consultant. |

| HTL-06 / P1 | Room-only versus meal plans — Same hotel with room-only, breakfast and all-inclusive options. | Search/PreBook each distinct rate. | Exact meal inclusion, guest coverage and rate identifiers. | Do not assume breakfast covers every guest or all-inclusive includes all extras. |

| HTL-07 / P0 | Refundability and deadline boundary — Refundable/non-refundable; cancellation one minute before/after deadline. | PreBook; quote applicable cancellation charge in separate fixtures. | Policy ladder, timezone, indexed room scope, fixed/percent/night rules. | Correct policy presented for selected rate; no inferred timezone or free cancellation. |

| HTL-08 / P0 | Price changes at PreBook — Higher/lower total, changed tax or supplement since Search. | Search → PreBook → review. | Updated cost/currency and whether new booking code is returned/required. | Reconcile final amount; require review before Book. |

| HTL-09 / P0 | Policy changes without price change — Same total; refundable becomes restricted or meal inclusion changes. | Search then changed PreBook fixture. | Changed policy/inclusions and validity metadata. | Terms change triggers review even when total is unchanged. |

| HTL-10 / P0 | Selected room no longer available — Search success; room sold out or booking code expires. | PreBook/Book controlled failure; retrieve if commit outcome uncertain. | Sold-out/expired code and permitted re-search path. | No different hotel/room substituted automatically; no false confirmation. |

| HTL-11 / P0 | Taxes, supplements and currency — Multi-room stay; included tax, pay-at-property city fee and extra guest charge. | Search → PreBook → confirmed retrieval. | Charge scope, currency, inclusion flags, nightly/total values and settlement amount. | No double-counted tax; payable-now and payable-at-property clearly separated. |

| HTL-12 / P0 | Minimum selling restriction — Rate with RecommendedSellingRate, zero/absent variant and currency mismatch. | PreBook → TLC quote validation. | Restriction applicability and authoritative currency/amount semantics. | Applicable floor enforced; never convert or omit it without an agreed rule. [S6] |

| HTL-13 / P1 | Mandatory PAN/passport/GST/name fields — PreBook varies document flags and guest naming restrictions. | H with one missing/invalid field per variant, then corrected payload. | Required-field flags, supported formats, rejection code and accepted guest mapping. | Collect required data securely; no invented identifiers; validation follows returned rules. |

| HTL-14 / P1 | Package-only rate and transfers — Package fare with mandatory arrival/departure details; transfer inclusion variant. | PreBook then Book with valid/omitted details. | Package restrictions, transport fields and transfer coverage/charges. | No package-only rate sold standalone; transfers not promised from hotel description alone. |

| HTL-15 / P1 | Special requests and accessibility — Twin beds, adjoining rooms, late arrival, wheelchair-accessible room. | Submit only supported request fields; retrieve. | Accepted request versus guaranteed amenity; unsupported field response. | Requested features remain unconfirmed unless explicit supplier evidence supports them. |

| HTL-16 / P0 | Booking pending/on request — Book accepted but supplier confirmation delayed. | H then agreed polling/status retrieval. | Pending→confirmed and pending→failed sequences with polling guidance. | No voucher or confirmed notice while pending; timeout escalates to consultant. |

| HTL-17 / P0 | Timeout after Book — Supplier created reservation but response lost; alternate no-booking variant. | LOCAL response loss with TBO reconciliation fixtures. | Lookup using client reference/session/known IDs; eventual final states. | No blind duplicate reservation; unresolved stays unknown. |

| HTL-18 / P0 | Duplicate and concurrent hotel Book — Two identical requests, same room code/reference. | LOCAL concurrency test and approved staging duplicate fixture. | Deduplication contract, duplicate error or existing reservation retrieval. | One logical reservation; de-duplication does not block a deliberate separate booking. |

| HTL-19 / P0 | Multi-room partial failure — One of two rooms unavailable during commitment. | TBO-provided atomic-failure or partial-success fixture. | Document whether whole unit fails or partial reservation exists; exact financial state. | Never assume atomicity; reconcile and display every room’s actual status. |

| HTL-20 / P1 | Voucher issuance and retrieval — Confirmed reservation; pending state; duplicate voucher request. | GetBookingDetails and GenerateVoucher where applicable. | Voucher availability, confirmation/reference fields and premature-request error. | Voucher reflects confirmed dates, guests and room scope; no duplicate booking from reprint. |

| HTL-21 / P1 | Full/partial cancellation — Whole booking and one room; free/penalty/non-refundable variants. | Approved cancel/change path → status → retrieve. | Supported scope, charge, request/final status and remaining rooms. | No automatic full cancellation when partial unsupported; reconcile deductions. |

| HTL-22 / P1 | Amendment, shortening and extension — Guest correction, arrival shift, one-night shortening/extension. | Use supported amendment or explicit cancel/rebook alternative. | Availability, fare/policy changes and unsupported operation response. | Never treat an email request as supplier-approved change; re-approve costs. |

| HTL-23 / P1 | No-show, early checkout and refund — Confirmed stay not used or guest leaves early. | Use supplier-supported change/refund status workflow. | Policy outcome, penalty, approved/refused refund and settlement evidence. | No promised refund without supplier outcome; avoid duplicate financial posting. |

| HTL-24 / P1 | Stale/missing booking details — Unknown reference, eventual consistency, changed supplier status. | Retrieve using supported identifiers and bounded retries. | Not-found versus pending versus final failure; updated booking details. | Do not mark cancelled from transient not-found; escalate unresolved mismatch. |

## G. Supplier data and storage

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| DATA-01 / P1 | Catalogue import and refresh — Two cities with hotels, images, amenities and coordinates. | Full import then changed record/delta refresh. | Sample static feed, stable identifiers, update/deletion semantics and cadence. | Upsert without duplicates; preserve provenance and TLC editorial overrides. |

| DATA-02 / P1 | Duplicate/retired property content — Same physical hotel under duplicate source records; one removed record. | Apply TBO mapping/deduplication guidance. | Canonical mapping or documented matching limits; retirement examples. | No duplicate public listing; ambiguous merge held for staff review. |

| DATA-03 / P1 | Missing content and image failure — No image, missing amenity, broken URL, incomplete geolocation. | Import and render supplier record. | Nullable fields, valid missing-data fixture and supported image formats. | Fallback is honest; no fabricated star rating, accessibility or distance. |

| DATA-04 / P1 | Catalogue pagination/batch interruption — Data exceeds batch size; one page fails; rerun import. | Use agreed batch/pagination contract and controlled read failure. | Limit values, continuation semantics and reproducible intermediate error. | Resume/idempotent upsert; partial import cannot be labelled complete. |

| DATA-05 / P0 | Price/cache expiry — Saved shortlist outlives underlying rate/session. | Reopen saved result; request quote; revalidate with live supplier. | Expiry semantics and stale-selection response. | Saved preference persists but stale price/availability is not guaranteed. |

| DATA-06 / P1 | Storage and model-use permissions — Static content, images, rate observations and synthetic examples. | Review written TBO licensing/retention response; LOCAL training-export checks. | Permitted purposes, retention limits and exclusions; no production customer corpus requested. | Only authorised data exported; no tokens, passports or volatile rates treated as durable facts. |

| DATA-07 / P1 | Schema evolution — Additional field, optional field absent, new enum, missing required field. | Replay versioned fixtures against importer/adapters. | Schema/version policy and representative compatibility fixtures. | Ignore safe additions; unknown critical values fail visibly, not silently misclassified. |

| DATA-08 / P1 | Static/live property mismatch — Static hotel exists but live result has different room/property mapping. | Join live result to static catalogue and review. | Authoritative property/room linkage and migration example. | No wrong-hotel image/description attached to a bookable option. |

## H. TLC vacation-planning acceptance

| ID / priority | Scenario and test data | Execution | TBO response requested | TLC acceptance |

|---|---|---|---|---|

| TLC-01 / P0 | Shortlist to consultant quote — Client selects two hotel alternatives and a return flight. | LOCAL save → enquiry → staff brief → live reprice. | Coherent search/quote fixtures; no new package API assumed. | Selections remain alternatives; supplier booking is not called by shortlist submission. |

| TLC-02 / P0 | Whole-trip budget and party cost — 2A + 2C, two rooms, return flights, property fees. | LOCAL combine separately priced components and apply explicit TLC items. | Clear per-party/per-room units and currencies for each fixture. | Correct party total; label excluded fees; do not add alternative hotel choices together. |

| TLC-03 / P1 | Preferences and factual recommendations — Family, honeymoon and accessible-stay briefs with budget constraints. | LOCAL rank fixture options; explain why each matches. | Amenity/inclusion evidence and unavailable/missing-value variants. | No unsupported preference guarantees; recommendations link back to current supplier evidence. |

| TLC-04 / P0 | No suitable inventory or provider outage — Zero matches versus timeout/credential denial. | LOCAL planner search and consultant handoff. | Distinct empty-success and error fixtures from both services. | Honest no-results or availability-on-request state; no fake live fares/rooms. |

| TLC-05 / P0 | Cross-client/stale selection tampering — Altered hotel code, price, trace or another client’s search ID. | LOCAL authenticated and public submission validation. | Normal opaque identifier fixture only; no hostile supplier calls. | Server resolves trusted saved evidence; tampered/foreign selections rejected. |

| TLC-06 / P0 | Accepted quote reprices before fulfilment — Client accepted; supplier increases cost or removes availability. | LOCAL approve → revalidate → detect change. | Reprice/sold-out fixture for each component. | Acceptance is not supplier confirmation; consultant obtains revised approval. |

| TLC-07 / P0 | Package component partial fulfilment — Flight ticketed, hotel booking fails; inverse variant. | LOCAL orchestrate approved supplier fixtures. | Independent component confirmations/failures and permitted cancellation paths. | Show partial state and financial exposure; no false complete-package confirmation. |

| TLC-08 / P0 | Notification states across channels — Quote ready, booking pending/confirmed, ticket failed, refund pending/settled. | LOCAL email/website/WhatsApp rendering with intercepted delivery. | Final/pending/error fixtures from relevant supplier methods. | Messages reflect verified state; no duplicate notices or credentials in client content. |

| TLC-09 / P0 | Financial and supplier reconciliation — Debit with confirmed booking, uncertain debit, later refund. | LOCAL compare provider state and TLC ledger; escalate mismatch. | Test wallet/statement entries with booking/refund references where available. | No double debit/refund; commission and customer selling total remain distinct. |

| TLC-10 / P1 | Search load and degraded response — Concurrent searches and slow supplier response. | LOCAL load with mocks; staged supplier volume only within agreed limit. | Documented rate/concurrency limits and timeout fixture. | Bounded latency and safe fallback; booking endpoints not stress-tested without agreement. |

| TLC-11 / P0 | Audit and sensitive-data handling — Traceable booking journey with synthetic traveller documents. | LOCAL export and role-based access inspection. | TBO-required certification identifiers and secure log-transfer policy. | No passwords/tokens in shareable pack; retain sufficient correlation; client cannot access other records. |

| TLC-12 / P1 | Production configuration separation — Staging credentials/URLs or mock responses accidentally selected for production. | LOCAL configuration gate and test-mode labelling. | Account-specific production endpoint/enablement checklist after certification. | Production activation blocked until explicitly configured; test inventory never sold as live. |

## 5. Response pack requested for every scenario

For each scenario ID, return: Supported / Conditional / Unsupported; actual API product/version; method sequence; reproducible setup; valid synthetic input; raw request and response for each applicable step; HTTP and application-level outcomes; field definitions; final state; and recovery guidance. Use the attached CSV as the response tracker.

Provide real staging logs for successful certification chains. For deterministic negative cases, identify the seed or switch that reproduces the state. If only a mock is available, label every file MOCK and explain which production behaviour it models. Do not substitute fabricated successful PNRs or confirmations for certification evidence.

For any list/array, clarify indexing, ordering, nullability and cardinality. For money, identify currency, decimal precision, rounding, unit and whether tax/fees are included. For dates, identify timezone and inclusive/exclusive boundaries. For status/error fields, provide actual enum/code values; this document does not invent them.

For booking timeouts and duplicate attempts, include both committed and not-committed outcomes, approved lookup identifiers, retry rules and financial effects. Include eventual-consistency windows and escalation instructions where a state cannot be resolved automatically.

Flight response coverage requested: carrier/source, segments, cabin/fare brand, result linkage, passenger-type fare breakdown, rule and baggage evidence, SSR eligibility/prices, booking/ticket identifiers and retrieval states. Hotel coverage requested: static identity, bookable room combination, occupancy mapping, price/currency, inclusions, policy/charge scope, required guest fields, reservation/voucher IDs and retrieval states. Unsupported fields must be identified, not filled with invented values.

## 6. Execution evidence and file structure

Use one folder per case and one request/response pair per method: TLC_TBO_STAGING/<case-id>/<run-id>/manifest.json; 01-authenticate.request.json; 01-authenticate.response.json; 02-search.request.json; 02-search.response.json; …; final-booking-details.response.json; assertions.json. For a negative case, the final file is the expected error or reconciliation response, not a fabricated booking.

The manifest is TLC’s test metadata, not a TBO API payload. Record caseId, runId, mode, environment, apiFamily, apiVersion, executedAtWithOffset, executedAtUtc, fixtureVersion, step filenames, request/session/trace identifiers as permitted, supplier reference if present, outcome and defect reference. Keep credentials in environment variables outside this pack.

Each assertion record states expected versus actual, evidence file/JSON path, result (Pass / Fail / Blocked / Not applicable) and reviewer. Mark Not applicable only with a reason and TBO agreement for certification items. A passed mock test is not a passed staging certification case.

Redact passwords, authentication headers, access tokens, payment secrets and unnecessary personal data. Preserve correlation IDs in the restricted support bundle when required by TBO; use stable aliases in wider copies. Agree any exceptions through a secure transfer channel rather than weakening general application log redaction.

## 7. Delivery phases and acceptance gates

Phase 1 — TBO confirms Q01–Q11, API families, access, current static IDs and test fixtures. Resolve hotel entitlement before interpreting availability failures as product behaviour.

Phase 2 — Execute AIR-SAMPLE and obtain sample approval. Prepare the flight crosswalk cases required by TBO’s written account-specific checklist and all eight listed hotel occupancy cases. Submit each completed case separately with JSON evidence and the original sample-verification reference. [S2,S4]

Phase 3 — Execute applicable P0 and P1 scenarios from sections D–H. TLC local tests cover orchestration, data access, UI, notifications and financial reconciliation; TBO supplies supplier-side fixtures and contract clarification. P2 capabilities remain disabled until scoped and verified.

Exit criteria: required certification cases accepted by TBO; no open P0 defect; applicable P1 defects resolved or explicitly accepted with owner and mitigation; uncertain reservations reconciled; no duplicate bookings/debits; required fields, fare/policy changes and cancellations handled; production configuration and monitoring reviewed. TBO must issue its own certification/sign-off.

No scenario has been executed for this document. Proposed owner split: TBO supplies valid schemas, supported inventory, deterministic fixtures and certification verdicts; TLC supplies integration execution, application assertions, logs and defect fixes. Establish delivery dates with TBO rather than assuming public documentation turnaround estimates.

## 8. Suggested covering request and support format

Subject: TLC VACATIONS LLP — Flight & Hotel staging scenarios and request/response fixture request

Dear TBO Integration Team, please review the attached scenario plan and tracker. We request account-specific schemas, seeded staging inputs and request/response examples for the supported cases, including negative and recovery cases. Please first confirm the flight mandatory checklist and hotel API family noted in Q01–Q03, and the HotelAPI entitlement noted in Q04. Our client journey uses shortlisted options and a consultant-prepared quote; supplier commitment remains controlled. Please return supported/conditional/unsupported status and proposed fixture delivery dates. Regards, TLC VACATIONS LLP.

For an individual issue, use: environment; agency/API login identifier (no password); scenario/run ID; method/API version; timestamp with timezone; trace/session/request ID; exact error; expected versus actual; reproducibility steps; business impact; and attached casewise JSON logs. Confirm the recipient address with TBO before sending. This covering text is a draft; nothing has been emailed.

## 9. References and interpretation

Public documentation checked on 17 October 2026. Sections A–C are the onboarding sample and published certification crosswalk; sections D–H are TLC-proposed acceptance and fixture requests, not additional TBO-mandated certification cases. Exact schemas, flags, limits and error codes must be confirmed for the entitled API version. See S8–S11 for method-level contracts supporting the requested field mappings.

Additional input: TBO onboarding email supplied by TLC, and TLC’s local integration verification record dated 6 October 2026. No separate attachment was available; attached-only requirements must be reconciled before final execution.

S1 — Flight sample verification: https://apidoc.tektravels.com/flight/SampleVerification.aspx

S2 — Flight certification cases: https://apidoc.tektravels.com/flight/Certification.aspx

S3 — Flight API guide: https://apidoc.tektravels.com/flight/APIGuide.aspx

S4 — Hotel certification cases: https://apidoc.tektravels.com/hotelnew/Certification.aspx

S5 — Hotel API guide (navigation-linked URL): https://apidoc.tektravels.com/hotelnew/apiguide.aspx

S6 — Hotel PreBook contract: https://apidoc.tektravels.com/hotelnew/HotelPreBook.aspx

S7 — Hotel Search contract: https://apidoc.tektravels.com/hotelnew/HotelSearch.aspx

S8 — Flight FareQuote contract: https://apidoc.tektravels.com/flight/FareQuote.aspx

S9 — Flight SSR contract: https://apidoc.tektravels.com/flight/SSR.aspx

S10 — Flight Ticket contract: https://apidoc.tektravels.com/flight/Ticket.aspx

S11 — Hotel Book contract: https://apidoc.tektravels.com/hotelnew/HotelBook.aspx