import { spawn } from "node:child_process";
import { startSlackSocket } from "./listeners/slack-socket.js";
import type { SlackIncomingMessage } from "./listeners/slack-socket.js";
import { logSessionDifficulty } from "./utils/session-log.js";

/**
 * System prompt that makes Claude respond as a natural, conversational
 * coworker — not a bot. Embeds key humanizer patterns inline so every
 * response avoids AI-sounding language without a separate processing step.
 */
const COWORKER_SYSTEM_PROMPT = `You are Trey's coworker responding in Slack. You are conversational, concise, and natural.

Rules:
- Talk like a real person on Slack — short messages, contractions, casual tone.
- No greetings like "Hi!" or "Hey there!" unless it fits the thread naturally.
- No sycophancy ("Great question!", "Absolutely!", "Of course!").
- No filler ("In order to", "It's important to note").
- No em dash overuse. No rule-of-three lists. No bold headers in chat.
- No significance inflation ("pivotal", "crucial", "transformative").
- Vary sentence length. Have opinions. Be direct.
- If you don't know something, say so plainly.
- Keep responses Slack-length — a few sentences, not paragraphs. Match the energy of the message.
- You have access to macOS tools (reminders, calendar, notes, mail, messages). Use them when asked.
- If something goes wrong or you're unsure, note it honestly — don't paper over it.`;

/** Timeout for Claude CLI calls (2 minutes). */
const CLAUDE_TIMEOUT_MS = 120_000;

/**
 * Call the Claude CLI in print mode to generate a conversational response.
 * Uses Trey's existing Claude Code auth — no separate API key needed.
 *
 * Pipes the prompt via stdin to avoid argument-parsing issues (messages
 * starting with "-" would be interpreted as CLI flags otherwise).
 */
async function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "claude",
      [
        "-p",
        "--model", "opus",
        "--append-system-prompt", COWORKER_SYSTEM_PROMPT,
      ],
      {
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`claude exited with code ${code}: ${stderr.trim()}`));
      }
    });

    child.on("error", reject);

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Claude CLI timed out after 2 minutes"));
    }, CLAUDE_TIMEOUT_MS);

    child.on("close", () => clearTimeout(timer));

    // Pipe the prompt via stdin so it's never parsed as a CLI flag
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

/**
 * Handle an incoming Slack message by routing it through Claude CLI.
 * Logs difficulties to session-difficulties.md when errors occur.
 */
async function handleMessage(msg: SlackIncomingMessage): Promise<string | undefined> {
  const source = msg.isDm ? "DM" : msg.isMention ? "mention" : "channel";
  const text = msg.text.replace(/<@[A-Z0-9]+>/g, "").trim();

  if (!text) return undefined;

  console.log(`[listener] ${source} from ${msg.userId}: ${text.slice(0, 120)}`);

  try {
    const reply = await askClaude(text);

    if (!reply) {
      await logSessionDifficulty({
        category: "edge-case",
        description: "Claude returned empty response",
        context: `slack ${source}: "${text.slice(0, 80)}"`,
      });
      return "Hmm, drew a blank on that one. Try rephrasing?";
    }

    return reply;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[listener] Claude CLI error: ${message}`);

    await logSessionDifficulty({
      category: "error",
      description: `Claude CLI failed: ${message.slice(0, 200)}`,
      context: `slack ${source}: "${text.slice(0, 80)}"`,
    });

    return "Something tripped up on my end. Give me a sec and try again.";
  }
}

async function main(): Promise<void> {
  console.log("[listener] Starting conversational Slack listener...");

  const app = await startSlackSocket({ onMessage: handleMessage });

  const shutdown = async () => {
    console.log("\n[listener] Shutting down...");
    await app.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error("[listener] Failed to start:");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
