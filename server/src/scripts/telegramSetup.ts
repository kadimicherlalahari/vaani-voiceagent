// Points the Telegram bot at the deployed server and prints the linking codes.
//   npm run telegram:setup                 → webhook to PUBLIC_BASE_URL (must be https)
//   npm run telegram:setup -- https://x.app → webhook to that URL

import { randomBytes } from "node:crypto";
import { all } from "../db.js";
import { setEnvVar } from "./envfile.js";

const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
if (!token) { console.error("Set TELEGRAM_BOT_TOKEN in .env first (from @BotFather)."); process.exit(1); }
const base = (process.argv[2] ?? process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const tg = async (m: string, body: object = {}) => {
  const j: any = await fetch(`https://api.telegram.org/bot${token}/${m}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  if (!j.ok) throw new Error(`${m}: ${j.description}`);
  return j.result;
};

const me = await tg("getMe");
console.log(`✓ Bot @${me.username}`);
if (!base.startsWith("https://")) {
  console.log("PUBLIC_BASE_URL isn't https yet — skipping webhook. For local testing run the server with TELEGRAM_MODE=polling.");
} else {
  let secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) { secret = randomBytes(24).toString("hex"); setEnvVar("TELEGRAM_WEBHOOK_SECRET", secret); console.log("✓ Generated TELEGRAM_WEBHOOK_SECRET (add it to Vercel env too)"); }
  await tg("setWebhook", { url: `${base}/telegram/webhook`, secret_token: secret, allowed_updates: ["message", "callback_query"], drop_pending_updates: true });
  console.log(`✓ Webhook → ${base}/telegram/webhook`);
}
await tg("setMyCommands", { commands: [{ command: "start", description: "Link this chat: /start YOURCODE" }] });

console.log(`\nStudio head (Nikhil): open https://t.me/${me.username}?start=STUDIOHEAD and press Start.`);
console.log("Designers: each opens their personal link and presses Start:");
for (const d of await all("SELECT name, link_code, telegram_chat_id FROM designers WHERE active = 1 ORDER BY id")) {
  console.log(`  ${d.telegram_chat_id ? "✓ linked " : "         "} ${d.name.padEnd(28)} https://t.me/${me.username}?start=${d.link_code}`);
}
