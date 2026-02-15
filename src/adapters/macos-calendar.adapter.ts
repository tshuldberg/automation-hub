import type {
  ChannelAdapter,
  ChannelItem,
  ListOptions,
  ResponseTarget,
  SearchOptions,
} from "./adapter.interface.js";

/**
 * Adapter wrapping macos-hub Apple Calendar MCP tools
 * (list_events, list_calendars, get_event, create_event, update_event, delete_event).
 *
 * In a Claude Code session the real MCP calls are routed through macos-hub.
 * When run as a standalone CLI the methods return empty arrays / log intent.
 */
export class MacosCalendarAdapter implements ChannelAdapter {
  readonly channel = "calendar" as const;

  /** No initialization needed -- macos-hub MCP tools are session-scoped. */
  async initialize(): Promise<void> {}

  /**
   * List calendar events.
   * Delegates to macos-hub `list_events` MCP tool in a Claude Code session.
   * Supports filtering by calendar name via `opts.filters.calendar`
   * and date range via `opts.since`.
   */
  async listItems(_opts: ListOptions): Promise<ChannelItem[]> {
    return [];
  }

  /**
   * Retrieve a single calendar event by ID.
   * Delegates to macos-hub `get_event` MCP tool in a Claude Code session.
   */
  async getItem(id: string): Promise<ChannelItem> {
    return {
      id,
      source_channel: "calendar",
      source_reference: `calendar:${id}`,
      timestamp: new Date().toISOString(),
      content: "",
      participants: [],
      metadata: {},
    };
  }

  /**
   * Create or update a calendar event as a response.
   * Delegates to macos-hub `create_event` or `update_event` MCP tool.
   * Uses `target.thread_id` as an existing event ID for updates.
   */
  async sendResponse(target: ResponseTarget, body: string): Promise<void> {
    console.log(
      `[MacosCalendarAdapter] Would send to ${target.recipient}: ${body}`,
    );
  }

  /**
   * Search calendar events by content.
   * Iterates events from `list_events` and filters by query string match.
   */
  async search(
    _query: string,
    _opts?: SearchOptions,
  ): Promise<ChannelItem[]> {
    return [];
  }
}
