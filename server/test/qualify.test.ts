import { test } from "node:test";
import assert from "node:assert/strict";
import { qualify } from "../src/rules/qualify.js";
import { checkServiceArea } from "../src/rules/serviceArea.js";
import { parseTimeline } from "../src/rules/timeline.js";
import { parseBudgetInr } from "../src/rules/budget.js";
import { SEPTEMBER_CALLS, RUBRIC_EXTRA_CASES } from "../src/scripts/septemberCalls.js";

// The rubric must reach the same decision the studio reached on every real September enquiry.
for (const c of [...SEPTEMBER_CALLS, ...RUBRIC_EXTRA_CASES]) {
  if (!c.expected) continue;
  test(`${c.id} → ${c.expected}`, () => {
    const q = qualify(c.facts, new Date(c.at));
    assert.equal(q.outcome, c.expected, JSON.stringify(q.criteria, null, 1) + (q.declineReason ?? ""));
  });
}

test("T16 frustrated repeat caller is qualified AND flagged urgent", () => {
  const t16 = SEPTEMBER_CALLS.find((c) => c.id === "T16")!;
  const q = qualify(t16.facts, new Date(t16.at));
  assert.equal(q.frustrated, true);
  assert.equal(q.priority, "urgent");
});

test("T05 referral from Nikhil's network routes to a senior designer", () => {
  const t = SEPTEMBER_CALLS.find((c) => c.id === "T05")!;
  assert.equal(qualify(t.facts, new Date(t.at)).needsSenior, true);
});

test("service area", () => {
  assert.equal(checkServiceArea("Talegaon Dabhade, near Pune").verdict, "out");
  assert.equal(checkServiceArea("Nanded City").verdict, "in");
  assert.equal(checkServiceArea("Pimple Saudagar").verdict, "in");
  assert.equal(checkServiceArea("Lonavala").verdict, "out");
  assert.equal(checkServiceArea("Somewhere").verdict, "unclear");
});

test("timeline parsing", () => {
  const ref = new Date("2026-09-08T10:00:00+05:30");
  assert.ok(parseTimeline("in 3 weeks before Diwali", ref).weeks! < 4);
  assert.ok(parseTimeline("before Diwali", ref).weeks! > 8);
  assert.ok(parseTimeline("by March", ref).weeks! > 25);
  assert.equal(parseTimeline("no rush, whenever", ref).open, true);
  assert.ok(parseTimeline("3-4 months", ref).weeks! > 16);
});

test("budget parsing", () => {
  assert.equal(parseBudgetInr("1 to 1.5 lakh maximum"), 150000);
  assert.equal(parseBudgetInr("₹60–80 lakh all-in"), 8_000_000);
  assert.equal(parseBudgetInr("reasonable"), null);
});
