# Personal travel advisor — 30 October 2026

The five requested connections are implemented locally. They combine verified client identity, consented history, current-trip confirmation, sourced inventory and retail budgets, approved outreach, and post-trip learning. This document distinguishes code behavior from production activation.

**Client identity and permission**

Clients sign in with a verified Firebase email. The server resolves only CRM records in the same organization whose stored email matches that address. Personalisation defaults to off and is enabled at `/client/preferences`. The verified UID/email and confirmation timestamp are recorded by the server. A browser cannot supply another customer's ID as proof of ownership or write these records through Firestore.

A shared email can match several traveller records. Clients explicitly select which traveller to personalise; preferences are updated only for that selected record. Household preferences are included only when their ownership and profile-saving permission match. Sensitive household preferences retain the existing separate permission. Marketing and model-training permission remain independent.

**Personal chat and current-trip choices**

`/client/advisor` shows recorded interests and destination affinities and embeds Tara. The same website concierge can use the verified, consented profile. The assistant receives a first name, travel-relevant affinities/preferences, feedback signals, and the confirmed trip rather than raw contact details, passports or financial transactions. Historical average INR spending is labelled as history, never adopted as the current budget.

Clients confirm destination, dates, room-by-room adults and children's ages, nationality, hotel/meal needs, flight choices, total budget and included service categories before inventory search. Current choices override historical suggestions. Changing a trip requires another confirmation; the model cannot silently overwrite the brief. The current saved plan can be resumed. Shared preferences extracted from chat require explicit confirmation to become profile evidence; trip-specific values stay conversation-specific.

The model uses current catalogue and retail budget evidence. Currency claims must match that evidence. When inference is unavailable, deterministic personal suggestions and the itemised search remain usable. The local experimental model has not been activated or reclassified as production-approved.

A consultant-review action sends the server-owned brief, priced components, missing components and exclusions to the existing support workflow, assigned to the recorded consultant where available. It also records the client's enquiry event. It does not create a reservation or collect money.

**Verified WhatsApp and email conversations**

A client can ask the channel bot to use saved preferences/history. Until an explicit connection exists, channel responses remain catalogue-based. The bot supplies a ten-minute, one-use `/connect-travel` link. The client signs into the verified portal, chooses an eligible traveller and approves using that profile and confirmed estimates in the conversation for 24 hours. The channel address must match that same traveller's recorded email or phone. A link alone cannot expose history or attach someone else's account.

The worker rechecks the Auth account, organization, contact match, consent and connection expiry before retrieving personal context. It can discuss a still-current, complete confirmed estimate; exact trip changes and live refreshes are confirmed in the secure advisor. Stale or missing estimates lead back to confirmation instead of an invented price. Booking, payment and refund execution remain human workflows.

Private replies carry evidence/identity metadata. The outbox rechecks the connection and consent and cancels private replies if their permission, connection or price evidence expires while queued. After withdrawal, prior private assistant messages are excluded from new model context. Existing human takeover is preserved. Sign-out clears in-memory website chat state.

**Complete budget calculation**

Managers configure `/admin/settings/personalization` with approved retail markup, a flat service fee, the applicable service-tax policy, and sourced, tax-inclusive rates for transfers, experiences, insurance, visa or other services. No default commercial prices or tax percentages are invented. Rates include their destination, pricing unit, source, travel validity and confirmation expiry; removed rates are paused.

The server combines current hotel and requested return-flight evidence with the requested extras. Hotel/flight totals cover the supplier request's party; multi-room scope and unknown hotel supplements must be resolved before a complete total is shown. Supplier costs and tokens remain server-side. Public lines contain retail amounts, TLC fees and configured tax on TLC services.

Extra selection maximises recorded interest matches within the confirmed budget using the available sourced rate combinations. Hotel recommendations retain preference ranking among complete, affordable choices. If no affordable choice exists, the system shows the overrun rather than dropping requested services. A missing price, expired source, unknown supplement, missing pricing policy or test-only inventory makes the result incomplete. Such a result has no total/within-budget claim. Unchecked service categories and personal spending are explicitly excluded.

The estimate expires at the earliest contributing evidence expiry. The UI stops presenting expired totals as current, and chat only uses fresh estimates. A planning estimate remains subject to supplier repricing and consultant quote approval; it is not a booking guarantee or a search of every possible supplier worldwide.

**Travel-pattern recommendations and email**

After the nightly profile job, `draftPersonalTravelCampaigns` runs at 03:30 Asia/Kolkata. Staff can also select **Draft travel-pattern recommendations** at `/admin/marketing/campaigns`.

The job requires verified identity, personalisation and email permission, sufficient recorded trips, preferred travel months and a recorded booking lead time. It matches saved/historical destinations, spending bands and feedback against active, currently valid offers with positive, fresh supplier/allocation inventory. Mock/on-request inventory cannot be promoted as available. The most recently confirmed eligible traveller is considered first; one campaign cycle is created per verified identity, organization and target month.

These are drafts in the existing campaign queue. Staff inspect the message and explanation, request approval, and a manager approves before a manual or scheduled send. Email uses the existing personalised-picks renderer, recommendation cards, unsubscribe tokens, consent/frequency limits, durable delivery records and callback reconciliation. No campaign is approved by the pattern job.

Delivery rechecks identity, personalisation, consent, contact frequency, offer freshness and approved evidence fingerprints. If unsent offer/preferences evidence changes, refreshing replaces it with a draft that requires approval again. Sent, uncertain or in-flight campaigns are not automatically recreated or resent. Email ideas invite confirmation of exact dates and a total quote; they do not invent future availability or a package price from a spending band.

**Completed trips and feedback**

Staff use **Mark trip completed** on an approved, fully confirmed booking after every active service has ended. They confirm destination, country, purpose and traveller group. The command writes one booking-linked history record, a trip-completed event and an audit entry, then refreshes the profile. Retries/concurrent completions do not duplicate history. Processed refunds are deducted from recorded holiday value, with a refund trigger keeping completed-trip history aligned.

Verified clients can submit feedback on completed trips from their dashboard. They select a rating, interests they want more/less of, and an optional consultant-only comment. Updated feedback replaces that booking/account's previous contribution instead of inflating counts on retries. Comments are not sent to the model; structured interest signals influence subsequent preferences and recommendations only under personalisation permission. Feedback does not opt a customer into training.

History writes refresh the profile, and the existing nightly refresh remains. Foreign-currency holiday values are not mixed into INR average-spend/budget suggestions. The profile retains traceable trip counts, seasonality, destination affinities, booking windows, segments, feature vectors and labelled rules-based value estimates.

**Activation requirements**

1. Deploy the web code, Firestore rules/indexes and Functions together. New exports include `completeBooking`, `refreshProfileFromTravelHistory`, `updateCompletedTripRefunds`, `draftPersonalTravelCampaigns` and `refreshPersonalRecommendations`; existing channel and outbox workers are updated.
2. Configure actual approved pricing/extra rates in the manager screen. Missing prices intentionally remain visible instead of becoming zero.
3. Populate genuine travel history through completed bookings or an approved historical import. No client history was invented or migrated into production during development.
4. Verify TBO production credentials, issued endpoints, approved server IP and organization provider selection. Staging/missing availability cannot produce a complete production budget.
5. Maintain fresh, approved offer inventory for pattern matching. Verify the email sender, HTTPS `TLC_SITE_URL`, domain, callbacks and designated-recipient delivery before approving real campaigns. Channel connection links require that HTTPS origin.
6. Clients opt into personalisation and separately choose marketing channels. A reachable approved inference endpoint improves conversational quality; the deterministic path remains available. The experimental local candidate remains unapproved.

**Verification**

Local verification passed: the production build across all seven packages, lint/type checks, 212 unit tests, 20 Firestore security-rule tests, 28 emulator integration tests, and the personalisation browser flow. Browser checks include consultant handover, secure channel linking, wrong-account/token-replay rejection, account isolation and consent withdrawal, as well as recommendations, complete budgets, refresh, pricing configuration and feedback.

Demo Auth/Firestore data and intercepted provider transports are used; no real supplier, model or messaging request is needed by the personalisation smoke test. The preload transport fixture refuses to run outside an explicitly enabled demo environment and is never imported by application code. Production supplier and designated-recipient delivery validation remain activation requirements.

```sh
pnpm prepare:ci
pnpm exec turbo run lint typecheck test --force
pnpm exec firebase emulators:exec --only auth,firestore --project demo-tlc-holidays --non-interactive 'pnpm --filter @tlc/web test:rules && pnpm --filter @tlc/functions test:integration && node scripts/personalization-smoke.mjs'
```

The integration runner executes suites sequentially with a bounded 20-second case timeout, while retaining the explicit concurrent transaction assertions inside each suite. Browser output uses an isolated build directory and the `personalization-smoke` organization. It leaves normal development output and real customer records untouched.
