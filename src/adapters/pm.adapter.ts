import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/**
 * Adapter wrapping PM MCP interface tools
 * (pm.list_projects, pm.create_task, pm.update_task, pm.search_tasks, etc.).
 *
 * Falls back to Apple Reminders for task tracking when no dedicated PM tool
 * is configured. The PM adapter normalizes project management actions into
 * the shared ChannelItem format for cross-channel consolidation.
 *
 * In a Claude Code session the real MCP calls are made by the orchestrator.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class PmAdapter implements ChannelAdapter {
  readonly channel = "pm" as const;

  /** No initialization needed -- PM MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List PM tasks/items.
   * Delegates to `pm.list_projects` or `pm.list_tasks` in a Claude Code session.
   * Falls back to Apple Reminders list when no PM tool is available.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /**
   * Retrieve a single PM task by ID.
   * Delegates to `pm.get_task` in a Claude Code session.
   */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "pm",
      source_reference: `pm:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [],
      metadata: {},
    };
  }

  /**
   * Create or update a PM task.
   * Delegates to `pm.create_task` or `pm.update_task` in a Claude Code session.
   * Falls back to creating an Apple Reminder when no PM tool is available.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(`[PmAdapter] Would send to ${target.recipient}: ${body}`);
  }

  /**
   * Search PM tasks.
   * Delegates to `pm.search_tasks` in a Claude Code session.
   */
  async search(
    _query: string,
    _opts?: SearchOptions,
  ): Promise<ChannelItem[]> {
    return [];
  }
}
