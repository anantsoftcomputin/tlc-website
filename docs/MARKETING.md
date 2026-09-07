# Phase 5 — AI Marketing & Customer Intelligence

Phase 5 gives TLC a governed offer-to-campaign workflow backed by first-party CRM events. AI recommends; authorized employees approve and send.

## Operator workflow

1. Open **Admin → Growth intelligence → Offers** and save an offer draft.
2. A manager approves it. Marketing can then activate it and score customers.
3. Open **Propensity explorer** to inspect the score, expected value, model version, reasoning and up to five feature contributions.
4. Open **Campaigns**, select an active offer, set a score threshold and optional CRM segment labels, choose a channel, and write the message.
5. Submit the campaign for approval. The server records an audience snapshot and excludes missing consent and opt-outs.
6. A manager approves. A manual campaign still requires a separate, explicit **Send now** confirmation; a scheduled campaign only becomes deliverable after approval.
7. Consent and opt-out status are checked again immediately before each delivery. Delivery IDs make retries traceable.
8. Read, reply and opt-out events are immutable customer events. A conversion requires a real booking ID, and attributed revenue is read from that booking rather than entered by an operator.

## Model lifecycle

- The default is `rules-v1`, with plain-language reasoning and feature attributions.
- The two-tower TensorFlow.js model uses 120 customer features and 48 offer features, a 64-dimensional interaction, and propensity, travel-90-day, churn, CLV and upgrade heads.
- Training examples are assembled chronologically from campaign delivery/conversion events, customer feature profiles and offers. The last 90 days are held out.
- Every candidate records the training window, example count, positive-event count, ROC AUC, PR AUC, Brier score and NDCG@10.
- A candidate is eligible only with at least 500 positive events, ROC AUC ≥ 0.72 and Brier ≤ 0.25. A manager must still activate it.
- Weights are private in Firebase Storage under `models/{orgId}/{version}/model.json`. Model evidence and lifecycle state stay in Firestore. Previous active versions become `retired`, so rollback is possible by reactivating an eligible version.
- Weekly training creates candidates but never activates them. Nightly scoring uses the active eligible model and falls back per record—or for the entire run—when neural inference is unavailable.

## Messaging configuration

Without provider credentials, delivery uses the deterministic mock adapter and no external message is sent. Production providers are selected only when these server-side variables exist:

- WhatsApp: `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`
- Email: `RESEND_API_KEY`, `MARKETING_EMAIL_FROM`

Move production values into Google Secret Manager/runtime secret bindings before enabling a real channel. Never put them in `NEXT_PUBLIC_*` variables.

## Emulator demo

Start the Firebase emulator, seed CRM data with `pnpm ai:seed`, refresh AI features, then run `pnpm marketing:seed`. The script refuses to run without `FIRESTORE_EMULATOR_HOST` and labels every generated score as synthetic.

## Operational safeguards

- Firestore clients can read authorized same-organization records, but offers, campaigns, deliveries, scores, models and customer marketing events are server-write-only.
- Manager approval, audience snapshots, lifecycle changes and model activation are audited.
- Metrics stay at zero until an event is recorded. No dashboard extrapolates sends, conversions or revenue.
- If a provider fails, keep the campaign paused, verify provider status and consent, and retry only after confirming the recipient did not receive the message.
