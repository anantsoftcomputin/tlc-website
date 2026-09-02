import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { hasPermission, isUserRole } from "@/lib/auth/roles";
import { sessionCookieName, sessionDurationMs } from "@/lib/auth/session";
import { hasTrustedOrigin } from "@/lib/security/request-origin";

const sessionSchema = z.object({ idToken: z.string().min(100).max(10000) });

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isFirebaseAdminConfigured) return NextResponse.json({ error: "Admin authentication is not configured on this server." }, { status: 503 });

  try {
    const parsed = sessionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid authentication token." }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(parsed.data.idToken, true);
    if (!isUserRole(decoded.role) || !hasPermission(decoded.role, "admin:access")) {
      return NextResponse.json({ error: "This account does not have admin access." }, { status: 403 });
    }

    const sessionCookie = await getAdminAuth().createSessionCookie(parsed.data.idToken, { expiresIn: sessionDurationMs });
    const response = NextResponse.json({ ok: true, role: decoded.role });
    response.cookies.set(sessionCookieName, sessionCookie, {
      maxAge: sessionDurationMs / 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Sign-in could not be verified." }, { status: 401 });
  }
}

export async function DELETE(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", { maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/" });
  return response;
}
