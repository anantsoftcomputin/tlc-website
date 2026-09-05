import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/roles";
import { getAdminFirestore, getAdminStorage } from "@/lib/firebase/admin";
import { hasTrustedOrigin } from "@/lib/security/request-origin";

const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"]);

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await getAdminUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!hasPermission(user.role, "content:write") || !user.orgId) return NextResponse.json({ error: "Content write access is required." }, { status: 403 });
  const data = await request.formData();
  const upload = data.get("file");
  if (!(upload instanceof File) || !allowed.has(upload.type) || upload.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Choose a JPG, PNG, WebP, AVIF or GIF smaller than 15 MB." }, { status: 400 });

  const extension = upload.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const id = randomUUID();
  const path = `media/public/${user.orgId}/${new Date().toISOString().slice(0, 10)}/${id}.${extension}`;
  const token = randomUUID();
  const bucket = getAdminStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  await bucket.file(path).save(Buffer.from(await upload.arrayBuffer()), {
    resumable: false,
    metadata: { contentType: upload.type, cacheControl: "public,max-age=31536000,immutable", metadata: { firebaseStorageDownloadTokens: token } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  const now = new Date().toISOString();
  await getAdminFirestore().collection("media").doc(id).set({
    id, orgId:user.orgId, name:upload.name, path, url, contentType:upload.type, size:upload.size,
    visibility:"public", createdAt:now, updatedAt:now, createdBy:user.uid, updatedBy:user.uid,
  });
  await getAdminFirestore().collection("auditLogs").add({
    orgId:user.orgId, actorUid:user.uid, actorRole:user.role, action:"content.media.upload",
    collection:"media", docId:id, before:null, after:{ name:upload.name, path, contentType:upload.type, size:upload.size },
    ts:now, createdAt:now, updatedAt:now, createdBy:user.uid, updatedBy:user.uid,
  });
  return NextResponse.json({ ok:true, id, url });
}
