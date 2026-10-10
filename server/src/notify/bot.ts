// Telegram bot conversation: linking chats, handoff buttons, post-meeting check-ins.

import { get, kvGet, kvSet, run, updateRow } from "../db.js";
import { answerCallback, clearButtons, sendTelegram, type Update } from "./telegram.js";
import { designerAccepts, designerDeclines, recordMeetingNotes, recordMeetingOutcome, recordReason, resolveEscalation, setLeadStage, type MeetingOutcome } from "../pipeline.js";
import { escapeHtml as h } from "../util.js";

const awaiting = (chat: number | string) => `await:${chat}`;

export async function onTelegramUpdate(u: Update) {
  if (u.callback_query) return onButton(u.callback_query);
  const msg = u.message;
  if (!msg) return;
  const chat = String(msg.chat.id);
  const text = msg.text?.trim() ?? "";

  if (text.startsWith("/start")) {
    const code = text.split(/\s+/)[1]?.toUpperCase();
    if (code === "STUDIOHEAD") {
      await kvSet("studio_head_chat_id", chat);
      return sendTelegram(chat, "✅ This chat now receives escalations and studio alerts.");
    }
    const d = code ? await get("SELECT * FROM designers WHERE link_code = ?", code) : null;
    if (!d) return sendTelegram(chat, "Hi! Send <code>/start YOURCODE</code> with the link code from the Aangan dashboard (Designers page).");
    await updateRow("designers", d.id, { telegram_chat_id: chat });
    return sendTelegram(chat, `✅ Linked, ${h(d.name)}. New leads, consultation check-ins and escalations will arrive here.`);
  }

  const pending = await kvGet(awaiting(chat));
  if (pending) {
    if (msg.voice) return sendTelegram(chat, "🎙 Voice notes aren't transcribed yet — please type the key points.");
    if (!text) return;
    await run("DELETE FROM kv WHERE k = ?", awaiting(chat));
    const [kind, id] = pending.split(":");
    if (kind === "notes") {
      const summary = await recordMeetingNotes(Number(id), text);
      const m = await get("SELECT lead_id FROM meetings WHERE id = ?", Number(id));
      return sendTelegram(chat,
        summary
          ? `📝 Saved. <b>Summary:</b> ${h(summary.summary)}\n<b>Next:</b> ${h(summary.next_steps.join("; ") || "-")}\n<b>Likelihood:</b> ${summary.likelihood}`
          : "📝 Notes saved to the lead.",
        [[{ text: "📄 Proposal next", data: `stage:${m?.lead_id}:proposal` }, { text: "🏆 Won", data: `stage:${m?.lead_id}:won` }, { text: "✖️ Not proceeding", data: `stage:${m?.lead_id}:lost` }]]);
    }
    if (kind === "reason") {
      await recordReason(Number(id), text);
      return sendTelegram(chat, "Noted — thanks. The front desk will see this on the dashboard.");
    }
  }
  if (text) return sendTelegram(chat, "I only handle Aangan lead updates here. Use the buttons on lead messages.");
}

async function onButton(cq: NonNullable<Update["callback_query"]>) {
  const chat = cq.message?.chat.id;
  const msgId = cq.message?.message_id;
  const [action, a, b] = (cq.data ?? "").split(":");
  const done = async (toast: string, footer?: string) => {
    await answerCallback(cq.id, toast);
    if (chat && msgId) await clearButtons(chat, msgId, footer);
  };

  switch (action) {
    case "acc":
      return (await designerAccepts(Number(a))) ? done("Accepted", "✅ Accepted — please call the client today to confirm the slot.") : answerCallback(cq.id, "Already handled");
    case "dec":
      return (await designerDeclines(Number(a))) ? done("Reassigning", "↪️ Passed on — reassigning to another designer.") : answerCallback(cq.id, "Already handled");
    case "met": {
      const outcome = b as MeetingOutcome;
      await recordMeetingOutcome(Number(a), outcome);
      if (outcome === "attended") {
        await kvSet(awaiting(chat!), `notes:${a}`);
        return done("Great", "📝 How did it go? Reply with the key points — scope agreed, budget discussed, client's priorities, next step.");
      }
      await kvSet(awaiting(chat!), `reason:${a}`);
      const ask: Record<string, string> = {
        customer_no_show: "😕 Noted. What happened — did the client give a reason, and should we rebook?",
        designer_missed: "Noted. What stopped you from attending? (so the front desk can rebook)",
        rescheduled: "Noted. What's the new date/time and why was it moved?",
      };
      return done("Noted", ask[outcome]);
    }
    case "stage":
      await setLeadStage(Number(a), b, "set by designer");
      return done("Updated", `Lead marked: ${b}`);
    case "eack":
      await resolveEscalation(Number(a), "acknowledged");
      return answerCallback(cq.id, "Marked as picked up");
    case "edone":
      await resolveEscalation(Number(a), "resolved");
      return done("Resolved", "✅ Escalation resolved.");
  }
  return answerCallback(cq.id);
}
