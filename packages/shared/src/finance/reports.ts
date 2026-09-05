import type { LedgerEntry } from "../schemas/finance.js";
import { ledgerOutstanding, moneyRound } from "./journal.js";

export function ageingBucket(dueDate: string, asOf: string) {
  const days = Math.floor(
    (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${dueDate}T00:00:00Z`)) /
      86_400_000,
  );
  if (days <= 0) return "current" as const;
  if (days <= 30) return "1-30" as const;
  if (days <= 60) return "31-60" as const;
  if (days <= 90) return "61-90" as const;
  return "90+" as const;
}

export function ageingSummary(entries: LedgerEntry[], asOf: string) {
  const result = { current: 0, "1-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  entries.forEach((entry) => {
    result[ageingBucket(entry.dueDate, asOf)] += ledgerOutstanding(entry);
  });
  Object.keys(result).forEach((key) => {
    result[key as keyof typeof result] = moneyRound(
      result[key as keyof typeof result],
    );
  });
  return result;
}

export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ].join("\n");
}
