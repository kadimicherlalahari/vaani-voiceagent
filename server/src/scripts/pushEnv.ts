// Copies production settings from .env into the linked Vercel project (production environment).
//   npm run vercel:env
// Skips local-only keys and blanks. Re-run after adding a new key, then redeploy.

import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { ENV_PATH } from "./envfile.js";

const LOCAL_ONLY = new Set(["PORT", "DB_PATH", "DASHBOARD_URL", "PUBLIC_BASE_URL", "TELEGRAM_MODE", "VERCEL_OIDC_TOKEN"]);
const root = new URL("../../../", import.meta.url).pathname;
const lines = readFileSync(ENV_PATH, "utf8").split("\n");
for (const line of lines) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || !m[2].trim() || LOCAL_ONLY.has(m[1])) continue;
  execFileSync("npx", ["-y", "vercel@latest", "env", "add", m[1], "production", "--force"], { cwd: root, input: m[2].trim(), stdio: ["pipe", "ignore", "pipe"] });
  console.log(`✓ ${m[1]}`);
}
