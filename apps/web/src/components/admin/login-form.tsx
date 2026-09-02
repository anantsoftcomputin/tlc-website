"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      if (!isFirebaseConfigured) throw new Error("Firebase web authentication is not configured.");
      const auth = getFirebaseAuth();
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken(true);
      const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Unable to start an admin session.");
      router.replace("/admin"); router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  return <form className="admin-login-form" onSubmit={submit}>
    <span className="admin-login-icon"><LockKeyhole/></span>
    <p className="eyebrow">Secure workspace</p><h1>Welcome back.</h1><p>Sign in with an authorised TLC team account.</p>
    <label><span>Email address</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label><span>Password</span><input type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    {error && <div className="admin-login-error" role="alert">{error}</div>}
    <button className="button button-gold" disabled={loading}>{loading ? <><LoaderCircle className="spin"/> Verifying</> : <>Enter workspace <ArrowRight/></>}</button>
  </form>;
}
