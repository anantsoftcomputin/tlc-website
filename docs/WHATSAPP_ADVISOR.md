# WhatsApp personal travel advisor — 1 November 2026

WhatsApp clients can register, consent, plan, refresh recommendations, request a consultant and submit post-trip feedback without visiting the website. Registration creates a CRM traveller linked to the sending number. LINK WEBSITE now lets the traveller explicitly connect to a verified website account using a ten-minute phone-proven link; it never impersonates a login or accepts an unverified email as proof. See [DASHBOARD_CONFIGURATION.md](./DASHBOARD_CONFIGURATION.md).

The Meta webhook verifies the exact raw-body signature and configured business phone ID before marking an incoming message as verified. Neither a number typed into a message nor a supplied customer ID can establish identity. Each new signed incoming message renews the number-control/service window for up to 24 hours. Expired or unsigned sessions cannot retrieve a private profile.

**Returning and new clients**

A unique registered number receives a welcome and can continue with its existing consented preferences and history. Clients without personalisation consent receive general assistance and can enable personalisation explicitly. Old placeholder contacts named “WhatsApp traveller” complete registration rather than being mistaken for registered clients.

New clients provide their name, then choose PERSONAL or BASIC. PERSONAL enables storing/using history, preferences and structured feedback for recommendations; BASIC leaves personalisation off. A separate YES/NO asks about optional WhatsApp offers. Registration never enables model training or email marketing. STOP disables offers; STOP PERSONALISATION disables profile use. CONSULTANT requests human assistance at any stage, including registration.

Only the signed sender's number is used. Duplicate/shared numbers go to a consultant before private history is selected. Formatting differences in existing international numbers are recognised by a bounded first-contact lookup (up to 5,000 organization records); if uniqueness cannot be established, the bot requests staff reconciliation instead of choosing/creating a traveller. The `normalizeCustomerWhatsAppPhones` trigger adds canonical international aliases on customer writes. Country codes must already be present; national numbers are not guessed.

**Trip planning in chat**

Reply NEW TRIP. Tara asks for:

1. A published TLC destination.
2. Future check-in/check-out dates, within one year and a 1–30 night stay.
3. Each room's adults and children's ages, e.g. `2 / 6,10; 2 / none`.
4. Nationality, e.g. IN. Mixed nationalities can be handled by a consultant.
5. Total INR budget for everyone and the requested services.
6. Included services, e.g. `hotel, flight, transfer, activity`. Unselected categories are excluded.
7. Airports/cabin if flights are included, e.g. `DEL DXB economy`.
8. Current interests, then hotel stars, meals, amenities and refund requirements. STANDARD is an explicit selection of the displayed baseline hotel requirements.

Tara shows the complete brief and asks for CONFIRM before searching. NEW TRIP replaces an intake; CANCEL discards it. Recorded historical preferences remain suggestions and cannot silently set current dates, party or budget.

The website and Functions import the same `findVacationOptions` and `buildPersonalBudgets` engines from `@tlc/integrations`. Both use organization-approved TBO selection, real supplier evidence, exact party/room details, source expiry, approved extra-service rates, markup, fees and configured taxes. Staging, missing rates, expired evidence or unknown supplements prevent a complete/within-budget claim. Private supplier identifiers/cost evidence are not projected into client replies.

Up to three options show retail lines, missing components, exclusions and whether a complete current estimate fits the budget. REFRESH repeats the confirmed brief with new supplier evidence; current website plans can also be resumed for the exact same linked CRM traveller. Supplier requests are limited to five distinct requests per verified traveller/hour. A stale turn cannot replace the plan after a newer inbound message. Nothing is booked or paid by the bot.

REVIEW 1 (or 2/3) creates an idempotent support request with the owned confirmed plan and selected option, assigned to the recorded consultant where available. The conversation moves to human assistance when the bot response is persisted. Existing quote/booking/payment operations remain staff workflows, as on the website advisor.

**Preferences, feedback and delivery**

PREFERENCES shows saved interests and explicitly saves a replacement selection. FEEDBACK asks for a completed booking ID, verifies that booking belongs to the sending traveller, collects a rating and liked/disliked interests, then asks for CONFIRM. Updating feedback replaces that traveller/booking's prior contribution, including a linked website contribution, rather than inflating interest counts. Structured feedback influences recommendations only while personalisation is enabled.

Bot replies use the existing durable communication outbox, service-window checks, provider status callbacks and uncertain-outcome controls. Private replies carry the customer identity and evidence expiry. Consent, contact ownership and session validity are checked again before sending; queued private replies are cancelled after revocation. Email retains its verified portal connection flow; WhatsApp's new phone identity does not weaken email identity checks.

Message-level decisions and state are written together. Webhook retries, duplicate job delivery and confirmed-request retries reuse the same registration/plan/review/feedback records. Provider acceptance followed by a lost response still requires the existing uncertain-delivery reconciliation; transport does not guarantee exactly-once delivery.

**Activation**

Deploy the shared-package/vendor changes, web release, rules and Functions together, including the new `normalizeCustomerWhatsAppPhones` trigger. Enable the existing WHATSAPP_ENABLED flag and configure the Meta webhook, business sender and Secret Manager values described in [COMMUNICATIONS_SETUP.md](./COMMUNICATIONS_SETUP.md).

For live WhatsApp searches, enable WHATSAPP_LIVE_SEARCH_ENABLED and bind TBO_API_USERNAME, TBO_API_PASSWORD, TBO_STATIC_USERNAME and TBO_STATIC_PASSWORD. Configure the same approved environment, client ID, issued production endpoints and approved server IP as the website. Organization provider settings, pricing policy, extras and fresh catalogue data are still required. These credentials belong in Functions as well as the web host. Deploying the flag changes secret bindings.

An approved inference endpoint supports open conversation, while guided registration/planning works without it. Test real inbound registration, returning-client identity, whole-party supplier pricing, consultant takeover, feedback, STOP and delivery callbacks with designated accounts before general activation. No real messages or production deployment were performed during implementation.

**Verification**

The emulator integration suite covers registration, consent separation, known/legacy-formatted numbers, ambiguous/expired/unsigned identities, confirmed live-transport fixture pricing, incomplete budgets, refresh, cross-channel plan continuity, handover, feedback ownership/deduplication, number spoof attempts, search limits, stale-turn isolation, outbox delivery/deduplication and revocation. Existing website browser and rule checks are also rerun because pricing engines are now shared.

```sh
pnpm prepare:ci
pnpm exec turbo run lint typecheck test --force
pnpm exec firebase emulators:exec --only auth,firestore --project demo-tlc-holidays --non-interactive 'pnpm --filter @tlc/web test:rules && pnpm --filter @tlc/functions test:integration && node scripts/personalization-smoke.mjs'
```

Provider calls in these checks use controlled fixtures; real Meta/TBO connectivity and production model quality remain activation checks.

Local results: 212 unit tests, 20 Firestore rule tests, 42 integration tests (14 covering the new WhatsApp flow) and the existing advisor browser checks passed. The seven-package production build and final lint/type checks also passed. Consent withdrawal during consultant takeover is covered explicitly.
