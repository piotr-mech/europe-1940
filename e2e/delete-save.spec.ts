import { expect, test } from "@playwright/test";

// The autosave envelope key (src/lib/persistence.ts SAVE_STORAGE_KEY). Hardcoded
// here so the test does not import engine modules through the `@` alias.
const SAVE_STORAGE_KEY = "europe1940:save";

/**
 * Protects the delete-save contract (risk #4, PRD FR-014): the setup screen
 * offers an explicit "Usuń zapisaną kampanię" affordance when a save exists,
 * and clicking it is the only user-initiated way a campaign is lost — after
 * deletion a refresh lands on the setup screen, not on the resumed board.
 *
 * Shaped by the seed test (.agents/skills/10x-e2e/references/seed-test-pattern.md):
 * role-based selectors, standalone setup → action → assertion → cleanup,
 * waiting for app state instead of time.
 */
test("deleting the saved campaign from the setup screen drops the save", async ({ page }) => {
  // Setup: open the game, start a campaign (player: Niemcy, AI: ZSRR), then
  // exit to the menu — the non-destructive exit that keeps the save and makes
  // the setup screen the place where a save is visible.
  await page.goto("/game");
  await page.getByRole("button", { name: "Rozpocznij grę" }).click();
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();
  await page.getByRole("button", { name: "Menu główne" }).click();
  await expect(page.getByRole("button", { name: "Rozpocznij grę" })).toBeVisible();

  // The affordance appears only while a save exists.
  const deleteButton = page.getByRole("button", { name: "Usuń zapisaną kampanię" });
  await expect(deleteButton).toBeVisible();

  // Action: delete the saved campaign.
  await deleteButton.click();

  // The affordance is gone (no save left to delete)…
  await expect(deleteButton).toBeHidden();

  // …and the risk under test: a refresh no longer resumes the campaign —
  // the setup screen is back, with no turn header on the page.
  await page.reload();
  await expect(page.getByRole("button", { name: "Rozpocznij grę" })).toBeVisible();
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeHidden();

  // Cleanup: drop the autosave slot (already empty — kept for context reuse).
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_STORAGE_KEY);
});
