import { createClient, type InValue } from "@libsql/client";
import { config } from "./config.js";

// libSQL: a local SQLite file in development, Turso in production (same SQL dialect).
export const db = createClient(
  process.env.TURSO_DATABASE_URL
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: `file:${config.dbPath}` },
);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS designers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  seniority TEXT NOT NULL DEFAULT 'designer',      -- designer | senior | principal | studio_head
  telegram_chat_id TEXT,
  link_code TEXT UNIQUE,
  calendar_id TEXT,                                -- Google calendar id (usually their email)
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  phone TEXT,
  name TEXT,
  email TEXT,
  language TEXT,
  enquiry_type TEXT,            -- new_project | existing_client_complaint | follow_up_no_response | other
  project_category TEXT,        -- residential | commercial | out_of_scope | unknown
  property TEXT,                -- e.g. "3BHK apartment"
  location TEXT,
  carpet_sqft INTEGER,
  scope TEXT,
  site_status TEXT,             -- new possession | lived-in | bare shell ...
  occupancy TEXT,               -- owner | tenant | unknown
  landlord_permission TEXT,
  timeline TEXT,
  budget TEXT,
  decision_maker TEXT,
  referral TEXT,
  preferred_slot TEXT,
  consultation_mode TEXT,       -- site_visit | studio
  sentiment TEXT,
  qualification TEXT,           -- qualified | needs_info | declined | nurture | escalation
  criteria_json TEXT,           -- rubric result per criterion
  decline_reason TEXT,
  handoff_note TEXT,
  stage TEXT NOT NULL DEFAULT 'new',
  priority TEXT NOT NULL DEFAULT 'normal',   -- normal | high | urgent
  designer_id INTEGER REFERENCES designers(id),
  hubspot_contact_id TEXT,
  hubspot_deal_id TEXT,
  reengage_on TEXT,
  source TEXT NOT NULL DEFAULT 'phone',      -- phone | seed
  first_contact_at TEXT NOT NULL,
  handoff_at TEXT,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS leads_stage ON leads(stage);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,                       -- Vaani call_id / room_name
  lead_id INTEGER REFERENCES leads(id),
  direction TEXT NOT NULL DEFAULT 'inbound',
  from_number TEXT,
  to_number TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_sec REAL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed | dropped | missed | failed
  end_reason TEXT,
  after_hours INTEGER,
  transcript TEXT,
  summary TEXT,
  entities_json TEXT,
  dispositions_json TEXT,
  recording_url TEXT,
  cost_inr REAL,
  source TEXT NOT NULL DEFAULT 'vaani',      -- vaani | seed | simulated
  processed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS calls_started ON calls(started_at);

CREATE TABLE IF NOT EXISTS call_events (
  id INTEGER PRIMARY KEY,
  call_id TEXT,
  event TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id),
  designer_id INTEGER NOT NULL REFERENCES designers(id),
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'site_visit',
  location TEXT,
  calendar_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | attended | customer_no_show | designer_missed | rescheduled | cancelled
  outcome_reason TEXT,
  notes_raw TEXT,
  summary_json TEXT,
  followup_asked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  call_id TEXT,
  kind TEXT NOT NULL,              -- existing_client_complaint | frustrated_lead
  details TEXT,
  assigned_to INTEGER REFERENCES designers(id),
  status TEXT NOT NULL DEFAULT 'open', -- open | acknowledged | resolved
  due_at TEXT,
  acknowledged_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER REFERENCES leads(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  channel TEXT NOT NULL,           -- telegram | email | log
  recipient TEXT,
  body TEXT NOT NULL,
  status TEXT NOT NULL,            -- sent | failed | skipped
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS costs (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,              -- vaani | claude
  ref TEXT,
  amount_inr REAL NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
`;

let ready: Promise<void> | null = null;
/** Create tables once per process (idempotent). */
export function migrate() {
  ready ??= db.executeMultiple(SCHEMA).catch((e) => { ready = null; throw e; });
  return ready;
}


type Params = InValue[];
type Row = Record<string, any>;

export async function all<T = Row>(sql: string, ...args: Params): Promise<T[]> {
  await migrate();
  const r = await db.execute({ sql, args });
  return r.rows.map((row) => ({ ...row }) as T);
}
export const get = async <T = Row>(sql: string, ...args: Params): Promise<T | undefined> => (await all<T>(sql, ...args))[0];
export async function run(sql: string, ...args: Params) {
  await migrate();
  return db.execute({ sql, args });
}

export const nowIso = () => new Date().toISOString();

export async function logActivity(leadId: number | null, kind: string, message: string) {
  await run("INSERT INTO activity (lead_id, kind, message, at) VALUES (?, ?, ?, ?)", leadId, kind, message, nowIso());
}

/** Insert/update helper: pass only defined fields. */
export async function updateRow(table: string, id: number | string, fields: Record<string, unknown>) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return;
  const set = entries.map(([k]) => `${k} = ?`).join(", ");
  const vals = entries.map(([, v]) => toSql(v));
  const touch = table === "leads" ? ", updated_at = datetime('now')" : "";
  await run(`UPDATE ${table} SET ${set}${touch} WHERE id = ?`, ...vals, id);
}

export async function insertRow(table: string, fields: Record<string, unknown>): Promise<number> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  const cols = entries.map(([k]) => k).join(", ");
  const qs = entries.map(() => "?").join(", ");
  const r = await run(`INSERT INTO ${table} (${cols}) VALUES (${qs})`, ...entries.map(([, v]) => toSql(v)));
  return Number(r.lastInsertRowid);
}

function toSql(v: unknown): InValue {
  if (v === null || typeof v === "string" || typeof v === "number" || typeof v === "bigint") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  return JSON.stringify(v);
}

export const kvGet = async (k: string) => (await get<{ v: string }>("SELECT v FROM kv WHERE k = ?", k))?.v;
export const kvSet = (k: string, v: string) =>
  run("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v);
