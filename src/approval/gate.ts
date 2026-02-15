import { ApprovalDecision, ApprovalPolicy, ApprovalRule } from "../contracts.js";

function findRule(policy: ApprovalPolicy, action: string): ApprovalRule | undefined {
  return policy.rules.find((rule) => rule.action === action);
}

function mapToolToPolicyActions(tool: string): string[] {
  if (tool === "pm.create_task" || tool === "pm.update_task") {
    return [tool, "task_write"];
  }

  if (tool === "pm.create_comment") {
    return [tool, "comment_write"];
  }

  if (tool === "pm.upsert_dependencies") {
    return [tool, "dependency_write"];
  }

  if (tool === "email.send_reply") {
    return [tool, "email_send"];
  }

  if (tool.startsWith("calendar.")) {
    return [tool, "calendar_write"];
  }

  if (tool.startsWith("messages.")) {
    return [tool];
  }

  if (tool.startsWith("reminders.")) {
    return [tool];
  }

  return [tool];
}

function decideAction(
  policy: ApprovalPolicy,
  requestedAction: string,
  humanApprovalGranted: boolean
): ApprovalDecision {
  const candidates = mapToolToPolicyActions(requestedAction);

  for (const action of candidates) {
    const matchedRule = findRule(policy, action);
    if (!matchedRule) {
      continue;
    }

    if (matchedRule.decision === "deny") {
      return {
        requested_action: requestedAction,
        policy_action: action,
        approved: false,
        requires_human_approval: matchedRule.requires_human_approval,
        reason: `Policy explicitly denies ${action}.`,
      };
    }

    if (matchedRule.requires_human_approval && !humanApprovalGranted) {
      return {
        requested_action: requestedAction,
        policy_action: action,
        approved: false,
        requires_human_approval: true,
        reason: `Human approval required for ${action}.`,
      };
    }

    return {
      requested_action: requestedAction,
      policy_action: action,
      approved: true,
      requires_human_approval: matchedRule.requires_human_approval,
      reason: `Policy allows ${action}.`,
    };
  }

  if (policy.default_decision === "allow") {
    return {
      requested_action: requestedAction,
      policy_action: "default",
      approved: true,
      requires_human_approval: false,
      reason: "No specific rule matched; default allow.",
    };
  }

  return {
    requested_action: requestedAction,
    policy_action: "default",
    approved: false,
    requires_human_approval: true,
    reason: "No specific rule matched; default deny.",
  };
}

export function evaluateWriteApprovals(
  policy: ApprovalPolicy,
  writeTools: string[],
  options: { dryRun: boolean; approveWrites: boolean }
): ApprovalDecision[] {
  const humanApprovalGranted = options.approveWrites && !options.dryRun;
  return writeTools.map((tool) => decideAction(policy, tool, humanApprovalGranted));
}
