import { z } from "zod";
import { documentIdSchema, orgIdSchema } from "../schemas/base.js";

export const customerImportFields = ["name", "phone", "email", "city", "tags"] as const;
export type CustomerImportField = (typeof customerImportFields)[number];

export const customerImportMappingSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().optional(),
  city: z.string().optional(),
  tags: z.string().optional(),
});

export const customerImportPreviewSchema = z.object({
  orgId: orgIdSchema,
  fileName: z.string().trim().min(1).max(255),
  mapping: customerImportMappingSchema,
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))).min(1).max(5000),
  defaults: z.object({
    source: z.string().trim().min(1).default("customer-import"),
    ownerUid: documentIdSchema,
    consent: z.object({ whatsapp: z.boolean(), email: z.boolean(), sms: z.boolean() }),
  }),
});

export const customerImportCommitSchema = z.object({
  importId: documentIdSchema,
  decisions: z.array(z.object({
    rowNumber: z.number().int().positive(),
    action: z.enum(["create", "merge", "skip"]),
    customerId: documentIdSchema.optional(),
  }).superRefine((decision, context) => {
    if (decision.action === "merge" && !decision.customerId) context.addIssue({ code: "custom", path: ["customerId"], message: "Merge requires a customer ID." });
  })).min(1).max(5000),
});

export type ImportCell = string | number | boolean | null;
export type ImportSourceRow = Record<string, ImportCell>;
export type CustomerImportMapping = z.infer<typeof customerImportMappingSchema>;

export type NormalizedCustomerImportRow = {
  rowNumber: number;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  tags: string[];
  errors: string[];
};

export type DedupCustomer = { id: string; name: string; phones: string[]; emails: string[]; city?: string };
export type DuplicateCandidate = { customerId: string; score: number; reasoning: string[] };

function stringCell(row: ImportSourceRow, header?: string) {
  if (!header) return "";
  const value = row[header];
  return value === null || value === undefined ? "" : String(value).trim();
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export function normalizeCustomerImportRow(row: ImportSourceRow, mapping: CustomerImportMapping, rowNumber: number): NormalizedCustomerImportRow {
  const name = stringCell(row, mapping.name).replace(/\s+/g, " ");
  const phone = normalizePhone(stringCell(row, mapping.phone));
  const emailValue = stringCell(row, mapping.email).toLowerCase();
  const cityValue = stringCell(row, mapping.city).replace(/\s+/g, " ");
  const tags = stringCell(row, mapping.tags).split(/[,;|]/).map((tag) => tag.trim().toLowerCase()).filter(Boolean);
  const errors: string[] = [];
  if (name.length < 2) errors.push("Name is required.");
  if (phone.length < 10 || phone.length > 15) errors.push("Phone must contain 10–15 digits.");
  if (emailValue && !z.email().safeParse(emailValue).success) errors.push("Email is invalid.");
  return { rowNumber, name, phone, ...(emailValue ? { email: emailValue } : {}), ...(cityValue ? { city: cityValue } : {}), tags: [...new Set(tags)], errors };
}

function normalizeName(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function bigrams(value: string) {
  const normalized = ` ${normalizeName(value)} `;
  return Array.from({ length: Math.max(0, normalized.length - 1) }, (_, index) => normalized.slice(index, index + 2));
}

export function nameSimilarity(left: string, right: string) {
  const a = bigrams(left); const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  const remaining = [...b]; let matches = 0;
  for (const gram of a) { const index = remaining.indexOf(gram); if (index >= 0) { matches += 1; remaining.splice(index, 1); } }
  return (2 * matches) / (a.length + b.length);
}

export function scoreDuplicate(row: NormalizedCustomerImportRow, customer: DedupCustomer): DuplicateCandidate | null {
  const reasoning: string[] = []; let score = 0;
  if (customer.phones.map(normalizePhone).includes(row.phone)) { score = 100; reasoning.push("Exact phone match"); }
  if (row.email && customer.emails.map((email) => email.toLowerCase()).includes(row.email)) { score = Math.max(score, 96); reasoning.push("Exact email match"); }
  const similarity = nameSimilarity(row.name, customer.name);
  if (similarity >= 0.72) { score = Math.max(score, Math.round(similarity * 82)); reasoning.push(`Similar name (${Math.round(similarity * 100)}%)`); }
  if (row.city && customer.city && row.city.toLowerCase() === customer.city.toLowerCase()) { score = Math.min(100, score + 6); reasoning.push("Same city"); }
  return score >= 65 ? { customerId: customer.id, score, reasoning } : null;
}

export function findDuplicateCandidates(row: NormalizedCustomerImportRow, customers: readonly DedupCustomer[]) {
  return customers.map((customer) => scoreDuplicate(row, customer)).filter((candidate): candidate is DuplicateCandidate => Boolean(candidate)).sort((left, right) => right.score - left.score).slice(0, 3);
}

export type CustomerImportPreviewInput = z.infer<typeof customerImportPreviewSchema>;
export type CustomerImportCommitInput = z.infer<typeof customerImportCommitSchema>;
