// Mid-call tools for the Vaani agent (Agent → Persona → Tools → add as cURL).
// Responses are short sentences the agent can read out. No prices ever leave this server.

import { Router } from "express";
import { config } from "../config.js";
import { all } from "../db.js";
import { checkBudgetFit, parseBudgetInr } from "../rules/budget.js";
import { checkServiceArea } from "../rules/serviceArea.js";
import { freeSlots, parsePreference } from "../scheduling/calendar.js";
import { fmtIst, isOfficeHours } from "../util.js";

export const toolsRouter = Router();

const input = (req: any) => ({ ...(req.query ?? {}), ...(req.body ?? {}) });

toolsRouter.all("/context", (_req, res) => {
  const now = new Date();
  res.json({
    result: `Today is ${fmtIst(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}, time ${fmtIst(now, { hour: "numeric", minute: "2-digit" })} in Pune. The front desk is ${isOfficeHours(now) ? "open" : "closed"} (10am–7pm, Monday to Saturday).`,
  });
});

toolsRouter.all("/service-area", (req, res) => {
  const { location } = input(req);
  const v = checkServiceArea(location);
  res.json({ result: v.verdict === "in" ? `${location} is in our service area.` : v.verdict === "out" ? `${location} is outside our service area (Pune city and PCMC only).` : `Not sure about ${location} — ask which part of Pune it is near.` });
});

// Returns only aligned / clearly_below — never a number (pricing.md).
toolsRouter.all("/budget-fit", (req, res) => {
  const b = input(req);
  const fit = checkBudgetFit({
    budgetInr: parseBudgetInr(String(b.budget ?? "")),
    category: b.category === "commercial_office" || b.category === "commercial" ? "commercial" : "residential",
    scopeSize: b.scope_size,
    carpetSqft: Number(b.carpet_area_sqft) || null,
    rooms: Number(b.rooms_count) || null,
  });
  res.json({
    result: fit === "clearly_below"
      ? "clearly_below: the volunteered budget is well below what this scope usually needs. Be honest and kind; do not state any number."
      : fit === "aligned" ? "aligned: no concern. Do not discuss numbers; continue." : "unknown: not enough detail. Do not probe budget; continue.",
  });
});

toolsRouter.all("/slots", async (req, res) => {
  const { preference } = input(req);
  const pref = parsePreference(String(preference ?? ""));
  const designers = await all("SELECT * FROM designers WHERE active = 1 AND seniority != 'studio_head'");
  const seen = new Map<string, Date>();
  for (const d of designers) {
    for (const s of await freeSlots(d, pref, new Date(), 3)) seen.set(s.label, s.start);
    if (seen.size >= 6) break;
  }
  const options = [...seen.entries()].sort((a, b) => a[1].getTime() - b[1].getTime()).slice(0, 3).map(([l]) => l);
  res.json({
    result: options.length
      ? `Available consultation times: ${options.join("; ")}. Offer these; once the caller picks one, repeat it back clearly so it is captured as the preferred slot. A designer will confirm by phone.`
      : "No open slots matched. Take the caller's preferred days/times; a designer will confirm.",
  });
});

export const toolDocs = () => {
  const q = config.webhookSecret ? `?key=${config.webhookSecret}` : "";
  return [
    { name: "get_studio_context", when: "At the start of a call if you need today's date/time, or when a caller mentions a deadline or festival.", curl: `curl -s '${config.publicBaseUrl}/tools/context${q}'` },
    { name: "check_service_area", when: "When unsure whether the site's locality is in Pune/PCMC. Argument: location.", curl: `curl -s -X POST '${config.publicBaseUrl}/tools/service-area${q}' -H 'Content-Type: application/json' -d '{"location":"{{location}}"}'` },
    { name: "check_budget_fit", when: "ONLY when the caller volunteers a budget. Arguments: budget (their words), category (residential|commercial_office), scope_size, carpet_area_sqft, rooms_count.", curl: `curl -s -X POST '${config.publicBaseUrl}/tools/budget-fit${q}' -H 'Content-Type: application/json' -d '{"budget":"{{budget}}","category":"{{category}}","scope_size":"{{scope_size}}","carpet_area_sqft":"{{carpet_area_sqft}}","rooms_count":"{{rooms_count}}"}'` },
    { name: "get_consultation_slots", when: "After the caller agrees to a consultation. Argument: preference (e.g. 'weekend mornings').", curl: `curl -s -X POST '${config.publicBaseUrl}/tools/slots${q}' -H 'Content-Type: application/json' -d '{"preference":"{{preference}}"}'` },
  ];
};
