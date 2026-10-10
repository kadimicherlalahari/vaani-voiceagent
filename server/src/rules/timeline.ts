// Turns what a caller said about their deadline ("by March", "before Diwali", "in 3 weeks",
// "no rush") into weeks from the call date. Deliberately conservative: anything it can't read
// returns null and the criterion becomes "unclear" rather than guessing.

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// Festival deadlines callers use in Pune. Extend yearly.
const FESTIVALS: Record<string, string[]> = {
  diwali: ["2026-11-08", "2027-10-29", "2028-10-17"],
  dussehra: ["2026-10-20", "2027-10-09"],
  "ganesh chaturthi": ["2027-09-04", "2028-08-23"],
  "gudi padwa": ["2027-04-07", "2028-03-27"],
  christmas: ["2026-12-25", "2027-12-25"],
  "new year": ["2027-01-01", "2028-01-01"],
};

export type Timeline = { weeks: number | null; open: boolean };

const WEEK_MS = 7 * 24 * 3600 * 1000;
const weeksBetween = (from: Date, to: Date) => Math.round(((to.getTime() - from.getTime()) / WEEK_MS) * 10) / 10;

export function parseTimeline(text: string | null | undefined, ref: Date): Timeline {
  if (!text) return { weeks: null, open: false };
  const t = text.toLowerCase();

  if (/\b(no rush|flexible|no (specific )?deadline|whenever|no hurry|not in a rush|plenty of time)\b/.test(t)) {
    // "by March, no rush" still has a month — fall through so the month wins
    if (!MONTHS.some((m) => new RegExp(`\\b${m}`).test(t))) return { weeks: null, open: true };
  }

  const num = (s: string) => {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12 };
    return /^\d+(\.\d+)?$/.test(s) ? Number(s) : words[s];
  };
  const rel = t.match(/\b(\d+(?:\.\d+)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)(?:\s*(?:-|to)\s*(\d+))?\s*(day|week|month)s?\b/);
  if (rel) {
    const n = num(rel[2] ?? rel[1]) ?? num(rel[1]); // use the upper end of a range: "3-4 months" → 4
    if (n != null) {
      const unit = rel[3];
      const weeks = unit === "day" ? n / 7 : unit === "week" ? n : n * 4.33;
      return { weeks: Math.round(weeks * 10) / 10, open: false };
    }
  }
  // A stated duration ("in 3 weeks") beats a festival name in the same sentence.
  for (const [name, dates] of Object.entries(FESTIVALS)) {
    if (t.includes(name)) {
      const next = dates.map((d) => new Date(d + "T00:00:00+05:30")).find((d) => d > ref);
      if (next) return { weeks: weeksBetween(ref, next), open: false };
    }
  }

  if (/\bnext month\b/.test(t)) return { weeks: 6, open: false };
  if (/\b(asap|as soon as possible|immediately|urgent|right away)\b/.test(t)) return { weeks: null, open: false };

  // Explicit ISO date
  const iso = t.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
  if (iso) return { weeks: weeksBetween(ref, new Date(`${iso[0]}T00:00:00+05:30`)), open: false };

  // Month name (optionally with year): deadline = end of that month
  const m = t.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(?:of\s+)?(?:next year|(20\d\d)))?/);
  if (m) {
    const month = MONTHS.indexOf(m[1]);
    let year = m[2] ? Number(m[2]) : ref.getFullYear();
    if (!m[2] && (month < ref.getMonth() || /next year/.test(m[0]))) year += 1;
    const end = new Date(Date.UTC(year, month + 1, 0, 18, 30)); // last day of month, IST midnight
    return { weeks: weeksBetween(ref, end), open: false };
  }
  return { weeks: null, open: false };
}
