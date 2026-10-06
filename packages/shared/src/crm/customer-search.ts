/** Normalized, prefix-searchable terms for whole-directory customer search. */
export const customerSearchVersion = 1;
const maxPrefix = 24;

const words = (value: unknown) =>
  String(value ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/)
    .map((word) => word.replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((word) => word.length >= 2);

const prefixes = (word: string, min = 2) => {
  const out: string[] = [];
  for (let length = min; length <= Math.min(word.length, maxPrefix); length += 1) out.push(word.slice(0, length));
  return out;
};

export function customerSearchTerms(customer: {
  name?: unknown;
  city?: unknown;
  emails?: unknown;
  phones?: unknown;
  tags?: unknown;
}) {
  const terms = new Set<string>();
  const list = (value: unknown) => (Array.isArray(value) ? value : []);
  for (const value of [customer.name, customer.city, ...list(customer.tags)])
    for (const word of words(value)) prefixes(word).forEach((term) => terms.add(term));
  for (const email of list(customer.emails)) {
    const address = String(email).trim().toLowerCase();
    if (!address) continue;
    terms.add(address);
    prefixes(address.split("@")[0]).forEach((term) => terms.add(term));
  }
  for (const phone of list(customer.phones)) {
    const digits = String(phone).replace(/\D/g, "");
    if (digits.length < 3) continue;
    prefixes(digits, 3).forEach((term) => terms.add(term));
    const national = digits.slice(-10);
    if (national !== digits) prefixes(national, 3).forEach((term) => terms.add(term));
  }
  return [...terms].sort();
}

/** Picks the most selective indexed term for a query plus the words to verify in memory. */
export function customerSearchQuery(input: string) {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  if (/^[+\d\s()-]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, "");
    return digits.length >= 3 ? { term: digits.slice(0, maxPrefix), words: [digits] } : null;
  }
  if (raw.includes("@")) return { term: raw, words: [raw] };
  const tokens = words(raw);
  if (!tokens.length) return null;
  const term = [...tokens].sort((a, b) => b.length - a.length)[0].slice(0, maxPrefix);
  return { term, words: tokens };
}
