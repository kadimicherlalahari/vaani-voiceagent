// Local server: API + built dashboard on one port, background checks every minute.
// Telegram: set TELEGRAM_MODE=polling to receive bot updates without a public URL
// (don't do this while a deployed webhook uses the same bot — polling removes the webhook).

import express from "express";
import { existsSync } from "node:fs";
import { app } from "./app.js";
import { config, integrations } from "./config.js";
import { startPolling } from "./notify/telegram.js";
import { onTelegramUpdate } from "./notify/bot.js";
import { startJobs } from "./jobs.js";

const webDist = new URL("../../web/dist", import.meta.url).pathname;
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api|tools|webhooks|telegram|cron).*/, (_req, res) => res.sendFile(`${webDist}/index.html`));
}

app.listen(config.port, () => {
  console.log(`Aangan server on :${config.port}`);
  console.log(`  Vaani webhook → ${config.publicBaseUrl}/webhooks/vaani`);
  console.log(`  Integrations:`, integrations());
});
if (process.env.TELEGRAM_MODE === "polling") startPolling(onTelegramUpdate);
startJobs();
