import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("swipetalk:skipLogin", "1"));
});

test("その日最初に開くとログインボーナスを受け取れ、コインで着せかえが買える", async ({ page }) => {
  await page.goto("/");
  const modal = page.getByTestId("bonus-modal");
  await expect(modal).toBeVisible();
  await expect(page.getByTestId("bonus-coins")).toContainText("+10");
  await expect(modal).toContainText("1日連続ログイン");
  await modal.getByRole("button", { name: "受け取る" }).click();
  await expect(modal).toHaveCount(0);

  // 同じ日にもう一度開いても出ない
  await page.reload();
  await expect(page.getByTestId("remaining")).toBeVisible();
  await expect(page.getByTestId("bonus-modal")).toHaveCount(0);

  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("coin-count")).toContainText("10");
  await page.getByRole("button", { name: /桜/ }).click();
  await expect(page.getByTestId("bonus-card")).toContainText("コインが 90 枚足りません");
});
