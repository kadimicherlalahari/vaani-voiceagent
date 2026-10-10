// Nikhil's rubric (qualified.md) + scope limits (services.md), as deterministic code so every
// decision is explainable on the dashboard. Input is the structured data Vaani extracts after
// each call; output is a per-criterion verdict and what to do with the lead.

import { checkServiceArea } from "./serviceArea.js";
import { parseTimeline } from "./timeline.js";
import { checkBudgetFit, parseBudgetInr } from "./budget.js";

export type Verdict = "pass" | "fail" | "unclear";
export type Criterion = { key: CriterionKey; label: string; verdict: Verdict; reason: string };
type CriterionKey = "real_project" | "service_area" | "timeline" | "budget" | "decision_maker";

export type LeadFacts = {
  enquiryType?: string | null;      // new_project | existing_client_complaint | follow_up_no_response | general_question | other
  projectCategory?: string | null;  // residential | commercial_office | restaurant_hotel_retail_gym | other | unknown
  serviceWanted?: string | null;    // design_and_execution | advice_only | decor_styling_only | furniture_only | vastu_only | structural_or_architecture | unknown
  readiness?: string | null;        // ready_to_proceed | just_exploring | unknown
  location?: string | null;
  carpetSqft?: number | string | null;
  scopeSize?: string | null;        // full_home | partial_home | single_room | office | unknown
  rooms?: number | string | null;
  completionDeadline?: string | null;
  budget?: string | null;
  occupancy?: string | null;        // owner | tenant | family_of_owner | unknown
  landlordPermission?: string | null; // yes | no | not_checked | not_applicable
  decisionMaker?: string | null;    // self | authorised_by_owner | owner_will_attend_consultation | only_researching | unknown
  sentiment?: string | null;        // calm | frustrated | angry
  referral?: string | null;
  property?: string | null;
};

export type Qualification = {
  outcome: "qualified" | "needs_info" | "declined" | "nurture" | "escalation";
  criteria: Criterion[];
  declineReason?: string;
  notes: string[];
  priority: "normal" | "high" | "urgent";
  needsSenior: boolean;
  frustrated: boolean;
  weeksToDeadline: number | null;
};

const toNum = (v: unknown) => {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const lc = (v: unknown) => (v == null ? "" : String(v).toLowerCase().trim());

export function qualify(f: LeadFacts, callDate: Date): Qualification {
  const notes: string[] = [];
  const sqft = toNum(f.carpetSqft);
  const rooms = toNum(f.rooms);
  const category = lc(f.projectCategory);
  const service = lc(f.serviceWanted);
  const sentiment = lc(f.sentiment);
  const frustrated = sentiment === "frustrated" || sentiment === "angry" || lc(f.enquiryType) === "follow_up_no_response";

  const base = { notes, frustrated, priority: "urgent" as const, needsSenior: true, weeksToDeadline: null };
  if (lc(f.enquiryType) === "existing_client_complaint") {
    return { ...base, outcome: "escalation", criteria: [], declineReason: undefined };
  }

  // 1. Real project — design + execution, and a kind of space we do (services.md)
  let c1: Criterion;
  if (category === "restaurant_hotel_retail_gym") {
    c1 = { key: "real_project", label: "Real project", verdict: "fail", reason: "Restaurants, hotels, retail and gyms are out of scope (services.md)" };
  } else if (["advice_only", "decor_styling_only", "furniture_only", "vastu_only"].includes(service)) {
    const why: Record<string, string> = {
      advice_only: "Wants advice/ideas only — minimum engagement is a room redesign with execution",
      decor_styling_only: "Decor/styling only — not a design + execution project",
      furniture_only: "Standalone furniture sourcing — not offered without a design project",
      vastu_only: "Standalone Vastu consultation — not offered",
    };
    c1 = { key: "real_project", label: "Real project", verdict: "fail", reason: why[service] };
  } else if (service === "structural_or_architecture") {
    c1 = { key: "real_project", label: "Real project", verdict: "fail", reason: "Structural/architecture work — we are interior designers, not architects" };
  } else if (category === "commercial_office" && sqft && sqft < 500) {
    c1 = { key: "real_project", label: "Real project", verdict: "fail", reason: `${sqft} sq ft is below our commercial minimum (~500 sq ft)` };
  } else if (category === "commercial_office" && sqft && sqft > 3500) {
    c1 = { key: "real_project", label: "Real project", verdict: "fail", reason: `${sqft} sq ft office is above our commercial range (up to ~3,000 sq ft)` };
  } else if (service === "design_and_execution" && (category === "residential" || category === "commercial_office")) {
    c1 = { key: "real_project", label: "Real project", verdict: "pass", reason: `${category === "residential" ? "Residential" : "Office"} design + execution` };
    if (category === "commercial_office" && sqft && sqft > 3000) notes.push(`Office is ${sqft} sq ft — at the top of our ~3,000 sq ft range`);
  } else {
    c1 = { key: "real_project", label: "Real project", verdict: "unclear", reason: "Not confirmed that they want design + execution" };
  }

  // Rented home: fine without structural change (qualified.md); confirm landlord is on board.
  let landlordBlocks: "no" | "pending" | null = null;
  if (lc(f.occupancy) === "tenant") {
    const lp = lc(f.landlordPermission);
    if (lp === "yes") notes.push("Tenant — landlord has approved (no structural changes)");
    else if (lp === "no") landlordBlocks = "no";
    else landlordBlocks = "pending";
  }

  // 2. Service area
  const area = checkServiceArea(f.location);
  const c2: Criterion =
    area.verdict === "in"
      ? { key: "service_area", label: "Pune / PCMC", verdict: "pass", reason: `${f.location} is in our service area` }
      : area.verdict === "out"
        ? { key: "service_area", label: "Pune / PCMC", verdict: "fail", reason: `${f.location} is outside Pune city / PCMC` }
        : { key: "service_area", label: "Pune / PCMC", verdict: "unclear", reason: f.location ? `Couldn't confirm "${f.location}" is in Pune/PCMC` : "Location not captured" };

  // 3. Timeline — services.md: can't take a project that must be ready in under 6 weeks
  const tl = parseTimeline(f.completionDeadline, callDate);
  let c3: Criterion;
  if (tl.weeks != null && tl.weeks < 6) {
    c3 = { key: "timeline", label: "Realistic timeline", verdict: "fail", reason: `Needs completion in ~${Math.max(1, Math.round(tl.weeks))} weeks — design alone takes 3–4 weeks; minimum lead time is 6 weeks` };
  } else if (tl.weeks != null) {
    c3 = { key: "timeline", label: "Realistic timeline", verdict: "pass", reason: `Deadline "${f.completionDeadline}" (~${Math.round(tl.weeks)} weeks out)` };
    if (tl.weeks < 12) notes.push(`Tight timeline: ~${Math.round(tl.weeks)} weeks to completion (design 3–4 wks + execution 8–16 wks)`);
  } else if (tl.open) {
    c3 = { key: "timeline", label: "Realistic timeline", verdict: "pass", reason: "Flexible / no fixed deadline" };
  } else if (lc(f.readiness) === "ready_to_proceed") {
    c3 = { key: "timeline", label: "Realistic timeline", verdict: "pass", reason: f.completionDeadline ? `"${f.completionDeadline}" — ready to start` : "Ready to start; no deadline given" };
  } else {
    c3 = { key: "timeline", label: "Realistic timeline", verdict: "unclear", reason: f.completionDeadline ? `Couldn't read deadline "${f.completionDeadline}"` : "Timeline not captured" };
  }

  // 4. Budget — never probe; only act on a volunteered number that clearly fails
  const budgetInr = parseBudgetInr(f.budget);
  const fit = checkBudgetFit({
    budgetInr,
    category: category === "commercial_office" ? "commercial" : category === "residential" ? "residential" : null,
    scopeSize: lc(f.scopeSize).replace("partial_home", "partial"),
    carpetSqft: sqft,
    rooms,
  });
  const c4: Criterion =
    fit === "clearly_below"
      ? { key: "budget", label: "Budget band", verdict: "fail", reason: `Volunteered budget (${f.budget}) is clearly below what this scope costs` }
      : fit === "aligned"
        ? { key: "budget", label: "Budget band", verdict: "pass", reason: `Volunteered budget ${f.budget}` }
        : { key: "budget", label: "Budget band", verdict: "pass", reason: budgetInr ? `Budget ${f.budget} — not enough scope detail to compare` : "Not mentioned — treated as qualified (don't probe)" };

  // 5. Decision-maker
  const dm = lc(f.decisionMaker);
  let c5: Criterion;
  if (dm === "self" || dm === "authorised_by_owner") c5 = { key: "decision_maker", label: "Decision-maker", verdict: "pass", reason: dm === "self" ? "Caller is the decision-maker" : "Caller authorised by the owner" };
  else if (dm === "owner_will_attend_consultation") {
    c5 = { key: "decision_maker", label: "Decision-maker", verdict: "pass", reason: "Decision-makers will attend the consultation" };
    notes.push("Caller is not the owner — decision-makers will attend the consultation");
  } else {
    c5 = { key: "decision_maker", label: "Decision-maker", verdict: "unclear", reason: dm === "only_researching" ? "Caller is researching on someone else's behalf" : "Not confirmed" };
    notes.push(`Decision-maker uncertain: ${c5.reason}`);
  }

  const criteria = [c1, c2, c3, c4, c5];
  const fails = criteria.filter((c) => c.verdict === "fail");
  const unclearCore = criteria.filter((c) => c.verdict === "unclear" && ["real_project", "service_area", "timeline"].includes(c.key));

  // priority & routing
  const isReferral = Boolean(f.referral && /nikhil|friend|referr|recommend|client|worked with/i.test(f.referral));
  const needsSenior = frustrated || (sqft ?? 0) >= 2500 || category === "commercial_office" || /villa|bungalow|independent house/i.test(f.property ?? "") || /nikhil/i.test(f.referral ?? "");
  const priority: Qualification["priority"] = frustrated ? "urgent" : isReferral || (sqft ?? 0) >= 2000 || category === "commercial_office" ? "high" : "normal";

  const out = (outcome: Qualification["outcome"], declineReason?: string): Qualification => ({
    outcome, criteria, declineReason, notes, priority, needsSenior, frustrated, weeksToDeadline: tl.weeks,
  });

  if (fails.length >= 2) return out("declined", fails.map((c) => c.reason).join("; "));
  if (fails.length === 1) return out("declined", fails[0].reason);
  if (landlordBlocks === "no") return out("declined", "Tenant — landlord has not approved the work");
  if (lc(f.readiness) === "just_exploring" && c1.verdict !== "pass") return out("nurture");
  if (landlordBlocks === "pending") {
    notes.push("Tenant — waiting on landlord permission before we proceed");
    return out("needs_info");
  }
  if (unclearCore.length) return out("needs_info");
  if (lc(f.readiness) === "just_exploring") {
    notes.push("Caller described themselves as just exploring");
    return out("nurture");
  }
  return out("qualified");
}
