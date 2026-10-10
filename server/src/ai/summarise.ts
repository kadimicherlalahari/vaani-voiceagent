// Turns a designer's post-consultation notes into a structured record for the dashboard,
// using Gemini Flash on the Google AI Studio free tier. Without GEMINI_API_KEY the raw notes
// are stored as-is.

import { z } from "zod";
import { config } from "../config.js";
import { insertRow } from "../db.js";

export const MeetingSummary = z.object({
  summary: z.string(),
  client_priorities: z.array(z.string()),
  scope_confirmed: z.string(),
  budget_discussed: z.string(),
  decision_timeline: z.string(),
  next_steps: z.array(z.string()),
  likelihood: z.enum(["high", "medium", "low"]),
  risks: z.array(z.string()),
});
export type MeetingSummary = z.infer<typeof MeetingSummary>;

// Gemini structured output: the response must match this JSON schema.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-3 sentence plain summary of the consultation" },
    client_priorities: { type: "array", items: { type: "string" } },
    scope_confirmed: { type: "string", description: "What the client wants done, as confirmed at the consultation" },
    budget_discussed: { type: "string", description: "What was said about budget, or 'not discussed'" },
    decision_timeline: { type: "string" },
    next_steps: { type: "array", items: { type: "string" } },
    likelihood: { type: "string", enum: ["high", "medium", "low"], description: "Likelihood the client signs" },
    risks: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "client_priorities", "scope_confirmed", "budget_discussed", "decision_timeline", "next_steps", "likelihood", "risks"],
};

const SYSTEM =
  "You write consultation records for Aangan Studio, a Pune interior design studio. Use only what is in the designer's notes and the original enquiry. Never invent prices or commitments. Notes may mix English, Hindi and Marathi; write the record in English. Be concise.";

export async function summariseMeeting(leadBrief: string, notes: string, meetingRef: string): Promise<MeetingSummary | null> {
  if (!config.gemini.apiKey) return null;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": config.gemini.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: `Original enquiry (from the phone agent):\n${leadBrief}\n\nDesigner's notes after the consultation:\n${notes}` }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: RESPONSE_SCHEMA, thinkingConfig: { thinkingLevel: "low" } },
      }),
      // Free-tier latency can approach a minute; this runs in the background, never on a caller's path
      signal: AbortSignal.timeout(180_000),
    });
    const j: any = await res.json();
    if (!res.ok) throw new Error(`${res.status} ${j.error?.message ?? ""}`);
    const text = j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? "").join("") ?? "";
    const parsed = MeetingSummary.safeParse(JSON.parse(text));
    // Free tier: no charge, but keep a zero-cost row so the dashboard shows usage
    await insertRow("costs", { kind: "gemini", ref: meetingRef, amount_inr: 0 });
    return parsed.success ? parsed.data : null;
  } catch (e) {
    console.error("Gemini summary failed:", (e as Error).message);
    return null;
  }
}
