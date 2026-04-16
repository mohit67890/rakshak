/**
 * Open the Raksha bot 1:1 chat in Teams.
 *
 * Uses the Teams deep link to navigate to the personal chat with the bot.
 * The `message` parameter pre-fills the compose box so the user can
 * just hit send.
 */
import { app } from "@microsoft/teams-js";

declare const __BOT_ID__: string;

export function openBotChat(message = "Hi"): void {
  const botId = __BOT_ID__;
  if (!botId) {
    console.warn("[raksha-tab] BOT_ID not configured — cannot open chat");
    return;
  }

  // 28:{appId} is the MRI format for a bot in Teams
  const deepLink =
    `https://teams.microsoft.com/l/chat/0/0?users=28:${encodeURIComponent(botId)}` +
    `&message=${encodeURIComponent(message)}`;

  app.openLink(deepLink).catch((err) => {
    console.warn("[raksha-tab] Failed to open bot chat:", err);
  });
}
