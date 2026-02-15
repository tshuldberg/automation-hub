import {
  ApprovalPolicy,
  AuditLogEntry,
  CanonicalTask,
  CanonicalTaskSchema,
  JobSpec,
  RuntimeConfig,
} from "../contracts.js";
import { evaluateWriteApprovals } from "../approval/gate.js";
import { createRunPaths, buildRunId } from "../runtime/run-files.js";
import { saveJsonFile, saveTextFile } from "../runtime/loaders.js";
import { inferPriority, summarizeText, toTitleCase } from "../utils/extraction.js";
import { semanticFingerprint } from "../utils/hash.js";
import type { AdapterKit } from "../adapters/factory.js";
import type { ChannelItem } from "../adapters/adapter.interface.js";

interface JobRunOptions {
  repoRoot: string;
  dryRun: boolean;
  approveWrites: boolean;
  adapters: AdapterKit;
}

interface DueDateProposal {
  task_title: string;
  project_id: string | undefined;
  current_due_date: string | undefined;
  proposed_due_date: string;
  rationale: string;
  confidence: number;
  conflicts: string[];
}

interface CapacityRisk {
  date: string;
  event_count: number;
  risk_level: "low" | "medium" | "high";
  details: string;
}

interface DueDatePlannerResult {
  projects_scanned: number;
  tasks_analyzed: number;
  proposals: DueDateProposal[];
  capacity_risks: CapacityRisk[];
  escalations: string[];
  approval_decisions: ReturnType<typeof evaluateWriteApprovals>;
  audit_log: AuditLogEntry[];
}

function buildDependencyGraph(tasks: CanonicalTask[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();
  for (const task of tasks) {
    graph.set(task.source_reference, task.dependency_task_ids);
  }
  return graph;
}

function getAvailableDates(
  calendarItems: ChannelItem[],
  windowDays: number,
): { available: string[]; busyDates: Map<string, number> } {
  const busyDates = new Map<string, number>();
  for (const item of calendarItems) {
    const date = item.timestamp.slice(0, 10);
    busyDates.set(date, (busyDates.get(date) ?? 0) + 1);
  }

  const available: string[] = [];
  const start = new Date();
  for (let offset = 1; offset <= windowDays; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    const day = candidate.getDay();
    if (day === 0 || day === 6) continue;
    const isoDate = candidate.toISOString().slice(0, 10);
    const busyCount = busyDates.get(isoDate) ?? 0;
    if (busyCount < 4) {
      available.push(isoDate);
    }
  }

  return { available, busyDates };
}

function buildCapacityRisks(busyDates: Map<string, number>): CapacityRisk[] {
  const risks: CapacityRisk[] = [];
  for (const [date, count] of busyDates.entries()) {
    if (count >= 3) {
      risks.push({
        date,
        event_count: count,
        risk_level: count >= 5 ? "high" : "medium",
        details: `${count} events on ${date} -- limited capacity for new work.`,
      });
    }
  }
  return risks.sort((a, b) => a.date.localeCompare(b.date));
}

function createSummaryMarkdown(result: DueDatePlannerResult, runId: string, dryRun: boolean): string {
  const approvalBlocked = result.approval_decisions.filter((d) => !d.approved).length;
  const lines = [
    "# Due Date Planner Run Summary",
    "",
    `- Run ID: ${runId}`,
    `- Mode: ${dryRun ? "dry_run" : "write_enabled"}`,
    `- Projects scanned: ${result.projects_scanned}`,
    `- Tasks analyzed: ${result.tasks_analyzed}`,
    `- Date proposals: ${result.proposals.length}`,
    `- Capacity risks: ${result.capacity_risks.length}`,
    `- Escalations: ${result.escalations.length}`,
    `- Blocked write actions: ${approvalBlocked}`,
    "",
    "## Proposals",
  ];

  for (const proposal of result.proposals) {
    lines.push(
      `- **${proposal.task_title}**: ${proposal.current_due_date ?? "no date"} -> ${proposal.proposed_due_date} (confidence ${(proposal.confidence * 100).toFixed(0)}%)`,
    );
    if (proposal.conflicts.length > 0) {
      lines.push(`  Conflicts: ${proposal.conflicts.join(", ")}`);
    }
  }

  if (result.escalations.length > 0) {
    lines.push("", "## Escalations");
    for (const escalation of result.escalations) {
      lines.push(`- ${escalation}`);
    }
  }

  return lines.join("\n");
}

function createEscalationMarkdown(escalations: string[], runId: string): string {
  const lines = [
    "# Escalation List",
    "",
    `Run ID: ${runId}`,
    "",
  ];

  if (escalations.length === 0) {
    lines.push("No escalations required.");
  } else {
    for (const escalation of escalations) {
      lines.push(`- ${escalation}`);
    }
  }

  return lines.join("\n");
}

export async function runDueDatePlannerJob(
  runtime: RuntimeConfig,
  jobSpec: JobSpec,
  approvalPolicy: ApprovalPolicy,
  options: JobRunOptions,
): Promise<{ runId: string; result: DueDatePlannerResult; outputPaths: Record<string, string> }> {
  const runId = buildRunId(jobSpec.id);
  const paths = await createRunPaths(options.repoRoot, runId, jobSpec.outputs);
  const { adapters } = options;

  const auditLog: AuditLogEntry[] = [];
  const escalations: string[] = [];

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "job_start",
    details: "Due date planner job started.",
  });

  // Step 1: Load projects from PM adapter
  const pmItems = await adapters.pm.listItems({ limit: 100 });
  const projectCount = pmItems.length;

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "load_projects",
    details: `Loaded ${projectCount} projects from PM adapter.`,
  });

  // Step 2: Pull calendar events for planning window
  const planningWindowDays = jobSpec.inputs.calendar?.planning_window_days ?? 45;
  const calendarItems = await adapters.calendar.listItems({
    limit: 500,
    since: new Date().toISOString(),
  });

  const { available, busyDates } = getAvailableDates(calendarItems, planningWindowDays);
  const capacityRisks = buildCapacityRisks(busyDates);

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "calendar_scan",
    details: `Found ${calendarItems.length} calendar events, ${available.length} available slots in ${planningWindowDays}-day window.`,
  });

  // Step 3: Build proposals for tasks without dates or with conflicts
  const proposals: DueDateProposal[] = [];
  const fingerprints = new Set<string>();
  const syntheticTasks: CanonicalTask[] = [];

  for (const pmItem of pmItems) {
    const fingerprint = semanticFingerprint([pmItem.id, pmItem.content]);
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);

    const existingDueDate = pmItem.metadata.due_date as string | undefined;
    const conflicts: string[] = [];

    // Check if existing due date falls on a high-capacity day
    if (existingDueDate && busyDates.has(existingDueDate)) {
      const busyCount = busyDates.get(existingDueDate) ?? 0;
      if (busyCount >= 4) {
        conflicts.push(`${existingDueDate} is overbooked (${busyCount} events)`);
      }
    }

    // Check if task has no due date
    if (!existingDueDate) {
      conflicts.push("No due date assigned");
    }

    if (conflicts.length === 0) continue;

    // Propose a new date from available slots
    const proposedDate = available.length > 0 ? available[0] : undefined;
    if (!proposedDate) {
      escalations.push(
        `No available date for task "${pmItem.subject ?? pmItem.content.slice(0, 60)}" -- calendar fully booked in ${planningWindowDays}-day window.`,
      );
      continue;
    }

    const title = toTitleCase(summarizeText(pmItem.subject ?? pmItem.content, 120));
    let confidence = 0.6;
    if (conflicts.length === 1 && conflicts[0] === "No due date assigned") {
      confidence = 0.5;
    }
    if (existingDueDate) {
      confidence = 0.7;
    }

    proposals.push({
      task_title: title,
      project_id: pmItem.metadata.project_id as string | undefined,
      current_due_date: existingDueDate,
      proposed_due_date: proposedDate,
      rationale: `Conflicts: ${conflicts.join("; ")}. Proposed ${proposedDate} based on calendar availability.`,
      confidence,
      conflicts,
    });

    // Also build a CanonicalTask for the proposals JSON
    syntheticTasks.push(
      CanonicalTaskSchema.parse({
        title,
        description: summarizeText(pmItem.content, 400),
        project_id: pmItem.metadata.project_id as string | undefined,
        priority: inferPriority(pmItem.content),
        status: "todo",
        due_date: proposedDate,
        dependency_task_ids: [],
        source_system: "calendar",
        source_reference: `calendar:${pmItem.id}`,
        evidence: [{ kind: "calendar_event_id", value: pmItem.id }],
        confidence,
      }),
    );
  }

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

  const result: DueDatePlannerResult = {
    projects_scanned: projectCount,
    tasks_analyzed: pmItems.length,
    proposals,
    capacity_risks: capacityRisks,
    escalations,
    approval_decisions: approvalDecisions,
    audit_log: auditLog,
  };

  // Write outputs
  const summary = createSummaryMarkdown(result, runId, options.dryRun);

  if (paths.resolvedOutputs.summary_markdown) {
    await saveTextFile(paths.resolvedOutputs.summary_markdown, `${summary}\n`);
  }

  if (paths.resolvedOutputs.due_date_proposals_json) {
    await saveJsonFile(paths.resolvedOutputs.due_date_proposals_json, proposals);
  }

  if (paths.resolvedOutputs.risk_register_json) {
    await saveJsonFile(paths.resolvedOutputs.risk_register_json, capacityRisks);
  }

  if (paths.resolvedOutputs.escalation_markdown) {
    await saveTextFile(
      paths.resolvedOutputs.escalation_markdown,
      `${createEscalationMarkdown(escalations, runId)}\n`,
    );
  }

  if (paths.resolvedOutputs.audit_log_json) {
    await saveJsonFile(paths.resolvedOutputs.audit_log_json, auditLog);
  }

  return { runId, result, outputPaths: paths.resolvedOutputs };
}
