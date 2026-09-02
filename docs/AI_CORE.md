# AI Core v1 runbook

## Serving policy

Phase 1 uses deterministic rules, not a trained neural network. Recommendations explicitly say `Rule-based (insufficient training data)` and expose ranked feature attributions. TLC should only activate the later two-tower model after at least 500 positive outcome events and validation AUC of at least 0.72.

## Jobs

- `buildFeatureStore` runs daily at 02:00 Asia/Kolkata. It rebuilds customer profiles, 120-feature arrays, explainable segments and rule-based CLV estimates.
- `runAiSupervisor` runs every 15 minutes. It evaluates active leads, deduplicates alerts by rule and entity, escalates unresolved alerts after 24 hours, and automatically resolves conditions that are no longer active.
- `refreshAiCore` lets an authenticated manager run both operations on demand.

## Supervisor coverage

The pure rules engine implements high-value unanswered, missed follow-up, ignored hot lead, inactivity, repeated question, sentiment drop, dissatisfied customer, excessive discount, low margin, suspicious price, better competitor price, valuable customer at risk, overdue payment, unusual refund impact and staff underperformance.

Only rules with available evidence fire. Every alert stores its reasoning and observed evidence. The engine recommends attention; it never sends a customer message, changes pricing or confirms a booking.

## Synthetic demonstration data

Start the Firestore emulator and run:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-tlc-holidays pnpm ai:seed
```

The generator is deterministic, emulator-only and creates 2,000 Indian outbound-travel customer profiles with history and events. Use `--count=N` after the script command for a smaller local dataset.
