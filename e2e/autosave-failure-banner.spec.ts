import { expect, test } from "@playwright/test";

// The autosave envelope key (src/lib/persistence.ts SAVE_STORAGE_KEY). Hardcoded
// here so the test does not import engine modules through the `@/` alias.
const SAVE_STORAGE_KEY = "europe1940:save";

/**
 * Protects the m3l5 risk: a save that cannot persist (quota exceeded, blocked
 * storage) must be announced to the player, never swallowed — otherwise the
 * campaign looks autosaved and a refresh silently loses it (FR-014).
 *
 * Shaped by the seed test (.agents/skills/10x-e2e/references/seed-test-pattern.md):
 * role-based selectors, standalone setup → action → assertion → cleanup, and
 * waiting for app state instead of time.
 */
test("failed autosave raises a warning banner while the game stays playable", async ({ page }) => {
  // Setup: break every storage write like a full quota before the app boots —
  // reads and removals keep working, only persistence is dead.
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    };
  });

  // Setup: open the game and start a campaign with the default sides
  // (player: Niemcy, AI: ZSRR). The first autosave attempt fails.
  await page.goto("/game");
  await page.getByRole("button", { name: "Rozpocznij grę" }).click();

  // Wait for state: the board is proven by its turn header.
  await expect(page.getByText(/^Tura 1 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();

  // The risk under test: the failure is announced, not swallowed. Filtered by
  // text because the scaffold's layout also renders a role="alert" banner
  // ("Uwaga: Supabase nie jest…") whenever the dev server runs without
  // secrets — exactly the CI case.
  const banner = page.getByRole("alert").filter({ hasText: "Automatyczny zapis nie działa" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Automatyczny zapis nie działa");

  // The game stays playable with storage broken: end the turn and let the
  // staged AI replay run to completion (Tura 2 proves the turn advanced).
  await page.getByRole("button", { name: "Koniec tury" }).click();
  await expect(page.getByText(/^Tura 2 · Grasz: Niemcy · AI: ZSRR$/)).toBeVisible();

  // Dismissing hides the banner — with the replay finished, no further save
  // fires, so it stays hidden until the next failed save.
  await page.getByRole("button", { name: "Rozumiem" }).click();
  await expect(banner).toBeHidden();

  // Cleanup: drop the save entry (removal is unaffected by the broken setItem).
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_STORAGE_KEY);
});
