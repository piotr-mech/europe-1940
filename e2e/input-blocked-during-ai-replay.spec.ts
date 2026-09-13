import { expect, test } from "@playwright/test";

// The autosave envelope key (src/lib/persistence.ts SAVE_STORAGE_KEY). Hardcoded
// here so the spec does not import engine modules through the `@/` alias.
const SAVE_STORAGE_KEY = "europe1940:save";

/**
 * Risk #6 (test-plan.md §2): turn-sequencing integrity — the rendered-UI part
 * that only a browser can prove: while the AI plan queue is non-empty, the
 * player cannot act (the end-turn action is disabled and relabeled "Tura
 * AI…"), and once the replay drains, play returns to the player on the next
 * turn. The pure `inputBlocked` contract is unit-tested; this test protects
 * the same contract as the user meets it in the rendered UI.
 *
 * Modeled on e2e/seed.spec.ts (role-based selectors, per-test independence,
 * wait-for-state, risk-tied name). All boundaries real — the game has no
 * external APIs; AI battle popups close themselves after playback, so the
 * replay drains without test interference. Cleanup drops the autosave.
 */
test("player input is blocked during AI replay and resumes on the next turn", async ({ page }) => {
  // Setup: start a campaign with the default sides (player: Niemcy, AI: ZSRR).
  await page.goto("/game");
  await page.getByRole("button", { name: "Rozpocznij grę" }).click();
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Koniec tury" })).toBeEnabled();

  // Action: end the player's turn — the AI replay queue takes over.
  await page.getByRole("button", { name: "Koniec tury" }).click();

  // Input blocked while the AI plan queue is non-empty: the player's only
  // header action is relabeled and disabled.
  await expect(page.getByRole("button", { name: "Tura AI…" })).toBeDisabled();

  // Wait for state, not time: the replay drains and play returns to the
  // player on turn 2. Generous timeout — each AI action is staged (500 ms)
  // and battle popups play out before the driver continues.
  await expect(page.getByText(/^Tura 2 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Koniec tury" })).toBeEnabled();

  // Cleanup: drop the autosaved campaign.
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_STORAGE_KEY);
});
