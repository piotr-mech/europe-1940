import { expect, test } from "@playwright/test";

// The autosave envelope key (src/lib/persistence.ts SAVE_STORAGE_KEY). Hardcoded
// here so the seed does not import engine modules through the `@/` alias.
const SAVE_STORAGE_KEY = "europe1940:save";

/**
 * Seed test — the exemplar every generated E2E test is shaped by
 * (.agents/skills/10x-e2e/references/seed-test-pattern.md). It demonstrates
 * the four conventions:
 *
 * 1. Role-based selectors: getByRole / getByText with the accessibility names
 *    a screen reader would announce — resilient to CSS/DOM refactors.
 * 2. Full test independence: setup → action → assertion → cleanup in this one
 *    test; no test assumes another test ran first.
 * 3. Waiting for state, never time: toBeVisible()/toBeEnabled() on concrete
 *    app state — no page.waitForTimeout().
 * 4. A test name tied to a test-plan.md risk: this one protects risk #4
 *    (save/resume breaks — PRD FR-014: a campaign survives page refresh).
 *
 * Data isolation: the game keeps all state in localStorage and has no
 * user-named entities, so Playwright's fresh storage context per test is the
 * unique-id equivalent. The cleanup below still drops the save explicitly, so
 * a reused context can never leak a campaign into the next run.
 */
test("started campaign persists after page reload", async ({ page }) => {
  // Setup: open the game and start a campaign with the default sides
  // (player: Niemcy, AI: ZSRR).
  await page.goto("/game");
  await page.getByRole("button", { name: "Rozpocznij grę" }).click();

  // Wait for state: the board is proven by its turn header and the player's
  // end-of-turn action being enabled.
  const turnHeader = page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/);
  await expect(turnHeader).toBeVisible();
  await expect(page.getByRole("button", { name: "Koniec tury" })).toBeEnabled();

  // The risk under test: the autosaved campaign must survive a refresh —
  // the game resumes on the board, not on the setup screen.
  await page.reload();
  await expect(turnHeader).toBeVisible();
  await expect(page.getByRole("button", { name: "Koniec tury" })).toBeEnabled();

  // Cleanup: drop the autosaved campaign.
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_STORAGE_KEY);
});
