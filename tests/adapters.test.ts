import { describe, it, expect } from "vitest";

import { SlackAdapter } from "../src/adapters/slack.adapter.js";
import { MacosMessagesAdapter } from "../src/adapters/macos-messages.adapter.js";
import { MacosMailAdapter } from "../src/adapters/macos-mail.adapter.js";
import { MacosCalendarAdapter } from "../src/adapters/macos-calendar.adapter.js";
import { MacosRemindersAdapter } from "../src/adapters/macos-reminders.adapter.js";
import { PmAdapter } from "../src/adapters/pm.adapter.js";
import type { ChannelAdapter, ChannelType } from "../src/adapters/adapter.interface.js";

/**
 * Each adapter must implement the ChannelAdapter interface:
 *   - readonly channel: ChannelType
 *   - initialize(): Promise<void>
 *   - listItems(opts): Promise<ChannelItem[]>
 *   - getItem(id): Promise<ChannelItem>
 *   - sendResponse(target, body): Promise<void>
 *   - search?(query, opts): Promise<ChannelItem[]>
 */

interface AdapterTestCase {
  name: string;
  create: () => ChannelAdapter;
  expectedChannel: ChannelType;
  hasSearch: boolean;
}

const adapters: AdapterTestCase[] = [
  { name: "SlackAdapter", create: () => new SlackAdapter(), expectedChannel: "slack", hasSearch: true },
  { name: "MacosMessagesAdapter", create: () => new MacosMessagesAdapter(), expectedChannel: "imessage", hasSearch: true },
  { name: "MacosMailAdapter", create: () => new MacosMailAdapter(), expectedChannel: "email", hasSearch: true },
  { name: "MacosCalendarAdapter", create: () => new MacosCalendarAdapter(), expectedChannel: "calendar", hasSearch: true },
  { name: "MacosRemindersAdapter", create: () => new MacosRemindersAdapter(), expectedChannel: "reminders", hasSearch: true },
  { name: "PmAdapter", create: () => new PmAdapter(), expectedChannel: "pm", hasSearch: true },
];

describe("ChannelAdapter interface compliance", () => {
  for (const { name, create, expectedChannel, hasSearch } of adapters) {
    describe(name, () => {
      it("has correct channel type", () => {
        const adapter = create();
        expect(adapter.channel).toBe(expectedChannel);
      });

      it("has initialize method", () => {
        const adapter = create();
        expect(typeof adapter.initialize).toBe("function");
      });

      it("has listItems method", () => {
        const adapter = create();
        expect(typeof adapter.listItems).toBe("function");
      });

      it("has getItem method", () => {
        const adapter = create();
        expect(typeof adapter.getItem).toBe("function");
      });

      it("has sendResponse method", () => {
        const adapter = create();
        expect(typeof adapter.sendResponse).toBe("function");
      });

      if (hasSearch) {
        it("has search method", () => {
          const adapter = create();
          expect(typeof adapter.search).toBe("function");
        });
      }

      it("initialize resolves without error", async () => {
        const adapter = create();
        await expect(adapter.initialize()).resolves.toBeUndefined();
      });

      it("listItems returns an array", async () => {
        const adapter = create();
        const items = await adapter.listItems({ limit: 10 });
        expect(Array.isArray(items)).toBe(true);
      });

      it("getItem returns a ChannelItem with correct structure", async () => {
        const adapter = create();
        const item = await adapter.getItem("test-id-123");
        expect(item).toHaveProperty("id", "test-id-123");
        expect(item).toHaveProperty("source_channel", expectedChannel);
        expect(item).toHaveProperty("source_reference");
        expect(item).toHaveProperty("timestamp");
        expect(item).toHaveProperty("content");
        expect(item).toHaveProperty("participants");
        expect(item).toHaveProperty("metadata");
        expect(typeof item.source_reference).toBe("string");
        expect(typeof item.timestamp).toBe("string");
        expect(Array.isArray(item.participants)).toBe(true);
        expect(typeof item.metadata).toBe("object");
      });

      it("getItem source_reference includes channel prefix", async () => {
        const adapter = create();
        const item = await adapter.getItem("test-id-123");
        expect(item.source_reference).toContain(expectedChannel);
      });
    });
  }
});

describe("item normalization", () => {
  it("SlackAdapter getItem includes SELF_USER_ID in participants", async () => {
    const adapter = new SlackAdapter();
    const item = await adapter.getItem("msg-001");
    expect(item.participants).toContain("U01BBL118JC");
  });

  it("MacosMessagesAdapter getItem includes self phone in participants", async () => {
    const adapter = new MacosMessagesAdapter();
    const item = await adapter.getItem("msg-001");
    expect(item.participants).toContain("+17608466479");
  });

  it("MacosMailAdapter getItem has empty participants", async () => {
    const adapter = new MacosMailAdapter();
    const item = await adapter.getItem("mail-001");
    expect(item.participants).toEqual([]);
  });

  it("MacosCalendarAdapter getItem has empty participants", async () => {
    const adapter = new MacosCalendarAdapter();
    const item = await adapter.getItem("event-001");
    expect(item.participants).toEqual([]);
  });

  it("MacosRemindersAdapter getItem has empty participants", async () => {
    const adapter = new MacosRemindersAdapter();
    const item = await adapter.getItem("rem-001");
    expect(item.participants).toEqual([]);
  });

  it("PmAdapter getItem has empty participants", async () => {
    const adapter = new PmAdapter();
    const item = await adapter.getItem("task-001");
    expect(item.participants).toEqual([]);
  });

  it("all adapters return ISO timestamp strings from getItem", async () => {
    for (const { create } of adapters) {
      const adapter = create();
      const item = await adapter.getItem("ts-check");
      // Should be parseable as a date
      const parsed = new Date(item.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    }
  });
});
