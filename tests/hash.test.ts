import { describe, it, expect } from "vitest";
import { semanticFingerprint } from "../src/utils/hash.js";

describe("semanticFingerprint", () => {
  describe("determinism", () => {
    it("produces the same hash for the same input", () => {
      const a = semanticFingerprint(["hello", "world"]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).toBe(b);
    });

    it("produces consistent 16-character hex string", () => {
      const hash = semanticFingerprint(["test input"]);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("different inputs produce different hashes", () => {
    it("different parts produce different hashes", () => {
      const a = semanticFingerprint(["hello", "world"]);
      const b = semanticFingerprint(["goodbye", "world"]);
      expect(a).not.toBe(b);
    });

    it("different order produces different hashes", () => {
      const a = semanticFingerprint(["hello", "world"]);
      const b = semanticFingerprint(["world", "hello"]);
      expect(a).not.toBe(b);
    });

    it("single part vs multiple parts differ", () => {
      const a = semanticFingerprint(["hello world"]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).not.toBe(b);
    });
  });

  describe("normalization", () => {
    it("normalizes case (case-insensitive)", () => {
      const a = semanticFingerprint(["Hello", "World"]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).toBe(b);
    });

    it("normalizes leading and trailing whitespace", () => {
      const a = semanticFingerprint(["  hello  ", "  world  "]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).toBe(b);
    });

    it("filters out empty parts after trimming", () => {
      const a = semanticFingerprint(["hello", "", "world"]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).toBe(b);
    });

    it("filters out whitespace-only parts", () => {
      const a = semanticFingerprint(["hello", "   ", "world"]);
      const b = semanticFingerprint(["hello", "world"]);
      expect(a).toBe(b);
    });
  });

  describe("edge cases", () => {
    it("handles empty array", () => {
      const hash = semanticFingerprint([]);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("handles single part", () => {
      const hash = semanticFingerprint(["only one"]);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("handles many parts", () => {
      const parts = Array.from({ length: 100 }, (_, i) => `part-${i}`);
      const hash = semanticFingerprint(parts);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });
  });
});
