import type {
  ChannelAdapter,
  ChannelType,
  ResponseTarget,
} from "./adapter.interface.js";
import {
  evaluateSendMode,
  type SendPolicyContext,
} from "../approval/send-policy.js";

export interface SendPolicyResult {
  allowed: boolean;
  mode: "auto" | "draft_only";
}

/**
 * Routes messages to the correct channel adapter based on the target channel.
 * Enforces send policy: draft-only messages are blocked from sending.
 *
 * Usage:
 * ```ts
 * const router = new ChannelRouter();
 * router.register(new SlackAdapter());
 * router.register(new MacosMailAdapter());
 * await router.sendResponse(
 *   { channel: "slack", recipient: "U01BBL118JC" },
 *   "Hello",
 *   { channel: "slack", recipientIsSelf: false, isInternalWorkspace: true },
 * );
 * ```
 */
export class ChannelRouter {
  private adapters = new Map<ChannelType, ChannelAdapter>();

  /** Register an adapter for its channel type. Replaces any previous adapter for that channel. */
  register(adapter: ChannelAdapter): void {
    this.adapters.set(adapter.channel, adapter);
  }

  /**
   * Route a response to the correct adapter based on `target.channel`.
   *
   * When `policyCtx` is provided, the send policy is evaluated first.
   * If the policy returns `draft_only`, the message is NOT sent and the method
   * returns `{ allowed: false, mode: "draft_only" }`. Callers should persist
   * the message as a draft instead.
   *
   * When `policyCtx` is omitted, the router sends unconditionally (legacy behavior).
   *
   * Throws if no adapter is registered for the target channel.
   */
  async sendResponse(
    target: ResponseTarget,
    body: string,
    policyCtx?: SendPolicyContext,
  ): Promise<SendPolicyResult> {
    const adapter = this.adapters.get(target.channel);
    if (!adapter) {
      throw new Error(`No adapter registered for channel: ${target.channel}`);
    }

    if (policyCtx) {
      const mode = evaluateSendMode(policyCtx);
      if (mode === "draft_only") {
        return { allowed: false, mode };
      }
    }

    await adapter.sendResponse(target, body);
    return { allowed: true, mode: "auto" };
  }

  /** Get the adapter for a specific channel, or undefined if not registered. */
  getAdapter(channel: ChannelType): ChannelAdapter | undefined {
    return this.adapters.get(channel);
  }

  /** Get all registered adapters. */
  getAllAdapters(): ChannelAdapter[] {
    return Array.from(this.adapters.values());
  }
}
