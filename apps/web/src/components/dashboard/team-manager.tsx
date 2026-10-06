"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
};
export function TeamManager({
  members,
  owner,
}: {
  members: Member[];
  owner: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/admin/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setMessage(
        "Account updated. New team members can use Forgot password to set their password.",
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to update account.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="workspace-panel">
        <header>
          <h2>Team access</h2>
        </header>
        <div className="workspace-list">
          {members.map((member) => (
            <div className="client-record" key={member.id}>
              <div>
                <strong>{member.name}</strong>
                <p>
                  {member.email} · {member.role} ·{" "}
                  {member.active ? "Active" : "Disabled"}
                </p>
              </div>
              {!["owner", "super_admin"].includes(member.role) && (
                <button
                  disabled={busy}
                  onClick={() =>
                    save({
                      uid: member.id,
                      email: member.email,
                      name: member.name,
                      role: member.role,
                      active: !member.active,
                    })
                  }
                >
                  {member.active ? "Disable" : "Enable"}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className="workspace-panel">
        <header>
          <h2>Add or update a staff account</h2>
        </header>
        <form
          className="workspace-form"
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            void save({
              email: data.get("email"),
              name: data.get("name"),
              role: data.get("role"),
              active: true,
            });
          }}
        >
          <label>
            Full name
            <input name="name" required minLength={2} maxLength={120} />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Role
            <select name="role">
              {[
                "sales",
                "travel_consultant",
                "accounts",
                "marketing",
                "content_editor",
                "readonly",
                ...(owner ? ["manager", "admin"] : []),
              ].map((role) => (
                <option key={role} value={role}>
                  {role.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <button disabled={busy} className="button button-gold">
            Save account
          </button>
          {message && <p role="status">{message}</p>}
        </form>
      </section>
    </>
  );
}
