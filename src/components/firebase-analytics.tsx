"use client";

import { useEffect } from "react";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getFirebaseApp, isFirebaseConfigured } from "@/lib/firebase/client";

export function FirebaseAnalytics() {
  useEffect(() => {
    if (!isFirebaseConfigured || !process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) return;
    void isSupported().then((supported) => {
      if (supported) getAnalytics(getFirebaseApp());
    });
  }, []);
  return null;
}
