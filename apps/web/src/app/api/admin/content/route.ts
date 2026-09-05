import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { contentCollectionSchema, contentMutationSchema } from "@tlc/shared";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";

async function contentActor(request: Request) {
  if (!hasTrustedOrigin(request)) return { error: NextResponse.json({ error: "Invalid request origin." }, { status: 403 }) };
  const user = await getAdminUser();
  if (!user) return { error: NextResponse.json({ error: "Authentication is required." }, { status: 401 }) };
  if (!hasPermission(user.role, "content:write")) return { error: NextResponse.json({ error: "Content write access is required." }, { status: 403 }) };
  if (!user.orgId) return { error: NextResponse.json({ error: "The account is not assigned to an organization." }, { status: 412 }) };
  return { user };
}

export async function POST(request: Request) {
  const identity = await contentActor(request);
  if (identity.error) return identity.error;
  const parsed = contentMutationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "The content record is invalid.", fields: parsed.error.flatten() }, { status: 400 });

  const { user } = identity;
  const database = getAdminFirestore();
  const clean = JSON.parse(JSON.stringify(parsed.data.data)) as Record<string, unknown>;
  const documentId = String(clean.id || clean.slug);
  const reference = database.collection(parsed.data.collection).doc(documentId);
  const audit = database.collection("auditLogs").doc();
  const now = new Date().toISOString();

  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const before = snapshot.exists ? snapshot.data() : null;
    if (before && before.orgId && before.orgId !== user.orgId) throw new Error("Content belongs to another organization.");
    const record = {
      ...clean, id: documentId, orgId: user.orgId,
      createdAt: before?.createdAt || now, createdBy: before?.createdBy || user.uid,
      updatedAt: now, updatedBy: user.uid,
      publishedAt: clean.status === "published" ? before?.publishedAt || now : before?.publishedAt || null,
    };
    transaction.set(reference, record);
    transaction.set(audit, {
      id: audit.id, orgId: user.orgId, actorUid: user.uid, actorRole: user.role,
      action: before ? `content.${parsed.data.collection}.update` : `content.${parsed.data.collection}.create`,
      collection: parsed.data.collection, docId: documentId, before: before || null, after: record,
      ts: now, createdAt: now, updatedAt: now, createdBy: user.uid, updatedBy: user.uid,
    });
  });
  revalidateTag("public-content");
  return NextResponse.json({ ok: true, id: documentId, href: `/admin/content/${parsed.data.collection}/${documentId}` });
}

export async function DELETE(request: Request) {
  const identity = await contentActor(request);
  if (identity.error) return identity.error;
  const body = await request.json() as { collection?: unknown; id?: unknown };
  const collection = contentCollectionSchema.safeParse(body.collection);
  if (!collection.success || typeof body.id !== "string" || !body.id) return NextResponse.json({ error: "Collection and record id are required." }, { status: 400 });
  const { user } = identity;
  const database = getAdminFirestore();
  const reference = database.collection(collection.data).doc(body.id);
  const audit = database.collection("auditLogs").doc();
  const now = new Date().toISOString();
  await database.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists || snapshot.data()?.orgId !== user.orgId) throw new Error("Content record was not found.");
    const before = snapshot.data()!;
    const after = { ...before, status: "archived", featured: false, updatedAt: now, updatedBy: user.uid };
    transaction.set(reference, after);
    transaction.set(audit, { id:audit.id, orgId:user.orgId, actorUid:user.uid, actorRole:user.role, action:`content.${collection.data}.archive`, collection:collection.data, docId:body.id, before, after, ts:now, createdAt:now, updatedAt:now, createdBy:user.uid, updatedBy:user.uid });
  });
  revalidateTag("public-content");
  return NextResponse.json({ ok: true });
}
