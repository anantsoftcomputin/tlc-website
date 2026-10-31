# TLC Travel OS

TLC Travel OS combines the TLC Holidays public website with an organization-aware travel CRM and the foundations for commerce, finance, analytics and explainable AI.

## Requirements

- Node.js 22
- pnpm 10.33+
- Java 21 for Firebase emulators
- Firebase CLI authentication for deployment

## Local development

```bash
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000`. In a second terminal:

```bash
pnpm emulators
```

To add realistic local foundation records after the Firestore emulator starts:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-tlc-holidays pnpm seed
```

## Production operations

```bash
pnpm admin:set-role -- person@example.com manager   # assigns role and organization claim
pnpm admin:enable-mfa                               # once: enable authenticator-app MFA
pnpm customers:backfill-search                      # once: index existing customers for search
```

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rules
pnpm build
```

Current fixes and activation requirements are tracked in [`docs/REMAINING_GAPS.md`](docs/REMAINING_GAPS.md). Architecture and delivery status are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PLAN.md`](docs/PLAN.md).

The verified, consented personal advisor and its activation steps are documented in [`docs/PERSONAL_TRAVEL_ADVISOR.md`](docs/PERSONAL_TRAVEL_ADVISOR.md).

WhatsApp registration and personal trip planning: [WhatsApp advisor](docs/WHATSAPP_ADVISOR.md).

Dashboard role configuration, dispatch and client archives: [Dashboard configuration](docs/DASHBOARD_CONFIGURATION.md).
