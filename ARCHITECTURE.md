# Architecture

TLC Travel OS uses Next.js 15 and React 19 for the public website, staff operations console and customer portal. Firebase Auth, Firestore, Storage and Functions provide identity, persistence and privileged workflows.

The canonical architecture is [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Domain schemas and permissions live in `packages/shared`; business commands live in `apps/functions`; server repositories and HTTP handlers live in `apps/web`. Production enquiries are persisted atomically with their CRM lead and audit records.

See [the current gap tracker](docs/REMAINING_GAPS.md) for implementation status and activation requirements. Dated project studies describe historical snapshots and should not be read as current defect lists.
