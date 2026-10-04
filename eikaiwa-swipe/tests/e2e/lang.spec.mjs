import { test, expect } from "./fixtures.mjs";

test("設定で表示の言語を English にすると、ボタンや説明が英語になる（英文と日本語訳はそのまま）。日本語に戻せる", async ({ page }) => {
  await page.getByRole("button", { name: "音声の設定" }).click();
  await page.getByTestId("lang-switch").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Voice, display & sound settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).first().click();

  // 下のタブとテスト画面
  await expect(page.getByRole("button", { name: "Study", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Test", exact: true }).first().click();
  await expect(page.getByRole("button", { name: /Start test/ })).toBeVisible();
  // バトルと冒険
  await page.getByRole("button", { name: "Battle", exact: true }).click();
  await expect(page.getByRole("button", { name: /Start battle/ })).toBeVisible();
  await expect(page.getByTestId("battle-chapter")).toContainText("Ch.51");
  await page.getByRole("button", { name: "Quest", exact: true }).click();
  await expect(page.getByTestId("quest-home")).toContainText("Challenge the tower");
  await page.getByRole("button", { name: "From floor 1" }).click();
  await expect(page.getByTestId("quest-floor")).toHaveText("Floor 1");
  await expect(page.getByTestId("quest-log")).toContainText("appeared!");
  await page.getByRole("button", { name: "Flee (return to town)" }).click();
  await expect(page.getByTestId("quest-result")).toContainText("Made it back to town");

  // 設定は保存され、再読み込みしても English のまま
  await page.reload();
  await expect(page.getByRole("button", { name: "Study", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");

  // 日本語に戻す
  await page.getByRole("button", { name: "Settings" }).first().click();
  await page.getByTestId("lang-switch").getByRole("button", { name: "日本語" }).click();
  await expect(page.getByRole("heading", { name: "音声・表示・効果音の設定" })).toBeVisible();
});
