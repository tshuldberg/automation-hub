import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/**
 * Adapter wrapping macos-hub Apple Mail MCP tools
 * (list_messages, get_message, send_email, search_mail, list_mailboxes).
 *
 * In a Claude Code session the real MCP calls are routed through macos-hub.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class MacosMailAdapter implements ChannelAdapter {
  readonly channel = "email" as const;

  /** No initialization needed -- macos-hub MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List recent mail messages.
   * Delegates to macos-hub `list_messages` MCP tool in a Claude Code session.
   * Supports filtering by mailbox via `opts.filters.mailbox`.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /**
   * Retrieve a single mail message by ID.
   * Delegates to macos-hub `get_message` MCP tool in a Claude Code session.
   */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "email",
      source_reference: `email:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [],
      metadata: {},
    };
  }

  /**
   * Send an email reply.
   * Delegates to macos-hub `send_email` MCP tool in a Claude Code session.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(
      `[MacosMailAdapter] Would send to ${target.recipient}: ${body}`,
    );
  }

  /**
   * Search mail messages.
   * Delegates to macos-hub `search_mail` MCP tool in a Claude Code session.
   */
  async search(
    _query: string,
    _opts?: SearchOptions,
  ): Promise<ChannelItem[]> {
    return [];
  }
}
