# TLC Holidays Project Delivery and Management Plan

## 1. Project objective

Launch a premium, fast, trustworthy travel discovery and lead-generation platform that allows TLC to publish destinations and journeys, capture qualified requirements, manage enquiries, and progressively grow into a connected travel CRM.

The project is managed as phased product delivery. Each phase must be reviewed and accepted before operational dependencies are added on top of it.

---

## 2. Roles and responsibilities

| Role | Primary responsibility |
|---|---|
| TLC business owner | Final business decisions, budget, launch approval, escalation |
| TLC project coordinator | Collects content, consolidates feedback, manages approvals |
| Travel consultants | Validate destinations, itineraries, inclusions, operational notes, enquiry workflow |
| Sales lead | Defines lead stages, ownership, follow-up expectations, and reports |
| Content/SEO owner | Approves copy, metadata, articles, FAQs, and legacy URL mapping |
| Design and engineering | Product design, implementation, testing, technical documentation, deployment |
| Firebase/Netlify administrator | Controls production access, billing, environment variables, domains, backups |

TLC should nominate one final approver. Feedback from different stakeholders should be consolidated before it reaches development.

---

## 3. Delivery phases

### Phase 0 — Project alignment and content audit

**Goal:** Agree on facts, scope, ownership, and launch priorities.

#### TLC actions

1. Confirm the official public brand name: TLC Holidays, TLC Travels, or an approved combination.
2. Supply the original logo in SVG, PDF, EPS, or high-resolution transparent PNG format.
3. Confirm phone numbers, WhatsApp number, email, address, business hours, and map location.
4. Provide approved social-media URLs.
5. Export every current package, destination, service, testimonial, and blog post.
6. Provide access to Search Console, Analytics, domain DNS, Netlify, and Firebase through role-based invitations.
7. Mark content as approved, needs rewrite, expired, or confidential.

#### Project actions

1. Maintain `PROJECT_AUDIT.md`.
2. Maintain `CONTENT_MIGRATION.md`.
3. Complete the legacy URL inventory using Search Console and server analytics.
4. Record unresolved facts in a content decision log.
5. Confirm the minimum launch scope.

#### Exit criteria

- Business identity and contact details are approved.
- A single project approver is named.
- Initial content inventory is complete.
- No unverified pricing, claims, testimonials, or visa information is approved for publication.

---

### Phase 1 — Design and technical foundation

**Status:** Substantially complete.

**Goal:** Establish the visual system and maintainable application architecture.

#### Work items

1. Approve colour palette, typography, spacing, and photography direction.
2. Validate header, footer, navigation, buttons, cards, forms, and responsive behaviour.
3. Confirm Firebase and Netlify environments.
4. Establish domain types and persistence interfaces.
5. Configure environmental variables and security rules.
6. Set up automated lint, type, test, and build gates.

#### Client review checklist

- Does the experience feel like TLC?
- Is the logo correct and readable?
- Are the primary actions clear?
- Does the mobile experience feel intentional?
- Are the contact details accurate?

#### Exit criteria

- Design direction is signed off.
- Production services have named owners.
- Automated quality gates pass.

---

### Phase 2 — Discovery and content

**Status:** Demonstration experience complete; production content required.

**Goal:** Allow travellers to find destinations and journeys through multiple intents.

#### Step-by-step work

1. Create an approved destination spreadsheet using the content template below.
2. Select the first 12–20 priority destinations based on TLC demand and search opportunity.
3. Approve one unique introduction for each destination.
4. Add best-time and operational notes only after consultant review.
5. Create the initial package catalogue with current itineraries.
6. Tag each package by destination, traveller type, interest, duration, and budget band.
7. Replace demonstration imagery with licensed or TLC-owned assets where required.
8. Import the approved data into Firestore.
9. Connect homepage and listing repositories to Firestore.
10. Review empty states, unpublished content, and invalid URLs.

#### Destination content template

- Destination and country
- Short introduction
- Detailed overview
- Why visit
- Top experiences
- Suggested duration
- Best time to visit
- Travel styles
- Places to visit
- FAQs
- Hero image and gallery with alt text
- Operational source and last-reviewed date
- SEO title and description

#### Trip content template

- Package name and slug
- Destination relationships
- Summary and description
- Days and nights
- Route
- Price guidance, pricing unit, and review date if approved
- Travel styles and ideal travellers
- Day-by-day itinerary
- Inclusions and exclusions
- Accommodation guidance
- Important information
- Cancellation wording
- Images and alt text
- SEO title and description
- Draft/published status

#### Exit criteria

- Priority destination and trip content is approved.
- Search and filters return only real published content.
- Each indexable page has unique, useful copy.
- Operational details have sources and review dates.

---

### Phase 3 — Enquiries and conversion

**Status:** Planner and WhatsApp hand-off complete; persistent lead workflow remains.

**Goal:** Turn browsing intent into structured, measurable enquiries.

#### Step-by-step work

1. Agree on required customer fields.
2. Agree on consent and privacy wording.
3. Configure Firebase Admin credentials on the hosting platform.
4. Implement secure Firestore enquiry creation.
5. Add rate limiting, honeypot, and Turnstile/CAPTCHA abstraction where needed.
6. Complete the trip-customisation side sheet.
7. Persist the Plan My Trip answers as a lead.
8. Send TLC a new-enquiry notification.
9. Send the traveller a short acknowledgement.
10. Capture campaign attribution without sensitive analytics payloads.
11. Track enquiry submission, calls, and WhatsApp clicks.
12. Test success, validation, duplicate submission, and failure states.

#### Decisions required from TLC

- Which inbox receives new leads?
- Who owns unassigned leads?
- What is the target first-response time?
- Is phone mandatory, and is email optional?
- Which languages should forms support?
- What consent wording has been approved?

#### Exit criteria

- Every successful submission creates exactly one enquiry.
- TLC receives an actionable notification.
- The traveller sees a clear acknowledgement.
- Failed persistence never shows a false success message.
- Attribution and CTA events are visible in analytics.

---

### Phase 4 — Secure admin and content management

**Goal:** Allow authorised TLC staff to manage the platform without developer assistance.

#### Step-by-step work

1. Create Firebase Authentication accounts through invitation only.
2. Define and approve each user role.
3. Configure custom claims through a secure server process.
4. Implement verified server session cookies.
5. Build the dashboard and navigation.
6. Build destination management.
7. Build trip and itinerary management.
8. Build media upload and selection.
9. Build testimonials, stories, FAQs, and SEO editing.
10. Add draft, preview, publish, and archive workflows.
11. Add audit logging for important changes.
12. Train content editors and administrators.

#### Role guidance

- `super_admin`: system access, roles, critical settings
- `admin`: operational and content administration
- `content_editor`: destinations, trips, stories, SEO
- `sales`: enquiries, pipeline, quotes, activities
- `travel_consultant`: assigned leads and itinerary collaboration
- `customer`: reserved for the future customer portal

#### Exit criteria

- Protected routes validate sessions server-side.
- Role permissions have test coverage.
- An editor can create, preview, publish, edit, and archive content.
- Material changes appear in the audit log.

---

### Phase 5 — CRM and quotation workflow

**Goal:** Manage the full journey from enquiry to converted trip.

#### Recommended pipeline

1. New Lead
2. Contacted
3. Requirement Received
4. Itinerary Preparation
5. Quote Sent
6. Follow-up
7. Negotiation
8. Won
9. Lost

#### Step-by-step work

1. Convert enquiries into contacts and leads.
2. Add lead owners, priority, source, status, and follow-up dates.
3. Add calls, WhatsApp notes, emails, and internal notes as activities.
4. Add follow-up tasks and reminders.
5. Build a configurable pipeline view.
6. Build quote and itinerary-proposal records.
7. Add quote versioning and status.
8. Record loss reasons and conversion outcomes.
9. Add operational dashboards without invented revenue data.
10. Define export and data-retention procedures.

#### Exit criteria

- Every website lead has an owner and status.
- Overdue follow-ups are visible.
- Quote history is preserved.
- Conversion and source reporting uses actual data.

---

### Phase 6 — SEO, editorial, analytics, and growth

**Goal:** Turn the platform into a sustainable discovery and acquisition channel.

#### Step-by-step work

1. Prioritise topics using real search and sales demand.
2. Create a three-month editorial calendar.
3. Publish detailed travel stories and destination guides.
4. Add meaningful internal links between stories, destinations, and trips.
5. Validate structured data.
6. Review index coverage and migrated URLs in Search Console.
7. Configure GA4 events and conversion definitions.
8. Build monthly acquisition and lead-quality reporting.
9. Add grounded recommendation logic using published Firestore content.
10. Pilot Ask TLC only after package grounding and safety rules are tested.

#### Exit criteria

- Search Console reports no major migration errors.
- Priority conversion events are measurable.
- Content has a named owner and publishing cadence.
- AI recommendations cannot invent packages, prices, or operational advice.

---

## 4. Suggested working cadence

### Weekly cycle

| Day | Activity |
|---|---|
| Monday | Priorities, blockers, and content hand-off |
| Tuesday–Wednesday | Design, implementation, and internal testing |
| Thursday | Review environment deployed for TLC |
| Friday | Consolidated feedback, acceptance, and next-sprint preparation |

### Meetings

- 30-minute weekly delivery review
- 45-minute content/operations session when required
- Phase acceptance meeting at each major milestone
- Launch readiness review 3–5 working days before release

Avoid collecting feedback through separate personal messages. Use one shared tracker and one consolidated approval comment per item.

---

## 5. Project board structure

### Recommended columns

1. Backlog
2. Ready for Content
3. Ready for Development
4. In Progress
5. Internal Review
6. Client Review
7. Changes Requested
8. Approved
9. Released
10. Blocked

### Required task fields

- Task title
- Phase
- Owner
- Approver
- Priority: Critical, High, Medium, Low
- Target release
- Acceptance criteria
- Dependencies
- Content/design links
- Test evidence
- Approval date

### Definition of Ready

A task can enter development when:

- Its business outcome is understood.
- Required copy and facts are available or explicitly marked as placeholders.
- Acceptance criteria are written.
- Dependencies and approver are known.
- No unresolved decision could substantially change the implementation.

### Definition of Done

A task is done when:

- Implementation matches the accepted requirement.
- Desktop and mobile states are reviewed.
- Accessibility and keyboard behaviour are checked where relevant.
- Error and empty states are covered.
- Lint, type check, tests, and build pass.
- Tracking and SEO are added where applicable.
- Documentation is updated.
- The nominated approver accepts the work.

---

## 6. Prioritisation method

Score significant requests from 1–5 across four areas:

- **Customer value:** Does it make discovery or planning easier?
- **Business value:** Does it improve lead quality, conversion, or operations?
- **Confidence:** Is the need supported by evidence?
- **Effort:** How much design, content, engineering, and operational work is required?

Use the practical score:

`Priority = (Customer value + Business value + Confidence) ÷ Effort`

Critical security, legal, accessibility, and data-integrity items always override this score.

---

## 7. Content approval workflow

1. Content owner creates or imports a draft.
2. Travel consultant validates itinerary and operational details.
3. SEO owner reviews intent, headings, metadata, and links.
4. Business approver confirms claims, pricing, and brand voice.
5. Editor previews the page on mobile and desktop.
6. Content is scheduled or published.
7. High-risk operational information receives a review date.
8. Expired content is archived or redirected rather than silently deleted.

Never publish unconfirmed pricing, availability, ratings, testimonials, visa rules, awards, partnerships, or discount claims.

---

## 8. Environment and access setup

### Local development

1. Install the active Node.js LTS release.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Add the Firebase web configuration.
5. Run `npm run dev`.
6. Open `http://localhost:3000`.

### Secure server configuration

1. Create a dedicated Firebase service account for the application.
2. Grant only the permissions required by the server.
3. Store `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` in Netlify environment variables.
4. Never prefix service-account values with `NEXT_PUBLIC_`.
5. Never send service-account JSON through email or project-management comments.
6. Rotate credentials if they are exposed.
7. Use separate Firebase projects for development/staging and production where practical.

### Netlify

1. Connect the approved Git repository.
2. Set the production branch.
3. Add public and server-only environment variables in Netlify.
4. Configure the custom domain.
5. Review preview-deployment access.
6. Deploy to a preview URL.
7. Run the launch checklist before promoting production.

---

## 9. Quality assurance instructions

### Automated checks

Run before every release:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

### Manual journey checks

1. Open the homepage and use the discovery search.
2. Browse destinations and open a destination guide.
3. Open a trip and review the complete itinerary.
4. Save and remove a trip.
5. Complete Plan My Trip.
6. Open the generated WhatsApp message.
7. Submit an enquiry and confirm it reaches Firestore and the notification inbox.
8. Test mobile navigation and sticky trip CTA.
9. Test keyboard navigation and visible focus.
10. Test 404, empty, validation, and network-error states.
11. Verify canonical URLs, metadata, sitemap, and legacy redirects.
12. Confirm no unpublished content appears publicly.

### Viewports

- 375px
- 430px
- 768px
- 1024px
- 1280px
- 1440px
- 1920px

Test current Safari and Chromium browsers where practical.

---

## 10. Launch checklist

### Content and business

- Brand name and logo approved
- Contact details tested
- WhatsApp number confirmed
- Privacy policy and terms approved
- All live destinations and trips reviewed
- Pricing notes and disclaimers approved
- Testimonials have permission and attribution
- No sample content is unintentionally public

### Technical

- Production Firebase project selected
- Firestore and Storage rules deployed
- Server credentials configured securely
- Domain and HTTPS working
- Production build successful
- Inquiry persistence and notifications tested
- Backups/export procedure documented
- Analytics and conversion events verified
- Error monitoring configured

### SEO and migration

- Production site URL configured
- Sitemap submitted
- Robots file reviewed
- Canonicals use the production domain
- Legacy redirects tested
- Search Console ownership confirmed
- Social sharing previews checked

### Approval

- Business owner approves launch
- Content owner approves content
- Technical owner approves production readiness
- Rollback decision and owner are documented

---

## 11. Post-launch management

### First 48 hours

- Monitor errors and enquiry delivery.
- Check important URLs and redirects.
- Review mobile analytics and drop-off points.
- Confirm sales staff can see and action every lead.

### Weekly

- Review new and overdue leads.
- Check failed forms and broken links.
- Update expired packages.
- Review popular destinations and search terms.
- Publish or prepare one useful content item.

### Monthly

- Review traffic, qualified leads, sources, and conversion.
- Review enquiry response times and loss reasons.
- Refresh priority destination and package information.
- Check Firestore usage, security logs, and hosting costs.
- Run dependency and performance checks.
- Update the roadmap based on evidence.

### Quarterly

- Audit user roles and access.
- Test backup and restore procedures.
- Review privacy and data retention.
- Audit operational travel information.
- Review SEO content quality and outdated URLs.
- Select the next product experiments.

---

## 12. Success measures

Measure the platform using real operational data:

- Qualified enquiries per month
- Enquiry-to-contact rate
- Contact-to-quote rate
- Quote-to-win rate
- Median first-response time
- WhatsApp and phone engagement
- Plan My Trip completion rate
- Trip-save rate
- Organic destination and story traffic
- Lead quality by source
- Most requested destinations and travel styles
- Percentage of published content reviewed on schedule

Revenue should be shown only after an approved accounting or booking data source exists.

---

## 13. Immediate next sprint

### Client inputs

1. Confirm the final logo and public brand name.
2. Approve all contact details.
3. Select 10 priority destinations.
4. Select 10–15 launch packages.
5. Nominate the enquiry inbox and lead owner.
6. Supply privacy and consent wording.
7. Invite the technical owner to Firebase and Netlify using role-based access.

### Project tasks

1. Add the Firebase Admin SDK and secure server initialisation.
2. Implement the Firestore inquiry repository.
3. Complete the enquiry and customisation forms.
4. Persist Plan My Trip submissions.
5. Add acknowledgement and staff notifications.
6. Import approved destination and trip content.
7. Add event tracking through the analytics abstraction.
8. Create integration and Playwright tests for the full lead journey.

### Sprint outcome

A real visitor can discover a trip, provide requirements, create a persistent Firestore lead, receive acknowledgement, and give TLC’s team a complete, attributable enquiry to follow up.
