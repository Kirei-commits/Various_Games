import { test, expect } from "./fixtures.mjs";

test("日記: 集めた単語をタップで入れて書き、保存できる（採点はしない）", async ({ page }) => {
  await page.evaluate(() => {
    const state = { version: 5, learned: {}, gacha: { starter: true, cards: { breakfast: 1, park: 1 } } };
    localStorage.setItem("swipetalk:v2", JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole("button", { name: "日記", exact: true }).click();
  const words = page.getByTestId("diary-words");
  await expect(words.getByRole("button")).toHaveCount(2);
  await page.locator("#diary-text").fill("Today I had");
  await words.getByRole("button", { name: /breakfast/ }).click();
  await expect(page.locator("#diary-text")).toHaveValue("Today I had breakfast ");
  await page.locator("#diary-text").fill("Today I had breakfast with my family. Then we went to the park and played soccer.");
  await expect(page.getByTestId("diary")).toContainText("集めた単語 2個");
  await page.getByRole("button", { name: "保存する" }).click();
  await expect(page.getByTestId("diary-saved")).toBeVisible();
  await expect(page.getByTestId("diary-result")).toHaveCount(0); // 採点はしない
  await page.reload();
  await page.getByRole("button", { name: "日記", exact: true }).click();
  await expect(page.locator("#diary-text")).toHaveValue(/played soccer/);
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
