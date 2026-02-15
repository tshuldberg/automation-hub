import { App } from "@slack/bolt";

/** Trey's Slack user ID for self-message detection. */
const SELF_USER_ID = "U01BBL118JC";

export interface SlackIncomingMessage {
  text: string;
  userId: string;
  channelId: string;
  threadTs: string | undefined;
  ts: string;
  isDm: boolean;
  isSelf: boolean;
  isMention: boolean;
}

export type MessageHandler = (msg: SlackIncomingMessage) => Promise<string | undefined>;

export interface SlackSocketOptions {
  /** Bot token (xoxb-...). Falls back to SLACK_BOT_TOKEN env var. */
  botToken?: string;
  /** App-level token (xapp-...). Falls back to SLACK_APP_TOKEN env var. */
  appToken?: string;
  /** Handler called for each incoming DM or mention. Return a string to reply. */
  onMessage: MessageHandler;
}

/**
 * Long-running Socket Mode listener for Slack.
 *
 * Handles three event types:
 * 1. DM messages — always dispatched to the handler
 * 2. app_mention events — dispatched to the handler, replies in-thread
 * 3. Channel messages — ignored (future: proactive participation)
 *
 * The handler receives a normalized `SlackIncomingMessage` and returns an
 * optional reply string. If a reply is returned, it is posted back to the
 * same channel/thread.
 */
export async function startSlackSocket(opts: SlackSocketOptions): Promise<App> {
  const botToken = opts.botToken ?? process.env["SLACK_BOT_TOKEN"];
  const appToken = opts.appToken ?? process.env["SLACK_APP_TOKEN"];

  if (!botToken) {
    throw new Error(
      "Missing SLACK_BOT_TOKEN. Set it in the environment or pass botToken option.",
    );
  }
  if (!appToken) {
    throw new Error(
      "Missing SLACK_APP_TOKEN (xapp-...). Socket Mode requires an app-level token.\n" +
        "Generate one at: https://api.slack.com/apps → Basic Information → App-Level Tokens\n" +
        "Required scope: connections:write",
    );
  }

  const app = new App({
    token: botToken,
    appToken,
    socketMode: true,
  });

  // --- DM messages ---
  app.message(async ({ message, say }) => {
    // Only handle standard user messages (not bot messages, edits, deletes, etc.)
    const msg = message as unknown as Record<string, unknown>;
    if (msg["subtype"] !== undefined) return;

    // Ignore messages from bots (including our own)
    if (msg["bot_id"] !== undefined) return;

    const isDm = msg["channel_type"] === "im";

    // For now, only respond to DMs. Channel messages will be handled
    // in a future iteration for proactive participation.
    if (!isDm) return;

    const incoming: SlackIncomingMessage = {
      text: (msg["text"] as string) ?? "",
      userId: (msg["user"] as string) ?? "",
      channelId: (msg["channel"] as string) ?? "",
      threadTs: msg["thread_ts"] as string | undefined,
      ts: (msg["ts"] as string) ?? "",
      isDm,
      isSelf: msg["user"] === SELF_USER_ID,
      isMention: false,
    };

    const reply = await opts.onMessage(incoming);
    if (reply) {
      await say({ text: reply, thread_ts: (msg["thread_ts"] as string) ?? (msg["ts"] as string) });
    }
  });

  // --- app_mention events ---
  app.event("app_mention", async ({ event, say }) => {
    const mention = event as unknown as Record<string, unknown>;

    const incoming: SlackIncomingMessage = {
      text: (mention["text"] as string) ?? "",
      userId: (mention["user"] as string) ?? "",
      channelId: (mention["channel"] as string) ?? "",
      threadTs: mention["thread_ts"] as string | undefined,
      ts: (mention["ts"] as string) ?? "",
      isDm: false,
      isSelf: mention["user"] === SELF_USER_ID,
      isMention: true,
    };

    const reply = await opts.onMessage(incoming);
    if (reply) {
      // Always reply in-thread for channel mentions
      await say({
        text: reply,
        thread_ts: (mention["thread_ts"] as string) ?? (mention["ts"] as string),
      });
    }
  });

  await app.start();
  console.log("[slack-socket] Connected via Socket Mode. Listening for DMs and mentions.");

  return app;
}
