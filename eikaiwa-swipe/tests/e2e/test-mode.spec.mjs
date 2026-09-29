import { test, expect, startTest, phraseOf, LIB } from "./fixtures.mjs";

async function currentPhrase(page) {
  return phraseOf(await page.getByTestId("test-question").innerText());
}

async function next(page) {
  await page.getByRole("button", { name: /次の問題へ|結果を見る/ }).click();
}

test("入力で答える: 正解・不正解・自己判定・結果と苦手リストへの反映", async ({ page }) => {
  await startTest(page);

  // 1問目: 正解を入力（Enter で送信）
  let p = await currentPhrase(page);
  await page.locator("#test-answer").fill(p.japanese.split("／")[0]);
  await page.locator("#test-answer").press("Enter");
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
  await next(page);

  // 2問目: でたらめな答え → 不正解 → 自分で正解にする
  await page.locator("#test-answer").fill("ぜんぜんちがうこたえ");
  await page.getByRole("button", { name: "答える" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("不正解");
  await page.getByRole("button", { name: "意味は合っているので正解にする" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解にしました");
  await next(page);

  // 残り8問は「わからない」
  for (let i = 3; i <= 10; i++) {
    await expect(page.getByTestId("test-progress")).toHaveText(`${i} / 10`);
    p = await currentPhrase(page);
    await page.getByRole("button", { name: "わからない" }).click();
    await expect(page.getByTestId("verdict")).toHaveText("スキップ");
    await next(page);
  }

  await expect(page.getByTestId("result-pct")).toHaveText("20%");
  await expect(page.getByText("間違えた8問は「未習得」に戻し")).toBeVisible();

  // 間違えた問題だけで再テストできる
  await page.getByRole("button", { name: "間違えた問題だけもう一度" }).click();
  await expect(page.getByTestId("test-progress")).toHaveText("1 / 8");
  await page.getByRole("button", { name: "やめる" }).click();

  // 苦手な問題として出題範囲に出てくる
  await expect(page.locator("#test-scope")).toContainText("苦手な問題（8問）");
});

test("4択で答える", async ({ page }) => {
  await startTest(page, { answer: "4択" });
  const p = await currentPhrase(page);
  await page.getByRole("button", { name: p.japanese, exact: true }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("音声で答える（音声認識の結果で採点する）", async ({ page }) => {
  await startTest(page, { answer: "音声" });
  const p = await currentPhrase(page);
  await page.evaluate((text) => (window.__nextSpeech = text), p.japanese.split("／")[0]);
  await page.getByRole("button", { name: "話して答える" }).click();
  // 聞き取った答えを確認してから解答する
  await expect(page.locator("#test-answer")).not.toHaveValue("");
  await page.getByRole("button", { name: "この答えで解答" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("音声だけで出題すると、英語は答えるまで表示されず自動で読み上げる", async ({ page }) => {
  await startTest(page, { prompt: "音声だけ" });
  await expect(page.getByTestId("test-question")).toHaveCount(0);
  const spoken = await page.waitForFunction(() => window.__spoken.length > 0 && window.__spoken[0].text);
  const english = await spoken.jsonValue();
  await page.getByRole("button", { name: "わからない" }).click();
  await expect(page.getByTestId("feedback")).toContainText(english);
});

test("テストの途中でタブを移動しても続きから再開できる", async ({ page }) => {
  await startTest(page);
  await page.getByRole("button", { name: "わからない" }).click();
  await page.getByRole("button", { name: "次の問題へ" }).click();
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await page.getByRole("button", { name: "テスト", exact: true }).click();
  await expect(page.getByTestId("test-progress")).toHaveText("2 / 10");
});

test("答え方はテスト中にいつでも切り替えられ、声→文字→声と戻しても使える", async ({ page }) => {
  await startTest(page, { answer: "音声" });
  await page.getByRole("button", { name: "文字で", exact: true }).click();
  await expect(page.locator("#test-answer")).toBeVisible();
  await page.getByRole("button", { name: "声で", exact: true }).click();
  const p = await currentPhrase(page);
  await page.evaluate((text) => (window.__nextSpeech = text), p.japanese.split("／")[0]);
  await page.getByRole("button", { name: "話して答える" }).click();
  // 聞き取った答えを確認してから解答する
  await expect(page.locator("#test-answer")).not.toHaveValue("");
  await page.getByRole("button", { name: "この答えで解答" }).click();
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("音声認識がないブラウザでは、声モードはキーボードの音声入力で答える", async ({ page }) => {
  await page.addInitScript(() => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
  });
  await page.reload();
  await startTest(page, { answer: "音声" });
  await expect(page.getByTestId("dictation-hint")).toContainText("キーボードのマイク");
  const p = await currentPhrase(page);
  await page.locator("#test-answer").fill(p.japanese.split("／")[0]);
  await page.locator("#test-answer").press("Enter");
  await expect(page.getByTestId("verdict")).toHaveText("正解！");
});

test("ドーパミンモード: 正解すると演出と連続正解の数が出て、待たずに次の問題へ進む", async ({ page }) => {
  await page.getByRole("button", { name: "音声の設定" }).first().click();
  await page.locator("#toggle-dopamine").check();
  await page.getByRole("dialog", { name: "音声の設定" }).getByRole("button", { name: "閉じる" }).click();
  await startTest(page, { answer: "4択" });
  for (let i = 1; i <= 2; i++) {
    await expect(page.getByTestId("test-progress")).toHaveText(`${i} / 10`);
    const p = await currentPhrase(page);
    await page.getByRole("button", { name: p.japanese, exact: true }).click();
    await expect(page.getByTestId("dopamine-streak")).toContainText(`×${i}`);
  }
  // 「次へ」を押さなくても進んでいる
  await expect(page.getByTestId("test-progress")).toHaveText("3 / 10");
});

test("出題範囲に「基本編 全部」などコースまるごとを選べる（テスト・バトル）", async ({ page }) => {
  await page.getByRole("button", { name: "テスト", exact: true }).click();
  await page.locator("#test-scope").selectOption("part2");
  await page.getByRole("button", { name: /テストを始める/ }).click();
  const id = await page.getByTestId("test-question").getAttribute("data-phrase-id");
  // アメリカ生活編（第21〜40章）の問題が出る
  const chapterNo = LIB.chapters.findIndex((c) => c.items.some((p) => p.id === id)) + 1;
  expect(chapterNo).toBeGreaterThanOrEqual(21);
  expect(chapterNo).toBeLessThanOrEqual(40);
  await page.getByRole("button", { name: "やめる" }).click();
  await page.getByRole("button", { name: "バトル", exact: true }).click();
  await page.getByRole("button", { name: "エンドレス" }).click();
  await page.getByTestId("battle-scope").click();
  const panel = page.getByTestId("battle-scope-panel");
  await panel.getByRole("button", { name: /^単語編・基礎（/ }).click();
  await panel.getByRole("button", { name: /単語編・基礎 全部（1000問）/ }).click();
  await expect(page.getByTestId("battle-scope")).toContainText("単語編・基礎 全部");
});
