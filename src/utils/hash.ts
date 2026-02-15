import crypto from "node:crypto";

export function semanticFingerprint(parts: string[]): string {
  const normalized = parts
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
    .join("|");
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}
