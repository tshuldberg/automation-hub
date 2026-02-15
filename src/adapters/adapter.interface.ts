export type ChannelType = "email" | "calendar" | "reminders" | "slack" | "imessage" | "pm";

export interface ListOptions {
  limit?: number;
  since?: string;
  filters?: Record<string, unknown>;
}

export interface SearchOptions {
  limit?: number;
  participant?: string;
}

export interface ChannelItem {
  id: string;
  source_channel: ChannelType;
  source_reference: string;
  timestamp: string;
  content: string;
  subject?: string;
  participants: string[];
  metadata: Record<string, unknown>;
}

export interface ResponseTarget {
  channel: ChannelType;
  recipient: string;
  thread_id?: string;
}

export interface ChannelAdapter {
  readonly channel: ChannelType;
  initialize(): Promise<void>;
  listItems(opts: ListOptions): Promise<ChannelItem[]>;
  getItem(id: string): Promise<ChannelItem>;
  sendResponse(target: ResponseTarget, body: string): Promise<void>;
  search?(query: string, opts?: SearchOptions): Promise<ChannelItem[]>;
}
