import { App } from "@slack/bolt";
import { config } from "./config.js";
import { findTopSopsForTicketText } from "./match.js";

function matchPercent(score: number): string {
  if (score >= 0 && score <= 1) {
    return (score * 100).toFixed(1);
  }
  return (((score + 1) / 2) * 100).toFixed(1);
}

function formatReply(matches: Array<{ title: string; url: string; score: number }>): string {
  if (matches.length === 0) {
    return "No close SOP matches were found. Try rephrasing or check Confluence labels/CQL for indexing.";
  }
  const lines = matches.map((m, i) => {
    const pct = matchPercent(m.score);
    return `${i + 1}. *${m.title}* (~${pct}% similarity)\n   ${m.url}`;
  });
  return `Here are the most relevant SOPs:\n\n${lines.join("\n\n")}`;
}

export function createSlackApp(): App {
  const appToken = config.slackAppToken();
  const app = new App({
    token: config.slackBotToken(),
    signingSecret: config.slackSigningSecret(),
    socketMode: Boolean(appToken),
    appToken: appToken ?? undefined,
  });

  const supportChannel = config.slackSupportChannelId();
  const processThreadReplies = config.slackProcessThreadReplies();
  const allowBotTickets = config.slackAllowBotTickets();
  const ourAppId = config.slackAppId();

  app.message(async ({ message, client, logger }) => {
    try {
      const subtype = "subtype" in message ? message.subtype : undefined;
      if (subtype && subtype !== "bot_message") {
        return;
      }
      if (subtype === "bot_message" && !allowBotTickets) {
        return;
      }

      if (ourAppId && "app_id" in message && message.app_id === ourAppId) {
        return;
      }

      if (!("text" in message) || typeof message.text !== "string") return;

      if ("bot_id" in message && message.bot_id && !allowBotTickets) return;

      if (
        message.text.includes("Here are the most relevant SOPs:") ||
        message.text.includes("No close SOP matches were found.")
      ) {
        return;
      }

      const channel =
        "channel" in message && typeof message.channel === "string"
          ? message.channel
          : undefined;
      if (!channel) return;

      if (supportChannel && channel !== supportChannel) return;

      const threadTs =
        "thread_ts" in message && typeof message.thread_ts === "string"
          ? message.thread_ts
          : undefined;
      if (threadTs && !processThreadReplies) return;

      const text = message.text.trim();
      if (!text) return;

      const matches = await findTopSopsForTicketText(text);
      const parentTs =
        "thread_ts" in message && typeof message.thread_ts === "string"
          ? message.thread_ts
          : "ts" in message && typeof message.ts === "string"
            ? message.ts
            : undefined;
      const replyTs = parentTs ?? (typeof message.ts === "string" ? message.ts : undefined);
      if (!replyTs) return;

      await client.chat.postMessage({
        channel,
        thread_ts: replyTs,
        text: formatReply(matches),
        unfurl_links: true,
        unfurl_media: false,
      });
    } catch (err) {
      logger.error(err);
    }
  });

  return app;
}
