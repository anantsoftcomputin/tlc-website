import { organizationSchema, userSchema } from "@tlc/shared";

export const initialOrgId = "tlc-vacations";

export function buildBootstrapDocuments(input: {
  actorUid: string;
  email: string;
  displayName: string;
  now: string;
}) {
  const audit = {
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.actorUid,
    updatedBy: input.actorUid,
  };

  const organization = organizationSchema.parse({
    id: initialOrgId,
    name: "TLC Vacations LLP",
    branding: { primaryColor: "#0B2545", accentColor: "#F4A261" },
    settings: {
      currency: "INR",
      timezone: "Asia/Kolkata",
      marginThresholds: { warningPct: 12, minimumPct: 8 },
      discountLimits: { salesPct: 3, managerPct: 8 },
      automation: {},
    },
    active: true,
    ownerUid: input.actorUid,
    ...audit,
  });

  const user = userSchema.parse({
    uid: input.actorUid,
    orgId: initialOrgId,
    displayName: input.displayName,
    email: input.email,
    role: "owner",
    active: true,
    ...audit,
  });

  return { organization, user };
}
