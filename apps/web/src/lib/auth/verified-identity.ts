type Identity = {
  uid?: string;
  role?: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  phoneVerified?: boolean;
  orgId?: string;
};
export function verifiedEmail(user: Identity) {
  return user.emailVerified && user.email
    ? user.email.trim().toLowerCase()
    : undefined;
}
export function verifiedPhone(user: Identity) {
  return user.phoneVerified && /^\+[1-9]\d{7,14}$/.test(user.phoneNumber || "")
    ? user.phoneNumber
    : undefined;
}
export function isVerifiedClient(user: Identity | null | undefined) {
  return Boolean(
    user?.uid &&
    user.role === "customer" &&
    user.orgId &&
    (verifiedEmail(user) || verifiedPhone(user)),
  );
}
export function customerContactMatches(
  user: Identity,
  customer: {
    emails?: string[];
    phones?: string[];
    verifiedClientUid?: string;
  },
) {
  if (customer.verifiedClientUid && customer.verifiedClientUid !== user.uid)
    return false;
  const email = verifiedEmail(user),
    phone = verifiedPhone(user);
  return Boolean(
    (email &&
      customer.emails?.some((value) => value.toLowerCase() === email)) ||
    (phone &&
      customer.phones?.some(
        (value) => `+${value.replace(/\D/g, "")}` === phone,
      )),
  );
}
export function personalizationIdentityMatches(
  user: Identity,
  customer: {
    verifiedClientUid?: string;
    verifiedEmail?: string;
    verifiedPhone?: string;
  },
) {
  return Boolean(
    user.uid &&
    customer.verifiedClientUid === user.uid &&
    Boolean(
      (verifiedEmail(user) && customer.verifiedEmail === verifiedEmail(user)) ||
      (verifiedPhone(user) && customer.verifiedPhone === verifiedPhone(user)),
    ),
  );
}
export function hasVerifiedTokenIdentity(token: {
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  firebase?: {
    sign_in_provider?: string;
    identities?: Record<string, unknown>;
  };
}) {
  return Boolean(
    (token.email && token.email_verified) ||
    (token.phone_number &&
      /^\+[1-9]\d{7,14}$/.test(token.phone_number) &&
      (token.firebase?.sign_in_provider === "phone" ||
        (Array.isArray(token.firebase?.identities?.phone) &&
          token.firebase.identities.phone.includes(token.phone_number)))),
  );
}
