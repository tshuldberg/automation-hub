import path from "node:path";

import type { ChannelAdapter } from "./adapter.interface.js";
import { MockEmailAdapter, MockPmAdapter, MockCalendarAdapter } from "./mock.js";
import { MacosMailAdapter } from "./macos-mail.adapter.js";
import { MacosCalendarAdapter } from "./macos-calendar.adapter.js";
import { MacosRemindersAdapter } from "./macos-reminders.adapter.js";
import { MacosMessagesAdapter } from "./macos-messages.adapter.js";
import { SlackAdapter } from "./slack.adapter.js";
import { PmAdapter } from "./pm.adapter.js";
import { ChannelRouter } from "./router.js";

export interface AdapterKit {
  email: ChannelAdapter;
  calendar: ChannelAdapter;
  reminders: ChannelAdapter;
  imessage: ChannelAdapter;
  slack: ChannelAdapter;
  pm: ChannelAdapter;
  router: ChannelRouter;
  /** Mock adapters only — available in dry-run mode for legacy email-triage compat. */
  mockEmail?: MockEmailAdapter | undefined;
  mockPm?: MockPmAdapter | undefined;
  mockCalendar?: MockCalendarAdapter | undefined;
}

export interface FactoryOptions {
  repoRoot: string;
  dryRun: boolean;
}

/**
 * Build a full set of channel adapters.
 *
 * - In dry-run mode: uses mock adapters for email/pm/calendar (backward-compatible
 *   with the original email-triage mock data), real stubs for the rest.
 * - In production mode: uses real adapters for all channels.
 *
 * Both modes register every adapter in a ChannelRouter for reply-in-same-channel routing.
 */
export async function createAdapterKit(opts: FactoryOptions): Promise<AdapterKit> {
  const stateDir = path.join(opts.repoRoot, "state");

  let email: ChannelAdapter;
  let calendar: ChannelAdapter;
  let pm: ChannelAdapter;
  let mockEmail: MockEmailAdapter | undefined;
  let mockPm: MockPmAdapter | undefined;
  let mockCalendar: MockCalendarAdapter | undefined;

  if (opts.dryRun) {
    const me = new MockEmailAdapter(stateDir);
    const mp = new MockPmAdapter(stateDir);
    const mc = new MockCalendarAdapter(stateDir);
    await mp.initialize();
    mockEmail = me;
    mockPm = mp;
    mockCalendar = mc;
    // Wrap mocks as ChannelAdapter-shaped placeholders for the router.
    // The job runners use the mock instances directly for dry-run logic.
    email = new MacosMailAdapter();
    calendar = new MacosCalendarAdapter();
    pm = new PmAdapter();
  } else {
    email = new MacosMailAdapter();
    calendar = new MacosCalendarAdapter();
    pm = new PmAdapter();
  }

  const reminders = new MacosRemindersAdapter();
  const imessage = new MacosMessagesAdapter();
  const slack = new SlackAdapter();

  await email.initialize();
  await calendar.initialize();
  await pm.initialize();
  await reminders.initialize();
  await imessage.initialize();
  await slack.initialize();

  const router = new ChannelRouter();
  router.register(email);
  router.register(calendar);
  router.register(reminders);
  router.register(imessage);
  router.register(slack);
  router.register(pm);

  return {
    email,
    calendar,
    reminders,
    imessage,
    slack,
    pm,
    router,
    mockEmail,
    mockPm,
    mockCalendar,
  };
}
