import { test, expect, swipe } from "./fixtures.mjs";

test("右スワイプで覚えた（残りが減る）、左スワイプで最後尾へ（残りは同じ）", async ({ page }) => {
  const remaining = page.getByTestId("remaining");
  await expect(remaining).toHaveText(/^50/);
  await swipe(page, 220);
  await expect(remaining).toHaveText(/^49/);
  await swipe(page, -220);
  await expect(remaining).toHaveText(/^49/);
  // 小さく動かしただけでは仕分けない
  await swipe(page, 40);
  await expect(remaining).toHaveText(/^49/);
});

test("ボタンでも仕分けでき、リロードしても進捗が残る", async ({ page }) => {
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await page.getByRole("button", { name: "覚えてない", exact: true }).click();
  await expect(page.getByTestId("swipe-card").locator("h2")).toHaveText("Not much.");
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText(/^48/);
  await page.reload();
  await expect(page.getByTestId("remaining")).toHaveText(/^48/);
});

test("章を切り替えると、その章のカードが出る", async ({ page }) => {
  await page.locator("#study-chapter").selectOption("ch15");
  await expect(page.getByTestId("swipe-card")).toContainText("get the hang of");
  await expect(page.getByTestId("swipe-card")).toContainText("第15章");
  // アメリカ生活編の章も選べる
  await page.locator("#study-chapter").selectOption("ch23");
  await expect(page.getByTestId("swipe-card").locator("h2")).toHaveText("What's the purpose of your visit?");
});

test("カードをタップすると裏返って訳と会話例が出る。会話は抑揚つきで読み上げる", async ({ page }) => {
  await page.getByTestId("swipe-card").click({ position: { x: 40, y: 40 } });
  await expect(page.getByText("調子どう？", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "会話を通して再生" }).first().click();
  const spoken = await page.waitForFunction(() => window.__spoken.length >= 3 && window.__spoken);
  const chunks = await spoken.jsonValue();
  // "Hey, how's it going?" は WH 疑問文、B の返答は B 役として少し高い声
  assert(chunks.map((c) => c.text).join(" ").includes("Pretty good, thanks."));
  const question = chunks.find((c) => c.text.endsWith("You?"));
  const flat = chunks.find((c) => c.text === "Pretty good, thanks.");
  expect(question.pitch).toBeGreaterThan(flat.pitch);
});

function assert(cond) {
  expect(cond).toBe(true);
}

test("一覧: 5500件から検索でき、章で絞り込める", async ({ page }) => {
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await expect(page.getByRole("button", { name: /すべて 5500/ })).toBeVisible();
  await page.locator("#list-search").fill("cats and dogs");
  const items = page.getByTestId("phrase-list").locator('> li[data-row="result"]');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText("It's raining cats and dogs.");
  await page.locator("#list-search").fill("土砂降り");
  await expect(items).toHaveCount(2);
  await page.locator("#list-search").fill("");
  await page.locator("#list-chapter").selectOption("ch12");
  await expect(page.getByRole("button", { name: /すべて 50/ })).toBeVisible();
});

test("進捗: 章ごとの進み具合が見え、章を選ぶと学習画面に移る", async ({ page }) => {
  // アニメーションの完了を待たずにタブを移っても、仕分けは反映される
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("progress-pct")).toHaveText(/0%/);
  await expect(page.getByText(/^1 \/ 5500 覚えた$/)).toBeVisible();
  await page.getByRole("button", { name: /電話・メール・SNS/ }).click();
  await expect(page.getByTestId("swipe-card")).toContainText("第18章");
});

test("横スクロールが発生しない", async ({ page }) => {
  for (const tab of ["学習", "テスト", "一覧", "進捗"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, tab).toBeLessThanOrEqual(0);
  }
});

test("一覧: 綴りが違っても「もしかして」で近いフレーズが出る", async ({ page }) => {
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await page.locator("#list-search").fill("raning cats");
  await expect(page.getByTestId("did-you-mean")).toBeVisible();
  await expect(page.getByTestId("phrase-list")).toContainText("It's raining cats and dogs.");
});

test("進捗のリセットは設定の中にあり、3回タップして初めて実行される", async ({ page }) => {
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("reset-button")).toHaveCount(0); // 進捗画面にはない
  await page.getByRole("button", { name: "学習", exact: true }).click();
  await page.getByRole("button", { name: "音声の設定" }).click();
  const reset = page.getByTestId("reset-button");
  await reset.click();
  await reset.click();
  await expect(page.getByTestId("remaining")).toHaveText(/^49/); // まだ消えていない
  await reset.click();
  await expect(page.getByTestId("remaining")).toHaveText(/^50/);
});

test("カードの裏にリンキング（音のつながり）が出て、設定でオフにできる", async ({ page }) => {
  await page.getByTestId("swipe-card").click({ position: { x: 40, y: 40 } });
  const notes = page.getByTestId("linking-notes").first();
  await expect(notes).toContainText("音のつながり");
  await expect(notes).toContainText("How's it");
  // ‿ は表示だけで、文字としては入らない（読み上げやコピーに影響しない）
  await expect(page.getByTestId("swipe-card").locator("h3")).toHaveText("How's it going?");
  await expect(page.getByTestId("swipe-card").locator('h3 .lk[data-k="link"]')).toHaveCount(1);

  await page.getByRole("button", { name: "音声の設定" }).click();
  await page.locator("#toggle-linking").uncheck();
  await page.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("linking-notes")).toHaveCount(0);
  await expect(page.getByTestId("swipe-card").locator("h3 .lk")).toHaveCount(0);
});

test("章の一覧に各章の問題数が出て、単語だけ・フレーズだけでも絞り込める", async ({ page }) => {
  await expect(page.locator("#study-chapter option", { hasText: "第1章 あいさつ・基本の返事（50問）" })).toHaveCount(1);
  await expect(page.locator("#study-chapter optgroup[label='単語編・基礎（1000問）']")).toHaveCount(1);
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await page.locator("#list-chapter").selectOption("word");
  await expect(page.getByRole("button", { name: /すべて 3000/ })).toBeVisible();
  await page.locator("#list-chapter").selectOption("phrase");
  await expect(page.getByRole("button", { name: /すべて 2500/ })).toBeVisible();
});

test("単語の章は、例文つきのカードで学べる", async ({ page }) => {
  await page.locator("#study-chapter").selectOption("ch51");
  await expect(page.getByTestId("swipe-card").locator("h2")).toHaveText("go");
  await page.getByTestId("swipe-card").click({ position: { x: 40, y: 40 } });
  await expect(page.getByText("EXAMPLE")).toBeVisible();
  await expect(page.getByRole("button", { name: "例文を再生" })).toBeVisible();
});
