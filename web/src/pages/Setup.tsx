import { useState } from "react";
import { useApi, when } from "../api";
import { Copy, Pill, Section } from "../components/ui";

export default function Setup() {
  const { data: s } = useApi<any>("/settings", 0);
  const { data: outbox } = useApi<any[]>("/notifications", 15000);
  const [num, setNum] = useState("");
  if (!s) return <div className="text-sm text-ink-3">Loading…</div>;
  const i = s.integrations;
  const vaaniNum = num.replace(/[^\d+]/g, "") || "<VAANI_NUMBER>";
  const localTunnel = s.publicBaseUrl.includes("localhost");

  const Step = ({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className="mt-0.5"><Pill tone={ok ? "good" : "warn"}>{ok ? "done" : "to do"}</Pill></span>
      <div className="min-w-0 flex-1"><div className="font-medium">{title}</div><div className="mt-1 space-y-2 text-sm text-ink-2">{children}</div></div>
    </li>
  );
  const Code = ({ children }: { children: string }) => (
    <div className="flex items-start gap-2"><code className="block min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg bg-ink/[0.05] px-3 py-2 text-xs">{children}</code><Copy text={children} /></div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl">Setup</h1>
        <p className="text-sm text-ink-2">Everything needed to take real calls. Steps marked "to do" still need you.</p>
      </div>

      <Section title="Go-live checklist">
        <ol className="space-y-5">
          <Step ok={i.vaaniAgent} title="Vaani agent created">
            <p>Agent <code>{s.agentId || "—"}</code> ("Aangan Studio Front Desk"). Prompt, extraction fields and QA checks are managed in code — run <code>npm run agent:sync</code> after editing <code>server/src/vaani/agentConfig.ts</code>. The date in the prompt refreshes daily.</p>
            <p>In the Vaani dashboard → this agent: pick a warm Indian voice in Voice Lab, and turn on <b>recording, transcript and summary</b>.</p>
          </Step>
          <Step ok={false} title="Give the agent a phone number">
            <p>Vaani → Settings → Telephony → Provision a Number (India), then Agent → Deployment → set it as the <b>Inbound</b> number. Test by calling it directly.</p>
          </Step>
          <Step ok={!localTunnel && s.database === "Turso"} title="Hosted on Vercel with a Turso database">
            <p>Database: <b>{s.database}</b>. Deploy with <code>npm run deploy</code> (pushes .env to Vercel, then deploys production).</p>
          </Step>
          <Step ok={!localTunnel} title="Connect the Vaani webhook">
            <p>Vaani → Settings → Webhooks → add:</p>
            <Code>{s.webhookUrl}</Code>
            {localTunnel && <p className="text-xs">This is a localhost URL — Vaani can't reach it. Open this page on the deployed site to get the public URL.</p>}
          </Step>
          <Step ok={Boolean(s.lastTick && Date.now() - new Date(s.lastTick).getTime() < 15 * 60_000)} title="Background checks every 5 minutes (free scheduler)">
            <p>Meeting check-ins, accept reminders and overdue escalations run on a tick. Vercel's free cron only runs daily, so create a free job at <a className="text-accent" href="https://cron-job.org" target="_blank" rel="noreferrer">cron-job.org</a> → URL below, every 5 minutes, method GET. Last tick: {s.lastTick ? when(s.lastTick) : "never"}.</p>
            <Code>{s.cronUrl}</Code>
          </Step>
          <Step ok={false} title="Ring the front desk first, then the AI (5–6 rings)">
            <p>Forward the studio number to the Vaani number <i>on no answer</i>. Enter the Vaani number:</p>
            <input className="input w-60" placeholder="+91XXXXXXXXXX" value={num} onChange={(e) => setNum(e.target.value)} />
            <p>On the studio mobile/SIM (Airtel, Jio, Vi — GSM codes), dial:</p>
            <Code>{`**61*${vaaniNum}**30#   ← no answer after 30 s (≈5–6 rings)\n**67*${vaaniNum}#       ← line busy (front desk already on a call)\n**62*${vaaniNum}#       ← phone switched off / unreachable`}</Code>
            <p>Outside 10am–7pm, at lunch and on holidays nobody picks up, so calls reach the AI after the same 30 s. For a landline or EPABX, ask the provider for "call forward on no answer, 30 seconds" to the Vaani number. To cancel: <code>##002#</code>.</p>
          </Step>
          <Step ok={i.telegram} title="Telegram bot for designer handoffs">
            {i.telegram ? (
              <>
                <p>Bot: {s.botUsername ? <a className="text-accent" href={`https://t.me/${s.botUsername}`} target="_blank" rel="noreferrer">@{s.botUsername}</a> : "connected"}. After deploying, run <code>npm run telegram:setup -- {s.publicBaseUrl}</code> once to point the bot at this server. Each designer opens their personal link from the Designers page.</p>
                <p>Studio head (escalations): {s.botUsername ? <a className="text-accent" href={`https://t.me/${s.botUsername}?start=STUDIOHEAD`} target="_blank" rel="noreferrer">open this link from Nikhil's Telegram</a> : <>send <code>/start STUDIOHEAD</code></>}. {s.studioHeadLinked ? <Pill tone="good">linked</Pill> : <Pill tone="warn">not linked</Pill>}</p>
              </>
            ) : (
              <p>Create a bot with <a className="text-accent" href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</a> (<code>/newbot</code>), put the token in <code>.env</code> as <code>TELEGRAM_BOT_TOKEN</code>, restart the server.</p>
            )}
          </Step>
          <Step ok={i.googleCalendar} title="Google Calendar (invites + designer availability) — optional">
            <p>Without it, slots come from designer working hours (Mon–Sat 10:30 / 12:30 / 15:00 / 17:00) and meetings already booked here, and designers confirm times by phone. With it, the studio calendar sends invites to the designer and client (when an email was captured) and real free/busy is respected. Put <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> (OAuth client, type Desktop app) in <code>.env</code>, run <code>npm run google:auth</code> to sign in and save the refresh token, then add each designer's email on the Designers page.</p>
          </Step>
          <Step ok={i.hubspot} title="HubSpot founder view — optional">
            <p>Create a HubSpot private app with <i>crm.objects.contacts</i> and <i>crm.objects.deals</i> read/write; set <code>HUBSPOT_TOKEN</code>. Qualified leads sync as contact + deal in the default pipeline and move stage as designers update them.</p>
          </Step>
          <Step ok={i.gemini} title="Consultation summaries (Gemini Flash, free) — optional">
            <p>Create a free key at <a className="text-accent" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio</a> and set <code>GEMINI_API_KEY</code>. Designer notes after a consultation become a structured summary (scope, budget discussed, next steps, likelihood). Without it, raw notes are stored.</p>
          </Step>
        </ol>
      </Section>

      <Section title="Optional mid-call tools (Vaani → Agent → Persona → Tools → add via cURL)">
        <p className="mb-3 text-sm text-ink-2">These let the agent check today's date, Pune coverage, a volunteered budget (answers only "aligned / clearly below" — never a number) and offer real consultation slots during the call. The endpoint must respond within 2–3 s, so use a deployed or tunnelled URL.</p>
        <div className="space-y-4">
          {s.tools.map((t: any) => (
            <div key={t.name}>
              <div className="text-sm font-medium">{t.name}</div>
              <div className="mb-1 text-xs text-ink-3">{t.when}</div>
              <Code>{t.curl}</Code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Notification outbox (last 100)">
        <div className="max-h-96 space-y-2 overflow-y-auto">
          {outbox?.map((n) => (
            <div key={n.id} className="rounded-lg border border-line p-2 text-xs">
              <div className="flex items-center gap-2"><Pill tone={n.status === "sent" ? "good" : n.status === "failed" ? "critical" : "warn"}>{n.status}</Pill><span className="text-ink-3">{n.channel} → {n.recipient ?? "nobody"} · {when(n.created_at + "Z")}</span>{n.error && <span className="text-ink-3">({n.error})</span>}</div>
              <div className="mt-1 whitespace-pre-wrap text-ink-2" dangerouslySetInnerHTML={{ __html: n.body.replace(/<(?!\/?(b|i|code)>)[^>]*>/g, "") }} />
            </div>
          ))}
          {outbox && !outbox.length && <p className="text-sm text-ink-3">Nothing sent yet.</p>}
        </div>
      </Section>
    </div>
  );
}
