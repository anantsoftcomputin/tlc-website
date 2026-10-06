"use client";
import { createUserWithEmailAndPassword, getMultiFactorResolver, multiFactor, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, TotpMultiFactorGenerator, type MultiFactorError, type MultiFactorResolver, type TotpSecret, type User } from "firebase/auth";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false); const [code, setCode] = useState("");
  const [resolver, setResolver] = useState<MultiFactorResolver>(); const [secret, setSecret] = useState<TotpSecret>();
  async function openSession(user: User) {
    await user.reload();
    const response = await fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await user.getIdToken(true) }) });
    const payload = await response.json();
    if (payload.code === "verify-email") { await sendEmailVerification(user); setNotice("Check your email for a verification link, then sign in again."); return; }
    if (payload.code === "enroll-mfa") {
      if (!user.emailVerified) { await sendEmailVerification(user); setNotice("Verify your email, then sign in again to set up your authenticator."); return; }
      try { setSecret(await TotpMultiFactorGenerator.generateSecret(await multiFactor(user).getSession())); }
      catch (caught) {
        const code = (caught as { code?: string }).code || "";
        if (["auth/operation-not-allowed", "auth/admin-restricted-operation", "auth/unsupported-first-factor"].includes(code) || code.includes("totp")) {
          await signOut(getFirebaseAuth());
          throw new Error("Authenticator sign-in is not enabled for TLC yet. Ask the owner to run the MFA setup (pnpm admin:enable-mfa), then sign in again.");
        }
        throw caught;
      }
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
    router.replace(payload.redirect); router.refresh();
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setLoading(true);
    try {
      if (!isFirebaseConfigured) throw new Error("Sign-in is not configured yet. Please contact TLC.");
      const auth = getFirebaseAuth();
      if (secret && auth.currentUser) {
        await multiFactor(auth.currentUser).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), "TLC authenticator");
        setSecret(undefined); setCode(""); await signOut(auth); setNotice("Authenticator added. Sign in again to verify it."); return;
      }
      if (resolver) {
        const hint = resolver.hints.find(item => item.factorId === TotpMultiFactorGenerator.FACTOR_ID);
        if (!hint) throw new Error("Ask your administrator to enable an authenticator for this account.");
        const credential = await resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code));
        await openSession(credential.user); return;
      }
      const credential = register ? await createUserWithEmailAndPassword(auth, email, password) : await signInWithEmailAndPassword(auth, email, password);
      await openSession(credential.user);
    } catch (caught) {
      if ((caught as {code?: string}).code === "auth/multi-factor-auth-required") setResolver(getMultiFactorResolver(getFirebaseAuth(), caught as MultiFactorError));
      else setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally { setLoading(false); }
  }
  async function resetPassword() {
    if (!email) { setError("Enter your email address first."); return; }
    try { await sendPasswordResetEmail(getFirebaseAuth(), email); setNotice("If this account exists, a password reset link will arrive shortly."); } catch { setNotice("If this account exists, a password reset link will arrive shortly."); }
  }
  return <form className="admin-login-form" onSubmit={submit}>
    <span className="admin-login-icon"><LockKeyhole/></span><p className="eyebrow">Your TLC account</p>
    <h1>{secret ? "Protect your account." : resolver ? "One more step." : register ? "Your next chapter." : "Welcome back."}</h1>
    <p>{secret ? "Add this setup key to your authenticator app, then enter its six-digit code." : resolver ? "Enter the code from your authenticator." : register ? "Create a client account with the email you use for TLC bookings." : "Sign in to your personal travel or team dashboard."}</p>
    {secret && <><code className="auth-secret">{secret.secretKey}</code><a className="auth-secret-link" href={secret.generateQrCodeUrl(email || getFirebaseAuth().currentUser?.email || "TLC account", "TLC Holidays")}>Open in an authenticator app on this device</a></>}
    {resolver || secret ? <label><span>Authenticator code</span><input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" value={code} onChange={e=>setCode(e.target.value)}/></label> : <>
    <label><span>Email address</span><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label><span>Password</span><input type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 12 : 6} value={password} onChange={e=>setPassword(e.target.value)}/></label></>}
    {error && <div className="admin-login-error" role="alert">{error}</div>}{notice && <p role="status">{notice}</p>}
    <button className="button button-gold" disabled={loading}>{loading ? <LoaderCircle className="spin"/> : <ArrowRight/>}{secret || resolver ? "Verify code" : register ? "Create client account" : "Sign in"}</button>
    {!resolver && !secret && <div className="auth-options"><button type="button" onClick={()=>{setRegister(!register);setError("");}}>{register ? "Already have an account? Sign in" : "New client? Create an account"}</button><button type="button" onClick={resetPassword}>Forgot password?</button></div>}
  </form>;
}
