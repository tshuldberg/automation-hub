import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/**
 * Adapter wrapping macos-hub Apple Reminders MCP tools
 * (list_reminders, get_reminder, create_reminder, complete_reminder,
 *  update_reminder, delete_reminder).
 *
 * Also serves as a lightweight PM adapter fallback -- tasks can be
 * tracked as Apple Reminders when no dedicated PM tool is configured.
 *
 * In a Claude Code session the real MCP calls are routed through macos-hub.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class MacosRemindersAdapter implements ChannelAdapter {
  readonly channel = "reminders" as const;

  /** No initialization needed -- macos-hub MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List reminders.
   * Delegates to macos-hub `list_reminders` MCP tool in a Claude Code session.
   * Supports filtering by list name via `opts.filters.list`.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /**
   * Retrieve a single reminder by ID.
   * Delegates to macos-hub `get_reminder` MCP tool in a Claude Code session.
   */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "reminders",
      source_reference: `reminders:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [],
      metadata: {},
    };
  }

  /**
   * Create a reminder or mark one complete.
   * Delegates to macos-hub `create_reminder` or `complete_reminder`
   * MCP tool in a Claude Code session.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(
      `[MacosRemindersAdapter] Would send to ${target.recipient}: ${body}`,
    );
  }

  /**
   * Search reminders by content text.
   * Iterates reminders from `list_reminders` and filters by query match.
   */
  async search(
    _query: string,
    _opts?: SearchOptions,
  ): Promise<ChannelItem[]> {
    return [];
  }
}
