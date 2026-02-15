import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/** Slack user ID for self-DM routing. */
const SELF_USER_ID = "U01BBL118JC";

/**
 * Adapter wrapping Slack MCP tools (slack_read_channel, slack_send_message,
 * slack_search_public_and_private, slack_read_thread).
 *
 * In a Claude Code session the real MCP calls are made by the orchestrator.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class SlackAdapter implements ChannelAdapter {
  readonly channel = "slack" as const;

  /** No initialization needed -- Slack MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List recent messages from a Slack channel.
   * Delegates to `slack_read_channel` in a Claude Code session.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /** Retrieve a single Slack message by ID. */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "slack",
      source_reference: `slack:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [SELF_USER_ID],
      metadata: {},
    };
  }

  /**
   * Send a message via Slack.
   * Delegates to `slack_send_message` in a Claude Code session.
   * For self-DM, use {@link SELF_USER_ID} as the channel_id.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(`[SlackAdapter] Would send to ${target.recipient}: ${body}`);
  }

  /**
   * Search Slack messages.
   * Delegates to `slack_search_public_and_private` in a Claude Code session.
   */
  async search(_query: string, _opts?: SearchOptions): Promise<ChannelItem[]> {
    return [];
  }
}
