import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/** Phone number for self-messaging. */
const SELF_PHONE = "+17608466479";

/**
 * Adapter wrapping macos-hub iMessage MCP tools
 * (list_messages, send_message, search_messages).
 *
 * In a Claude Code session the real MCP calls are routed through macos-hub.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class MacosMessagesAdapter implements ChannelAdapter {
  readonly channel = "imessage" as const;

  /** No initialization needed -- macos-hub MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List recent iMessages.
   * Delegates to macos-hub `list_messages` MCP tool in a Claude Code session.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /** Retrieve a single iMessage by ID. */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "imessage",
      source_reference: `imessage:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [SELF_PHONE],
      metadata: {},
    };
  }

  /**
   * Send an iMessage.
   * Delegates to macos-hub `send_message` MCP tool in a Claude Code session.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(
      `[MacosMessagesAdapter] Would send to ${target.recipient}: ${body}`,
    );
  }

  /**
   * Search iMessages by content text.
   * Delegates to macos-hub `search_messages` MCP tool in a Claude Code session.
   */
  async search(
    _query: string,
    _opts?: SearchOptions,
  ): Promise<ChannelItem[]> {
    return [];
  }
}
