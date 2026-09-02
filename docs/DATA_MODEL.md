# TLC Travel OS Data Model

> Generated from `packages/shared/src/schemas/schema-catalog.ts`. Do not edit collection fields manually; update the Zod schema and run `pnpm docs:data-model`.

## Conventions

- Business documents use `orgId` for tenant isolation.
- Mutable documents carry `createdAt`, `updatedAt`, `createdBy`, and `updatedBy`.
- Dates cross API boundaries as ISO 8601 strings; Firestore repositories convert them to timestamps.
- Currency values use major units and are rounded to two decimals by shared financial utilities.
- Sensitive identity values are references to encrypted material, never plaintext passport numbers.
- AI output includes human-readable `reasoning` and feature attribution where applicable.
- Browser clients cannot write audit logs, payment truth, analytics aggregates, or AI scores.

## Collection summary

| Collection | Org scoped | Server writes only | Purpose |
|---|---|---|---|
| `orgs/{orgId}` | No | No | Organization identity, branding, thresholds and automation guardrails. |
| `users/{uid}` | Yes | No | Staff identity, role, organization and commercial targets. |
| `customers/{customerId}` | Yes | No | Customer 360 profile, consent, segments, vector and CLV. |
| `customers/{customerId}/travelHistory/{tripId}` | Yes | No | Normalized historical and booked travel records. |
| `customers/{customerId}/events/{eventId}` | Yes | Yes | Append-only customer behaviour and model training events. |
| `leads/{leadId}` | Yes | No | Assigned sales opportunity, requirement, SLA and AI suggestions. |
| `leads/{leadId}/activities/{activityId}` | Yes | No | Append-only lead timeline. |
| `tasks/{taskId}` | Yes | No | Assigned CRM follow-up and operational task. |
| `conversations/{conversationId}` | Yes | No | Channel conversation, handover state and summary. |
| `conversations/{conversationId}/messages/{messageId}` | Yes | Yes | Messages, delivery, sentiment and grounded tool calls. |
| `quotes/{quoteId}` | Yes | No | Versioned itinerary cart with server-recomputed totals and approvals. |
| `bookings/{bookingId}` | Yes | No | Approved booking, travellers, supplier references and profitability. |
| `payments/{paymentId}` | Yes | Yes | Payment and refund lifecycle. |
| `ledger/{entryId}` | Yes | Yes | Receivable, payable, commission and incentive ledger. |
| `suppliers/{supplierId}` | Yes | No | Supplier directory and adapter selection. |
| `offers/{offerId}` | Yes | No | Grounded inventory offer and targeting content. |
| `campaigns/{campaignId}` | Yes | No | Approved audience, channel, schedule and outcome metrics. |
| `propensity/{customerId_offerId}` | Yes | Yes | Explainable customer-to-offer score. |
| `alerts/{alertId}` | Yes | Yes | Deduplicated supervisor red flag and evidence. |
| `analyticsDaily/{orgId_date}` | Yes | Yes | Pre-aggregated organization KPIs. |
| `analyticsStaff/{uid_month}` | Yes | Yes | Pre-aggregated staff performance KPIs. |
| `personas/{personaId}` | Yes | No | Editable AI assistant persona and escalation policy. |
| `auditLogs/{logId}` | Yes | Yes | Immutable before/after record for sensitive writes. |
| `imports/{importId}` | Yes | Yes | Customer import mapping, validation, deduplication and results. |
| `models/{version}` | Yes | Yes | TLC-owned model version, metrics and weight location. |
| `usage/{month_provider}` | Yes | Yes | Provider calls, reliability, latency and cost tracking. |

## `orgs/{orgId}`

Organization identity, branding, thresholds and automation guardrails.

- Organization scoped: No
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `name` | string | Yes |
| `gstin` | string | No |
| `branding` | object | Yes |
| `settings` | object | Yes |
| `active` | boolean | Yes |
| `ownerUid` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `users/{uid}`

Staff identity, role, organization and commercial targets.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `uid` | string | Yes |
| `orgId` | string | Yes |
| `displayName` | string | Yes |
| `email` | string | Yes |
| `phone` | string | No |
| `whatsappNumber` | string | No |
| `role` | owner \| manager \| sales \| accounts \| marketing \| readonly \| super_admin \| admin \| content_editor \| travel_consultant | Yes |
| `active` | boolean | Yes |
| `targets` | object | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `customers/{customerId}`

Customer 360 profile, consent, segments, vector and CLV.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `name` | string | Yes |
| `phones` | string[] | Yes |
| `emails` | string[] | Yes |
| `whatsappId` | string | No |
| `city` | string | No |
| `dob` | string | No |
| `passportRef` | string | No |
| `tags` | string[] | Yes |
| `consent` | object | Yes |
| `source` | string | Yes |
| `ownerUid` | string | Yes |
| `profile` | object | No |
| `segments` | object[] | Yes |
| `vector` | number[] | No |
| `modelVersion` | string | No |
| `clv` | object | No |
| `lifecycleStage` | new \| active \| repeat \| vip \| dormant \| churned | Yes |
| `lastActivityAt` | string | No |
| `mergedFrom` | string[] | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `customers/{customerId}/travelHistory/{tripId}`

Normalized historical and booked travel records.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `destination` | string | Yes |
| `country` | string | Yes |
| `domesticIntl` | domestic \| international | Yes |
| `dates` | object | Yes |
| `duration` | integer | Yes |
| `travellers` | object | Yes |
| `purpose` | business \| leisure | Yes |
| `airline` | string | No |
| `cabinClass` | string | No |
| `hotelBrand` | string | No |
| `hotelCategory` | 3 \| 4 \| 5 \| luxury | No |
| `roomType` | string | No |
| `spend` | number | Yes |
| `currency` | INR \| USD \| EUR \| GBP \| AED \| SGD \| THB | Yes |
| `bookingWindowDays` | integer | Yes |
| `source` | imported \| booking | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `customers/{customerId}/events/{eventId}`

Append-only customer behaviour and model training events.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `type` | enquiry \| quoteViewed \| replied \| booked \| cancelled \| offerSent \| offerClicked \| chatMessage \| campaignOpen \| campaignDelivered \| payment | Yes |
| `payload` | object | Yes |
| `channel` | website \| whatsapp \| phone \| email \| social \| system | Yes |
| `ts` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `leads/{leadId}`

Assigned sales opportunity, requirement, SLA and AI suggestions.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `customerId` | string | Yes |
| `source` | website \| whatsapp \| phone \| email \| social \| walkin \| campaign \| api \| chatbot | Yes |
| `status` | new \| contacted \| quoted \| negotiating \| won \| lost \| dormant | Yes |
| `priority` | low \| normal \| high \| urgent | Yes |
| `assignedUid` | string | Yes |
| `requirement` | object | Yes |
| `valueEstimate` | number | Yes |
| `expectedMargin` | number | Yes |
| `lostReason` | string | No |
| `sla` | object | Yes |
| `ageDays` | integer | Yes |
| `sentiment` | object | No |
| `aiSuggestions` | object | No |
| `flags` | string[] | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `leads/{leadId}/activities/{activityId}`

Append-only lead timeline.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `leadId` | string | Yes |
| `type` | note \| call \| email \| whatsapp \| quote \| statusChange \| followUp | Yes |
| `body` | string | Yes |
| `by` | string | Yes |
| `ts` | string | Yes |
| `attachments` | object[] | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `tasks/{taskId}`

Assigned CRM follow-up and operational task.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `title` | string | Yes |
| `description` | string | Yes |
| `assignedUid` | string | Yes |
| `dueAt` | string | Yes |
| `status` | open \| completed \| cancelled | Yes |
| `priority` | low \| normal \| high \| urgent | Yes |
| `entity` | object | No |
| `completedAt` | string | No |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `conversations/{conversationId}`

Channel conversation, handover state and summary.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `customerId` | string | Yes |
| `leadId` | string | No |
| `channel` | whatsapp \| web \| email | Yes |
| `participants` | object[] | Yes |
| `status` | bot \| human \| closed | Yes |
| `assignedUid` | string | No |
| `personaSnapshot` | object | Yes |
| `summary` | string | Yes |
| `lastMessageAt` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `conversations/{conversationId}/messages/{messageId}`

Messages, delivery, sentiment and grounded tool calls.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `conversationId` | string | Yes |
| `direction` | inbound \| outbound | Yes |
| `from` | object | Yes |
| `body` | string | Yes |
| `media` | object[] | Yes |
| `templateName` | string | No |
| `deliveryStatus` | queued \| sent \| delivered \| read \| failed | Yes |
| `aiGenerated` | boolean | Yes |
| `reasoning` | string | No |
| `sentiment` | object | No |
| `toolCalls` | object[] | Yes |
| `sentAt` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `quotes/{quoteId}`

Versioned itinerary cart with server-recomputed totals and approvals.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `leadId` | string | Yes |
| `customerId` | string | Yes |
| `version` | integer | Yes |
| `items` | object[] | Yes |
| `totals` | object | Yes |
| `validUntil` | string | Yes |
| `status` | draft \| sent \| viewed \| accepted \| rejected \| expired | Yes |
| `shareToken` | string | Yes |
| `approvals` | object[] | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `bookings/{bookingId}`

Approved booking, travellers, supplier references and profitability.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `quoteId` | string | Yes |
| `customerId` | string | Yes |
| `items` | object[] | Yes |
| `status` | pendingApproval \| processing \| confirmed \| partiallyConfirmed \| cancelled \| completed | Yes |
| `travellers` | object[] | Yes |
| `totals` | object | Yes |
| `paymentStatus` | unpaid \| partial \| paid \| partiallyRefunded \| refunded | Yes |
| `cancellation` | object | No |
| `profitability` | object | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `payments/{paymentId}`

Payment and refund lifecycle.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `bookingId` | string | Yes |
| `gateway` | string | Yes |
| `gatewayRef` | string | No |
| `linkUrl` | string | No |
| `amount` | number | Yes |
| `currency` | INR \| USD \| EUR \| GBP \| AED \| SGD \| THB | Yes |
| `type` | advance \| balance \| full \| refund | Yes |
| `status` | created \| pending \| captured \| failed \| cancelled \| refunded | Yes |
| `method` | link \| card \| upi \| bankTransfer \| cash \| cheque \| other | No |
| `reconciledAt` | string | No |
| `receiptNo` | string | No |
| `invoiceNo` | string | No |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `ledger/{entryId}`

Receivable, payable, commission and incentive ledger.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `bookingId` | string | Yes |
| `type` | receivable \| payable \| commission \| incentive | Yes |
| `party` | object | Yes |
| `amount` | number | Yes |
| `currency` | INR \| USD \| EUR \| GBP \| AED \| SGD \| THB | Yes |
| `gst` | object | Yes |
| `dueDate` | string | Yes |
| `settledAt` | string | No |
| `accountingSyncRef` | string | No |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `suppliers/{supplierId}`

Supplier directory and adapter selection.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `name` | string | Yes |
| `type` | airline \| hotel \| dmc \| transfer \| activity \| insurance \| visa \| technology \| other | Yes |
| `contact` | object | Yes |
| `paymentTerms` | object | Yes |
| `adapterKey` | string | Yes |
| `active` | boolean | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `offers/{offerId}`

Grounded inventory offer and targeting content.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `title` | string | Yes |
| `type` | package \| flight \| hotel \| cruise \| experience \| other | Yes |
| `destinations` | string[] | Yes |
| `priceBand` | budget \| mid \| premium \| luxury | Yes |
| `validity` | object | Yes |
| `inventory` | object | Yes |
| `exclusive` | boolean | Yes |
| `targetingRules` | object | Yes |
| `offerVector` | number[] | No |
| `content` | object | Yes |
| `status` | draft \| approved \| active \| paused \| expired | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `campaigns/{campaignId}`

Approved audience, channel, schedule and outcome metrics.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `offerId` | string | Yes |
| `name` | string | Yes |
| `audience` | object | Yes |
| `channel` | whatsapp \| email \| sms \| multi | Yes |
| `schedule` | object | Yes |
| `trigger` | manual \| scheduled \| event | Yes |
| `approvalStatus` | draft \| pending \| approved \| rejected | Yes |
| `approvedBy` | string | No |
| `stats` | object | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `propensity/{customerId_offerId}`

Explainable customer-to-offer score.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `customerId` | string | Yes |
| `offerId` | string | Yes |
| `score` | number | Yes |
| `reasoning` | string | Yes |
| `attributions` | object[] | Yes |
| `expectedRevenue` | number | Yes |
| `bestChannel` | whatsapp \| email \| phone \| web | Yes |
| `bestSendAt` | string | Yes |
| `computedAt` | string | Yes |
| `modelVersion` | string | Yes |
| `confidence` | number | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `alerts/{alertId}`

Deduplicated supervisor red flag and evidence.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `severity` | LOW \| MEDIUM \| HIGH \| CRITICAL | Yes |
| `ruleKey` | string | Yes |
| `entity` | object | Yes |
| `assignedUid` | string | No |
| `reasoning` | string | Yes |
| `evidence` | object[] | Yes |
| `status` | open \| acknowledged \| resolved | Yes |
| `dedupeKey` | string | Yes |
| `acknowledgedAt` | string | No |
| `resolvedAt` | string | No |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `analyticsDaily/{orgId_date}`

Pre-aggregated organization KPIs.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `date` | string | Yes |
| `enquiries` | integer | Yes |
| `leadsCreated` | integer | Yes |
| `quotesSent` | integer | Yes |
| `bookings` | integer | Yes |
| `revenue` | number | Yes |
| `gp` | number | Yes |
| `avgResponseMinutes` | number | Yes |
| `conversionPct` | number | Yes |
| `generatedAt` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `analyticsStaff/{uid_month}`

Pre-aggregated staff performance KPIs.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `uid` | string | Yes |
| `month` | string | Yes |
| `leadsAssigned` | integer | Yes |
| `firstResponseMedianMinutes` | number | Yes |
| `conversionPct` | number | Yes |
| `revenue` | number | Yes |
| `gp` | number | Yes |
| `targetAttainmentPct` | number | Yes |
| `generatedAt` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `personas/{personaId}`

Editable AI assistant persona and escalation policy.

- Organization scoped: Yes
- Server writes only: No

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `name` | string | Yes |
| `avatarUrl` | string | No |
| `tagline` | string | Yes |
| `tone` | object | Yes |
| `languages` | en \| hi \| gu[] | Yes |
| `autoDetectLanguage` | boolean | Yes |
| `brandVoice` | string[] | Yes |
| `forbiddenPhrases` | string[] | Yes |
| `signOff` | string | Yes |
| `channelOverrides` | object | Yes |
| `workingHours` | object | Yes |
| `afterHoursMessage` | string | Yes |
| `escalation` | object | Yes |
| `disclosures` | string | Yes |
| `active` | boolean | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `auditLogs/{logId}`

Immutable before/after record for sensitive writes.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `actorUid` | string | Yes |
| `action` | string | Yes |
| `collection` | string | Yes |
| `docId` | string | Yes |
| `before` | object \| null | Yes |
| `after` | object \| null | Yes |
| `ip` | string | No |
| `ts` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `imports/{importId}`

Customer import mapping, validation, deduplication and results.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `fileRef` | string | Yes |
| `mapping` | object | Yes |
| `stats` | object | Yes |
| `dedupReport` | object[] | Yes |
| `status` | uploaded \| mapping \| validating \| review \| processing \| completed \| failed | Yes |
| `error` | string | No |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `models/{version}`

TLC-owned model version, metrics and weight location.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `version` | string | Yes |
| `status` | training \| evaluating \| candidate \| active \| rejected \| archived | Yes |
| `weightsStoragePath` | string | Yes |
| `metrics` | object | Yes |
| `trainingWindow` | object | Yes |
| `positiveEvents` | integer | Yes |
| `featureAttributions` | object[] | Yes |
| `reasoning` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |

## `usage/{month_provider}`

Provider calls, reliability, latency and cost tracking.

- Organization scoped: Yes
- Server writes only: Yes

| Field | Type | Required |
|---|---|---|
| `id` | string | Yes |
| `orgId` | string | Yes |
| `month` | string | Yes |
| `provider` | string | Yes |
| `domain` | flights \| hotels \| payments \| accounting \| whatsapp \| email \| llm | Yes |
| `calls` | integer | Yes |
| `successfulCalls` | integer | Yes |
| `failedCalls` | integer | Yes |
| `latencyMsTotal` | number | Yes |
| `cost` | number | Yes |
| `currency` | string | Yes |
| `createdAt` | string | Yes |
| `updatedAt` | string | Yes |
| `createdBy` | string | Yes |
| `updatedBy` | string | Yes |
