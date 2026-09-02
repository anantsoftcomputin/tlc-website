# Customer import runbook

## Purpose

The import workflow brings legacy customer lists into the canonical `customers` collection without silently overwriting customer data. It is designed as a governed CRM command: an authorized team member uploads and maps data, reviews validation and duplicate evidence, and explicitly commits create, merge, or skip decisions.

## Operator workflow

1. Open **Operations → Customers → Import customers**.
2. Choose a CSV or XLSX file no larger than 5 MB and containing no more than 5,000 customer rows.
3. Map the required customer name and phone columns. Optionally map email, city, and tags.
4. Select marketing consent only when the source data contains recorded consent for that channel.
5. Select **Validate & review**. No customer record is changed at this point.
6. Review every possible match. Exact phone or email matches are preselected for merge. Fuzzy name matches are skipped by default and require an explicit choice.
7. Correct the source file and restart for invalid rows, or leave those rows skipped.
8. Select **Commit import** once the create, merge, and skip totals are correct.
9. Open the customer directory and spot-check imported records and their 360° pages.

## Normalization and duplicate policy

- Phone values are reduced to digits. Ten-digit Indian numbers receive the `91` country prefix.
- Emails are trimmed, lowercased, and validated.
- Tags are split on commas, semicolons, or pipes, lowercased, and de-duplicated.
- Exact normalized phone matches score 100.
- Exact email matches score 96.
- Similar names use Dice bigram similarity; names at or above 72% can become candidates.
- Matching cities add six points, capped at 100.
- Scores below 65 are not presented as duplicate candidates.
- Every match includes human-readable evidence. Fuzzy candidates are never merged automatically.

## Data and security architecture

- Browser parsing limits unnecessary file retention: only mapped row values are sent to the authenticated server endpoint.
- The callable Firebase Function derives `orgId` and record ownership from the verified Firebase Auth token; browser-supplied organization or owner values are ignored.
- Preview rows are stored under `imports/{importId}/rows/{rowNumber}` so large imports do not exceed the Firestore document size limit.
- Import documents and row details cannot be written by Firestore browser clients. Firebase Admin performs privileged writes.
- The commit transition from `review` to `processing` is transactional, preventing a double submission.
- Each created or merged customer produces an immutable `auditLogs` record with before/after context.
- Canonical customer records remain organization-scoped and are accessed through the repository boundary, leaving room for future CRM services, jobs, and channel adapters.

## Supported mapping

| Canonical field | Required | Notes |
|---|---:|---|
| Name | Yes | At least two characters |
| Phone | Yes | 10–15 normalized digits |
| Email | No | Must be a valid email when supplied |
| City | No | Whitespace is normalized |
| Tags | No | CSV-style tags in a single source column |

## Failure handling

An import job is marked `failed` with a readable error if server processing cannot finish. Because a large Firestore import spans multiple bounded batches, an administrator should inspect the import job and audit trail before retrying a failed commit. The original source file remains the recovery source of truth.
