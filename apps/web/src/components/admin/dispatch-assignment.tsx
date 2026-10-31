"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function DispatchAssignment({
  kind,
  id,
  assignedUid,
  staff,
}: {
  kind: "conversation" | "support";
  id: string;
  assignedUid: string;
  staff: { uid: string; displayName: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(assignedUid || "unassigned");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="workspace-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setMessage("");
        try {
          const response = await fetch("/api/admin/assign-work", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind,
              id,
              assignedUid: selected,
              expectedUid: assignedUid || "unassigned",
              requestId: crypto.randomUUID(),
            }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Assignment failed.");
          setMessage(
            "Assigned. The employee can see this work and an alert in their workspace.",
          );
          router.refresh();
        } catch (error) {
          setMessage(
            error instanceof Error ? error.message : "Assignment failed.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <label>
        Assign this {kind === "conversation" ? "conversation" : "request"}
        <select
          aria-label={`Assign ${kind} ${id}`}
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="unassigned">Unassigned — dispatch queue</option>
          {staff.map((person) => (
            <option key={person.uid} value={person.uid}>
              {person.displayName}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button secondary"
        disabled={busy || selected === (assignedUid || "unassigned")}
      >
        Assign work
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
