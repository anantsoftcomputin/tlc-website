# Commerce Architecture

## Inventory boundary

Flight and hotel inventory is accessed only through `FlightProvider` and `HotelProvider`. Every search response includes `source` and `fetchedAt`; UI surfaces must display both and must never invent availability or prices.

Organization provider selection comes from `orgs/{orgId}.settings.integrations`. Disabled or absent inventory integrations use deterministic mock providers, keeping local development and demonstrations independent of third-party credentials.

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

Only authenticated commerce roles can call these commands. The organization is read from verified Firebase custom claims and never accepted from request data.

## Offer cache

Normalized search results are stored in the server-only `inventoryOffers` collection. Document IDs are SHA-256 hashes of organization, inventory kind, and provider offer ID. Browser Firestore rules deny this collection; clients access offers only through callable commands. Expired or cross-organization offers are rejected.

## Quote boundary

Staff can move normalized flight and hotel offers into the quote cart, add manual services, and preview totals in the builder. Preview totals are informational: callable commands validate every item and recompute cost, sell, tax, fees, discount, commission, gross profit, and margin with the shared financial module.

Every save creates a new quote document and version. Existing revisions are never overwritten. The server rejects revisions of anything except the latest version, derives discount and low-margin approvals from organization settings, and prevents sending until all exceptions are approved. Each command verifies organization and lead assignment, appends an audit record, and writes lead timeline activity where applicable.

Browser clients may read only quotes linked to leads they can access. Firestore rules deny all direct quote mutations, so clients cannot bypass versioning, calculations, or approval policy.

## Human controls

Provider booking, cancellation, and flight reissue contracts require an explicit `approvedBy` value. Creation commands also require an idempotency key. Quote and booking command services will recheck selected offer identifiers and enforce role, approval, margin, and audit invariants before contacting a supplier.
