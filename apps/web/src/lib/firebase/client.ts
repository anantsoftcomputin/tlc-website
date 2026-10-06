import { initializeAppCheck, ReCaptchaV3Provider, getToken, type AppCheck } from "firebase/app-check";
import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";
import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

export const isFirebaseConfigured = Object.entries(firebaseConfig)
  .filter(([key]) => key !== "measurementId")
  .every(([, value]) => Boolean(value));

export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured) throw new Error("Firebase web configuration is incomplete.");
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY && !appCheck) appCheck = initializeAppCheck(app, { provider: new ReCaptchaV3Provider(process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  return app;
}

const connected = new WeakSet<object>();
const local = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";
export function getFirebaseAuth(): Auth { const auth = getAuth(getFirebaseApp()); if (local && !connected.has(auth)) { connectAuthEmulator(auth, "http://127.0.0.1:9099", {disableWarnings: true}); connected.add(auth); } return auth; }
export function getFirebaseFirestore(): Firestore { const db = getFirestore(getFirebaseApp()); if (local && !connected.has(db)) { connectFirestoreEmulator(db, "127.0.0.1", 8080); connected.add(db); } return db; }
export function getFirebaseStorage(): FirebaseStorage { const storage = getStorage(getFirebaseApp()); if (local && !connected.has(storage)) { connectStorageEmulator(storage, "127.0.0.1", 9199); connected.add(storage); } return storage; }

let functionsConnected = false;
export function getFirebaseFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp(), "asia-south1");
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && !functionsConnected) { connectFunctionsEmulator(functions, "127.0.0.1", 5001); functionsConnected = true; }
  return functions;
}

let appCheck: AppCheck | undefined;
export async function publicRequestHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY) {
    getFirebaseApp();
    // A blocked reCAPTCHA must not crash the form; the server returns a clear retry message.
    try { headers["X-Firebase-AppCheck"] = (await getToken(appCheck!, false)).token; } catch { /* sent without attestation */ }
  }
  return headers;
}
