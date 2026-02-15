import {
  ApprovalPolicy,
  AuditLogEntry,
  CanonicalTask,
  CanonicalTaskSchema,
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
import type { ChannelItem, ChannelType, ResponseTarget } from "../adapters/adapter.interface.js";

interface JobRunOptions {
  repoRoot: string;
  dryRun: boolean;
  approveWrites: boolean;
  adapters: AdapterKit;
}

interface UnifiedQueueItem {
  rank: number;
  source_channel: ChannelType;
  source_reference: string;
  title: string;
  priority: string;
  due_date: string | undefined;
  action_type: "task" | "reply" | "reminder";
  target: ResponseTarget | undefined;
  fingerprint: string;
}

interface ProposedReminder {
  title: string;
  due_date: string | undefined;
  source_channel: ChannelType;
  source_reference: string;
  body: string;
}

interface ChannelConsolidationResult {
  channels_polled: number;
  items_collected: number;
  items_after_dedup: number;
  tasks_extracted: number;
  unified_queue: UnifiedQueueItem[];
  proposed_tasks: CanonicalTask[];
  proposed_replies: ProposedReply[];
  proposed_reminders: ProposedReminder[];
  approval_decisions: ReturnType<typeof evaluateWriteApprovals>;
  audit_log: AuditLogEntry[];
}

function toSourceSystem(channel: ChannelType): CanonicalTask["source_system"] {
  const map: Record<ChannelType, CanonicalTask["source_system"]> = {
    email: "gmail",
    calendar: "calendar",
    reminders: "apple_reminders",
    imessage: "messages",
    slack: "slack",
    pm: "pm_tool",
  };
  return map[channel];
}

function toEvidenceKind(channel: ChannelType): CanonicalTask["evidence"][number]["kind"] {
  const map: Record<ChannelType, CanonicalTask["evidence"][number]["kind"]> = {
    email: "email_id",
    calendar: "calendar_event_id",
    reminders: "reminder_id",
    imessage: "message_id",
    slack: "slack_message_id",
    pm: "task_id",
  };
  return map[channel];
}

const PRIORITY_ORDER: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

function priorityRank(p: string): number {
  return PRIORITY_ORDER[p] ?? 99;
}

function createSummaryMarkdown(
  result: ChannelConsolidationResult,
  runId: string,
  dryRun: boolean,
): string {
  const approvalBlocked = result.approval_decisions.filter((d) => !d.approved).length;

  const lines = [
    "# Unified Channel Consolidation Run Summary",
    "",
    `- Run ID: ${runId}`,
    `- Mode: ${dryRun ? "dry_run" : "write_enabled"}`,
    `- Channels polled: ${result.channels_polled}`,
    `- Items collected: ${result.items_collected}`,
    `- Items after dedup: ${result.items_after_dedup}`,
    `- Tasks extracted: ${result.tasks_extracted}`,
    `- Unified queue size: ${result.unified_queue.length}`,
    `- Proposed tasks: ${result.proposed_tasks.length}`,
    `- Proposed replies: ${result.proposed_replies.length}`,
    `- Proposed reminders: ${result.proposed_reminders.length}`,
    `- Blocked write actions: ${approvalBlocked}`,
    "",
    "## Unified Queue (top 10)",
  ];

  for (const item of result.unified_queue.slice(0, 10)) {
    lines.push(
      `${item.rank}. [${item.source_channel}] **${item.title}** (${item.priority})${item.due_date ? ` due ${item.due_date}` : ""}`,
    );
  }

  return lines.join("\n");
}

export async function runChannelConsolidationJob(
  runtime: RuntimeConfig,
  jobSpec: JobSpec,
  approvalPolicy: ApprovalPolicy,
  options: JobRunOptions,
): Promise<{ runId: string; result: ChannelConsolidationResult; outputPaths: Record<string, string> }> {
  const runId = buildRunId(jobSpec.id);
  const paths = await createRunPaths(options.repoRoot, runId, jobSpec.outputs);
  const { adapters } = options;

  const auditLog: AuditLogEntry[] = [];

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "job_start",
    details: "Unified channel consolidation job started.",
  });

  // Step 1: Poll all channels
  const windowHours = jobSpec.inputs.email?.window_hours ?? 24;
  const sinceDate = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const calendarLookahead = jobSpec.inputs.calendar?.lookahead_days ?? 21;

  const channelConfigs: Array<{
    name: string;
    fetch: () => Promise<ChannelItem[]>;
  }> = [
    {
      name: "email",
      fetch: () => adapters.email.listItems({ limit: 200, since: sinceDate }),
    },
    {
      name: "calendar",
      fetch: () =>
        adapters.calendar.listItems({
          limit: 200,
          since: new Date().toISOString(),
        }),
    },
    {
      name: "reminders",
      fetch: () => adapters.reminders.listItems({ limit: 100 }),
    },
    {
      name: "imessage",
      fetch: () => adapters.imessage.listItems({ limit: 100, since: sinceDate }),
    },
    {
      name: "slack",
      fetch: () => adapters.slack.listItems({ limit: 100, since: sinceDate }),
    },
  ];

  const allItems: ChannelItem[] = [];
  let channelsPolled = 0;

  for (const config of channelConfigs) {
    try {
      const items = await config.fetch();
      allItems.push(...items);
      channelsPolled += 1;
      auditLog.push({
        timestamp: new Date().toISOString(),
        level: "info",
        action: "channel_poll",
        details: `${config.name}: ${items.length} items.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      auditLog.push({
        timestamp: new Date().toISOString(),
        level: "warn",
        action: "channel_poll_error",
        details: `${config.name}: ${message}`,
      });
    }
  }

  const totalCollected = allItems.length;

  // Step 2: Deduplicate using semantic fingerprints
  const fingerprints = new Set<string>();
  const dedupedItems: ChannelItem[] = [];

  for (const item of allItems) {
    const fingerprint = semanticFingerprint([
      item.source_channel,
      item.source_reference,
      item.content.slice(0, 200),
    ]);
    if (fingerprints.has(fingerprint)) {
      auditLog.push({
        timestamp: new Date().toISOString(),
        level: "info",
        action: "dedupe",
        details: `Duplicate suppressed: ${item.source_channel}:${item.id}`,
        metadata: { fingerprint },
      });
      continue;
    }
    fingerprints.add(fingerprint);
    dedupedItems.push(item);
  }

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "dedup_summary",
    details: `${totalCollected} items -> ${dedupedItems.length} after dedup (${totalCollected - dedupedItems.length} duplicates removed).`,
  });

  // Step 3: Extract tasks from each item
  const proposedTasks: CanonicalTask[] = [];
  const proposedReplies: ProposedReply[] = [];
  const proposedReminders: ProposedReminder[] = [];
  const unifiedQueue: UnifiedQueueItem[] = [];

  // Pull calendar for cross-checking due dates
  const calendarItems = await adapters.calendar.listItems({
    limit: 500,
    since: new Date().toISOString(),
  });
  const busyDates = new Set<string>();
  for (const cal of calendarItems) {
    busyDates.add(cal.timestamp.slice(0, 10));
  }

  for (const item of dedupedItems) {
    const candidates = extractActionCandidates(item.content);
    if (candidates.length === 0) continue;

    for (const [index, candidate] of candidates.entries()) {
      const sourceRef = `${item.source_channel}:${item.id}:${index + 1}`;
      const fp = semanticFingerprint([sourceRef, candidate]);
      if (fingerprints.has(fp)) continue;
      fingerprints.add(fp);

      const explicitDate = extractDateCandidate(candidate) ?? extractDateCandidate(item.content);
      const priority = inferPriority(candidate);
      const title = toTitleCase(summarizeText(candidate, 120));

      // Cross-check due date against calendar
      let finalDueDate = explicitDate;
      if (finalDueDate && busyDates.has(finalDueDate)) {
        auditLog.push({
          timestamp: new Date().toISOString(),
          level: "warn",
          action: "date_conflict",
          details: `${finalDueDate} conflicts with calendar for "${title}".`,
        });
      }

      let confidence = 0.6;
      if (explicitDate) confidence += 0.15;
      if (candidate.toLowerCase().startsWith("action")) confidence += 0.08;
      if (candidate.toLowerCase().includes("urgent") || candidate.toLowerCase().includes("asap")) {
        confidence += 0.08;
      }
      if (confidence > 0.95) confidence = 0.95;

      // Build canonical task
      const task = CanonicalTaskSchema.parse({
        title,
        description: summarizeText(item.content, 400),
        project_id: item.metadata.project_id as string | undefined,
        priority,
        status: "todo",
        due_date: finalDueDate,
        dependency_task_ids: [],
        source_system: toSourceSystem(item.source_channel),
        source_reference: sourceRef,
        evidence: [{ kind: toEvidenceKind(item.source_channel), value: item.id }],
        confidence,
      });
      proposedTasks.push(task);

      // Build response target for reply routing
      const responseTarget: ResponseTarget | undefined =
        item.source_channel === "email" || item.source_channel === "imessage" || item.source_channel === "slack"
          ? {
              channel: item.source_channel,
              recipient: item.participants[0] ?? "",
              thread_id: item.id,
            }
          : undefined;

      // Build reply draft for communication channels
      if (
        item.source_channel === "email" ||
        item.source_channel === "imessage" ||
        item.source_channel === "slack"
      ) {
        const recipientHint = item.participants.find((p) => p.includes("@")) ?? item.participants[0];
        proposedReplies.push(
          ProposedReplySchema.parse({
            thread_id: item.id,
            subject: `Re: ${item.subject ?? "Follow-up"}`,
            recipient_hint: recipientHint,
            body: [
              "Thanks for this.",
              "",
              `We've logged "${title}" as an action item (${priority}) and it's queued for review.`,
              finalDueDate ? `Target date: ${finalDueDate}.` : "",
            ]
              .filter(Boolean)
              .join("\n"),
          }),
        );
      }

      // Build reminder proposals for reminder-sourced items
      if (item.source_channel === "reminders") {
        proposedReminders.push({
          title,
          due_date: finalDueDate,
          source_channel: item.source_channel,
          source_reference: sourceRef,
          body: summarizeText(candidate, 200),
        });
      }

      // Add to unified queue
      unifiedQueue.push({
        rank: 0,
        source_channel: item.source_channel,
        source_reference: sourceRef,
        title,
        priority,
        due_date: finalDueDate,
        action_type:
          item.source_channel === "reminders"
            ? "reminder"
            : item.source_channel === "email" || item.source_channel === "imessage" || item.source_channel === "slack"
              ? "reply"
              : "task",
        target: responseTarget,
        fingerprint: fp,
      });
    }
  }

  // Step 4: Sort and rank unified queue
  unifiedQueue.sort((a, b) => {
    const pDiff = priorityRank(a.priority) - priorityRank(b.priority);
    if (pDiff !== 0) return pDiff;
    const aDate = a.due_date ?? "9999-12-31";
    const bDate = b.due_date ?? "9999-12-31";
    return aDate.localeCompare(bDate);
  });

  for (let i = 0; i < unifiedQueue.length; i += 1) {
    unifiedQueue[i]!.rank = i + 1;
  }

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "queue_built",
    details: `Unified queue: ${unifiedQueue.length} items, ${proposedTasks.length} tasks, ${proposedReplies.length} replies, ${proposedReminders.length} reminders.`,
  });

  // Step 5: Evaluate write approvals
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

  const result: ChannelConsolidationResult = {
    channels_polled: channelsPolled,
    items_collected: totalCollected,
    items_after_dedup: dedupedItems.length,
    tasks_extracted: proposedTasks.length,
    unified_queue: unifiedQueue,
    proposed_tasks: proposedTasks,
    proposed_replies: proposedReplies,
    proposed_reminders: proposedReminders,
    approval_decisions: approvalDecisions,
    audit_log: auditLog,
  };

  // Write outputs
  const summary = createSummaryMarkdown(result, runId, options.dryRun);

  if (paths.resolvedOutputs.summary_markdown) {
    await saveTextFile(paths.resolvedOutputs.summary_markdown, `${summary}\n`);
  }

  if (paths.resolvedOutputs.unified_queue_json) {
    await saveJsonFile(paths.resolvedOutputs.unified_queue_json, unifiedQueue);
  }

  if (paths.resolvedOutputs.proposed_tasks_json) {
    await saveJsonFile(paths.resolvedOutputs.proposed_tasks_json, proposedTasks);
  }

  if (paths.resolvedOutputs.proposed_replies_json) {
    await saveJsonFile(paths.resolvedOutputs.proposed_replies_json, proposedReplies);
  }

  if (paths.resolvedOutputs.proposed_reminders_json) {
    await saveJsonFile(paths.resolvedOutputs.proposed_reminders_json, proposedReminders);
  }

  if (paths.resolvedOutputs.audit_log_json) {
    await saveJsonFile(paths.resolvedOutputs.audit_log_json, auditLog);
  }

  return { runId, result, outputPaths: paths.resolvedOutputs };
}
