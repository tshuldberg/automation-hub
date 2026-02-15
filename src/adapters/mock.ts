import path from "node:path";

import { EmailThread } from "../contracts.js";
import { fileExists, loadJsonFile } from "../runtime/loaders.js";

export interface PmProject {
  project_id: string;
  name: string;
  account_name: string;
  status: string;
}

export interface PmTask {
  task_id: string;
  title: string;
  external_ref?: string;
}

const DEFAULT_EMAIL_THREADS: EmailThread[] = [
  {
    id: "thread_1001",
    subject: "Implementation kickoff timeline for Acme Co",
    participants: ["pm@acme.com", "impl@shiphawk.com"],
    messages: [
      {
        id: "msg_1001_a",
        from: "pm@acme.com",
        timestamp: "2026-02-08T09:05:00-08:00",
        body: [
          "Action: confirm kickoff agenda and assign data mapping owner.",
          "Action: create go-live readiness checklist before 2026-02-14.",
          "Please keep us posted if timeline risk appears.",
        ].join("\n"),
      },
    ],
  },
  {
    id: "thread_1002",
    subject: "Go-live blocker: carrier credentials are failing",
    participants: ["ops@acme.com", "impl@shiphawk.com"],
    messages: [
      {
        id: "msg_1002_a",
        from: "ops@acme.com",
        timestamp: "2026-02-08T10:20:00-08:00",
        body: [
          "Urgent blocker for go-live.",
          "Action: investigate credential validation errors and provide resolution ASAP.",
          "Can we target completion by 2026-02-10?",
        ].join("\n"),
      },
    ],
  },
  {
    id: "thread_1003",
    subject: "Weekly newsletter",
    participants: ["newsletter@example.com"],
    messages: [
      {
        id: "msg_1003_a",
        from: "newsletter@example.com",
        timestamp: "2026-02-08T07:00:00-08:00",
        body: "This is marketing content and should be ignored.",
      },
    ],
  },
];

const DEFAULT_PROJECTS: PmProject[] = [
  {
    project_id: "proj_acme_install",
    name: "Acme Co Post-Sales Install",
    account_name: "Acme Co",
    status: "active",
  },
  {
    project_id: "proj_orion_install",
    name: "Orion Foods Install",
    account_name: "Orion Foods",
    status: "planned",
  },
];

const DEFAULT_CALENDAR_BUSY_DATES = ["2026-02-09", "2026-02-11", "2026-02-13"];

export class MockEmailAdapter {
  constructor(private readonly stateDir: string) {}

  async listThreads(): Promise<EmailThread[]> {
    const mockPath = path.join(this.stateDir, "mock_email_threads.json");
    if (!(await fileExists(mockPath))) {
      return DEFAULT_EMAIL_THREADS;
    }

    return loadJsonFile<EmailThread[]>(mockPath);
  }
}

export class MockPmAdapter {
  private readonly tasksByExternalRef = new Map<string, PmTask>();

  constructor(private readonly stateDir: string) {}

  async initialize(): Promise<void> {
    const mappingPath = path.join(this.stateDir, "pm_mapping.json");
    if (!(await fileExists(mappingPath))) {
      return;
    }

    const loaded = await loadJsonFile<Record<string, string>>(mappingPath);
    for (const [externalRef, taskId] of Object.entries(loaded)) {
      this.tasksByExternalRef.set(externalRef, {
        task_id: taskId,
        title: `Existing task for ${externalRef}`,
        external_ref: externalRef,
      });
    }
  }

  async listProjects(): Promise<PmProject[]> {
    return DEFAULT_PROJECTS;
  }

  async searchByExternalRef(externalRef: string): Promise<PmTask | undefined> {
    return this.tasksByExternalRef.get(externalRef);
  }
}

export class MockCalendarAdapter {
  constructor(private readonly stateDir: string) {}

  async suggestDueDate(windowDays: number): Promise<string | undefined> {
    const eventPath = path.join(this.stateDir, "mock_calendar_busy_days.json");
    let busyDates = new Set(DEFAULT_CALENDAR_BUSY_DATES);

    if (await fileExists(eventPath)) {
      const loaded = await loadJsonFile<string[]>(eventPath);
      busyDates = new Set(loaded);
    }

    const start = new Date();
    for (let offset = 1; offset <= windowDays; offset += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + offset);
      const day = candidate.getDay();
      const isoDate = candidate.toISOString().slice(0, 10);

      if (day === 0 || day === 6) {
        continue;
      }

      if (!busyDates.has(isoDate)) {
        return isoDate;
      }
    }

    return undefined;
  }
}
