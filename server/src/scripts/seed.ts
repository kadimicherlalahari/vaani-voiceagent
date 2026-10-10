// npm run seed            → demo designer team (if none) + September 2026 baseline calls
// npm run seed -- --reset → also wipes previously seeded rows first
//
// Seeded rows are marked source='seed' and hidden from the dashboard unless "Include Sept
// baseline" is toggled, so they never mix with real call metrics. They are not handed off and
// trigger no notifications.

import { all, insertRow, run } from "../db.js";
import { qualify } from "../rules/qualify.js";
import { randomCode } from "../util.js";
import { SEPTEMBER_CALLS } from "./septemberCalls.js";

if (process.argv.includes("--reset")) {
  const ids = (await all("SELECT id FROM leads WHERE source = 'seed'")).map((r) => r.id);
  for (const id of ids) {
    await run("DELETE FROM activity WHERE lead_id = ?", id);
    await run("DELETE FROM escalations WHERE lead_id = ?", id);
  }
  await run("DELETE FROM calls WHERE source = 'seed'");
  await run("DELETE FROM leads WHERE source = 'seed'");
  console.log(`Removed ${ids.length} seeded leads`);
}

if (!(await all("SELECT id FROM designers LIMIT 1")).length) {
  // Placeholder team — replace with the real 14 designers on the Designers page.
  const team: [string, string][] = [
    ["Nikhil Deshpande", "studio_head"],
    ["Principal Designer (demo)", "principal"],
    ["Aryan (demo)", "senior"],
    ["Designer A (demo)", "designer"],
    ["Designer B (demo)", "designer"],
  ];
  for (const [name, seniority] of team) await insertRow("designers", { name, seniority, link_code: randomCode() });
  console.log(`Created ${team.length} placeholder designers`);
}

const entityNames: Record<string, string> = {
  enquiryType: "enquiry_type", projectCategory: "project_category", serviceWanted: "service_wanted", readiness: "readiness",
  location: "location", carpetSqft: "carpet_area_sqft", scopeSize: "scope_size", rooms: "rooms_count",
  completionDeadline: "completion_deadline", budget: "budget_volunteered", occupancy: "occupancy",
  landlordPermission: "landlord_permission", decisionMaker: "decision_maker", sentiment: "sentiment",
  referral: "referral_source", property: "property",
};

let n = 0;
for (const c of SEPTEMBER_CALLS) {
  const id = `seed-sep26-${c.id}`;
  if ((await all("SELECT 1 FROM calls WHERE id = ?", id)).length) continue;
  const started = new Date(c.at);
  const hour = Number(started.toLocaleString("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hour12: false }));
  const after = hour < 10 || hour >= 19;
  const phone = `+9190000${String(10000 + SEPTEMBER_CALLS.indexOf(c)).slice(-5)}`;
  const entities = Object.fromEntries(Object.entries(c.facts).map(([k, v]) => [entityNames[k] ?? k, v]));
  if (c.name) entities.caller_name = c.name;

  let leadId: number | null = null;
  if (c.status === "completed") {
    const q = qualify(c.facts, started);
    const stage = q.outcome === "escalation" ? "escalated" : q.outcome;
    leadId = await insertRow("leads", {
      phone, name: c.name ?? null, enquiry_type: c.facts.enquiryType ?? null, project_category: c.facts.projectCategory ?? null,
      property: c.facts.property ?? null, location: c.facts.location ?? null, carpet_sqft: Number(c.facts.carpetSqft) || null,
      timeline: c.facts.completionDeadline ?? null, budget: c.facts.budget ?? null, decision_maker: c.facts.decisionMaker ?? null,
      occupancy: c.facts.occupancy ?? null, landlord_permission: c.facts.landlordPermission ?? null, referral: c.facts.referral ?? null,
      sentiment: c.facts.sentiment ?? null, scope: c.summary, qualification: q.outcome, stage, priority: q.priority,
      criteria_json: JSON.stringify({ criteria: q.criteria, notes: q.notes, facts: c.facts }), decline_reason: q.declineReason ?? null,
      first_contact_at: started.toISOString(), source: "seed",
    });
    await insertRow("activity", { lead_id: leadId, kind: "call", message: `September baseline (handled by front desk): ${c.summary}`, at: started.toISOString() });
    await insertRow("activity", { lead_id: leadId, kind: "qualified", message: `Rubric: ${q.outcome.toUpperCase()}${q.declineReason ? ` — ${q.declineReason}` : ""}`, at: started.toISOString() });
    if (q.outcome === "escalation") await insertRow("escalations", { lead_id: leadId, kind: "existing_client_complaint", details: c.summary, status: "resolved", due_at: new Date(started.getTime() + 15 * 60_000).toISOString(), resolved_at: started.toISOString(), created_at: started.toISOString() });
  }
  await insertRow("calls", {
    id, lead_id: leadId, from_number: phone, started_at: started.toISOString(),
    ended_at: new Date(started.getTime() + c.durationSec * 1000).toISOString(), duration_sec: c.durationSec,
    status: c.status, after_hours: after, summary: c.summary, transcript: c.transcript ?? null,
    entities_json: JSON.stringify(entities), source: "seed", processed_at: started.toISOString(),
  });
  n++;
}
console.log(`Seeded ${n} September baseline calls`);
