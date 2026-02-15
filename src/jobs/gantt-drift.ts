import {
  ApprovalPolicy,
  AuditLogEntry,
  JobSpec,
  ProposedReply,
  ProposedReplySchema,
  RuntimeConfig,
} from "../contracts.js";
import { evaluateWriteApprovals } from "../approval/gate.js";
import { createRunPaths, buildRunId } from "../runtime/run-files.js";
import { saveJsonFile, saveTextFile } from "../runtime/loaders.js";
import {
  containsAnyKeyword,
  extractActionCandidates,
  extractDateCandidate,
  inferPriority,
  summarizeText,
  toTitleCase,
} from "../utils/extraction.js";
import { semanticFingerprint } from "../utils/hash.js";
import type { AdapterKit } from "../adapters/factory.js";
import type { ChannelItem } from "../adapters/adapter.interface.js";

interface JobRunOptions {
  repoRoot: string;
  dryRun: boolean;
  approveWrites: boolean;
  adapters: AdapterKit;
}

type DriftCategory = "late_start" | "blocked_dependency" | "scope_increase" | "capacity_risk";

interface DriftItem {
  project_id: string | undefined;
  task_title: string;
  category: DriftCategory;
  planned_date: string | undefined;
  signal_date: string | undefined;
  delta_days: number;
  evidence: string;
  corrective_action: string;
  priority: string;
}

interface GanttDriftResult {
  projects_scanned: number;
  email_threads_scanned: number;
  drift_items: DriftItem[];
  voice_queue: string;
  response_drafts: ProposedReply[];
  approval_decisions: ReturnType<typeof evaluateWriteApprovals>;
  audit_log: AuditLogEntry[];
}

function categorizeDrift(content: string): DriftCategory {
  const lower = content.toLowerCase();
  if (lower.includes("blocked") || lower.includes("dependency") || lower.includes("waiting on")) {
    return "blocked_dependency";
  }
  if (lower.includes("scope") || lower.includes("additional") || lower.includes("new requirement")) {
    return "scope_increase";
  }
  if (lower.includes("capacity") || lower.includes("overloaded") || lower.includes("bandwidth")) {
    return "capacity_risk";
  }
  return "late_start";
}

function computeDeltaDays(planned: string | undefined, actual: string | undefined): number {
  if (!planned || !actual) return 0;
  const plannedMs = new Date(planned).getTime();
  const actualMs = new Date(actual).getTime();
  if (Number.isNaN(plannedMs) || Number.isNaN(actualMs)) return 0;
  return Math.round((actualMs - plannedMs) / (1000 * 60 * 60 * 24));
}

function buildVoiceQueue(driftItems: DriftItem[]): string {
  const lines = [
    "# Voice Review Queue -- Gantt Drift",
    "",
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];

  if (driftItems.length === 0) {
    lines.push("No drift items detected. All projects are tracking to plan.");
    return lines.join("\n");
  }

  for (const [index, item] of driftItems.entries()) {
    lines.push(`## Item ${index + 1}: ${item.task_title}`);
    lines.push("");
    lines.push(`**Category:** ${item.category.replace(/_/g, " ")}`);
    lines.push(`**Priority:** ${item.priority}`);
    if (item.planned_date) {
      lines.push(`**Planned:** ${item.planned_date}`);
    }
    if (item.delta_days !== 0) {
      lines.push(`**Drift:** ${item.delta_days > 0 ? "+" : ""}${item.delta_days} days`);
    }
    lines.push(`**Evidence:** ${item.evidence}`);
    lines.push("");
    lines.push(`**Decision needed:** ${item.corrective_action}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

function buildReplyDraft(emailItem: ChannelItem, driftItem: DriftItem): ProposedReply {
  const recipientHint = emailItem.participants.find((p) => p.includes("@"));
  return ProposedReplySchema.parse({
    thread_id: emailItem.id,
    subject: `Re: ${emailItem.subject ?? "Project Update"}`,
    recipient_hint: recipientHint,
    body: [
      "Thanks for the update.",
      "",
      `We've identified a potential ${driftItem.category.replace(/_/g, " ")} issue: ${driftItem.corrective_action}`,
      "",
      "We'll follow up with a revised plan once the team reviews.",
    ].join("\n"),
  });
}

function createSummaryMarkdown(result: GanttDriftResult, runId: string, dryRun: boolean): string {
  const approvalBlocked = result.approval_decisions.filter((d) => !d.approved).length;

  const lines = [
    "# Gantt Drift Voice Queue Run Summary",
    "",
    `- Run ID: ${runId}`,
    `- Mode: ${dryRun ? "dry_run" : "write_enabled"}`,
    `- Projects scanned: ${result.projects_scanned}`,
    `- Email threads scanned: ${result.email_threads_scanned}`,
    `- Drift items detected: ${result.drift_items.length}`,
    `- Response drafts: ${result.response_drafts.length}`,
    `- Blocked write actions: ${approvalBlocked}`,
    "",
    "## Drift Items",
  ];

  for (const item of result.drift_items) {
    lines.push(
      `- **${item.task_title}** [${item.category}] ${item.priority}: ${item.corrective_action}`,
    );
  }

  return lines.join("\n");
}

export async function runGanttDriftJob(
  runtime: RuntimeConfig,
  jobSpec: JobSpec,
  approvalPolicy: ApprovalPolicy,
  options: JobRunOptions,
): Promise<{ runId: string; result: GanttDriftResult; outputPaths: Record<string, string> }> {
  const runId = buildRunId(jobSpec.id);
  const paths = await createRunPaths(options.repoRoot, runId, jobSpec.outputs);
  const { adapters } = options;

  const auditLog: AuditLogEntry[] = [];

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "job_start",
    details: "Gantt drift detection job started.",
  });

  // Step 1: Load project timelines from PM adapter
  const pmItems = await adapters.pm.listItems({ limit: 100 });

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "load_projects",
    details: `Loaded ${pmItems.length} project items from PM adapter.`,
  });

  // Step 2: Load recent email threads (24h window)
  const windowHours = jobSpec.inputs.email?.window_hours ?? 24;
  const sinceDate = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const emailItems = await adapters.email.listItems({
    limit: 200,
    since: sinceDate,
  });

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "load_emails",
    details: `Loaded ${emailItems.length} email items from ${windowHours}h window.`,
  });

  // Step 3: Compare planned dates vs email-derived signals
  const driftItems: DriftItem[] = [];
  const responseDrafts: ProposedReply[] = [];
  const fingerprints = new Set<string>();

  for (const emailItem of emailItems) {
    const candidates = extractActionCandidates(emailItem.content);
    if (candidates.length === 0) continue;

    const signalDate = extractDateCandidate(emailItem.content);

    for (const candidate of candidates) {
      const fingerprint = semanticFingerprint([emailItem.id, candidate]);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);

      // Look for matching PM items by content similarity
      const matchingPm = pmItems.find((pm) => {
        const pmCorpus = `${pm.subject ?? ""} ${pm.content}`.toLowerCase();
        const emailCorpus = `${emailItem.subject ?? ""} ${candidate}`.toLowerCase();
        return containsAnyKeyword(pmCorpus, emailCorpus.split(/\s+/).filter((w) => w.length > 4).slice(0, 5));
      });

      const plannedDate = matchingPm?.metadata.due_date as string | undefined;
      const delta = computeDeltaDays(plannedDate, signalDate ?? new Date().toISOString().slice(0, 10));

      // Only flag if there's meaningful drift or the email contains drift signals
      const hasDriftSignal =
        delta > 2 ||
        containsAnyKeyword(candidate, ["delayed", "blocked", "slipped", "behind", "risk", "overdue", "late"]);

      if (!hasDriftSignal) continue;

      const category = categorizeDrift(candidate);
      const title = toTitleCase(summarizeText(candidate, 120));

      const correctiveAction = category === "blocked_dependency"
        ? `Unblock dependency and reassess timeline for "${title}".`
        : category === "scope_increase"
          ? `Review scope change and adjust sprint capacity for "${title}".`
          : category === "capacity_risk"
            ? `Redistribute workload or extend timeline for "${title}".`
            : `Investigate delay and propose revised start date for "${title}".`;

      driftItems.push({
        project_id: matchingPm?.metadata.project_id as string | undefined,
        task_title: title,
        category,
        planned_date: plannedDate,
        signal_date: signalDate,
        delta_days: delta,
        evidence: summarizeText(emailItem.content, 200),
        corrective_action: correctiveAction,
        priority: inferPriority(candidate),
      });

      responseDrafts.push(buildReplyDraft(emailItem, driftItems[driftItems.length - 1]!));
    }
  }

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "drift_detection",
    details: `Detected ${driftItems.length} drift items from ${emailItems.length} email signals.`,
  });

  // Step 4: Evaluate write approvals
  const approvalDecisions = evaluateWriteApprovals(
    approvalPolicy,
    jobSpec.approval.allowed_write_tools,
    { dryRun: options.dryRun, approveWrites: options.approveWrites },
  );

  for (const decision of approvalDecisions) {
    auditLog.push({
      timestamp: new Date().toISOString(),
      level: decision.approved ? "info" : "warn",
      action: "approval_gate",
      details: `${decision.requested_action}: ${decision.reason}`,
      metadata: { decision },
    });
  }

  const voiceQueue = buildVoiceQueue(driftItems);

  const result: GanttDriftResult = {
    projects_scanned: pmItems.length,
    email_threads_scanned: emailItems.length,
    drift_items: driftItems,
    voice_queue: voiceQueue,
    response_drafts: responseDrafts,
    approval_decisions: approvalDecisions,
    audit_log: auditLog,
  };

  // Write outputs
  const summary = createSummaryMarkdown(result, runId, options.dryRun);

  if (paths.resolvedOutputs.summary_markdown) {
    await saveTextFile(paths.resolvedOutputs.summary_markdown, `${summary}\n`);
  }

  if (paths.resolvedOutputs.schedule_drift_json) {
    await saveJsonFile(paths.resolvedOutputs.schedule_drift_json, driftItems);
  }

  if (paths.resolvedOutputs.voice_queue_markdown) {
    await saveTextFile(paths.resolvedOutputs.voice_queue_markdown, `${voiceQueue}\n`);
  }

  if (paths.resolvedOutputs.response_drafts_json) {
    await saveJsonFile(paths.resolvedOutputs.response_drafts_json, responseDrafts);
  }

  if (paths.resolvedOutputs.audit_log_json) {
    await saveJsonFile(paths.resolvedOutputs.audit_log_json, auditLog);
  }

  return { runId, result, outputPaths: paths.resolvedOutputs };
}
