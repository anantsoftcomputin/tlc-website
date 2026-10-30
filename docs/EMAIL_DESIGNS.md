# TLC email design library

43 reusable designs cover account access, holiday planning, booking updates, payments, support and marketing. Each design produces a subject, preheader, responsive HTML, equivalent plain text and any required email headers. No provider credentials are needed to design, preview or export them.

## Review the designs

- In the app: **Admin → Communications → Email design library** (`/admin/communications/emails`). Search/filter by scenario, switch desktop/mobile/plain text, try a personalised name or note, and download HTML or text. Staff access and same-origin requests are enforced. Previews do not send messages or change customer records.
- Offline: run `pnpm email:preview` and open `artifacts/email-designs/index.html`. Images are bundled. Each scenario includes `.html`, `.txt` and a sample `.json` payload; `manifest.json` lists every trigger, required field and integration status. The complete folder can be handed to an email integrator.
- Sample names, prices, dates, references and authentication links are **fictional**. The exported preview uses `preview.tlc.example`; these files must not be sent to customers. Production delivery calls the renderer with actual event data and the public site origin.

The collection follows the existing TLC red, wine and ivory palette, with Georgia headings, Arial body text and TLC photography. Travel proposals and editorial campaigns use photography; security notices and financial records keep the action or amount prominent. Every message contains readable text and contact details even when images are blocked. The 640px layout uses tables, inline styles, mobile spacing and Outlook fallbacks. User-supplied content is escaped; links require HTTPS outside local previews. HTML is limited to 95KB.

## What is connected now

| Existing path | Design | Behaviour |
| --- | --- | --- |
| Consultant explicitly sends a quote | `quote-ready`, `quote-revised` | Stores template data on the existing durable outbox message; links to the authenticated portal without exposing a share token. |
| Email conversation reply, including a bot response when enabled | `support-reply` | Uses the existing subject, message and reply-to address, with branded HTML and plain text. |
| Approved email campaign | Any of the 11 marketing designs | Campaign editor saves the selected design; the existing worker personalises the note and checks consent, frequency and unsubscribe before delivery. |
| Linked enquiry, captured payment, fully confirmed booking, issued finance document | `enquiry-received`, `payment-received`, `booking-confirmed`, `invoice-ready` | New deduplicated adapters use authoritative records and authenticated portal links; enable with `EMAIL_LIFECYCLE_ENABLED=true` after provider validation. Disabled by default. |

Existing Resend delivery receives HTML and text. Its idempotency and delivery callback paths remain in place. No live delivery, deployment or domain configuration has been performed as part of the design work.

**Design readiness is separate from event automation.** Other transactional designs are ready to render but their event adapters have not been activated. Authentication designs need secure action links from Firebase Auth and a custom send path. Birthday, anniversary, unfinished-plan and post-trip designs are available in the campaign editor; selecting one does not create a birthday calendar, recover abandoned plans or automatically schedule a send. Existing payment-reminder tasks do not yet dispatch their email template. Four additional event adapters now cover linked enquiries, captured payments, fully confirmed bookings and issued finance documents, gated by `EMAIL_LIFECYCLE_ENABLED`; see the communications setup guide.

## Scenario coverage and integration inputs

All templates support `firstName`, `message`, `consultantName`, `actionUrl`, `actionLabel`, `details`, and optional trip/reference data. Values are supplied as display strings; format currency/dates from verified records on the server. The catalogue enforces essential security and transaction fields. Supply an authenticated deep link where the relevant portal feature is available; a design does not create that portal feature.

| Group | Template IDs | Source/event to connect |
| --- | --- | --- |
| Account (5) | `welcome`, `verify-email`, `password-reset`, `email-changed`, `staff-invitation` | Verified new account or the corresponding Firebase Auth action. All four security templates require `actionUrl`; generate it server-side through the authentication provider, never construct an authentication token in the renderer. |
| Planning (8) | `enquiry-received`, `shortlist-saved`, `quote-ready`, `quote-revised`, `quote-accepted`, `quote-declined`, `quote-expiring`, `quote-expired` | Enquiry/shortlist/quote lifecycle. Shortlist requires a saved-plan link; expiry reminder requires actual `validUntil`. Quote ready/revised already use the send workflow. |
| Booking (8) | `booking-requested`, `booking-confirmed`, `booking-updated`, `documents-requested`, `documents-ready`, `pre-departure`, `cancellation-received`, `booking-cancelled` | Persisted supplier and booking states. Processing/confirmation/change/cancellation confirmation require `reference`; booking update and cancellation confirmation also require `message` explaining the affected services. Send confirmation only after the stated services are confirmed. |
| Payments (7) | `payment-request`, `payment-reminder`, `payment-received`, `payment-failed`, `refund-processing`, `refund-completed`, `invoice-ready` | Verified payment/refund/invoice events. All require `reference`; all except failed payment require `amount`; reminder also requires `dueDate`. Recheck outstanding balance before a reminder. Quote acceptance, receipt, supplier confirmation and bank credit have distinct wording. |
| Support (4) | `support-received`, `support-reply`, `consultant-handover`, `preferences-updated` | New support request, reply, consultant takeover and saved preference change. Replies already use the renderer. |
| Marketing (11) | `travel-newsletter`, `destination-inspiration`, `personalised-picks`, `seasonal-offer`, `family-holidays`, `honeymoon-escape`, `birthday-wish`, `anniversary-wish`, `resume-planning`, `welcome-back`, `post-trip-feedback` | Approved campaign with a valid consented audience. Every design requires a tokenised `unsubscribeUrl`. Birthday/anniversary dates must come from the client; offers must have real prices, terms and availability. |

`recommendations` supports up to three cards with title, description, destination image, link and optional label. This is available to server callers; the campaign editor currently configures a design, subject and personal note, not a card editor. No sample recommendations or rates are inserted into live messages.

## Shared rendering contract

Source: `packages/integrations/src/email/`. `catalog.ts` defines scenarios and required data, `render.ts` produces delivery content, and `samples.ts` is used only by previews/tests.

```ts
import { renderEmail, firebaseEmailDocument } from "@tlc/integrations";

// Values below come from the verified event and recipient, not preview fixtures.
const email = renderEmail("payment-received", {
  firstName: recipient.firstName,
  reference: payment.reference,
  amount: formattedConfirmedAmount,
  actionUrl: authenticatedPaymentDetailsUrl,
}, { siteUrl: publicHttpsOrigin });

// Resend / another HTML email provider:
const providerBody = {
  from: verifiedSender,
  to: [recipient.email],
  subject: email.subject,
  html: email.html,
  text: email.text,
  headers: email.headers,
};

// Optional Firebase Trigger Email / SMTP worker payload shape:
const mailDocument = firebaseEmailDocument(recipient.email, email);
// This helper only returns data. It does not write to Firestore or send mail.
```

Provider-neutral rendering does not require changing the current Resend integration. If a Firebase/SMTP delivery worker is chosen later, configure that worker and adapt status/idempotency handling before writing payloads to its protected collection. Do not run two delivery workers against the same event.

Brand defaults use the website's current TLC contact details and postal address. Optional renderer settings include `supportEmail`, `phone`, `postalAddress`, `assetBaseUrl` and `year`. Set `TLC_SITE_URL` to the public HTTPS origin for existing Functions senders. Host `/images/logo.png` and the destination images publicly at that origin, or provide `assetBaseUrl` to a direct renderer caller. `preview: true` is only for local previews and is not used by production senders.

## Email integration handoff

1. Configure the existing provider, verified sending domain, reply-to inbox, HTTPS site URL and callbacks as described in [COMMUNICATIONS_SETUP.md](./COMMUNICATIONS_SETUP.md). Credentials alone do not configure DNS or a provider account.
2. For each additional lifecycle automation being enabled, connect its verified event to a server-owned outbox entry containing `emailTemplateId` and validated `emailData`. Use a stable event/version identifier to deduplicate retries. Keep marketing in the campaign pipeline so consent, suppression and one-click opt-out are preserved.
3. Generate Firebase Auth verification/reset/recovery/setup action links server-side for security templates and route their delivery through the selected mail provider. Keep Firebase's current built-in messages until this custom path is connected and tested.
4. Test designated recipients in Gmail, Outlook and Apple Mail, including images blocked, mobile views, action links, replies, delivery callbacks and unsubscribe. Browser layout checks do not replace real inbox rendering and delivery tests.

Reference contracts: [Resend send-email fields](https://resend.com/docs/api-reference/emails/send-email), [Firebase Trigger Email message format](https://firebase.google.com/docs/extensions/official/firestore-send-email), and [cross-platform HTML email guidance](https://www.twilio.com/docs/sendgrid/ui/sending-email/cross-platform-html-design).

## Local verification

`pnpm email:preview` generates all 43 fixture sets. Email unit tests exercise required fields, content escaping, unsafe links, financial wording and payload formatting. The demo Firestore suites verify quote HTML, reply HTML/plain text, selected campaign designs, personalisation and unsubscribe headers with intercepted provider requests. `scripts/communications-smoke.mjs` exercises the authenticated design studio, personalised preview, mobile layout, text download and access/origin checks using demo Auth/Firestore emulators. No customer email is sent by these tests.
