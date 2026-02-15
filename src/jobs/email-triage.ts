import path from "node:path";

import {
  ApprovalPolicy,
  CanonicalTask,
  CanonicalTaskSchema,
  EmailThread,
  EmailTriageResult,
  JobSpec,
  ProposedReply,
  ProposedReplySchema,
  RuntimeConfig,
} from "../contracts.js";
import { evaluateWriteApprovals } from "../approval/gate.js";
import { MockCalendarAdapter, MockEmailAdapter, MockPmAdapter } from "../adapters/mock.js";
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

interface JobRunOptions {
  repoRoot: string;
  dryRun: boolean;
  approveWrites: boolean;
  adapters?: AdapterKit;
}

function normalizeRelativePath(inputPath: string): string {
  return inputPath.replace(/^\.\//, "");
}

function chooseProjectId(thread: EmailThread, projectNames: { project_id: string; account_name: string }[]): string | undefined {
  const searchCorpus = `${thread.subject}\n${thread.messages.map((message) => message.body).join("\n")}`.toLowerCase();
  const match = projectNames.find((project) => searchCorpus.includes(project.account_name.toLowerCase()));
  return match?.project_id;
}

function toSourceSystem(provider: string): CanonicalTask["source_system"] {
  if (provider === "gmail") {
    return "gmail";
  }

  if (provider === "outlook") {
    return "outlook";
  }

  return "manual";
}

function createSummaryMarkdown(result: EmailTriageResult, runId: string, dryRun: boolean): string {
  const approvalBlocked = result.approval_decisions.filter((decision) => !decision.approved).length;

  return [
    `# Email Triage Run Summary`,
    "",
    `- Run ID: ${runId}`,
    `- Mode: ${dryRun ? "dry_run" : "write_enabled"}`,
    `- Threads scanned: ${result.scanned_threads}`,
    `- Relevant threads: ${result.relevant_threads}`,
    `- Proposed tasks: ${result.proposed_tasks.length}`,
    `- Proposed replies: ${result.proposed_replies.length}`,
    `- Blocked write actions: ${approvalBlocked}`,
    "",
    "## Write Approval Decisions",
    ...result.approval_decisions.map(
      (decision) =>
        `- ${decision.requested_action}: ${decision.approved ? "approved" : "blocked"} (${decision.reason})`
    ),
  ].join("\n");
}

function createVoiceBrief(result: EmailTriageResult): string {
  const top = result.proposed_tasks.slice(0, 5);
  const lines = ["# Voice Review Brief", "", "Review the following action candidates:"];

  for (const task of top) {
    lines.push(`- ${task.priority}: ${task.title}${task.due_date ? ` (target ${task.due_date})` : ""}`);
  }

  if (top.length === 0) {
    lines.push("- No actionable items were detected in the latest email window.");
  }

  return lines.join("\n");
}

function buildReplyDraft(thread: EmailThread, taskCount: number): ProposedReply {
  const recipientHint = thread.participants.find((entry) => entry.includes("@"));
  return ProposedReplySchema.parse({
    thread_id: thread.id,
    subject: `Re: ${thread.subject}`,
    recipient_hint: recipientHint,
    body: [
      "Thanks for the update.",
      "",
      `We extracted ${taskCount} action item${taskCount === 1 ? "" : "s"} from this thread and queued them for approval.`,
      "We will follow up with confirmed owners and due dates after approval.",
    ].join("\n"),
  });
}

function normalizeCapability(capabilities: string[]): string[] {
  return capabilities.map((capability) => (capability === "list_new_messages" ? "list_threads" : capability));
}

export async function runEmailTriageJob(
  runtime: RuntimeConfig,
  jobSpec: JobSpec,
  approvalPolicy: ApprovalPolicy,
  options: JobRunOptions
): Promise<{ runId: string; result: EmailTriageResult; outputPaths: Record<string, string> }> {
  const runId = buildRunId(jobSpec.id);
  const paths = await createRunPaths(options.repoRoot, runId, jobSpec.outputs);
  const stateDir = path.join(options.repoRoot, normalizeRelativePath(runtime.paths.state_dir));

  // Use adapter kit if provided, otherwise fall back to legacy mock adapters
  let emailAdapter: MockEmailAdapter;
  let pmAdapter: MockPmAdapter;
  let calendarAdapter: MockCalendarAdapter;

  if (options.adapters?.mockEmail && options.adapters?.mockPm && options.adapters?.mockCalendar) {
    emailAdapter = options.adapters.mockEmail;
    pmAdapter = options.adapters.mockPm;
    calendarAdapter = options.adapters.mockCalendar;
  } else {
    emailAdapter = new MockEmailAdapter(stateDir);
    pmAdapter = new MockPmAdapter(stateDir);
    calendarAdapter = new MockCalendarAdapter(stateDir);
    await pmAdapter.initialize();
  }

  const threads = await emailAdapter.listThreads();
  const includeKeywords = jobSpec.inputs.email?.filters?.include_keywords ?? [];
  const excludeKeywords = jobSpec.inputs.email?.filters?.exclude_keywords ?? [];
  const normalizedCapabilities = normalizeCapability(jobSpec.inputs.email?.capabilities ?? []);

  const auditLog: EmailTriageResult["audit_log"] = [];

  auditLog.push({
    timestamp: new Date().toISOString(),
    level: "info",
    action: "capability_check",
    details: `Using capabilities: ${normalizedCapabilities.join(", ") || "none declared"}`,
  });

  const relevantThreads = threads.filter((thread) => {
    const corpus = `${thread.subject}\n${thread.messages.map((message) => message.body).join("\n")}`;
    const included = includeKeywords.length === 0 || containsAnyKeyword(corpus, includeKeywords);
    const excluded = excludeKeywords.length > 0 && containsAnyKeyword(corpus, excludeKeywords);
    return included && !excluded;
  });

  const pmProjects = await pmAdapter.listProjects();
  const fingerprints = new Set<string>();
  const proposedTasks: CanonicalTask[] = [];
  const proposedReplies: ProposedReply[] = [];
  const lookaheadDays = jobSpec.inputs.calendar?.lookahead_days ?? 21;
  const fallbackDueDate = await calendarAdapter.suggestDueDate(lookaheadDays);

  for (const thread of relevantThreads) {
    const latestMessage = thread.messages.at(-1);
    if (!latestMessage) {
      continue;
    }

    const candidates = extractActionCandidates(latestMessage.body);

    if (candidates.length === 0) {
      auditLog.push({
        timestamp: new Date().toISOString(),
        level: "warn",
        action: "candidate_extraction",
        details: `No actionable sentence extracted from ${thread.id}.`,
      });
      continue;
    }

    const threadTasks: CanonicalTask[] = [];

    for (const [index, candidate] of candidates.entries()) {
      const sourceReference = `${thread.id}:${latestMessage.id}:${index + 1}`;

      const duplicateInPm = await pmAdapter.searchByExternalRef(sourceReference);
      if (duplicateInPm) {
        auditLog.push({
          timestamp: new Date().toISOString(),
          level: "info",
          action: "dedupe_pm",
          details: `Skipping ${sourceReference}; already mapped to ${duplicateInPm.task_id}.`,
        });
        continue;
      }

      const fingerprint = semanticFingerprint([thread.id, candidate]);
      if (fingerprints.has(fingerprint)) {
        auditLog.push({
          timestamp: new Date().toISOString(),
          level: "info",
          action: "dedupe_semantic",
          details: `Skipping semantic duplicate in ${thread.id}.`,
          metadata: { fingerprint },
        });
        continue;
      }
      fingerprints.add(fingerprint);

      const explicitDueDate = extractDateCandidate(candidate) ?? extractDateCandidate(latestMessage.body);
      let confidence = 0.62;
      if (explicitDueDate) {
        confidence += 0.18;
      }
      if (candidate.toLowerCase().startsWith("action")) {
        confidence += 0.08;
      }
      if (candidate.toLowerCase().includes("urgent") || candidate.toLowerCase().includes("asap")) {
        confidence += 0.08;
      }
      if (confidence > 0.95) {
        confidence = 0.95;
      }

      const task = CanonicalTaskSchema.parse({
        title: toTitleCase(summarizeText(candidate, 120)),
        description: summarizeText(latestMessage.body, 400),
        project_id: chooseProjectId(thread, pmProjects),
        priority: inferPriority(candidate),
        status: "todo",
        due_date: explicitDueDate ?? fallbackDueDate,
        dependency_task_ids: [],
        source_system: toSourceSystem(runtime.connectors.email.provider),
        source_reference: sourceReference,
        evidence: [{ kind: "email_id", value: latestMessage.id }],
        confidence,
      });

      threadTasks.push(task);
      proposedTasks.push(task);
    }

    proposedReplies.push(buildReplyDraft(thread, threadTasks.length));
  }

  const approvalDecisions = evaluateWriteApprovals(approvalPolicy, jobSpec.approval.allowed_write_tools, {
    dryRun: options.dryRun,
    approveWrites: options.approveWrites,
  });

  for (const decision of approvalDecisions) {
      auditLog.push({
        timestamp: new Date().toISOString(),
        level: decision.approved ? "info" : "warn",
        action: "approval_gate",
        details: `${decision.requested_action}: ${decision.reason}`,
        metadata: { decision },
      });
    }

  const result: EmailTriageResult = {
    scanned_threads: threads.length,
    relevant_threads: relevantThreads.length,
    proposed_tasks: proposedTasks,
    proposed_replies: proposedReplies,
    approval_decisions: approvalDecisions,
    audit_log: auditLog,
    voice_brief: createVoiceBrief({
      scanned_threads: threads.length,
      relevant_threads: relevantThreads.length,
      proposed_tasks: proposedTasks,
      proposed_replies: proposedReplies,
      approval_decisions: approvalDecisions,
      audit_log: auditLog,
      voice_brief: "",
    }),
  };

  const summary = createSummaryMarkdown(result, runId, options.dryRun);

  if (paths.resolvedOutputs.summary_markdown) {
    await saveTextFile(paths.resolvedOutputs.summary_markdown, `${summary}\n`);
  }

  if (paths.resolvedOutputs.proposed_tasks_json || paths.resolvedOutputs.due_date_proposals_json) {
    const targetPath =
      paths.resolvedOutputs.proposed_tasks_json ?? paths.resolvedOutputs.due_date_proposals_json;
    if (targetPath) {
      await saveJsonFile(targetPath, proposedTasks);
    }
  }

  if (paths.resolvedOutputs.proposed_replies_json || paths.resolvedOutputs.response_drafts_json) {
    const targetPath =
      paths.resolvedOutputs.proposed_replies_json ?? paths.resolvedOutputs.response_drafts_json;
    if (targetPath) {
      await saveJsonFile(targetPath, proposedReplies);
    }
  }

  if (paths.resolvedOutputs.voice_brief_markdown || paths.resolvedOutputs.voice_queue_markdown) {
    const targetPath =
      paths.resolvedOutputs.voice_brief_markdown ?? paths.resolvedOutputs.voice_queue_markdown;
    if (targetPath) {
      await saveTextFile(targetPath, `${result.voice_brief}\n`);
    }
  }

  if (paths.resolvedOutputs.audit_log_json) {
    await saveJsonFile(paths.resolvedOutputs.audit_log_json, auditLog);
  }

  return {
    runId,
    result,
    outputPaths: paths.resolvedOutputs,
  };
}
