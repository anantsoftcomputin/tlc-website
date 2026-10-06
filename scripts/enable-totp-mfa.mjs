// Enables authenticator-app (TOTP) multi-factor sign-in for the Firebase project.
// Requires Firebase Authentication with Identity Platform (Console > Authentication > Settings > Upgrade).
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !privateKey)
  throw new Error("FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required.");
const app = getApps()[0] || initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey }) });
const manager = getAuth(app).projectConfigManager();
try {
  await manager.updateProjectConfig({
    multiFactorConfig: {
      state: "ENABLED",
      providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  });
} catch (error) {
  console.error("Could not enable TOTP. Upgrade the project to Firebase Authentication with Identity Platform first.");
  throw error;
}
const config = await manager.getProjectConfig();
console.log("Multi-factor configuration:", JSON.stringify(config.multiFactorConfig ?? {}, null, 2));
console.log("Owners, managers and admins will be asked to add an authenticator at their next sign-in.");
