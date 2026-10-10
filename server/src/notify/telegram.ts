// Telegram is the handoff channel: designers are on site all day, the note must arrive in
// seconds, and inline buttons let them accept / report a meeting outcome with one tap.
// Uses long polling, so it works on a laptop without a public URL.

import { config } from "../config.js";
import { insertRow, kvGet, kvSet } from "../db.js";

export type Button = { text: string; data: string } | { text: string; url: string };

async function tg(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${config.telegram.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await res.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

/** Send an HTML message. Always recorded in `notifications`, so the dashboard shows what went out even without a bot. */
export async function sendTelegram(chatId: string | null | undefined, html: string, buttons: Button[][] = []) {
  if (!config.telegram.token || !chatId) {
    await insertRow("notifications", { channel: "telegram", recipient: chatId ?? null, body: html, status: "skipped", error: !config.telegram.token ? "TELEGRAM_BOT_TOKEN not set" : "recipient has not linked Telegram" });
    return null;
  }
  try {
    const r = await tg("sendMessage", {
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(buttons.length
        ? { reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ("url" in b ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } }
        : {}),
    });
    await insertRow("notifications", { channel: "telegram", recipient: chatId, body: html, status: "sent" });
    return r;
  } catch (e) {
    await insertRow("notifications", { channel: "telegram", recipient: chatId, body: html, status: "failed", error: (e as Error).message });
    return null;
  }
}

export const studioHeadChat = async () => config.telegram.studioHeadChatId || (await kvGet("studio_head_chat_id")) || null;

export type Update = {
  update_id: number;
  message?: { chat: { id: number }; from?: { first_name?: string }; text?: string; voice?: unknown };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number }; message_id: number; text?: string } };
};

export async function answerCallback(id: string, text?: string) {
  await tg("answerCallbackQuery", { callback_query_id: id, text }).catch(() => {});
}

export async function clearButtons(chatId: number, messageId: number, footer?: string, originalText?: string) {
  await tg("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {});
  if (footer) await tg("sendMessage", { chat_id: chatId, text: footer, parse_mode: "HTML", reply_to_message_id: messageId }).catch(() => {});
  void originalText;
}

export function startPolling(onUpdate: (u: Update) => Promise<void>) {
  if (!config.telegram.token) return;
  let stopped = false;
  (async () => {
    // Webhook and getUpdates are mutually exclusive
    await tg("deleteWebhook", {}).catch(() => {});
    while (!stopped) {
      try {
        const offset = Number(await kvGet("tg_offset") ?? 0);
        const updates: Update[] = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message", "callback_query"] });
        for (const u of updates) {
          await kvSet("tg_offset", String(u.update_id + 1));
          await onUpdate(u).catch((e) => console.error("telegram handler:", e));
        }
      } catch (e) {
        console.error("telegram poll:", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  })();
  return () => { stopped = true; };
}
