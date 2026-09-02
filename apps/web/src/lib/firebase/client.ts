import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
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
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export const getFirebaseAuth = (): Auth => getAuth(getFirebaseApp());
export const getFirebaseFirestore = (): Firestore => getFirestore(getFirebaseApp());
export const getFirebaseStorage = (): FirebaseStorage => getStorage(getFirebaseApp());
let functionsConnected = false;
export function getFirebaseFunctions(): Functions {
  const functions = getFunctions(getFirebaseApp(), "asia-south1");
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" && !functionsConnected) { connectFunctionsEmulator(functions, "127.0.0.1", 5001); functionsConnected = true; }
  return functions;
}
