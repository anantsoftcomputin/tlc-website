import {
  onCall as firebaseOnCall,
  HttpsError,
  type CallableRequest,
  type CallableOptions,
} from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { isManagerRole } from "@tlc/shared";
// Every callable uses the same application-attestation and staff-session boundary.
export const onCall: typeof firebaseOnCall = ((
  optionsOrHandler:
    | CallableOptions
    | ((request: CallableRequest, response?: unknown) => unknown),
  handler?: (request: CallableRequest, response?: unknown) => unknown,
) => {
  const options =
    typeof optionsOrHandler === "function" ? {} : optionsOrHandler;
  const run =
    typeof optionsOrHandler === "function" ? optionsOrHandler : handler!;
  return firebaseOnCall(
    {
      ...options,
      // Matches the web policy: explicit APP_CHECK_ENFORCEMENT=off is the only opt-out.
      enforceAppCheck:
        process.env.FUNCTIONS_EMULATOR !== "true" &&
        process.env.APP_CHECK_ENFORCEMENT?.trim().toLowerCase() !== "off",
    },
    async (request, response) => {
      if (request.auth) {
        const user = await getFirestore()
          .collection("users")
          .doc(request.auth.uid)
          .get();
        if (user.data()?.active === false || user.data()?.disabled === true)
          throw new HttpsError(
            "permission-denied",
            "This account is disabled.",
          );
        if (
          user.exists &&
          ((user.data()?.role &&
            user.data()?.role !== request.auth.token.role) ||
            (user.data()?.orgId &&
              user.data()?.orgId !== request.auth.token.orgId))
        )
          throw new HttpsError(
            "permission-denied",
            "Your access changed. Please sign in again.",
          );
        if (
          process.env.FUNCTIONS_EMULATOR !== "true" &&
          isManagerRole(String(request.auth.token.role)) &&
          !request.auth.token.firebase?.sign_in_second_factor
        )
          throw new HttpsError(
            "permission-denied",
            "Management actions require multi-factor sign-in.",
          );
      }
      return run(request, response);
    },
  );
}) as typeof firebaseOnCall;
