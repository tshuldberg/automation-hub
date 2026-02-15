import { describe, it, expect } from "vitest";
import {
  normalizeForSearch,
  containsAnyKeyword,
  extractActionCandidates,
  extractDateCandidate,
  inferPriority,
  summarizeText,
  toTitleCase,
} from "../src/utils/extraction.js";

describe("normalizeForSearch", () => {
  it("lowercases input", () => {
    expect(normalizeForSearch("Hello WORLD")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(normalizeForSearch("")).toBe("");
  });
});

describe("containsAnyKeyword", () => {
  it("returns true when a keyword is present", () => {
    expect(containsAnyKeyword("This is urgent", ["urgent", "critical"])).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(containsAnyKeyword("URGENT request", ["urgent"])).toBe(true);
  });

  it("returns false when no keywords match", () => {
    expect(containsAnyKeyword("normal email", ["urgent", "critical"])).toBe(false);
  });

  it("returns false for empty keyword list", () => {
    expect(containsAnyKeyword("some text", [])).toBe(false);
  });

  it("returns false for empty text", () => {
    expect(containsAnyKeyword("", ["urgent"])).toBe(false);
  });
});

describe("extractActionCandidates", () => {
  it("extracts lines with action prefix", () => {
    const text = "Action: Schedule the team meeting for next week";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Schedule the team meeting for next week"]);
  });

  it("extracts TODO prefix lines", () => {
    const text = "Todo: Review the pull request by Friday";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Review the pull request by Friday"]);
  });

  it("extracts markdown checkbox items", () => {
    const text = "- [ ] Complete the quarterly report\n- [ ] Send invoices to clients";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Complete the quarterly report", "Send invoices to clients"]);
  });

  it("extracts bullet list items", () => {
    const text = "- Update the documentation\n- Fix the broken test";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Update the documentation", "Fix the broken test"]);
  });

  it("filters out short candidates (less than 8 chars)", () => {
    const text = "- Do it\n- Complete the quarterly report";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Complete the quarterly report"]);
  });

  it("falls back to first sentence when no explicit actions found", () => {
    const text = "Please review the attached documents and provide feedback.";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Please review the attached documents and provide feedback"]);
  });

  it("returns empty array for empty input", () => {
    expect(extractActionCandidates("")).toEqual([]);
  });

  it("returns empty array for very short text with no actions", () => {
    expect(extractActionCandidates("Hi.")).toEqual([]);
  });

  it("handles next step prefix", () => {
    const text = "Next step: Deploy the new version to staging";
    const result = extractActionCandidates(text);
    expect(result).toEqual(["Deploy the new version to staging"]);
  });

  it("returns multiple action candidates", () => {
    const text = "Action: Update the database schema\nTodo: Write migration tests";
    const result = extractActionCandidates(text);
    expect(result).toHaveLength(2);
  });
});

describe("extractDateCandidate", () => {
  it("extracts ISO date format", () => {
    expect(extractDateCandidate("Due by 2026-03-15 please")).toBe("2026-03-15");
  });

  it("extracts month name date format", () => {
    const result = extractDateCandidate("Meeting on January 15, 2026");
    expect(result).toBe("2026-01-15");
  });

  it("extracts month name without year", () => {
    const result = extractDateCandidate("Due March 20");
    expect(result).toBeDefined();
    expect(result).toMatch(/^\d{4}-03-20$/);
  });

  it("returns undefined for no date", () => {
    expect(extractDateCandidate("No date here")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(extractDateCandidate("")).toBeUndefined();
  });

  it("prefers ISO date when both formats present", () => {
    const text = "Due 2026-06-01 or June 15, 2026";
    expect(extractDateCandidate(text)).toBe("2026-06-01");
  });
});

describe("inferPriority", () => {
  it("returns P0 for critical", () => {
    expect(inferPriority("This is critical")).toBe("P0");
  });

  it("returns P0 for sev1", () => {
    expect(inferPriority("SEV1 incident detected")).toBe("P0");
  });

  it("returns P1 for urgent", () => {
    expect(inferPriority("Urgent: fix the build")).toBe("P1");
  });

  it("returns P1 for asap", () => {
    expect(inferPriority("Need this ASAP")).toBe("P1");
  });

  it("returns P1 for blocker", () => {
    expect(inferPriority("This is a blocker for release")).toBe("P1");
  });

  it("returns P1 for today", () => {
    expect(inferPriority("Need this done today")).toBe("P1");
  });

  it("returns P3 for nice to have", () => {
    expect(inferPriority("This is nice to have")).toBe("P3");
  });

  it("returns P3 for backlog", () => {
    expect(inferPriority("Move to backlog")).toBe("P3");
  });

  it("returns P2 as default", () => {
    expect(inferPriority("Regular task")).toBe("P2");
  });

  it("returns P2 for empty string", () => {
    expect(inferPriority("")).toBe("P2");
  });

  it("matches case-insensitively", () => {
    expect(inferPriority("CRITICAL issue")).toBe("P0");
    expect(inferPriority("URGENT request")).toBe("P1");
  });
});

describe("summarizeText", () => {
  it("returns text unchanged if under max length", () => {
    expect(summarizeText("Short text")).toBe("Short text");
  });

  it("truncates long text with ellipsis", () => {
    const longText = "a".repeat(300);
    const result = summarizeText(longText);
    expect(result.length).toBe(240);
    expect(result.endsWith("...")).toBe(true);
  });

  it("normalizes whitespace", () => {
    expect(summarizeText("hello   world\n\tfoo")).toBe("hello world foo");
  });

  it("respects custom max length", () => {
    const text = "This is a somewhat longer piece of text that should be truncated";
    const result = summarizeText(text, 20);
    expect(result.length).toBe(20);
    expect(result.endsWith("...")).toBe(true);
  });

  it("handles empty string", () => {
    expect(summarizeText("")).toBe("");
  });

  it("returns exact max length text unchanged", () => {
    const text = "a".repeat(240);
    expect(summarizeText(text)).toBe(text);
  });
});

describe("toTitleCase", () => {
  it("capitalizes first letter of each word", () => {
    expect(toTitleCase("hello world")).toBe("Hello World");
  });

  it("handles single word", () => {
    expect(toTitleCase("hello")).toBe("Hello");
  });

  it("preserves existing capitalization after first letter", () => {
    expect(toTitleCase("heLLO wORLD")).toBe("HeLLO WORLD");
  });

  it("handles multiple spaces", () => {
    expect(toTitleCase("hello   world")).toBe("Hello World");
  });

  it("handles empty string", () => {
    expect(toTitleCase("")).toBe("");
  });
});
