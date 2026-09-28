import { test, expect, startTest, currentQuestion } from "./fixtures.mjs";

const JA_EN = { direction: "日本語 → 英語" };

test("日本語→英語: 入力で答え、正解の英語を読み上げる。短縮形の違いは正解", async ({ page }) => {
  await startTest(page, JA_EN);
  const p = await currentQuestion(page);
  await expect(page.getByTestId("test-question")).toHaveText(p.japanese);
  await page.evaluate(() => (window.__spoken = []));
  // 小文字・記号なし・短縮形を展開して答えても正解
  const answer = p.english.toLowerCase().replace(/'m\b/, " am").replace(/[.?!]/g, "");
  await page.locator("#test-answer").fill(answer);
  await page.locator("#test-answer").press("Enter");
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
  await expect(page.getByTestId("answer-english")).toHaveText(p.english);
  const spoken = await page.waitForFunction(() => window.__spoken.length > 0 && window.__spoken.map((c) => c.text).join(" "));
  expect(await spoken.jsonValue()).toContain(p.english.split(" ")[0]);
});

test("日本語→英語: ヒントで頭文字を表示できる", async ({ page }) => {
  await startTest(page, JA_EN);
  const p = await currentQuestion(page);
  await page.getByRole("button", { name: "ヒント（頭文字）を見る" }).click();
  await expect(page.getByTestId("hint")).toHaveText(new RegExp(`^${p.english[0]}`));
});

test("日本語→英語: 英語の音声で答える", async ({ page }) => {
  await startTest(page, { ...JA_EN, answer: "音声" });
  const p = await currentQuestion(page);
  await page.evaluate((text) => (window.__nextSpeech = text), p.english);
  await page.getByRole("button", { name: "話して答える" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("日本語→英語: 4択は英語の選択肢", async ({ page }) => {
  await startTest(page, { ...JA_EN, answer: "4択" });
  const p = await currentQuestion(page);
  await page.getByRole("button", { name: p.english, exact: true }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("日本語→英語の成績は英語→意味とは別に記録される", async ({ page }) => {
  await startTest(page, { ...JA_EN, count: "10問" });
  for (let i = 0; i < 10; i++) {
    await page.getByRole("button", { name: "わからない" }).click();
    await page.getByRole("button", { name: /次の問題へ|結果を見る/ }).click();
  }
  await expect(page.getByTestId("result-pct")).toHaveText("0%");
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByRole("button", { name: /あいさつ・基本の返事/ })).toContainText("英語 0%");
  await expect(page.getByRole("button", { name: /あいさつ・基本の返事/ })).not.toContainText("意味");
});
