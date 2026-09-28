import { test, expect } from "./fixtures.mjs";

/** 保存データを直接入れて読み込み直す（ガチャの状態を用意するため） */
async function seedGacha(page, gacha) {
  await page.evaluate((gacha) => {
    const state = {
      version: 3,
      learned: {},
      queues: {},
      misses: {},
      tests: {},
      stats: {},
      bonus: {},
      gacha: { starter: true, ...gacha },
      chapter: "ch01",
    };
    localStorage.setItem("swipetalk:v2", JSON.stringify(state));
  }, gacha);
  await page.reload();
  await expect(page.getByTestId("remaining")).toBeVisible();
}

async function openGacha(page) {
  await page.getByRole("button", { name: "ガチャ", exact: true }).first().click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => (window.__swipetalkGachaSeed = 1));
});

test("はじめてボーナスで10連を引ける。結果が出て、ポイントが減り、交換ポイントが貯まる", async ({ page }) => {
  await openGacha(page);
  await expect(page.getByTestId("gacha-starter")).toBeVisible();
  await expect(page.getByTestId("wallet-points")).toHaveText(/^1000/);
  await expect(page.getByTestId("wallet-tickets")).toHaveText(/^1/);
  await expect(page.getByTestId("gacha-rates")).toContainText("SSR 1%");

  await page.getByRole("button", { name: /10連/ }).click();
  const result = page.getByTestId("gacha-result");
  await expect(result).toBeVisible();
  await expect(result.getByTestId("gacha-result-card")).toHaveCount(10);
  // 10連は SR 以上が1枚以上
  const rarities = await result.getByTestId("gacha-result-card").evaluateAll((els) => els.map((e) => e.dataset.rarity));
  expect(rarities.some((r) => r === "SR" || r === "SSR")).toBe(true);
  await result.getByRole("button", { name: "閉じる" }).click();

  await expect(page.getByTestId("wallet-points")).toHaveText(/^0/);
  const ex = Number((await page.getByTestId("wallet-ex").innerText()).replace(/\D/g, ""));
  expect(ex).toBeGreaterThanOrEqual(10);
  await expect(page.getByTestId("gacha-pity")).toContainText("あと 9");

  // ポイントが足りないと引けない
  await page.getByRole("button", { name: /1回引く/ }).click();
  await expect(page.getByText(/ポイントが 100 足りません/)).toBeVisible();

  // レアチケットは R 以上
  await page.getByRole("button", { name: /レアチケットで引く/ }).click();
  const card = page.getByTestId("gacha-result").getByTestId("gacha-result-card");
  await expect(card).toHaveCount(1);
  expect(await card.getAttribute("data-rarity")).not.toBe("N");
});

test("図鑑: 未獲得の SSR はシルエットと豆知識のチラ見せだけ。交換すると答えが見られる", async ({ page }) => {
  await seedGacha(page, { exPoints: 300 });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await expect(page.getByTestId("zukan-count")).toContainText("集めた単語 0 /");
  // 未獲得の単語は英語では検索できず、チラ見せの文で探せる
  await page.locator("#zukan-search").fill("sandwich");
  await expect(page.getByTestId("zukan-tile")).toHaveCount(0);
  await page.locator("#zukan-search").fill("伯爵");
  await expect(page.getByTestId("zukan-tile")).toHaveCount(1);
  await page.getByTestId("zukan-tile").click();

  const sheet = page.getByTestId("word-sheet");
  await expect(sheet.getByTestId("word-teaser")).toContainText("カードゲーム");
  await expect(sheet).not.toContainText("サンドイッチ伯爵");
  await expect(sheet).not.toContainText("sandwich");

  await sheet.getByRole("button", { name: /交換ポイント 300 で交換/ }).click();
  await expect(sheet.getByRole("heading", { name: "sandwich" })).toBeVisible();
  await expect(sheet.getByTestId("word-trivia")).toContainText("サンドイッチ伯爵");
  await expect(sheet.getByTestId("word-trivia")).toContainText("肉をパンに挟ませて");
  await sheet.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-ex")).toHaveText(/^0/);
});

test("com の付く単語を3つ集めると、シークレット単語 companion が解放される", async ({ page }) => {
  // com の付く単語はそろっているが、まだ判定されていない状態から、何か1枚交換する
  await seedGacha(page, { exPoints: 20, cards: { company: 1, combine: 1, compete: 1 } });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "シークレット", exact: true }).click();
  await page.getByRole("button", { name: "未獲得", exact: true }).first().click();
  await page.getByTestId("zukan-tile").first().click();
  await expect(page.getByTestId("word-sheet")).toContainText("解放の条件");
  await page.getByTestId("word-sheet").getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "N", exact: true }).click();
  await page.getByTestId("zukan-tile").first().click();
  const sheet = page.getByTestId("word-sheet");
  await sheet.getByRole("button", { name: /交換ポイント 20 で交換/ }).click();
  await expect(sheet.getByTestId("exchange-unlocks")).toContainText("companion");
  await sheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "シークレット", exact: true }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await page.getByTestId("zukan-tile").filter({ hasText: "companion" }).click();
  await expect(page.getByTestId("word-trivia")).toContainText("パン");
});

test("称号: 集めた単語の数やテーマで獲得でき、進み具合が見える", async ({ page }) => {
  await seedGacha(page, { cards: { sun: 1, moon: 1, star: 1, planet: 1, sky: 1 }, titles: [] });
  await openGacha(page);
  await page.getByRole("button", { name: "称号" }).click();
  const stargazer = page.getByTestId("title-item").filter({ hasText: "天体観測者" });
  await expect(stargazer).toContainText("5 / 5");
  await expect(page.getByTestId("title-item").filter({ hasText: "単語コレクター" })).toContainText("5 / 50");
});

test("学習するとガチャポイントがもらえる（「覚えた」1枚で 10pt）", async ({ page }) => {
  await seedGacha(page, { points: 0 });
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("remaining")).toHaveText(/^48/);
  await openGacha(page);
  await expect(page.getByTestId("wallet-points")).toHaveText(/^20/);
});

test("ダブると Lv が上がり、MAX になると表示が変わる", async ({ page }) => {
  await seedGacha(page, { cards: { robot: 4, go: 2 } });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await expect(page.getByTestId("zukan-tile")).toHaveCount(2);
  await page.getByTestId("zukan-tile").filter({ hasText: "robot" }).click();
  await expect(page.getByTestId("word-sheet")).toContainText("MAX！この単語はもうガチャから出ません");
  await expect(page.getByTestId("word-sheet")).toContainText("強制労働");
});
