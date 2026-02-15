import { describe, it, expect, vi } from "vitest";

import { ChannelRouter } from "../src/adapters/router.js";
import { SlackAdapter } from "../src/adapters/slack.adapter.js";
import { MacosMailAdapter } from "../src/adapters/macos-mail.adapter.js";
import { MacosMessagesAdapter } from "../src/adapters/macos-messages.adapter.js";
import { MacosCalendarAdapter } from "../src/adapters/macos-calendar.adapter.js";
import { MacosRemindersAdapter } from "../src/adapters/macos-reminders.adapter.js";
import { PmAdapter } from "../src/adapters/pm.adapter.js";
import type { ResponseTarget } from "../src/adapters/adapter.interface.js";

describe("ChannelRouter", () => {
  describe("register", () => {
    it("registers a single adapter", () => {
      const router = new ChannelRouter();
      const slack = new SlackAdapter();
      router.register(slack);
      expect(router.getAdapter("slack")).toBe(slack);
    });

    it("registers multiple adapters", () => {
      const router = new ChannelRouter();
      const slack = new SlackAdapter();
      const mail = new MacosMailAdapter();
      router.register(slack);
      router.register(mail);
      expect(router.getAdapter("slack")).toBe(slack);
      expect(router.getAdapter("email")).toBe(mail);
    });

    it("replaces previous adapter for same channel", () => {
      const router = new ChannelRouter();
      const slack1 = new SlackAdapter();
      const slack2 = new SlackAdapter();
      router.register(slack1);
      router.register(slack2);
      expect(router.getAdapter("slack")).toBe(slack2);
    });
  });

  describe("getAdapter", () => {
    it("returns undefined for unregistered channel", () => {
      const router = new ChannelRouter();
      expect(router.getAdapter("slack")).toBeUndefined();
    });

    it("returns the correct adapter by channel type", () => {
      const router = new ChannelRouter();
      const imessage = new MacosMessagesAdapter();
      router.register(imessage);
      expect(router.getAdapter("imessage")).toBe(imessage);
    });
  });

  describe("getAllAdapters", () => {
    it("returns empty array when no adapters registered", () => {
      const router = new ChannelRouter();
      expect(router.getAllAdapters()).toEqual([]);
    });

    it("returns all registered adapters", () => {
      const router = new ChannelRouter();
      const slack = new SlackAdapter();
      const mail = new MacosMailAdapter();
      const imessage = new MacosMessagesAdapter();
      const calendar = new MacosCalendarAdapter();
      const reminders = new MacosRemindersAdapter();
      const pm = new PmAdapter();
      router.register(slack);
      router.register(mail);
      router.register(imessage);
      router.register(calendar);
      router.register(reminders);
      router.register(pm);
      const all = router.getAllAdapters();
      expect(all).toHaveLength(6);
      expect(all).toContain(slack);
      expect(all).toContain(mail);
      expect(all).toContain(imessage);
      expect(all).toContain(calendar);
      expect(all).toContain(reminders);
      expect(all).toContain(pm);
    });
  });

  describe("sendResponse", () => {
    it("routes to the correct adapter", async () => {
      const router = new ChannelRouter();
      const slack = new SlackAdapter();
      const sendSpy = vi.spyOn(slack, "sendResponse").mockResolvedValue(undefined);
      router.register(slack);

      const target: ResponseTarget = {
        channel: "slack",
        recipient: "U01BBL118JC",
      };
      await router.sendResponse(target, "Hello from router");

      expect(sendSpy).toHaveBeenCalledWith(target, "Hello from router");
      sendSpy.mockRestore();
    });

    it("throws when no adapter registered for channel", async () => {
      const router = new ChannelRouter();

      const target: ResponseTarget = {
        channel: "slack",
        recipient: "U01BBL118JC",
      };

      await expect(router.sendResponse(target, "test")).rejects.toThrow(
        "No adapter registered for channel: slack",
      );
    });

    it("routes to different adapters based on channel", async () => {
      const router = new ChannelRouter();
      const slack = new SlackAdapter();
      const mail = new MacosMailAdapter();
      const slackSpy = vi.spyOn(slack, "sendResponse").mockResolvedValue(undefined);
      const mailSpy = vi.spyOn(mail, "sendResponse").mockResolvedValue(undefined);
      router.register(slack);
      router.register(mail);

      await router.sendResponse({ channel: "slack", recipient: "U01" }, "slack msg");
      await router.sendResponse({ channel: "email", recipient: "test@example.com" }, "email msg");

      expect(slackSpy).toHaveBeenCalledTimes(1);
      expect(mailSpy).toHaveBeenCalledTimes(1);
      slackSpy.mockRestore();
      mailSpy.mockRestore();
    });

    it("passes thread_id through to adapter", async () => {
      const router = new ChannelRouter();
      const imessage = new MacosMessagesAdapter();
      const spy = vi.spyOn(imessage, "sendResponse").mockResolvedValue(undefined);
      router.register(imessage);

      const target: ResponseTarget = {
        channel: "imessage",
        recipient: "+17608466479",
        thread_id: "chat-123",
      };
      await router.sendResponse(target, "threaded reply");

      expect(spy).toHaveBeenCalledWith(target, "threaded reply");
      expect(spy.mock.calls[0]![0].thread_id).toBe("chat-123");
      spy.mockRestore();
    });
  });
});
