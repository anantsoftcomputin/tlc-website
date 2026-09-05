# Finance architecture

Phase 3 promotes the Phase 2 operational ledger into an auditable finance subsystem while preserving the booking and payment records already in production.

## Source-of-truth chain

1. An accepted quote supplies immutable commercial economics.
2. Booking approval creates the customer receivable, supplier payables, and a balanced booking journal.
3. Captured customer payments reduce the receivable and post a payment-clearing journal.
4. Supplier settlement requests reserve payable capacity so concurrent requests cannot over-allocate it.
5. A manager approves or rejects each settlement explicitly.
6. Marking an approved settlement paid releases the reservation, settles the payable allocation, and posts the bank journal.

Posted journals are append-only. Corrections use linked reversal journals; posted accounting history is never rewritten.

## Accounts introduced in Step 11

| Code   | Account                   |
| ------ | ------------------------- |
| `1100` | Bank                      |
| `1105` | Payment clearing          |
| `1200` | Customer receivables      |
| `2100` | Supplier payables         |
| `2200` | Refunds payable           |
| `4100` | Travel sales              |
| `4110` | Sales returns and refunds |
| `5100` | Travel cost of services   |

## Authorization

- Owners, administrators, managers, and accounts users can request and pay supplier settlements.
- Only owners, administrators, and managers can approve or reject a settlement.
- Browsers can read finance records only with a finance role; all writes use authenticated Cloud Functions.
- Every command validates `orgId` and writes an immutable audit record.

## Idempotency and migration

Booking and payment journal IDs are deterministic (`{bookingId}-approval` and `{paymentId}-capture`). The finance workspace identifies older approved bookings without an opening journal and provides an idempotent initialization command. Supplier settlement journals use `{settlementId}-payment`, and only an approved settlement can be paid once.

## Profitability

The finance workspace reports booking-level net revenue, planned cost, current supplier liability, cost variance, actual gross profit, margin, collections, and outstanding balances. It derives these figures from bookings, payments, and ledger entries instead of accepting client-calculated totals.

## Cancellations and refunds

Finance users submit item-level supplier penalties and retained service fees. The server recalculates the refundable amount from captured collections, subtracts prior refunds, and requires manager approval. Provider refunds support deterministic mock execution and Razorpay's refund API; pending Razorpay refunds settle through the signed `refund.processed` webhook. Offline refunds use the same journal, reconciliation, and audit chain.

## GST documents

The organization tax profile stores legal identity, GSTIN, registered address, state code, place of supply, SAC, and default GST rate. Invoices, receipts, and credit notes receive transactionally allocated financial-year numbers. Interstate documents use IGST; intrastate documents split GST into CGST and SGST. Issued documents are immutable and printable from their permanent admin URL.

## Accounting providers

`AccountingProvider` is shared by the deterministic mock, Zoho Books, and Tally bridge adapters. Every source/provider/type combination has a stable idempotency key. Attempts, external IDs, failures, retries, usage, and cost are recorded. Zoho and Tally register only when their environment credentials exist.

## Reports and close

The finance workspace derives receivable and supplier ageing, collections, GST, booking profitability, and net cash position. Ledger, GST, and profitability reports are downloadable as CSV. A manager can close a date range only when journals balance and no unreconciled collections or pending settlements/refunds remain. Closed dates reject new financial postings until an audited manager reopen.
