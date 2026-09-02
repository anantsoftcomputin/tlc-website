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

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:rules
pnpm build
```

Architecture and delivery status are documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PLAN.md`](docs/PLAN.md).
