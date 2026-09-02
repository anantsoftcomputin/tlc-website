# TLC Admin and CRM foundation

## Security architecture

The admin application is a server-authorised workspace over domain repositories. Pages never trust the presence of a cookie or query Firestore directly from visual components.

1. Firebase client Auth signs in with email/password.
2. The client sends a fresh Firebase ID token to `/api/auth/session`.
3. Firebase Admin verifies the token, revocation state and role claim.
4. The server creates a five-day `httpOnly`, `sameSite=strict` session cookie.
5. Every protected page verifies that signed cookie and checks a named permission.
6. Firestore repositories map documents into explicit admin and CRM domain types.
7. Future mutations run through validated server endpoints and write immutable audit logs.

## Create the initial administrator

1. Enable Email/Password in Firebase Authentication.
2. Create the first team user in Firebase Authentication.
3. Add the three server-only Firebase Admin variables to `.env` locally and to the hosting environment:

```dotenv
FIREBASE_PROJECT_ID=tlcweb-cf7d3
FIREBASE_CLIENT_EMAIL=your-service-account@tlcweb-cf7d3.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

These are separate from the `NEXT_PUBLIC_FIREBASE_*` browser configuration. Create or select a least-privilege server service account in Google Cloud/Firebase and keep its private key only in secret storage.

4. Run:

```bash
pnpm admin:set-role -- user@example.com super_admin
```

5. Sign in at `/login`. Existing tokens must be refreshed after any role change.

Never prefix Admin credentials with `NEXT_PUBLIC_` or commit a service-account JSON file.

## CRM collection boundaries

- `inquiries`: customer intake from validated server routes
- `customers`: canonical traveller identity, consent, segments and value profile
- `customers/{id}/travelHistory`: normalized historic and booked journeys
- `customers/{id}/events`: server-written customer interaction stream
- `imports`: governed import jobs and duplicate review results
- `leads`: sales opportunity and pipeline stage
- `deals`: commercial outcome and value
- `activities`: calls, WhatsApp, email, meetings, notes and status history
- `tasks`: owned follow-ups and reminders
- `quotes`: versioned itinerary proposals
- `leadSources`: configurable acquisition sources
- `pipelineSettings`: configurable stages and service targets
- `auditLogs`: immutable server-written record of material actions

## Rules deployment

Rules must be validated with the Firebase Emulator Suite before production deployment. After review:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage --project tlcweb-cf7d3
```

Indexes can take time to build. Do not remove a production index until its replacement is ready.
