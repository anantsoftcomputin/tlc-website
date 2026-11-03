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
pnpm admin:enable-mfa                               # enable authenticator-app MFA on an upgraded project
node scripts/configure-auth.mjs                     # read provider, domain and MFA settings
pnpm customers:backfill-search                      # once: index existing customers for search
```

The login page supports Google, email/password and SMS phone verification. Customer access requires a verified email or phone; staff permissions come from assigned roles. Management requires an authenticator and Google or email as the first factor. Identity Platform must be enabled for TOTP. After reviewing its usage-based pricing, the explicit upgrade command is `node scripts/configure-auth.mjs --enable-totp --upgrade-identity-platform`. The command saves a private configuration backup under `/tmp` and preserves existing providers.

App Check can be inspected with `pnpm appcheck:configure`. The explicit `--apply` option enables the required APIs, verifies the dedicated App Check service agent, registers the domain-restricted Enterprise provider and updates the production Netlify variables. It saves the previous settings privately under `/tmp`; it requires a Firebase CLI login and Netlify CLI access. Rebuild and publish the website after applying it. Run `node scripts/app-check-smoke.mjs` against the live release to verify browser attestation without creating production records. The build passes App Check configuration through Turbo and rejects a production deployment with missing verification settings. reCAPTCHA Enterprise has a free allowance and usage charges above it; review [Firebase's App Check documentation](https://firebase.google.com/docs/app-check) before activating it in another project.

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
