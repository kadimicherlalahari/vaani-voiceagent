// INTERNAL ONLY. pricing.md: "No number from this guide should be quoted to a client."
// These floors are never sent to the voice agent or the caller. They are used only to detect
// the case qualified.md calls out: a caller *volunteers* a budget that is clearly below what
// any project of their described scope would cost (e.g. ₹1–1.5 lakh for kitchen + bedroom, T10).

const RESIDENTIAL_FLOOR_PER_SQFT = 1800; // lowest residential tier
const COMMERCIAL_FLOOR_PER_SQFT = 1200; // lowest commercial tier
const ROOM_FLOOR = 350_000; // single room redesign lower bound
// Only flag when the volunteered budget is well under the floor — the designer handles
// anything near the line at consultation.
const CLEARLY_BELOW_RATIO = 0.6;

export type BudgetFit = "aligned" | "clearly_below" | "unknown";

export function checkBudgetFit(input: {
  budgetInr: number | null | undefined;
  category: "residential" | "commercial" | string | null | undefined;
  scopeSize?: "full_home" | "partial" | "single_room" | "office" | string | null;
  carpetSqft?: number | null;
  rooms?: number | null;
}): BudgetFit {
  const { budgetInr, category, scopeSize, carpetSqft, rooms } = input;
  if (!budgetInr || budgetInr <= 0) return "unknown";

  let floor: number | null = null;
  if (category === "commercial" && carpetSqft) floor = carpetSqft * COMMERCIAL_FLOOR_PER_SQFT;
  else if (category === "residential") {
    if ((scopeSize === "single_room" || scopeSize === "partial") && rooms) floor = rooms * ROOM_FLOOR;
    else if (scopeSize === "single_room") floor = ROOM_FLOOR;
    else if (carpetSqft) floor = carpetSqft * RESIDENTIAL_FLOOR_PER_SQFT;
    else if (rooms) floor = rooms * ROOM_FLOOR;
  }
  if (!floor) return "unknown";
  return budgetInr < floor * CLEARLY_BELOW_RATIO ? "clearly_below" : "aligned";
}

/** "1 to 1.5 lakh" → 150000, "₹60–80 lakh" → 8000000, "2 crore" → 20000000. Uses the top of a range. */
export function parseBudgetInr(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase().replace(/,/g, "");
  const m = t.match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(lakh|lac|l\b|crore|cr\b|k\b|thousand)?/);
  if (!m) return null;
  const n = Number(m[2] ?? m[1]);
  const unit = m[3] ?? "";
  if (/^(lakh|lac|l)$/.test(unit)) return n * 100_000;
  if (/^(crore|cr)$/.test(unit)) return n * 10_000_000;
  if (/^(k|thousand)$/.test(unit)) return n * 1000;
  return n >= 10_000 ? n : null; // a bare small number is not a budget
}
