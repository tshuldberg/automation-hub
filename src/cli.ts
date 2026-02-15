import path from "node:path";

import { runEmailTriageJob } from "./jobs/email-triage.js";
import { runDueDatePlannerJob } from "./jobs/due-date-planner.js";
import { runGanttDriftJob } from "./jobs/gantt-drift.js";
import { runChannelConsolidationJob } from "./jobs/channel-consolidation.js";
import { loadApprovalPolicy, loadJobSpec, loadRuntimeConfig } from "./runtime/loaders.js";
import { createAdapterKit } from "./adapters/factory.js";

type Command =
  | "run-email-triage"
  | "run-due-date-planner"
  | "run-gantt-drift"
  | "run-channel-consolidation";

const VALID_COMMANDS = new Set<string>([
  "run-email-triage",
  "run-due-date-planner",
  "run-gantt-drift",
  "run-channel-consolidation",
]);

const DEFAULT_JOB_FILES: Record<Command, string> = {
  "run-email-triage": "jobs/01_email_triage.yaml",
  "run-due-date-planner": "jobs/02_calendar_due_date_planner.yaml",
  "run-gantt-drift": "jobs/03_gantt_drift_voice_queue.yaml",
  "run-channel-consolidation": "jobs/04_unified_channel_consolidation.yaml",
};

interface CliOptions {
  jobFile: string | undefined;
  dryRun: boolean;
  approveWrites: boolean;
}

function parseArgs(argv: string[]): { command: string | undefined; options: CliOptions } {
  const command = argv[0];
  const options: CliOptions = {
    jobFile: undefined,
    dryRun: false,
    approveWrites: false,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--job-file") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --job-file");
      }
      options.jobFile = value;
      index += 1;
      continue;
    }

    if (token === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (token === "--approve-writes") {
      options.approveWrites = true;
    }
  }

  return { command, options };
}

function printHelp(): void {
  console.log(
    [
      "Automation Hub CLI",
      "",
      "Usage:",
      "  node dist/cli.js <command> [options]",
      "",
      "Commands:",
      "  run-email-triage            Run Job 01: email triage",
      "  run-due-date-planner        Run Job 02: calendar-aware due date planner",
      "  run-gantt-drift             Run Job 03: gantt drift voice queue",
      "  run-channel-consolidation   Run Job 04: unified channel consolidation",
      "",
      "Options:",
      "  --job-file <path>    Override the YAML job spec file",
      "  --dry-run            Run without executing write actions",
      "  --approve-writes     Approve human-gated write actions",
      "  --help, -h           Show this help message",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const { command, options } = parseArgs(process.argv.slice(2));

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (!VALID_COMMANDS.has(command)) {
    throw new Error(
      `Unsupported command: ${command}\nValid commands: ${[...VALID_COMMANDS].join(", ")}`,
    );
  }

  const typedCommand = command as Command;
  const repoRoot = process.cwd();
  const jobFile = options.jobFile ?? DEFAULT_JOB_FILES[typedCommand];
  const { config: runtimeConfig, sourcePath } = await loadRuntimeConfig(repoRoot);
  const jobSpec = await loadJobSpec(repoRoot, jobFile);
  const policy = await loadApprovalPolicy(repoRoot, runtimeConfig.paths.policy_file);
  const dryRun = options.dryRun || jobSpec.status === "dry_run";

  // Create adapter kit (mock adapters for dry-run, real for production)
  const adapters = await createAdapterKit({ repoRoot, dryRun });

  if (typedCommand === "run-email-triage") {
    const run = await runEmailTriageJob(runtimeConfig, jobSpec, policy, {
      repoRoot,
      dryRun,
      approveWrites: options.approveWrites,
      adapters,
    });

    const outputLines = Object.entries(run.outputPaths)
      .map(([key, value]) => `  - ${key}: ${path.relative(repoRoot, value)}`)
      .join("\n");

    console.log(`Run complete: ${run.runId}`);
    console.log(`Runtime config: ${path.relative(repoRoot, sourcePath)}`);
    console.log(`Threads scanned: ${run.result.scanned_threads}`);
    console.log(`Relevant threads: ${run.result.relevant_threads}`);
    console.log(`Proposed tasks: ${run.result.proposed_tasks.length}`);
    console.log(`\nOutputs:\n${outputLines}`);
    return;
  }

  if (typedCommand === "run-due-date-planner") {
    const run = await runDueDatePlannerJob(runtimeConfig, jobSpec, policy, {
      repoRoot,
      dryRun,
      approveWrites: options.approveWrites,
      adapters,
    });

    const outputLines = Object.entries(run.outputPaths)
      .map(([key, value]) => `  - ${key}: ${path.relative(repoRoot, value)}`)
      .join("\n");

    console.log(`Run complete: ${run.runId}`);
    console.log(`Runtime config: ${path.relative(repoRoot, sourcePath)}`);
    console.log(`Projects scanned: ${run.result.projects_scanned}`);
    console.log(`Tasks analyzed: ${run.result.tasks_analyzed}`);
    console.log(`Date proposals: ${run.result.proposals.length}`);
    console.log(`Escalations: ${run.result.escalations.length}`);
    console.log(`\nOutputs:\n${outputLines}`);
    return;
  }

  if (typedCommand === "run-gantt-drift") {
    const run = await runGanttDriftJob(runtimeConfig, jobSpec, policy, {
      repoRoot,
      dryRun,
      approveWrites: options.approveWrites,
      adapters,
    });

    const outputLines = Object.entries(run.outputPaths)
      .map(([key, value]) => `  - ${key}: ${path.relative(repoRoot, value)}`)
      .join("\n");

    console.log(`Run complete: ${run.runId}`);
    console.log(`Runtime config: ${path.relative(repoRoot, sourcePath)}`);
    console.log(`Projects scanned: ${run.result.projects_scanned}`);
    console.log(`Email threads scanned: ${run.result.email_threads_scanned}`);
    console.log(`Drift items: ${run.result.drift_items.length}`);
    console.log(`Response drafts: ${run.result.response_drafts.length}`);
    console.log(`\nOutputs:\n${outputLines}`);
    return;
  }

  if (typedCommand === "run-channel-consolidation") {
    const run = await runChannelConsolidationJob(runtimeConfig, jobSpec, policy, {
      repoRoot,
      dryRun,
      approveWrites: options.approveWrites,
      adapters,
    });

    const outputLines = Object.entries(run.outputPaths)
      .map(([key, value]) => `  - ${key}: ${path.relative(repoRoot, value)}`)
      .join("\n");

    console.log(`Run complete: ${run.runId}`);
    console.log(`Runtime config: ${path.relative(repoRoot, sourcePath)}`);
    console.log(`Channels polled: ${run.result.channels_polled}`);
    console.log(`Items collected: ${run.result.items_collected}`);
    console.log(`Items after dedup: ${run.result.items_after_dedup}`);
    console.log(`Unified queue: ${run.result.unified_queue.length}`);
    console.log(`Proposed tasks: ${run.result.proposed_tasks.length}`);
    console.log(`\nOutputs:\n${outputLines}`);
    return;
  }
}

main().catch((error: unknown) => {
  console.error("Automation Hub CLI failed.");
  if (error instanceof Error) {
    console.error(error.stack ?? error.message);
  } else {
    console.error(String(error));
  }
  process.exitCode = 1;
});
