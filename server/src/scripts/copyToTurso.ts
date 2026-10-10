// One-off: copy every row from the local SQLite file into Turso (same schema).
import { createClient } from "@libsql/client";
import { config } from "../config.js";
import { db as turso, migrate } from "../db.js";

const local = createClient({ url: `file:${config.dbPath}` });
await migrate();
const tables = ["designers", "leads", "calls", "call_events", "meetings", "escalations", "activity", "notifications", "costs", "kv"];
for (const t of tables) {
  const rows = (await local.execute(`SELECT * FROM ${t}`)).rows;
  if (!rows.length) { console.log(`${t}: 0`); continue; }
  const cols = Object.keys(rows[0]);
  await turso.batch(rows.map((r) => ({ sql: `INSERT OR REPLACE INTO ${t} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, args: cols.map((c) => (r as any)[c]) })), "write");
  console.log(`${t}: ${rows.length}`);
}
