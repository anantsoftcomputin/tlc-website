import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const [, , email, role = "super_admin"] = process.argv;
const roles = ["super_admin", "owner", "manager", "admin", "sales", "travel_consultant", "accounts", "marketing", "content_editor", "readonly", "customer"];
const orgId = process.env.TLC_ORG_ID || "tlc-vacations";

if (!email || !roles.includes(role)) {
  console.error("Usage: npm run admin:set-role -- user@example.com super_admin");
  process.exitCode = 1;
} else {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey) {
    throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.");
  }
  const app = getApps()[0] || initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  // Staff sessions require an organization claim; customers are scoped by verified email instead.
  const claims = { ...(user.customClaims || {}), role };
  if (role === "customer") delete claims.orgId; else claims.orgId = orgId;
  await auth.setCustomUserClaims(user.uid, claims);
  await getFirestore(app).collection("users").doc(user.uid).set({
    email: user.email,
    displayName: user.displayName || email.split("@")[0],
    role,
    ...(role === "customer" ? {} : { orgId }),
    active: true,
    status: "active",
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`Assigned ${role} to ${email}. The user must sign in again to refresh their token.`);
}
