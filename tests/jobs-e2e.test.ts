import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { runEmailTriageJob } from "../src/jobs/email-triage.js";
import { runDueDatePlannerJob } from "../src/jobs/due-date-planner.js";
import { runGanttDriftJob } from "../src/jobs/gantt-drift.js";
import { runChannelConsolidationJob } from "../src/jobs/channel-consolidation.js";
import { loadApprovalPolicy, loadJobSpec, loadRuntimeConfig } from "../src/runtime/loaders.js";
import { createAdapterKit } from "../src/adapters/factory.js";
import type { RuntimeConfig, ApprovalPolicy, JobSpec } from "../src/contracts.js";
import type { AdapterKit } from "../src/adapters/factory.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
let tmpDir: string;
let runtimeConfig: RuntimeConfig;
let policy: ApprovalPolicy;
let adapters: AdapterKit;

beforeAll(async () => {
  // Create a temp directory as repoRoot for run outputs to avoid polluting the real runs/ dir
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "automation-hub-e2e-"));

  // Copy required config/state directories into tmpDir
  const dirs = ["config", "policies", "jobs", "schemas", "state"];
  for (const dir of dirs) {
    const src = path.join(REPO_ROOT, dir);
    const dst = path.join(tmpDir, dir);
    await fs.cp(src, dst, { recursive: true });
  }

  const { config } = await loadRuntimeConfig(tmpDir);
  runtimeConfig = config;
  policy = await loadApprovalPolicy(tmpDir, runtimeConfig.paths.policy_file);
  adapters = await createAdapterKit({ repoRoot: tmpDir, dryRun: true });
});

afterAll(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

describe("Job 01: Email Triage (dry-run)", () => {
  let jobSpec: JobSpec;

  beforeAll(async () => {
    jobSpec = await loadJobSpec(tmpDir, "jobs/01_email_triage.yaml");
  });

  it("completes without error", async () => {
    const run = await runEmailTriageJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.runId).toMatch(/^email-triage/);
    expect(run.result).toBeDefined();
  });

  it("produces expected output structure", async () => {
    const run = await runEmailTriageJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.result.scanned_threads).toBeGreaterThanOrEqual(0);
    expect(run.result.relevant_threads).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(run.result.proposed_tasks)).toBe(true);
    expect(Array.isArray(run.result.proposed_replies)).toBe(true);
    expect(Array.isArray(run.result.approval_decisions)).toBe(true);
    expect(Array.isArray(run.result.audit_log)).toBe(true);
    expect(typeof run.result.voice_brief).toBe("string");
  });

  it("writes summary markdown to output path", async () => {
    const run = await runEmailTriageJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    if (run.outputPaths.summary_markdown) {
      const content = await fs.readFile(run.outputPaths.summary_markdown, "utf-8");
      expect(content).toContain("Email Triage Run Summary");
      expect(content).toContain("dry_run");
    }
  });

  it("blocks writes in dry-run mode", async () => {
    const run = await runEmailTriageJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: true,
    });
    for (const decision of run.result.approval_decisions) {
      expect(decision.approved).toBe(false);
    }
  });
});

describe("Job 02: Due Date Planner (dry-run)", () => {
  let jobSpec: JobSpec;

  beforeAll(async () => {
    jobSpec = await loadJobSpec(tmpDir, "jobs/02_calendar_due_date_planner.yaml");
  });

  it("completes without error", async () => {
    const run = await runDueDatePlannerJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.runId).toMatch(/^calendar-aware/);
    expect(run.result).toBeDefined();
  });

  it("produces expected output structure", async () => {
    const run = await runDueDatePlannerJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(typeof run.result.projects_scanned).toBe("number");
    expect(typeof run.result.tasks_analyzed).toBe("number");
    expect(Array.isArray(run.result.proposals)).toBe(true);
    expect(Array.isArray(run.result.capacity_risks)).toBe(true);
    expect(Array.isArray(run.result.escalations)).toBe(true);
    expect(Array.isArray(run.result.approval_decisions)).toBe(true);
    expect(Array.isArray(run.result.audit_log)).toBe(true);
  });

  it("writes summary markdown to output path", async () => {
    const run = await runDueDatePlannerJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    if (run.outputPaths.summary_markdown) {
      const content = await fs.readFile(run.outputPaths.summary_markdown, "utf-8");
      expect(content).toContain("Due Date Planner Run Summary");
    }
  });
});

describe("Job 03: Gantt Drift (dry-run)", () => {
  let jobSpec: JobSpec;

  beforeAll(async () => {
    jobSpec = await loadJobSpec(tmpDir, "jobs/03_gantt_drift_voice_queue.yaml");
  });

  it("completes without error", async () => {
    const run = await runGanttDriftJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.runId).toMatch(/^gantt-drift/);
    expect(run.result).toBeDefined();
  });

  it("produces expected output structure", async () => {
    const run = await runGanttDriftJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(typeof run.result.projects_scanned).toBe("number");
    expect(typeof run.result.email_threads_scanned).toBe("number");
    expect(Array.isArray(run.result.drift_items)).toBe(true);
    expect(typeof run.result.voice_queue).toBe("string");
    expect(Array.isArray(run.result.response_drafts)).toBe(true);
    expect(Array.isArray(run.result.approval_decisions)).toBe(true);
    expect(Array.isArray(run.result.audit_log)).toBe(true);
  });

  it("generates voice queue content", async () => {
    const run = await runGanttDriftJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.result.voice_queue).toContain("Voice Review Queue");
  });
});

describe("Job 04: Channel Consolidation (dry-run)", () => {
  let jobSpec: JobSpec;

  beforeAll(async () => {
    jobSpec = await loadJobSpec(tmpDir, "jobs/04_unified_channel_consolidation.yaml");
  });

  it("completes without error", async () => {
    const run = await runChannelConsolidationJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.runId).toMatch(/^unified-channel/);
    expect(run.result).toBeDefined();
  });

  it("produces expected output structure", async () => {
    const run = await runChannelConsolidationJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(typeof run.result.channels_polled).toBe("number");
    expect(typeof run.result.items_collected).toBe("number");
    expect(typeof run.result.items_after_dedup).toBe("number");
    expect(typeof run.result.tasks_extracted).toBe("number");
    expect(Array.isArray(run.result.unified_queue)).toBe(true);
    expect(Array.isArray(run.result.proposed_tasks)).toBe(true);
    expect(Array.isArray(run.result.proposed_replies)).toBe(true);
    expect(Array.isArray(run.result.proposed_reminders)).toBe(true);
    expect(Array.isArray(run.result.approval_decisions)).toBe(true);
    expect(Array.isArray(run.result.audit_log)).toBe(true);
  });

  it("polls all 5 channels", async () => {
    const run = await runChannelConsolidationJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    expect(run.result.channels_polled).toBe(5);
  });

  it("writes summary markdown to output path", async () => {
    const run = await runChannelConsolidationJob(runtimeConfig, jobSpec, policy, {
      repoRoot: tmpDir,
      dryRun: true,
      approveWrites: false,
      adapters,
    });
    if (run.outputPaths.summary_markdown) {
      const content = await fs.readFile(run.outputPaths.summary_markdown, "utf-8");
      expect(content).toContain("Unified Channel Consolidation Run Summary");
    }
  });
});
