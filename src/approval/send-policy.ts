import type { ChannelType } from "../adapters/adapter.interface.js";

export type SendMode = "auto" | "draft_only";

export interface SendPolicyContext {
  channel: ChannelType;
  recipientIsSelf: boolean;
  isInternalWorkspace: boolean;
}

/**
 * Determine whether an outbound message can be auto-sent or must remain a draft.
 *
 * Classification:
 *   - Messages to Trey (self-replies) on any channel → auto
 *   - Messages in the Receeps Slack workspace (internal) → auto
 *   - Everything else → draft_only
 */
export function evaluateSendMode(ctx: SendPolicyContext): SendMode {
  if (ctx.recipientIsSelf) return "auto";
  if (ctx.channel === "slack" && ctx.isInternalWorkspace) return "auto";
  return "draft_only";
}
