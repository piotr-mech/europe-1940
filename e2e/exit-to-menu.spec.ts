import { expect, test } from "@playwright/test";

// The autosave envelope key (src/lib/persistence.ts SAVE_STORAGE_KEY). Hardcoded
// here so the test does not import engine modules through the `@/` alias.
const SAVE_STORAGE_KEY = "europe1940:save";

/**
 * Protects the exit-to-menu contract: "Menu główne" returns to the setup screen
 * at any time, and it is non-destructive — the autosave is kept, so a page
 * refresh from the menu resumes the exited campaign (PRD FR-014).
 *
 * Shaped by the seed test (.agents/skills/10x-e2e/references/seed-test-pattern.md):
 * role-based selectors, standalone setup → action → assertion → cleanup,
 * waiting for app state instead of time.
 */
test("exiting to the main menu keeps the campaign resumable", async ({ page }) => {
  // Setup: open the game and start a campaign with the default sides
  // (player: Niemcy, AI: ZSRR).
  await page.goto("/game");
  await page.getByRole("button", { name: "Rozpocznij grę" }).click();
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();

  // Action: exit mid-campaign via the header menu button.
  await page.getByRole("button", { name: "Menu główne" }).click();

  // The setup screen is back (country pickers + start button).
  await expect(page.getByRole("button", { name: "Rozpocznij grę" })).toBeVisible();
  await expect(page.getByText("Twój kraj")).toBeVisible();

  // Non-destructive: a refresh resumes the exited campaign on the board.
  await page.reload();
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Koniec tury" })).toBeEnabled();

  // The setup screen's exit leads to the landing page — also non-destructive.
  await page.getByRole("button", { name: "Menu główne" }).click();
  await page.getByRole("link", { name: "Strona główna" }).click();
  await page.waitForURL("**/");
  await expect(page.getByRole("link", { name: "Rozpocznij kampanię" })).toBeVisible();

  // Cleanup: drop the autosaved campaign.
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_STORAGE_KEY);
});
