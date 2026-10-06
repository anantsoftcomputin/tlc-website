"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SupportReply({
  id,
  reply,
  status,
}: {
  id: string;
  reply: string;
  status: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form
      className="workspace-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch("/api/admin/support", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              reply: data.get("reply"),
              status: data.get("status"),
            }),
          });
          if (!r.ok) throw new Error((await r.json()).error);
          router.refresh();
          setError("Reply saved to the client dashboard.");
        } catch (error) {
          setError(error instanceof Error ? error.message : "Unable to reply.");
        }
      }}
    >
      <label>
        Reply to client
        <textarea
          name="reply"
          required
          maxLength={4000}
          defaultValue={reply}
          rows={6}
        />
      </label>
      <label>
        Status
        <select name="status" defaultValue={status}>
          <option value="open">Open</option>
          <option value="answered">Answered</option>
          <option value="closed">Closed</option>
        </select>
      </label>
      <button className="button button-gold">Save reply</button>
      {error && <p role="status">{error}</p>}
    </form>
  );
}
