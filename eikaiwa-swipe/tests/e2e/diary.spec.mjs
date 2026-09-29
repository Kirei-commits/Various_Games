import { test, expect } from "./fixtures.mjs";

test("日記: ガチャの単語を使わずに自由に書き、気分と一緒に保存できる（採点はしない）", async ({ page }) => {
  await page.getByRole("button", { name: "日記", exact: true }).click();
  await expect(page.getByTestId("diary-words")).toHaveCount(0); // 集めた単語の一覧は出さない
  // お題を押すと、空のときだけお題が書き出しに入る
  await page.getByTestId("diary-prompt").click();
  await expect(page.locator("#diary-text")).toHaveValue(/\?\n$/);
  await page.locator("#diary-text").fill("Today I had breakfast with my family. Then we went to the park and played soccer.");
  await expect(page.getByTestId("diary")).toContainText("16語");
  await page.getByRole("radio", { name: "😄" }).click();
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId("diary-saved")).toBeVisible();
  await expect(page.getByTestId("diary-result")).toHaveCount(0); // 採点はしない
  await page.reload();
  await page.getByRole("button", { name: "日記", exact: true }).click();
  await expect(page.locator("#diary-text")).toHaveValue(/played soccer/);
  await expect(page.getByRole("radio", { name: "😄" })).toHaveAttribute("aria-checked", "true");
});

test("日記: 日本語でも書ける", async ({ page }) => {
  await page.getByRole("button", { name: "日記", exact: true }).click();
  await page.locator("#diary-text").fill("今日は公園に行った。");
  await expect(page.getByTestId("diary")).toContainText("10文字");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId("diary-saved")).toBeVisible();
});

test("日記: 前の日の日記は一覧に並び、タップで全文が見られる", async ({ page }) => {
  await page.evaluate(() => {
    const state = {
      version: 5,
      learned: {},
      diary: { "2020-01-02": { text: "It was a sunny day. I went to the zoo.", score: 64, points: 1920, at: 1, words: [] } },
    };
    localStorage.setItem("swipetalk:v2", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "日記", exact: true }).click();
  const history = page.getByTestId("diary-history");
  await expect(history).toContainText("2020/01/02");
  await history.getByRole("button").first().click();
  await expect(history).toContainText("I went to the zoo.");
});
