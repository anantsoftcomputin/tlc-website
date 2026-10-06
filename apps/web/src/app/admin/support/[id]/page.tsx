import { notFound } from "next/navigation";
import { isManagerRole } from "@tlc/shared";
import { requireAdminUser } from "@/lib/auth/session";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { SupportReply } from "@/components/dashboard/support-reply";
export default async function SupportDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAdminUser("crm:write");
  const { id } = await params;
  const snapshot = await getAdminFirestore()
    .collection("supportRequests")
    .doc(id)
    .get();
  const data = snapshot.data();
  if (
    !data ||
    data.orgId !== user.orgId ||
    (!isManagerRole(user.role) && data.assignedUid !== user.uid)
  )
    notFound();
  return (
    <section className="workspace-panel">
      <header>
        <h1>{String(data.subject)}</h1>
      </header>
      <p className="support-thread">{String(data.body)}</p>
      <SupportReply
        id={id}
        reply={String(data.reply || "")}
        status={String(data.status)}
      />
    </section>
  );
}
