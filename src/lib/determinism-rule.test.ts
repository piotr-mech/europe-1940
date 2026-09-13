import { describe, expect, it } from "vitest";

import { ESLint } from "eslint";

// Imported for side effect + the shared engine file list — the same constant
// the flat config's determinism block uses, so rule scope and this test
// cannot diverge.
import { DETERMINISM_ENGINE_FILES } from "../../eslint.config.js";

/**
 * Self-verification for the static determinism gate (test-plan Phase 3,
 * risk #5): the ESLint rule must (a) hold on the actual engine modules — the
 * closed reducer-path set — and (b) catch every banned construct when it
 * appears in an engine file. It must NOT fire outside the engine set (the
 * UI's sanctioned one-time campaign seed lives in GameScreen).
 */

/** The rule ids only the determinism block defines — unambiguous markers. */
const DETERMINISM_RULE_IDS = new Set(["no-restricted-properties", "no-restricted-syntax"]);

function determinismMessages(messages: { ruleId: string | null }[]): number {
  return messages.filter((message) => message.ruleId !== null && DETERMINISM_RULE_IDS.has(message.ruleId)).length;
}

/** One line per banned construct — wall-clock reads and unseeded entropy. */
const VIOLATION_FIXTURE = [
  "const a = Date.now();",
  "const b = Math.random();",
  "const c = new Date();",
  "const d = performance.now();",
  "const e = crypto.randomUUID();",
  "const f = crypto.getRandomValues(new Uint8Array(1));",
].join("\n");

describe("static determinism rule (risk #5)", () => {
  it("reports zero determinism violations across the engine module set", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const results = await eslint.lintFiles(DETERMINISM_ENGINE_FILES);

    expect(results).toHaveLength(DETERMINISM_ENGINE_FILES.length);
    for (const result of results) {
      expect(determinismMessages(result.messages), `${result.filePath} must be determinism-clean`).toBe(0);
    }
  });

  it("catches every banned construct inside an engine module", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(VIOLATION_FIXTURE, { filePath: "src/lib/battle.ts" });

    expect(determinismMessages(result.messages)).toBe(6);
  });

  it("does not fire outside the engine set (the UI seed stays sanctioned)", async () => {
    const eslint = new ESLint({ cwd: process.cwd() });
    const [result] = await eslint.lintText(VIOLATION_FIXTURE, { filePath: "src/components/game/GameScreen.tsx" });

    expect(determinismMessages(result.messages)).toBe(0);
  });
});
