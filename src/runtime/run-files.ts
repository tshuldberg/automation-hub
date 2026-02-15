import path from "node:path";

import { JobRunPaths } from "../contracts.js";
import { ensureDirectory } from "./loaders.js";

function resolveOutputPath(repoRoot: string, templatePath: string, runId: string): string {
  const normalizedTemplate = templatePath.replace("{{run_id}}", runId).replace(/^\.\//, "");
  return path.join(repoRoot, normalizedTemplate);
}

export async function createRunPaths(
  repoRoot: string,
  runId: string,
  outputTemplates: Record<string, string>
): Promise<JobRunPaths> {
  const resolvedOutputs: Record<string, string> = {};
  for (const [key, template] of Object.entries(outputTemplates)) {
    resolvedOutputs[key] = resolveOutputPath(repoRoot, template, runId);
  }

  const runDir = path.join(repoRoot, "runs", runId);
  await ensureDirectory(runDir);

  for (const filePath of Object.values(resolvedOutputs)) {
    await ensureDirectory(path.dirname(filePath));
  }

  return { runDir, resolvedOutputs };
}

export function buildRunId(jobId: string): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${jobId}-${stamp}`;
}
