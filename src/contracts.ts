import { z } from "zod";

export const RuntimeConfigSchema = z
  .object({
    project: z
      .object({
        name: z.string(),
        timezone: z.string(),
      })
      .passthrough(),
    providers: z
      .object({
        active: z.string(),
      })
      .passthrough(),
    connectors: z
      .object({
        email: z
          .object({
            provider: z.string(),
            mcp_server: z.string(),
          })
          .passthrough(),
        calendar: z
          .object({
            provider: z.string(),
            mcp_server: z.string(),
          })
          .passthrough(),
        pm: z
          .object({
            provider: z.string(),
            mcp_server: z.string(),
          })
          .passthrough(),
      })
      .passthrough(),
    paths: z
      .object({
        jobs_dir: z.string(),
        schema_dir: z.string(),
        policy_file: z.string(),
        state_dir: z.string(),
        runs_dir: z.string(),
      })
      .passthrough(),
    references: z
      .object({
        shiphawk_dev_path: z.string().optional(),
        shiphawk_dev_read_only: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const EmailInputsSchema = z
  .object({
    capabilities: z.array(z.string()).optional(),
    filters: z
      .object({
        folders: z.array(z.string()).optional(),
        include_keywords: z.array(z.string()).default([]),
        exclude_keywords: z.array(z.string()).default([]),
      })
      .passthrough()
      .optional(),
    window_hours: z.number().optional(),
  })
  .passthrough();

const CalendarInputsSchema = z
  .object({
    capabilities: z.array(z.string()).optional(),
    lookahead_days: z.number().optional(),
    planning_window_days: z.number().optional(),
  })
  .passthrough();

export const JobSpecSchema = z
  .object({
    id: z.string(),
    version: z.string(),
    owner_team: z.string().optional(),
    status: z.string().default("dry_run"),
    objective: z.string(),
    schedule: z
      .object({
        timezone: z.string(),
        rrule: z.string().optional(),
        cron_fallback: z.string().optional(),
      })
      .passthrough(),
    providers: z.record(z.string(), z.unknown()).optional(),
    inputs: z
      .object({
        email: EmailInputsSchema.optional(),
        pm: z
          .object({
            tools: z.array(z.string()).optional(),
          })
          .passthrough()
          .optional(),
        calendar: CalendarInputsSchema.optional(),
      })
      .passthrough(),
    steps: z.array(z.string()).default([]),
    approval: z
      .object({
        read_tools: z.string().default("auto"),
        write_tools: z.string().default("always"),
        allowed_write_tools: z.array(z.string()).default([]),
      })
      .passthrough(),
    outputs: z.record(z.string(), z.string()),
    success_criteria: z.array(z.string()).default([]),
  })
  .passthrough();

export const ApprovalRuleSchema = z.object({
  action: z.string(),
  decision: z.enum(["allow", "deny"]),
  requires_human_approval: z.boolean(),
});

export const ApprovalPolicySchema = z.object({
  version: z.string(),
  default_decision: z.enum(["allow", "deny"]),
  rules: z.array(ApprovalRuleSchema),
});

export const CanonicalTaskSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(5),
  project_id: z.string().optional(),
  owner: z.string().optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]),
  status: z.enum(["backlog", "todo", "in_progress", "blocked", "done"]),
  start_date: z.string().optional(),
  due_date: z.string().optional(),
  dependency_task_ids: z.array(z.string()).default([]),
  source_system: z.enum([
    "gmail",
    "outlook",
    "pm_tool",
    "manual",
    "apple_reminders",
    "messages",
    "superwhisper",
    "calendar",
    "slack",
  ]),
  source_reference: z.string(),
  evidence: z
    .array(
      z.object({
        kind: z.enum([
          "email_id",
          "calendar_event_id",
          "task_id",
          "note",
          "message_id",
          "reminder_id",
          "transcript_id",
          "slack_message_id",
        ]),
        value: z.string(),
      })
    )
    .default([]),
  confidence: z.number().min(0).max(1).optional(),
});

export const ProposedReplySchema = z.object({
  thread_id: z.string(),
  subject: z.string(),
  body: z.string(),
  recipient_hint: z.string().optional(),
});

export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
export type JobSpec = z.infer<typeof JobSpecSchema>;
export type ApprovalPolicy = z.infer<typeof ApprovalPolicySchema>;
export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;
export type CanonicalTask = z.infer<typeof CanonicalTaskSchema>;
export type ProposedReply = z.infer<typeof ProposedReplySchema>;

export type EvidenceKind = z.infer<typeof CanonicalTaskSchema>['evidence'][number]['kind'];

export interface EmailMessage {
  id: string;
  from: string;
  body: string;
  timestamp: string;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: string[];
  messages: EmailMessage[];
}

export interface AuditLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  action: string;
  details: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalDecision {
  requested_action: string;
  policy_action: string;
  approved: boolean;
  requires_human_approval: boolean;
  reason: string;
}

export interface JobRunPaths {
  runDir: string;
  resolvedOutputs: Record<string, string>;
}

export interface EmailTriageResult {
  scanned_threads: number;
  relevant_threads: number;
  proposed_tasks: CanonicalTask[];
  proposed_replies: ProposedReply[];
  approval_decisions: ApprovalDecision[];
  audit_log: AuditLogEntry[];
  voice_brief: string;
}
