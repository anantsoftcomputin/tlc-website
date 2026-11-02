"use client";
import {
  createUserWithEmailAndPassword,
  getMultiFactorResolver,
  multiFactor,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  TotpMultiFactorGenerator,
  GoogleAuthProvider,
  signInWithPopup,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";
import { ArrowRight, LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";
import { internationalPhone, loginError } from "@/lib/auth/login-errors";

export function AdminLoginForm({ returnTo }: { returnTo?: string } = {}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [mode, setMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult>();
  const [resolver, setResolver] = useState<MultiFactorResolver>();
  const [secret, setSecret] = useState<TotpSecret>();
  const captcha = useRef<RecaptchaVerifier | undefined>(undefined);
  useEffect(
    () => () => {
      captcha.current?.clear();
      captcha.current = undefined;
    },
    [],
  );
  function handleError(caught: unknown) {
    if (
      (caught as { code?: string })?.code === "auth/multi-factor-auth-required"
    ) {
      setResolver(
        getMultiFactorResolver(getFirebaseAuth(), caught as MultiFactorError),
      );
      setCode("");
    } else setError(loginError(caught));
  }
  async function openSession(user: User) {
    await user.reload();
    const response = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: await user.getIdToken(true) }),
    });
    const payload = await response.json();
    if (payload.code === "verify-email") {
      if (user.email) await sendEmailVerification(user);
      setNotice(
        "Check your email for a verification link, then sign in again.",
      );
      return;
    }
    if (payload.code === "use-email-for-mfa") {
      await signOut(getFirebaseAuth());
      setConfirmation(undefined);
      setMode("email");
      throw new Error(payload.error);
    }
    if (payload.code === "enroll-mfa") {
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        setNotice(
          "Verify your email, then sign in again to set up your authenticator.",
        );
        return;
      }
      try {
        setSecret(
          await TotpMultiFactorGenerator.generateSecret(
            await multiFactor(user).getSession(),
          ),
        );
        setCode("");
      } catch {
        await signOut(getFirebaseAuth());
        throw new Error(
          "Your management account needs an authenticator, but setup is unavailable. Contact TLC to enable authenticator sign-in.",
        );
      }
      return;
    }
    if (!response.ok) throw new Error(payload.error || "Unable to sign in.");
    router.replace(
      returnTo && payload.role === "customer" ? returnTo : payload.redirect,
    );
    router.refresh();
  }
  async function googleSignIn() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await openSession(
        (await signInWithPopup(getFirebaseAuth(), provider)).user,
      );
    } catch (caught) {
      handleError(caught);
    } finally {
      setLoading(false);
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      if (!isFirebaseConfigured)
        throw new Error("Sign-in is not configured yet. Please contact TLC.");
      const auth = getFirebaseAuth();
      if (secret && auth.currentUser) {
        await multiFactor(auth.currentUser).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
          "TLC authenticator",
        );
        setSecret(undefined);
        setCode("");
        await signOut(auth);
        setNotice("Authenticator added. Sign in again to verify it.");
        return;
      }
      if (resolver) {
        const hint = resolver.hints.find(
          (item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        );
        if (!hint)
          throw new Error(
            "Ask your administrator to enable an authenticator for this account.",
          );
        const credential = await resolver.resolveSignIn(
          TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
        );
        await openSession(credential.user);
        return;
      }
      if (mode === "phone") {
        if (confirmation) {
          await openSession((await confirmation.confirm(code)).user);
          return;
        }
        const number = internationalPhone(phone);
        captcha.current?.clear();
        captcha.current = new RecaptchaVerifier(auth, "login-recaptcha", {
          size: "invisible",
        });
        try {
          setConfirmation(
            await signInWithPhoneNumber(auth, number, captcha.current),
          );
          setPhone(number);
          setCode("");
          setNotice("Enter the six-digit code sent by SMS.");
        } catch (caught) {
          captcha.current?.clear();
          captcha.current = undefined;
          throw caught;
        }
        return;
      }
      const credential = register
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      await openSession(credential.user);
    } catch (caught) {
      handleError(caught);
    } finally {
      setLoading(false);
    }
  }
  async function resetPassword() {
    if (!email) {
      setError("Enter your email address first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
      setNotice(
        "If this account exists, a password reset link will arrive shortly.",
      );
    } catch {
      setNotice(
        "If this account exists, a password reset link will arrive shortly.",
      );
    } finally {
      setLoading(false);
    }
  }
  function changeMethod(next: "email" | "phone") {
    setMode(next);
    setRegister(false);
    setConfirmation(undefined);
    setCode("");
    setError("");
    setNotice("");
    captcha.current?.clear();
    captcha.current = undefined;
  }
  return (
    <form className="admin-login-form" onSubmit={submit}>
      <span className="admin-login-icon">
        <LockKeyhole />
      </span>
      <p className="eyebrow">Your TLC account</p>
      <h1>
        {secret
          ? "Protect your account."
          : resolver
            ? "One more step."
            : register
              ? "Your next chapter."
              : "Welcome back."}
      </h1>
      <p>
        {secret
          ? "Add this setup key to your authenticator app, then enter its six-digit code."
          : resolver
            ? "Enter the code from your authenticator."
            : register
              ? "Create a client account with the email you use for TLC bookings."
              : "Sign in to your personal travel or team dashboard."}
      </p>
      {!resolver && !secret && (
        <>
          <button
            type="button"
            className="button auth-provider"
            onClick={googleSignIn}
            disabled={loading}
          >
            Continue with Google
          </button>
          <div
            className="auth-methods"
            role="group"
            aria-label="Sign-in method"
          >
            <button
              type="button"
              aria-pressed={mode === "email"}
              onClick={() => changeMethod("email")}
              disabled={loading}
            >
              Email & password
            </button>
            <button
              type="button"
              aria-pressed={mode === "phone"}
              onClick={() => changeMethod("phone")}
              disabled={loading}
            >
              Phone & OTP
            </button>
          </div>
        </>
      )}
      {secret && (
        <>
          <code className="auth-secret">{secret.secretKey}</code>
          <a
            className="auth-secret-link"
            href={secret.generateQrCodeUrl(
              email || getFirebaseAuth().currentUser?.email || "TLC account",
              "TLC Holidays",
            )}
          >
            Open in an authenticator app on this device
          </a>
        </>
      )}
      {resolver || secret ? (
        <label>
          <span>Authenticator code</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            pattern="[0-9]{6}"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      ) : mode === "phone" ? (
        <>
          <label>
            <span>Phone number</span>
            <input
              type="tel"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              required
              disabled={Boolean(confirmation)}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          {confirmation && (
            <label>
              <span>SMS verification code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          <small>
            By requesting a code, you agree to receive a sign-in SMS. Google
            processes your number for verification and abuse prevention.
            Standard message rates may apply.
          </small>
          {confirmation && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setConfirmation(undefined);
                setCode("");
                setNotice("");
              }}
            >
              Change number or request a new code
            </button>
          )}
        </>
      ) : (
        <>
          <label>
            <span>Email address</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              autoComplete={register ? "new-password" : "current-password"}
              required
              minLength={register ? 12 : 6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </>
      )}
      <div id="login-recaptcha" />
      {error && (
        <div className="admin-login-error" role="alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      <button className="button button-gold" disabled={loading}>
        {loading ? <LoaderCircle className="spin" /> : <ArrowRight />}
        {secret || resolver
          ? "Verify code"
          : mode === "phone"
            ? confirmation
              ? "Verify & sign in"
              : "Send verification code"
            : register
              ? "Create client account"
              : "Sign in"}
      </button>
      {!resolver && !secret && mode === "email" && (
        <div className="auth-options">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setRegister(!register);
              setError("");
            }}
          >
            {register
              ? "Already have an account? Sign in"
              : "New client? Create an account"}
          </button>
          <button type="button" disabled={loading} onClick={resetPassword}>
            Forgot password?
          </button>
        </div>
      )}
    </form>
  );
}
