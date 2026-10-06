import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminAuth, isFirebaseAdminConfigured } from "@/lib/firebase/admin";
import { hasPermission, isUserRole } from "@/lib/auth/roles";
import { sessionCookieName, sessionDurationMs, requiresMfa } from "@/lib/auth/session";
import { dashboardPath } from "@tlc/shared";
import { hasTrustedOrigin } from "@/lib/security/request-origin";

const sessionSchema = z.object({ idToken: z.string().min(100).max(10000) });

export async function POST(request: Request) {
  if (!hasTrustedOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (!isFirebaseAdminConfigured) return NextResponse.json({ error: "Admin authentication is not configured on this server." }, { status: 503 });

  try {
    const parsed = sessionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid authentication token." }, { status: 400 });

    const decoded = await getAdminAuth().verifyIdToken(parsed.data.idToken, true);
    const role = decoded.role || "customer";
    if (!isUserRole(role)) return NextResponse.json({ error: "Account role is invalid." }, { status: 403 });
    if (role === "customer" && (!decoded.email_verified || !decoded.email)) return NextResponse.json({ error: "Verify your email before opening your dashboard.", code: "verify-email" }, { status: 403 });
    if (role !== "customer" && (!decoded.orgId || !hasPermission(role, "admin:access"))) return NextResponse.json({ error: "This account has no organization access." }, { status: 403 });
    if (Date.now() / 1000 - decoded.auth_time > 300) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
    if (requiresMfa(role) && !decoded.firebase?.sign_in_second_factor) return NextResponse.json({ error: "Set up an authenticator to protect your management account.", code: "enroll-mfa" }, { status: 403 });

    const sessionCookie = await getAdminAuth().createSessionCookie(parsed.data.idToken, { expiresIn: sessionDurationMs });
    const response = NextResponse.json({ ok: true, role, redirect: dashboardPath(role) });
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
