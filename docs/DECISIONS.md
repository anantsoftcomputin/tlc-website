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

## ADR-009 — Inventory provenance and human booking approval

Flight and hotel results are normalized at the adapter boundary and always returned with a provider `source` and ISO `fetchedAt` value. Provider offer identifiers must be price-checked before booking. Booking, cancellation, and reissue contracts require an authenticated human approver and an idempotency key where the command can create supplier inventory.

## ADR-010 — Immutable quote revisions and server-owned writes

Each quote revision is a new Firestore document with an increasing lead-scoped version. Only the latest revision can be revised or sent. Browser quote writes are denied; callable commands recompute financial totals, derive approval exceptions, enforce assignment and organization scope, and append audit evidence. This preserves a reliable commercial history for the future CRM, booking, payment, and reporting layers.

## ADR-011 — Bearer-token itinerary projection

Customer itinerary links use 192-bit random tokens as bearer credentials and are excluded from search indexing. Public clients never read quote documents from Firestore. A callable resolves the token and returns a customer-safe projection that omits every internal commercial and supplier field. Only the latest sent revision can be answered, terminal responses are immutable, and access-time plus scheduled expiry close stale links.

## ADR-012 — Booking approval and double-entry preparation

Accepted quotes convert once into server-owned bookings. A separate manager approval is mandatory before supplier fulfilment or collection. Approval creates customer receivable and supplier payable records from the immutable quote economics. Phase 2 tracks operational settlement without general-ledger journal accounting; Phase 3 can map these stable entries into Zoho Books, Tally, GST invoices, refunds, and formal double-entry journals.

## ADR-013 — Credential-gated commerce providers

Deterministic flight, hotel, and payment providers remain the safe default. Amadeus, Hotelbeds, and Razorpay implementations register only when server credentials exist and the organization explicitly enables the provider. Inventory calls are rate-limited, retried, and usage/cost logged. Supplier ticketing stays human-confirmed until production fulfilment scopes and commercial contracts are approved.

## ADR-014 — Append-only finance journals and reserved allocations

Operational booking ledgers remain the balance source while every accounting event posts a balanced, immutable journal linked to its source. Supplier settlement requests reserve payable allocations atomically before approval so concurrent requests cannot over-allocate a liability. Rejections release the reservation; payment converts it into a settled allocation and posts the cash journal. Corrections use linked reversal entries instead of rewriting posted history.

## ADR-015 — Refunds are approved calculations, not editable amounts

Cancellation requests contain item-level supplier penalties and retained fees, while the server derives the maximum refund from captured collections and prior refunds. Approval and execution are separate states. Pending provider refunds post to a refund-payable account and move to bank only after a signed provider event, preserving accurate cash timing.

## ADR-016 — Immutable tax snapshots and transactional numbering

Each issued invoice, receipt, or credit note snapshots the organization tax profile and receives a financial-year number from a transactionally incremented server-only counter. Later profile changes never alter issued documents. Place-of-supply state determines CGST/SGST versus IGST.

## ADR-017 — External accounting is an idempotent projection

The internal journal remains authoritative. Zoho Books, Tally, and the deterministic mock implement one provider contract and receive stable source keys. Synchronization failures are retained and retried without duplicating external documents; they never roll back an already posted internal transaction.

## ADR-018 — Period close blocks posting, not visibility

A period may close only when its journals balance and operational queues reconcile. Closing preserves report access but prevents new finance postings in the covered date range. Only a manager can reopen it, with a mandatory audited reason.

## ADR-019 — Revised phase numbering after the CMS insertion

The product and content CMS was delivered as Phase 4 to close the operational catalogue gap identified during client review. The master brief's AI marketing scope therefore becomes Phase 5, and persona-driven chatbot autonomy becomes Phase 6. Dependencies remain unchanged: campaigns consume governed catalogue offers and the later chatbot consumes the scoring, consent and handover foundations.
