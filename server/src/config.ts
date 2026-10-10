const env = (k: string, d = "") => process.env[k]?.trim() || d;

export const config = {
  port: Number(env("PORT", "4000")),
  publicBaseUrl: env("PUBLIC_BASE_URL", process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4000"),
  // The server also serves the built dashboard, so links default to the public server URL
  dashboardUrl: env("DASHBOARD_URL", env("PUBLIC_BASE_URL", process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:4000")),
  webhookSecret: env("WEBHOOK_SECRET"),
  cronSecret: env("CRON_SECRET"),
  // Required to read the dashboard API (it contains callers' names and numbers). Blank = open (local dev only).
  dashboardPassword: env("DASHBOARD_PASSWORD"),
  dbPath: env("DB_PATH", new URL("../aangan.db", import.meta.url).pathname),
  timezone: "Asia/Kolkata",

  vaani: {
    apiKey: env("VAANI_API_KEY"),
    agentId: env("VAANI_AGENT_ID"),
    baseUrl: env("VAANI_BASE_URL", "https://api.vaanivoice.ai"),
    inrPerCredit: Number(env("VAANI_INR_PER_CREDIT", "1")),
    inrPerMinute: Number(env("VAANI_INR_PER_MINUTE", "6")),
  },
  telegram: {
    token: env("TELEGRAM_BOT_TOKEN"),
    studioHeadChatId: env("TELEGRAM_STUDIO_HEAD_CHAT_ID"),
    webhookSecret: env("TELEGRAM_WEBHOOK_SECRET"),
  },
  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
    refreshToken: env("GOOGLE_REFRESH_TOKEN"),
    studioCalendarId: env("GOOGLE_STUDIO_CALENDAR_ID", "primary"),
  },
  hubspotToken: env("HUBSPOT_TOKEN"),
  gemini: {
    apiKey: env("GEMINI_API_KEY"),
    model: env("GEMINI_MODEL", "gemini-3.8-flash"),
  },

  // Studio operating rules (services.md / problem statement)
  officeHours: { startHour: 10, endHour: 19 },
  consultationMinutes: 90,
  // A designer must accept a handoff within this window or it is reassigned
  handoffAcceptSlaMin: 15,
  // Complaint callback promise (T09)
  escalationSlaMin: 15,
};

export const integrations = () => ({
  vaani: Boolean(config.vaani.apiKey),
  vaaniAgent: Boolean(config.vaani.agentId),
  telegram: Boolean(config.telegram.token),
  googleCalendar: Boolean(config.google.refreshToken && config.google.clientId),
  hubspot: Boolean(config.hubspotToken),
  gemini: Boolean(config.gemini.apiKey),
});
