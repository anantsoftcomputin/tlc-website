# Phase 1 demo script

1. Sign in at `/login` with the configured TLC owner account.
2. Open **Inquiries** and convert a website enquiry into a lead. Repeat the action to demonstrate idempotency.
3. Open **Lead pipeline**, switch between board and list, search by destination, and create a manual phone lead.
4. Open a lead, record a call, schedule a follow-up, change priority, and demonstrate that lost status requires a reason.
5. Open **Lead settings** and show manual, round-robin and destination-specialist policies. Leave automatic assignment disabled unless the client approves the workflow.
6. Open **Customers** and demonstrate Customer 360, consent, travel history, segments and explainable CLV.
7. Run `refreshAiCore` from an authenticated management client or wait for the scheduled jobs.
8. Open **Alerts** and show evidence, entity deep links, acknowledge and resolve actions.

For a large local demonstration, start the emulators, run `pnpm ai:seed`, and then run the AI refresh. Synthetic records are clearly tagged and cannot be written to production by the seed script.

## Phase 2 quote and itinerary

1. Open **Live inventory**, search for a flight or hotel, and add an option to the quote cart.
2. Select an accessible lead, add any manual services, adjust sell pricing, and show the live total and margin preview.
3. Save the draft. If discount or margin guardrails are triggered, approve the exceptions as a manager.
4. Mark the latest revision ready to share, then copy its customer link from the quote detail page.
5. Open the private link in a signed-out window. Confirm that it shows customer pricing without supplier cost, commission, margin, references, or internal approvals.
6. Use **Print / save PDF** to demonstrate the A4 itinerary output.
7. Accept the proposal and return to the CRM to show its quote, audit, customer-event, and lead-timeline evidence.
8. Try responding a second time or opening an older revision to demonstrate lifecycle and version protections.

## Phase 2 booking and payment

1. Open the accepted quote and choose **Create booking**. Enter every traveller's name, date of birth, nationality, and optional encrypted passport reference.
2. Open **Bookings** and select the new record. Show that supplier fulfilment is locked until a manager chooses **Approve booking**.
3. Approve it and show the automatically created customer receivable and item-level supplier payables.
4. Confirm one item with its supplier reference and PNR, and mark another failed or pending to demonstrate partial confirmation.
5. Move passport/visa checklist entries from required to received and verified. Confirm every change appears in the timeline.
6. Under **Payment collection**, create an advance link. With mocks enabled, open the deterministic link and then choose **Record received** to emulate the verified provider result.
7. Create a balance link, record it, and show the booking change from partial to paid. Choose **Reconcile** for each captured receipt.
8. Open **Payments** and **Audit trail** to confirm organization-scoped financial and mutation history.

Running `pnpm seed` against the emulators also creates a realistic partially confirmed booking, traveller documents, an advance receipt, and open ledger entries so every Phase 2 screen has data without external credentials.

## Phase 3 finance foundation

1. Open **Finance** and review customer outstanding, supplier outstanding, collections, and posted-journal totals.
2. Compare planned and actual cost, gross profit, margin, and cost variance for the seeded booking.
3. For an older approved booking marked **migration needed**, post its deterministic opening journal and refresh to confirm the command is idempotent.
4. Under **Open supplier payables**, request either a full or partial supplier settlement.
5. Sign in as a manager and approve the request. Use rejection on a separate request to demonstrate that its reserved payable balance is released.
6. Mark the approved settlement paid with its bank or UPI reference.
7. Confirm that the payable balance, supplier-paid KPI, and balanced append-only journal all update together.
8. Open **Audit trail** and verify the settlement request, approval/rejection, and payment actions.

The emulator seed includes a partially settled airline payable and three balanced journals: booking approval, customer collection, and supplier payment.
