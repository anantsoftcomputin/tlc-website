# TLC customer AI concierge

## Production behaviour

Tara is a text-only customer-facing assistant rendered on every public website route. It is hidden from login, shared-itinerary and CRM routes. On mobile it becomes a full-screen chat experience above the primary navigation.

Every turn searches TLC's published destination, trip and hotel CMS. The application—not the language model—creates the visual cards, entity links, images, availability label and grounding IDs. Prices and live availability are never inferred. A request to book, obtain a quote, discuss payment, resolve a complaint or speak to a person opens the CRM handover form.

The handover creates an `ai_concierge` inquiry plus linked customer and lead, applies the configured lead-assignment policy, preserves the transcript summary in the lead requirement and attaches the complete conversation to the lead.

## Model configuration

Set these server-only environment variables in Netlify:

- `OPENAI_API_KEY` — project API key. Never prefix it with `NEXT_PUBLIC_`.
- `OPENAI_CHAT_MODEL` — optional; defaults to `gpt-5.4-mini`.

The implementation uses the OpenAI Responses API with strict structured output and `store: false`. If the key is absent, the provider times out or the response fails the grounding check, Tara automatically uses the deterministic TLC catalogue planner. This keeps the customer experience operational without weakening grounding.

## Data and privacy

- Anonymous sessions receive a random browser UUID and expire after 90 days.
- Only the last 12 text turns are sent to the model.
- Contact details are collected in the separate CRM handover form, not in the model prompt.
- No voice, recording, passport, payment card or exact birth-date data is collected.
- Browser clients cannot write conversation documents directly.
- Rate limits and same-origin validation apply to chat and handover endpoints.

## Remaining conversational work

The launched text experience intentionally does not include voice. Phase 6 now includes confirmed preference extraction, ambiguity handling, persona versioning and previews, a staff conversation inbox, human takeover and bot resume, grounded lead-side suggestions, WhatsApp webhook continuity, 24-hour session enforcement, satisfaction capture and operational quality telemetry.

Live supplier search and full day-by-day generative itinerary composition remain behind the existing adapter and visual-itinerary contracts. Streaming voice is the only Phase 6 customer surface explicitly deferred by the client.

See the AI concierge operating runbook for deployment secrets, WhatsApp setup, monitoring and recovery procedures.
