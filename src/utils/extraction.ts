const ACTION_PREFIX_REGEX = /^\s*(action|todo|next step)\s*:\s*/i;

const MONTH_NAME_PATTERN =
  /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:,\s*\d{4})?/i;

export function normalizeForSearch(text: string): string {
  return text.toLowerCase();
}

export function containsAnyKeyword(text: string, keywords: string[]): boolean {
  const normalized = normalizeForSearch(text);
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

export function extractActionCandidates(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const explicit = lines
    .filter((line) => ACTION_PREFIX_REGEX.test(line) || line.startsWith("- [ ]") || line.startsWith("-"))
    .map((line) => line.replace(ACTION_PREFIX_REGEX, "").replace(/^-\s*\[\s\]\s*/, "").replace(/^-\s*/, "").trim())
    .filter((line) => line.length >= 8);

  if (explicit.length > 0) {
    return explicit;
  }

  const firstSentence = text
    .replace(/\s+/g, " ")
    .split(/[.!?]/)
    .map((sentence) => sentence.trim())
    .find((sentence) => sentence.length >= 10);

  return firstSentence ? [firstSentence] : [];
}

export function extractDateCandidate(text: string): string | undefined {
  const isoDateMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoDateMatch) {
    return isoDateMatch[1];
  }

  const monthDateMatch = text.match(MONTH_NAME_PATTERN);
  if (!monthDateMatch) {
    return undefined;
  }

  const parsed = new Date(monthDateMatch[0]);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString().slice(0, 10);
}

export function inferPriority(text: string): "P0" | "P1" | "P2" | "P3" {
  const normalized = normalizeForSearch(text);

  if (normalized.includes("sev1") || normalized.includes("critical")) {
    return "P0";
  }

  if (
    normalized.includes("asap") ||
    normalized.includes("urgent") ||
    normalized.includes("blocker") ||
    normalized.includes("today")
  ) {
    return "P1";
  }

  if (normalized.includes("nice to have") || normalized.includes("backlog")) {
    return "P3";
  }

  return "P2";
}

export function summarizeText(text: string, maxLength = 240): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 3)}...`;
}

export function toTitleCase(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}
