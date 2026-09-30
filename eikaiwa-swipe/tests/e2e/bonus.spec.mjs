import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("swipetalk:skipLogin", "1"));
});

test("その日最初に開くとログインボーナス（ガチャポイントと5倍ブースト）。コインはもうない", async ({ page }) => {
  await page.goto("/");
  const modal = page.getByTestId("bonus-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("bonus-gacha")).toContainText("+300pt");
  await expect(page.getByTestId("bonus-boost")).toContainText("5倍ブースト +1");
  await expect(modal).toContainText("1日連続ログイン");
  await expect(modal).not.toContainText("コイン");
  await modal.getByRole("button", { name: "受け取る" }).click();
  await expect(modal).toHaveCount(0);

  // 同じ日にもう一度開いても出ない
  await page.reload();
  await expect(page.getByTestId("remaining")).toBeVisible();
  await expect(page.getByTestId("bonus-modal")).toHaveCount(0);

  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("bonus-card")).not.toContainText("🪙");
  await expect(page.getByTestId("bonus-card")).toContainText("5倍ブースト ×1");

  // ブーストはガチャ画面から使える。使うと残り時間が出て、学習のポイントが5倍
  await page.getByRole("button", { name: "ガチャ", exact: true }).first().click();
  await page.getByTestId("wallet-boost").getByRole("button", { name: "使う" }).click();
  await expect(page.getByTestId("boost-badge")).toContainText(/残り (59|60):/);
  await page.getByRole("button", { name: "学習", exact: true }).first().click();
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("earn-toast")).toContainText("（5倍）");
});

test("ログインボーナスの「今すぐ使う」で5倍ブーストが始まる", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("bonus-modal").getByRole("button", { name: /今すぐ使う/ }).click();
  await expect(page.getByTestId("bonus-modal")).toHaveCount(0);
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("bonus-card").getByTestId("boost-badge")).toBeVisible();
});

test("着せかえは設定からいつでも無料で選べ、次に開いても残っている", async ({ page }) => {
  await page.addInitScript(() => (window.__swipetalkNoDailyBonus = true));
  await page.goto("/");
  await page.getByRole("button", { name: "音声の設定" }).first().click();
  const picker = page.getByTestId("theme-picker");
  await expect(picker.getByRole("button", { name: /スタンダード/ })).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("button", { name: /桜/ }).click();
  await expect(picker.getByRole("button", { name: /桜/ })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "音声の設定" }).first().click();
  await expect(page.getByTestId("theme-picker").getByRole("button", { name: /桜/ })).toHaveAttribute("aria-pressed", "true");
});
