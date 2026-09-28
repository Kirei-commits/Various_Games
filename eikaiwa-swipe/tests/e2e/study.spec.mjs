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

test("一覧: 1000件から検索でき、章で絞り込める", async ({ page }) => {
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await expect(page.getByRole("button", { name: /すべて 1000/ })).toBeVisible();
  await page.locator("#list-search").fill("cats and dogs");
  const items = page.getByTestId("phrase-list").locator("> li");
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
  await expect(page.getByText(/^1 \/ 1000 覚えた$/)).toBeVisible();
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
