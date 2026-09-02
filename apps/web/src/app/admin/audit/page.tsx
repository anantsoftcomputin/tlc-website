import { FileClock, ShieldCheck } from "lucide-react";
import { requireAdminUser } from "@/lib/auth/session";
import { FirestoreManagementRepository } from "@/repositories/firebase/firestore-management-repository";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
function changeCount(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  return new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
    .size;
}

export default async function AuditPage() {
  const user = await requireAdminUser("audit:read");
  const entries = await new FirestoreManagementRepository(
    user.orgId,
  ).listAuditEntries();
  return (
    <>
      <header className="admin-page-head">
        <div>
          <p className="eyebrow">Governance</p>
          <h1>Audit trail</h1>
          <p>
            Immutable organization activity with actor, entity and before/after
            evidence.
          </p>
        </div>
        <span className="admin-count">
          <ShieldCheck />
          {entries.length} recent events
        </span>
      </header>
      <section className="admin-panel">
        <header>
          <div>
            <span>
              <FileClock />
            </span>
            <div>
              <h2>System of record</h2>
              <p>
                Newest events first. Audit entries cannot be changed or deleted
                from the application.
              </p>
            </div>
          </div>
        </header>
        <div className="admin-table-wrap">
          <table className="admin-table audit-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Action</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDate(entry.ts)}</td>
                  <td>
                    <b className="audit-action">
                      {entry.action.replaceAll("_", " ").replaceAll(".", " · ")}
                    </b>
                  </td>
                  <td>
                    <span>{entry.actorUid}</span>
                  </td>
                  <td>
                    <b>{entry.collection}</b>
                    <span>{entry.docId}</span>
                  </td>
                  <td>
                    <details>
                      <summary>
                        {changeCount(entry.before, entry.after)} fields
                      </summary>
                      <div className="audit-evidence">
                        <section>
                          <b>Before</b>
                          <pre>{JSON.stringify(entry.before, null, 2)}</pre>
                        </section>
                        <section>
                          <b>After</b>
                          <pre>{JSON.stringify(entry.after, null, 2)}</pre>
                        </section>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!entries.length && (
            <div className="admin-empty">
              <span>
                <ShieldCheck />
              </span>
              <h3>No audit events found</h3>
              <p>
                Sensitive CRM and settings changes will appear here
                automatically.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
