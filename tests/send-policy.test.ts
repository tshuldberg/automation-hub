import { describe, it, expect } from "vitest";
import { evaluateSendMode } from "../src/approval/send-policy.js";
import type { SendPolicyContext } from "../src/approval/send-policy.js";

describe("evaluateSendMode", () => {
  describe("self-replies (recipientIsSelf)", () => {
    it("allows auto-send for email to self", () => {
      const ctx: SendPolicyContext = {
        channel: "email",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });

    it("allows auto-send for slack to self", () => {
      const ctx: SendPolicyContext = {
        channel: "slack",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });

    it("allows auto-send for imessage to self", () => {
      const ctx: SendPolicyContext = {
        channel: "imessage",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });

    it("allows auto-send for calendar to self", () => {
      const ctx: SendPolicyContext = {
        channel: "calendar",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });

    it("allows auto-send for reminders to self", () => {
      const ctx: SendPolicyContext = {
        channel: "reminders",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });
  });

  describe("internal Slack (Receeps workspace)", () => {
    it("allows auto-send for internal slack to non-self", () => {
      const ctx: SendPolicyContext = {
        channel: "slack",
        recipientIsSelf: false,
        isInternalWorkspace: true,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });

    it("allows auto-send for internal slack to self", () => {
      const ctx: SendPolicyContext = {
        channel: "slack",
        recipientIsSelf: true,
        isInternalWorkspace: true,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });
  });

  describe("external recipients (draft only)", () => {
    it("returns draft_only for email to external", () => {
      const ctx: SendPolicyContext = {
        channel: "email",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("returns draft_only for imessage to external", () => {
      const ctx: SendPolicyContext = {
        channel: "imessage",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("returns draft_only for external slack", () => {
      const ctx: SendPolicyContext = {
        channel: "slack",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("returns draft_only for calendar to external", () => {
      const ctx: SendPolicyContext = {
        channel: "calendar",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("returns draft_only for reminders to external", () => {
      const ctx: SendPolicyContext = {
        channel: "reminders",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("returns draft_only for pm to external", () => {
      const ctx: SendPolicyContext = {
        channel: "pm",
        recipientIsSelf: false,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });
  });

  describe("isInternalWorkspace only affects slack", () => {
    it("does not allow auto-send for internal email", () => {
      const ctx: SendPolicyContext = {
        channel: "email",
        recipientIsSelf: false,
        isInternalWorkspace: true,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });

    it("does not allow auto-send for internal imessage", () => {
      const ctx: SendPolicyContext = {
        channel: "imessage",
        recipientIsSelf: false,
        isInternalWorkspace: true,
      };
      expect(evaluateSendMode(ctx)).toBe("draft_only");
    });
  });

  describe("priority: recipientIsSelf takes precedence", () => {
    it("self-reply on external slack still returns auto", () => {
      const ctx: SendPolicyContext = {
        channel: "slack",
        recipientIsSelf: true,
        isInternalWorkspace: false,
      };
      expect(evaluateSendMode(ctx)).toBe("auto");
    });
  });
});
