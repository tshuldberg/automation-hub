import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export type LogCategory =
  | "question"
  | "error"
  | "edge-case"
  | "improvement-idea";

export interface SessionLogEntry {
  category: LogCategory;
  description: string;
  context?: string;
}

const LOG_PATH = join(
  import.meta.dirname ?? ".",
  "../../logs/session-difficulties.md",
);

export async function logSessionDifficulty(
  entry: SessionLogEntry,
): Promise<void> {
  const ts = new Date().toISOString().replace("T", " ").slice(0, 16);
  const ctx = entry.context ? ` (${entry.context})` : "";
  const line = `\n### ${ts}\n- **Category:** ${entry.category}\n- **Description:** ${entry.description}${ctx ? `\n- **Context:** ${entry.context}` : ""}\n`;
  await appendFile(LOG_PATH, line, "utf-8");
}
