# AI concierge operating runbook

## Daily operating workflow

1. Open /admin/conversations and prioritise threads marked human.
2. Open a thread, review its full transcript, grounding status and linked lead.
3. Select Take over before replying. Tara remains silent while the thread is in human mode.
4. Review every staff-assist draft before sending. Suggestions never confirm price, inventory or booking status.
5. Select Return to Tara only after the customer request is resolved, or close the thread.
6. Review average latency, handover rate, grounding issues, satisfaction and recorded provider cost on the inbox dashboard.

## Persona releases

Owners manage Tara at /admin/settings/persona. Each save creates a numbered immutable snapshot and an audit entry. Preview web and WhatsApp copy before activation. Never remove the AI disclosure, live-availability disclaimer or escalation language.

## WhatsApp configuration

Configure these Firebase runtime secrets:

- WHATSAPP_VERIFY_TOKEN
- WHATSAPP_APP_SECRET
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID

Deploy whatsappConversationWebhook and deliverWhatsAppConversationMessage, then register the webhook URL in Meta. Subscribe to message events and use the same verify token. The webhook validates the Meta SHA-256 signature, deduplicates message IDs and opens a 24-hour customer-service window. Free-form staff or bot messages fail closed after the window; an approved template workflow must reopen contact.

## Privacy and access drill

Run quarterly:

1. Confirm an unauthenticated browser cannot read conversations, preference signals, households, personas or messages.
2. Confirm sales staff can only read assigned conversations and leads.
3. Confirm marketing staff cannot read family profiles.
4. Confirm preference candidates are not persisted until the traveller selects Yes, remember this.
5. Confirm anonymous preferences remain attached only to the expiring conversation until a customer is linked.

## Accessibility and load drill

Before a major release:

1. Complete the web chat and staff inbox using keyboard only at 360 px and desktop widths.
2. Verify focus visibility, labelled controls, screen-reader announcements and 200% zoom.
3. Run 30 chat requests per ten-minute client window and confirm request 31 receives HTTP 429 with retry guidance.
4. Load-test within the configured Netlify and Firebase concurrency budgets; do not raise limits before reviewing provider cost and Firestore writes.

## Failure-mode drill

- Remove the LLM key and verify the deterministic grounded planner continues to answer.
- Return an ungrounded price from a test provider and verify the validator rejects it.
- Disable the WhatsApp token and verify queued messages become failed rather than falsely sent.
- Ask for a human, complaint or refund and verify the conversation enters human mode with a linked CRM handover.

## Backup and restore drill

1. Export Firestore using the scheduled encrypted GCS export and record its object generation.
2. Restore into an isolated Firebase test project.
3. Verify conversation/message parent-child integrity, persona versions, linked leads and preference evidence.
4. Run the rules test suite against the restored project configuration.
5. Record restoration time, missing records and corrective actions. Never overwrite production during a drill.

## Incident thresholds

- Grounding failures above zero: pause the affected assistant release and inspect the stored tool ledger.
- Average response latency above 10 seconds for 15 minutes: verify provider health and allow deterministic fallback.
- WhatsApp delivery failures above 5%: pause outbound replies and verify the Meta token, phone ID and session windows.
- Satisfaction below 3/5 over ten rated threads: review transcripts, persona version and handover timing before changing prompts.
