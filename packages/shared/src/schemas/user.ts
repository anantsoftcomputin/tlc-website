import { z } from "zod";
import { auditFieldsSchema, documentIdSchema, orgIdSchema } from "./base.js";

export const canonicalUserRoles = ["owner", "manager", "sales", "accounts", "marketing", "readonly"] as const;
export const legacyUserRoles = ["super_admin", "admin", "content_editor", "travel_consultant"] as const;
export const userRoleSchema = z.enum([...canonicalUserRoles, ...legacyUserRoles]);

export const userSchema = z.object({
  uid: documentIdSchema,
  orgId: orgIdSchema,
  displayName: z.string().trim().min(2).max(120),
  email: z.email(),
  phone: z.string().trim().min(7).max(20).optional(),
  whatsappNumber: z.string().trim().min(7).max(20).optional(),
  role: userRoleSchema,
  active: z.boolean().default(true),
  targets: z.object({
    monthlyRevenue: z.number().nonnegative().default(0),
    monthlyGP: z.number().nonnegative().default(0),
  }).default({ monthlyRevenue: 0, monthlyGP: 0 }),
}).and(auditFieldsSchema);

export type UserRole = z.infer<typeof userRoleSchema>;
export type User = z.infer<typeof userSchema>;
