import { describe, it, expect } from "vitest";
import { evaluateWriteApprovals } from "../src/approval/gate.js";
import type { ApprovalPolicy } from "../src/contracts.js";

const defaultDenyPolicy: ApprovalPolicy = {
  version: "1.0",
  default_decision: "deny",
  rules: [
    { action: "read_only", decision: "allow", requires_human_approval: false },
    { action: "task_write", decision: "allow", requires_human_approval: true },
    { action: "comment_write", decision: "allow", requires_human_approval: true },
    { action: "dependency_write", decision: "allow", requires_human_approval: true },
    { action: "email_send", decision: "allow", requires_human_approval: true },
    { action: "calendar_write", decision: "allow", requires_human_approval: true },
    { action: "pm.create_task", decision: "allow", requires_human_approval: true },
    { action: "pm.update_task", decision: "allow", requires_human_approval: true },
    { action: "pm.create_comment", decision: "allow", requires_human_approval: true },
    { action: "pm.upsert_dependencies", decision: "allow", requires_human_approval: true },
    { action: "email.send_reply", decision: "allow", requires_human_approval: true },
    { action: "messages.send_message", decision: "allow", requires_human_approval: true },
    { action: "reminders.create_reminder", decision: "allow", requires_human_approval: true },
    { action: "reminders.update_reminder", decision: "allow", requires_human_approval: true },
  ],
};

const defaultAllowPolicy: ApprovalPolicy = {
  version: "1.0",
  default_decision: "allow",
  rules: [],
};

const denySpecificPolicy: ApprovalPolicy = {
  version: "1.0",
  default_decision: "allow",
  rules: [
    { action: "email_send", decision: "deny", requires_human_approval: false },
  ],
};

describe("evaluateWriteApprovals", () => {
  describe("default-deny behavior", () => {
    it("denies unknown actions when default is deny", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["unknown.action"],
        { dryRun: false, approveWrites: false }
      );
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("default deny");
    });

    it("allows unknown actions when default is allow", () => {
      const [result] = evaluateWriteApprovals(
        defaultAllowPolicy,
        ["unknown.action"],
        { dryRun: false, approveWrites: false }
      );
      expect(result.approved).toBe(true);
      expect(result.reason).toContain("default allow");
    });
  });

  describe("rule matching for known tools", () => {
    it("maps pm.create_task to task_write rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_task"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
      expect(result.policy_action).toBe("pm.create_task");
    });

    it("maps pm.update_task to task_write rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.update_task"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });

    it("maps pm.create_comment to comment_write rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_comment"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });

    it("maps pm.upsert_dependencies to dependency_write rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.upsert_dependencies"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });

    it("maps email.send_reply to email_send rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["email.send_reply"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });

    it("maps calendar.* tools to calendar_write rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["calendar.create_event"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });

    it("matches messages.send_message directly", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["messages.send_message"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
      expect(result.policy_action).toBe("messages.send_message");
    });

    it("matches reminders.create_reminder directly", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["reminders.create_reminder"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
      expect(result.policy_action).toBe("reminders.create_reminder");
    });

    it("matches reminders.update_reminder directly", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["reminders.update_reminder"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
      expect(result.policy_action).toBe("reminders.update_reminder");
    });
  });

  describe("human approval required flag", () => {
    it("blocks when human approval required but not granted", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_task"],
        { dryRun: false, approveWrites: false }
      );
      expect(result.approved).toBe(false);
      expect(result.requires_human_approval).toBe(true);
      expect(result.reason).toContain("Human approval required");
    });

    it("allows when human approval required and granted", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_task"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(true);
    });
  });

  describe("dry-run blocking", () => {
    it("blocks writes during dry run even with approveWrites true", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_task"],
        { dryRun: true, approveWrites: true }
      );
      expect(result.approved).toBe(false);
      expect(result.requires_human_approval).toBe(true);
    });
  });

  describe("explicit deny rules", () => {
    it("denies when policy explicitly denies the action", () => {
      const [result] = evaluateWriteApprovals(
        denySpecificPolicy,
        ["email.send_reply"],
        { dryRun: false, approveWrites: true }
      );
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("explicitly denies");
    });
  });

  describe("multiple tools at once", () => {
    it("evaluates each tool independently", () => {
      const results = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["pm.create_task", "unknown.action", "email.send_reply"],
        { dryRun: false, approveWrites: true }
      );
      expect(results).toHaveLength(3);
      expect(results[0].approved).toBe(true);
      expect(results[1].approved).toBe(false); // unknown => default deny
      expect(results[2].approved).toBe(true);
    });
  });

  describe("slack.send_message (default-deny if no rule)", () => {
    it("defaults to deny for slack.send_message with no matching rule", () => {
      const [result] = evaluateWriteApprovals(
        defaultDenyPolicy,
        ["slack.send_message"],
        { dryRun: false, approveWrites: true }
      );
      // No rule for slack.send_message in the policy, so default deny
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("default deny");
    });
  });
});
