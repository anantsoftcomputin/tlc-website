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
