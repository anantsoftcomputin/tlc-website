export class JourneyInputError extends Error {}
const months: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
type Part = {
  day: number;
  month: number;
  year?: number;
  index: number;
  end: number;
};
function iso(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new JourneyInputError(
      "That date does not exist. Please check the day and month.",
    );
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
/** Resolve named calendar dates, retaining explicit years and rolling Dec→Jan into the following year. */
export function journeyDates(
  message: string,
  now = new Date(),
): { startDate?: string; nights?: number } {
  const text = message.toLowerCase();
  const parts: Part[] = [];
  const patterns = [
    /\b(20\d{2})-(\d{2})-(\d{2})\b/g,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s*,?\s*(20\d{2}))?\b/g,
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember|t)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(20\d{2}))?\b/g,
  ];
  patterns.forEach((pattern, kind) => {
    for (const match of text.matchAll(pattern)) {
      const value: Part =
        kind === 0
          ? {
              year: Number(match[1]),
              month: Number(match[2]),
              day: Number(match[3]),
              index: match.index!,
              end: match.index! + match[0].length,
            }
          : kind === 1
            ? {
                day: Number(match[1]),
                month: months[match[2].slice(0, 3)],
                year: match[3] ? Number(match[3]) : undefined,
                index: match.index!,
                end: match.index! + match[0].length,
              }
            : {
                day: Number(match[2]),
                month: months[match[1].slice(0, 3)],
                year: match[3] ? Number(match[3]) : undefined,
                index: match.index!,
                end: match.index! + match[0].length,
              };
      if (!parts.some((p) => value.index < p.end && value.end > p.index))
        parts.push(value);
    }
  });
  parts.sort((a, b) => a.index - b.index);
  if (!parts.length) return {};
  const first = parts[0],
    second = parts[1];
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
  }).format(now);
  let year = first.year || Number(today.slice(0, 4));
  if (!first.year && second?.year)
    year = second.year - (second.month < first.month ? 1 : 0);
  let start = iso(year, first.month, first.day);
  if (!first.year && !second?.year && start < today) {
    year++;
    start = iso(year, first.month, first.day);
  }
  const result: { startDate: string; nights?: number } = { startDate: start };
  if (
    second &&
    /\b(to|till|until|through|return(?:ing)?(?:\s+on)?)\b|[–—-]/.test(
      text.slice(first.end, second.index),
    )
  ) {
    const endYear =
      second.year || (second.month < first.month ? year + 1 : year);
    const end = iso(endYear, second.month, second.day);
    const nights = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (nights < 1)
      throw new JourneyInputError(
        "Your return date must be after your departure date. Please confirm the two dates.",
      );
    if (nights > 30)
      throw new JourneyInputError(
        "The day-by-day planner supports up to 30 nights. Please choose a shorter stay or ask TLC to plan the longer trip.",
      );
    result.nights = nights;
  }
  return result;
}
