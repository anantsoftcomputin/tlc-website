export function loginError(error: unknown): string {
  const code = (error as { code?: string })?.code;
  const messages: Record<string, string> = {
    "auth/invalid-credential":
      "The email or password is incorrect. Try Google sign-in or use Forgot password.",
    "auth/wrong-password":
      "The email or password is incorrect. Use Forgot password to reset it.",
    "auth/user-not-found":
      "The email or password is incorrect. Check your details or create a client account.",
    "auth/email-already-in-use":
      "An account already uses this email. Sign in or use Forgot password.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password":
      "Choose a stronger password with at least 12 characters.",
    "auth/user-disabled": "This account is disabled. Contact TLC for access.",
    "auth/popup-closed-by-user":
      "Google sign-in was cancelled. Please try again.",
    "auth/cancelled-popup-request":
      "Please complete the Google sign-in window already open.",
    "auth/popup-blocked":
      "Your browser blocked the Google window. Allow pop-ups for this site and try again.",
    "auth/unauthorized-domain":
      "Sign-in is not enabled for this website address. Contact TLC.",
    "auth/operation-not-allowed":
      "This sign-in method is unavailable. Try another method or contact TLC.",
    "auth/unsupported-first-factor":
      "Use Google or email sign-in to continue with your authenticator.",
    "auth/account-exists-with-different-credential":
      "This email uses another sign-in method. Use that method first to access your existing account.",
    "auth/invalid-phone-number":
      "Enter a valid phone number with country code, for example +91 98765 43210.",
    "auth/invalid-verification-code":
      "That verification code is incorrect. Check the SMS and try again.",
    "auth/code-expired": "That code expired. Request a new code.",
    "auth/session-expired": "That code expired. Request a new code.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a while before trying again.",
    "auth/quota-exceeded":
      "SMS sign-in is temporarily unavailable. Please use Google or email sign-in.",
    "auth/captcha-check-failed":
      "The security check failed. Please try requesting the code again.",
    "auth/network-request-failed":
      "Could not connect to sign-in. Check your connection and try again.",
  };
  return (
    (code && messages[code]) ||
    (error instanceof Error && !code
      ? error.message
      : "Sign-in could not be completed. Please try again.")
  );
}
export function internationalPhone(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d\s().-]+$/.test(trimmed))
    throw new Error("Enter a valid phone number with country code.");
  const digits = trimmed.replace(/\D/g, "");
  const phone =
    /^\d{10}$/.test(digits) && !trimmed.startsWith("+")
      ? `+91${digits}`
      : trimmed.startsWith("+")
        ? `+${digits}`
        : "";
  if (!/^\+[1-9]\d{7,14}$/.test(phone))
    throw new Error(
      "Enter your phone number with country code, for example +91 98765 43210.",
    );
  return phone;
}
