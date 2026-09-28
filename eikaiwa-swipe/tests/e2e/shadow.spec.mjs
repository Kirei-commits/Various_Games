import { test, expect } from "./fixtures.mjs";

async function openShadow(page) {
  await page.getByRole("button", { name: "シャドー", exact: true }).click();
  await expect(page.getByTestId("shadow-counter")).toHaveText("1 / 50");
}

test("お手本 → あなたの番 を行ごとに進み、フレーズを終えると次へ進んで回数を記録する", async ({ page }) => {
  await openShadow(page);
  await page.getByRole("button", { name: "短め", exact: true }).click();
  await page.getByRole("button", { name: "シャドーイングを始める" }).click();
  await expect(page.getByTestId("shadow-status")).toContainText("あなたの番");
  // お手本は役ごとに読み上げる（見出し → A → B）
  await expect(page.getByTestId("shadow-counter")).toHaveText("2 / 50", { timeout: 15_000 });
  const spoken = await page.evaluate(() => window.__spoken.map((c) => c.text));
  expect(spoken.slice(0, 3)).toEqual(["How's it going?", "Hey, how's it going?", "Pretty good, thanks."]);

  await page.getByRole("button", { name: "一時停止" }).click();
  await expect(page.getByTestId("shadow-status")).toContainText("▶ を押すと");
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByText("シャドーイング").locator("..")).toContainText("1回");
});

test("英文を隠すと、あなたの番が来るまで伏せ字になる", async ({ page }) => {
  await openShadow(page);
  await page.getByText("英文を隠す").click();
  const first = page.getByTestId("shadow-line").first();
  await expect(first).not.toContainText("How's it going?");
  await expect(first).toContainText("•");
});

test("前後のフレーズへ移動できる", async ({ page }) => {
  await openShadow(page);
  await page.getByRole("button", { name: "次のフレーズ" }).click();
  await expect(page.getByTestId("shadow-counter")).toHaveText("2 / 50");
  await expect(page.getByTestId("shadow-line").first()).toContainText("What's up?");
  await page.getByRole("button", { name: "前のフレーズ" }).click();
  await expect(page.getByTestId("shadow-counter")).toHaveText("1 / 50");
});

test("発音チェック: 聞き取れた単語を色分けして割合を出す", async ({ page }) => {
  await openShadow(page);
  await page.getByText("発音チェック").click();
  await page.evaluate(() => (window.__nextSpeech = "how is it going"));
  await page.getByRole("button", { name: "シャドーイングを始める" }).click();
  await expect(page.getByTestId("shadow-score").first()).toHaveText("発音チェック 100%");
  await page.getByRole("button", { name: "一時停止" }).click();
});
