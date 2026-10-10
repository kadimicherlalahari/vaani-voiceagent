import { config } from "../config.js";

async function vaani<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  if (!config.vaani.apiKey) throw new Error("VAANI_API_KEY not set");
  const res = await fetch(`${config.vaani.baseUrl}/api${path}`, {
    method,
    headers: { "X-API-Key": config.vaani.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Vaani ${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

export const vaaniApi = {
  listAgents: () => vaani<any[]>("GET", "/list-agents"),
  getAgent: (id: string) => vaani("GET", `/agent/${id}`),
  createAgent: (name: string, cfg: object = {}) =>
    vaani<{ agent_id: string }>("POST", "/create-agent", { agent_display_name: name, config: cfg }),
  patch: (id: string, section: "persona" | "training" | "experience" | "analysis" | "deployment", body: object) =>
    vaani("PATCH", `/agent/${id}/${section}`, body),
  callDetails: (callId: string) => vaani("GET", `/call_details/${encodeURIComponent(callId)}`),
  callHistory: (page = 1, pageSize = 50) => vaani<{ data: any[] }>("GET", `/call-history?page=${page}&page_size=${pageSize}`),
};
