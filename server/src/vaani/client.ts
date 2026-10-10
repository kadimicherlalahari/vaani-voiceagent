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
  /** In-browser (WebRTC) session — the same flow Vaani's own "test call" uses. create → connect gives LiveKit credentials and dispatches the agent. */
  createWebSession: (agentId: string, metadata: object = {}) =>
    vaani<{ session_token: string; session_url: string; expires_at: string }>("POST", "/webrtc/session/create", {
      agent_id: agentId, ui_type: "fullpage", grace_period: 30, session_ttl: 1800, metadata,
    }),
  connectWebSession: (sessionToken: string) =>
    vaani<{ lk_url: string; lk_token: string; room_name: string }>("POST", "/webrtc/session/connect", { session_token: sessionToken }),
  endWebSession: (sessionToken: string) =>
    vaani("POST", "/webrtc/session/disconnect", { session_token: sessionToken, explicit_end: true }),
  callDetails: (callId: string) => vaani("GET", `/call_details/${encodeURIComponent(callId)}`),
  callHistory: (page = 1, pageSize = 50) => vaani<{ data: any[] }>("GET", `/call-history?page=${page}&page_size=${pageSize}`),
};
