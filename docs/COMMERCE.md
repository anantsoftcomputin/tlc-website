# Commerce Architecture

## Inventory boundary

Flight and hotel inventory is accessed only through `FlightProvider` and `HotelProvider`. Every search response includes `source` and `fetchedAt`; UI surfaces must display both and must never invent availability or prices.

Organization provider selection comes from `orgs/{orgId}.settings.integrations`. Disabled or absent inventory integrations use deterministic mock providers, keeping local development and demonstrations independent of third-party credentials.

The credential-backed implementations are Amadeus flight shopping and Hotelbeds hotel availability. They register only when their server-side credentials exist. Provider calls have organization/provider minute limits, bounded retries, latency/success counters, and configurable per-call cost accumulation in `usage`. Live supplier fulfilment remains deliberately human-confirmed in the booking workspace until TLC's ticketing and hotel-booking account scopes are approved.

## Authenticated commands

The following callable Firebase Functions run in `asia-south1`:

| Function                | Purpose                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `searchFlightInventory` | Validate a flight request, select the organization's provider, return sourced offers, and cache them for the caller's organization. |
| `searchHotelInventory`  | Validate a hotel request, select the organization's provider, return sourced offers, and cache them for the caller's organization.  |
| `priceCheckInventory`   | Recheck a previously returned organization-scoped offer before it can enter a quote.                                                |
| `createQuote`           | Create the first immutable quote revision for an accessible lead and calculate all totals server-side.                              |
| `reviseQuote`           | Create a new immutable version from the latest accessible quote.                                                                    |
| `approveQuote`          | Allow an authorized manager to approve discount and low-margin exceptions.                                                          |
| `sendQuote`             | Mark the latest, unexpired, fully approved revision ready to share and move its lead to quoted.                                     |
| `getSharedQuote`        | Resolve a private bearer-token itinerary, record its first view, and return a customer-safe projection.                             |
| `respondToQuote`        | Accept or reject the latest active quote through its private link and append customer and lead events.                              |
| `expireQuotes`          | Hourly expiry of sent or viewed quotes whose validity window has elapsed.                                                           |
| `createBooking`         | Convert the latest accepted quote and validated travellers into a pending-approval booking.                                         |
| `approveBooking`        | Record manager approval, open the receivable/payable ledger, and move the lead to won.                                              |
| `updateBookingItem`     | Record each supplier confirmation, PNR/reference, failure, or cancellation and derive overall status.                               |
| `updateBookingDocument` | Maintain the operational document checklist and append its booking timeline evidence.                                               |
| `createPaymentLink`     | Create an organization-selected Razorpay or mock payment link within the outstanding balance.                                       |
| `recordPayment`         | Capture an authorized offline receipt and recalculate partial/paid booking and ledger state.                                        |
| `reconcilePayment`      | Mark a captured payment reconciled with an immutable audit event.                                                                   |
| `razorpayWebhook`       | Validate Razorpay's raw-body HMAC and idempotently capture payment-link events.                                                     |
| `sendPaymentReminders`  | Create daily high-priority collection tasks for payment links past their due time.                                                  |

Only authenticated commerce roles can call these commands. The organization is read from verified Firebase custom claims and never accepted from request data.

## Offer cache

Normalized search results are stored in the server-only `inventoryOffers` collection. Document IDs are SHA-256 hashes of organization, inventory kind, and provider offer ID. Browser Firestore rules deny this collection; clients access offers only through callable commands. Expired or cross-organization offers are rejected.

## Quote boundary

Staff can move normalized flight and hotel offers into the quote cart, add manual services, and preview totals in the builder. Preview totals are informational: callable commands validate every item and recompute cost, sell, tax, fees, discount, commission, gross profit, and margin with the shared financial module.

Every save creates a new quote document and version. Existing revisions are never overwritten. The server rejects revisions of anything except the latest version, derives discount and low-margin approvals from organization settings, and prevents sending until all exceptions are approved. Each command verifies organization and lead assignment, appends an audit record, and writes lead timeline activity where applicable.

Browser clients may read only quotes linked to leads they can access. Firestore rules deny all direct quote mutations, so clients cannot bypass versioning, calculations, or approval policy.

## Private itinerary links

Sending a quote activates its cryptographically random bearer-token route at `/i/{token}`. The public callable returns a deliberately reduced projection: descriptions, dates, traveller counts, customer prices, taxes, fees, discounts, validity, branding, and lifecycle status. Supplier identifiers, supplier costs, commissions, gross profit, margins, raw provider payloads, and internal approvals never leave the command boundary.

Only the latest quote version can be opened or answered. A first open transitions `sent` to `viewed`; the customer can then accept or request changes exactly once while the quote remains valid. Each transition is audited and appended to the appropriate CRM timelines. Active links expire during access and through the hourly `expireQuotes` job. The itinerary has a dedicated responsive layout and an A4 print stylesheet so the browser can print it or save it as a PDF without internal controls.

## Human controls

Provider booking, cancellation, and flight reissue contracts require an explicit `approvedBy` value. Creation commands also require an idempotency key. Quote and booking command services will recheck selected offer identifiers and enforce role, approval, margin, and audit invariants before contacting a supplier.

## Booking and finance boundary

An accepted latest quote can become exactly one booking. The booking begins in `pendingApproval`; only a manager can release it for fulfilment. Approval atomically creates one customer receivable and item-level supplier payables. Supplier items then move independently through pending, confirmed, failed, or cancelled, allowing an overall partially-confirmed state. Traveller documents and every operational change remain on the booking timeline and audit trail.

Payments never mutate directly from the browser. Finance commands prevent over-collection by rechecking captured totals transactionally. Multiple advance/balance links provide partial collection, while a captured payment updates the booking and receivable together. The mock provider supports a credential-free demo; enabling `payments.provider = razorpay` requires Razorpay API credentials and a webhook configured to the deployed `razorpayWebhook` URL.
