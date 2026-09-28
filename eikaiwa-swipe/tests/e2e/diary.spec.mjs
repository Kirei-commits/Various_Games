import { test, expect } from "./fixtures.mjs";

test("日記: 集めた単語をタップで入れて書き、採点するとポイント。次の日は「これまでの日記」に残る", async ({ page }) => {
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
  await page.locator("#diary-text").fill("Today I had breakfast with my family. Then we went to the park and played soccer. It was fun!");
  await page.getByRole("button", { name: "採点して保存" }).click();
  const result = page.getByTestId("diary-result");
  await expect(result).toBeVisible();
  const score = Number(await page.getByTestId("diary-score").innerText().then((t) => t.replace(/\D/g, "")));
  expect(score).toBeGreaterThanOrEqual(70);
  await expect(result).toContainText("breakfast, park");
  await expect(result).toContainText(`ガチャポイント +${(score * 30).toLocaleString()}`);

  // 間違いがあると指摘される
  await page.locator("#diary-text").fill("i ate a apple");
  await page.getByRole("button", { name: "採点して保存" }).click();
  await expect(page.getByTestId("diary-issues")).toContainText("an apple");
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
  await expect(history).toContainText("64点");
  await history.getByRole("button").first().click();
  await expect(history).toContainText("I went to the zoo.");
});
