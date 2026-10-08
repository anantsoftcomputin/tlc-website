# Client communications

## Implemented surfaces

- `/admin/communications`: worker-reported readiness, blocked/uncertain delivery queue, links to the conversation inbox and approved campaign workflow.
- `/admin/conversations`: website, WhatsApp and email threads, consultant takeover/resume, staff replies; external replies enter a durable outbox.
- `/client/messages`: verified client conversations matched by organization and CRM identity, consultant messages, new portal threads, automatic refresh.
- `/client/preferences`: destinations, interests, budget style, preferred channel, promotional opt-in and maximum cross-channel frequency. CRM consent and opt-outs are updated transactionally.
- Website planner/chat: existing Tara experience uses the same TLC model endpoint. Supplier facts and quote handoff remain server-controlled. The local neural candidate is not production-approved; see the owned-AI report.
- Quote notifications: a consultant’s explicit send action queues a transactional email linking to the authenticated client portal. Notification messages are deduplicated and do not expose quote share tokens. Promotional opt-out does not block requested quote correspondence.
- Campaigns: history-based audience scoring, client preference substitutions, manager approval, scheduled/manual sends, WhatsApp template body parameters/language, plain-text email, unsubscribe links and email delivery callbacks. Promotional frequency defaults to weekly; clients can choose monthly or none.

No messages are sent as part of development verification. Tests use demo Firebase emulators and intercepted provider calls.

## Provider setup (credentials plus account configuration)

Use `apps/functions/.env.<project-id>` for nonsecret settings and Google Secret Manager for secrets. Enable flags control function secret bindings at deployment; changing them requires a functions deployment. Do not put secrets in browser variables or commit them.

### WhatsApp Cloud API

Nonsecret: `WHATSAPP_ENABLED=true`, `TLC_ORG_ID`.
Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.

Register `whatsappConversationWebhook` as the Meta callback, perform the GET verification using the verify token, and subscribe to message and delivery events. The POST handler validates the raw-body signature and sender phone-number ID. Freeform replies require an active 24-hour service window. Proactive campaigns require an approved template, matching language and body parameter positions. Template headers, media and buttons are not yet configurable by the campaign editor.

Text, quick reply and list-choice messages are supported. Voice notes, images and attachments cause a consultant handover; media transcription/download is not implemented. STOP updates the linked customer's WhatsApp marketing opt-out. Clients are not subscribed just by contacting the bot.

### Email (Resend)

Nonsecret: `EMAIL_ENABLED=true`, `MARKETING_EMAIL_FROM` (verified sender), `EMAIL_REPLY_TO` (receiving inbox), `TLC_SITE_URL` (public HTTPS site origin), `TLC_ORG_ID`.
Secrets: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`.

Verify the sending domain and configure the receiving domain/MX records. Register `emailConversationWebhook` and subscribe to `email.received`, `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, and `email.failed`. Incoming webhook signatures are verified with the raw bytes, Svix headers, and a five-minute timestamp tolerance. The handler retrieves email text from Resend and checks the receiving address; automated/list mail and failed DMARC are ignored. Missing positive DMARC verification routes to a consultant rather than AI. Email addresses are not proof of portal authentication; no booking/account information is returned by the channel bot.

HTML-only mail or attachments route to a consultant; attachments are not downloaded. Plain-text email replies are supported. Replying UNSUBSCRIBE on the first line or using the email's unsubscribe link revokes marketing consent. GET links show confirmation without changing consent; the token-scoped POST supports one-click unsubscribe. Bounces/complaints suppress future email campaigns.

Official references: [Resend receiving API](https://resend.com/docs/api-reference/emails/retrieve-received-email), [webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests), [Meta webhook payloads](https://www.postman.com/meta/whatsapp-business-platform/folder/tduohwq/webhook-payload-reference).

## Delivery and operations

Deploy Firestore rules and indexes, web changes, and Functions together after validation. Additional function exports: `emailConversationWebhook`, `deliverConversationOutbox`, `answerConversationMessage`, `recoverCommunicationJobs`, `notifyClientQuoteReady`. The existing `deliverWhatsAppConversationMessage` trigger name is retained and now queues both external channels.

Messages awaiting credentials stay `pending_configuration`; a five-minute worker retries configured channels and recovers interrupted bot jobs. Network ambiguity becomes `unknown`, not delivered, and is not automatically resent. Check provider logs before retrying manually. A crash after provider acceptance but before recording its ID can require reconciliation. Campaigns serialize sends and claim recipients before contacting providers; missing production credentials fail closed. Emulator-only mock delivery never contacts customers. No third-party messaging API guarantees end-to-end exactly-once delivery.

Approved campaigns still require an explicit manual send or scheduled trigger. Frequency and consent are checked immediately before a recipient is claimed. Failed/uncertain sends conservatively retain the frequency reservation. Campaigns with uncertain outcomes pause for review. Campaign callbacks update delivery status; click/open tracking is not implemented by these handlers.

Pending jobs are server-only. Portal reads and writes go through authenticated routes, not direct client Firestore access. Shared email addresses can map to multiple CRM records; ambiguous inbound contact matching creates a separate contact for consultant reconciliation. Client self-service phone verification and automatic cross-channel contact merging are not implemented.

For a secured model endpoint, set `TLC_AI_AUTH_REQUIRED=true` in Functions and store `TLC_AI_API_KEY` in Secret Manager. The bot and recovery workers bind this secret.

TLC model configuration must be reachable from both the website host and Functions. A localhost endpoint works only for local development. Real provider delivery, DNS, Meta template approvals, Google Cloud hosting and production model quality remain activation checks, not things an API key alone can establish.

## Deployment sequence

1. Use Node 22 for the Functions build, install with the repository's pinned pnpm version, and run `pnpm prepare:ci`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, and `pnpm test`.
2. Copy nonsecret settings from `apps/functions/.env.example` to the Firebase project environment. Set the public website origin and sender/receiving addresses. Add each required secret with `firebase functions:secrets:set SECRET_NAME --project PROJECT_ID` (interactive secret entry).
3. Deploy rules/indexes and the web release, then deploy Functions. The existing hosting workflow remains in use; this change does not deploy anything itself.
4. Register the provider webhooks and complete sender/domain/template verification. Confirm worker readiness at `/admin/communications`.
5. Use designated test recipients to verify inbound replies, consultant takeover, quote notification, delivery callbacks, STOP/unsubscribe and a single approved campaign before general activation.

Validation performed locally: 189 unit tests, 19 Firestore rule tests, demo integration suites for commerce/catalogue/messaging/campaigns, and production-build browser checks for client/admin communications, journeys and hotel shortlists. GPU live application tests remain deliberately opt-in and the current local model candidate does not pass them. Screenshots from communication browser checks are written to `/tmp/tlc-communications-smoke`.
