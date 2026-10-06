/**
 * App Check enforcement for public endpoints.
 *
 * - APP_CHECK_ENFORCEMENT=required: always verify tokens.
 * - APP_CHECK_ENFORCEMENT=off: never verify (explicit opt-out, e.g. a staging site).
 * - unset: verify in production whenever a site key is configured.
 *
 * Production builds refuse to start without a site key unless enforcement is
 * explicitly off (see assertAppCheckDeployConfig in next.config.ts), so a
 * missing key can no longer silently reject every visitor.
 */
export type AppCheckMode = "enforce" | "off";

export function appCheckMode(env: Record<string, string | undefined> = process.env): AppCheckMode {
  const setting = env.APP_CHECK_ENFORCEMENT?.trim().toLowerCase();
  if (setting === "off") return "off";
  if (setting === "required") return "enforce";
  if (env.FIREBASE_AUTH_EMULATOR_HOST || env.NODE_ENV !== "production") return "off";
  return env.NEXT_PUBLIC_APP_CHECK_SITE_KEY ? "enforce" : "off";
}

export function appCheckDeployProblem(env: Record<string, string | undefined> = process.env) {
  const production = env.CONTEXT === "production" || env.TLC_DEPLOY_ENV === "production";
  const setting = env.APP_CHECK_ENFORCEMENT?.trim().toLowerCase();
  if (setting && !["off", "required"].includes(setting))
    return `APP_CHECK_ENFORCEMENT must be "required" or "off", not "${setting}".`;
  if (setting === "required" && !env.NEXT_PUBLIC_APP_CHECK_SITE_KEY)
    return "APP_CHECK_ENFORCEMENT=required but NEXT_PUBLIC_APP_CHECK_SITE_KEY is empty, so every public request would be rejected.";
  if (production && setting !== "off" && !env.NEXT_PUBLIC_APP_CHECK_SITE_KEY)
    return "Production deploys need NEXT_PUBLIC_APP_CHECK_SITE_KEY. Set it, or set APP_CHECK_ENFORCEMENT=off here and in Functions to deploy without App Check.";
  return null;
}
