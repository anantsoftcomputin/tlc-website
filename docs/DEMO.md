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
