# Lead workflow runbook

## Intake and qualification

1. A website form writes a server-owned record to `inquiries`.
2. An authorized CRM user opens **Inquiries** and selects **Create lead**.
3. The callable command creates an organization-scoped customer, lead, initial activity and audit entry in one transaction.
4. Repeating the command is safe because the lead ID is derived from the inquiry ID.
5. The converted inquiry links directly to its lead workspace.
6. Staff can also create phone, walk-in, WhatsApp, email or social leads from **Lead pipeline → New lead**.

## Sales workflow

- Managers can see and reassign all leads in their organization.
- Sales and travel-consultant users can only see and update records assigned to their UID.
- The board and list share the canonical statuses: new, contacted, quoted, negotiating, won, lost and dormant.
- Moving a new lead forward records its first-response timestamp.
- Every update writes an immutable audit entry and an append-only timeline activity.
- Marking a lead lost requires a reason.
- Follow-up dates are displayed in India time and overdue open leads are highlighted.

## Integration boundary

The current production intake adapter is the TLC website endpoint. WhatsApp, email, social and chatbot adapters should normalize provider payloads into the same inquiry-to-lead command rather than writing CRM records directly. Provider webhook verification, replay protection and channel message retention must be implemented per adapter.

## Remaining Step 4 work

- Gmail and social adapters require provider credentials and verified webhook configuration before they can ingest real external messages.
- Mock WhatsApp remains the safe local/demo provider until a Meta or BSP account is connected.
- SLA alerts are in-app; outbound email/FCM delivery belongs to the later messaging integration phase.
