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
  // 以後の読み込み（reload）用と、すでに開いているページ用の両方に乱数の種を入れる
  await page.addInitScript(() => (window.__swipetalkGachaSeed = 1));
  await page.evaluate(() => (window.__swipetalkGachaSeed = 1));
});

test("はじめてボーナスで10連を引ける。結果が出て、ポイントが減り、交換ポイントが貯まる", async ({ page }) => {
  await openGacha(page);
  await expect(page.getByTestId("gacha-starter")).toBeVisible();
  await expect(page.getByTestId("wallet-points")).toHaveText("1,000");
  await expect(page.getByTestId("wallet-tickets")).toHaveText(/^1/);
  await expect(page.getByTestId("gacha-rates")).toContainText("SSR 0.1%");

  await page.getByRole("button", { name: /10連/ }).click();
  const result = page.getByTestId("gacha-result");
  await expect(result).toBeVisible();
  await expect(result.getByTestId("gacha-result-card")).toHaveCount(10);
  const rarities = await result.getByTestId("gacha-result-card").evaluateAll((els) => els.map((e) => e.dataset.rarity));
  await result.getByRole("button", { name: "閉じる" }).click();

  await expect(page.getByTestId("wallet-points")).toHaveText(/^0/);
  const ex = Number((await page.getByTestId("wallet-ex").innerText()).replace(/\D/g, ""));
  expect(ex).toBeGreaterThanOrEqual(10);
  // 天井までの残り: 10連で SSR が出たら、その後に引いた回数だけ減っている
  const lastSsr = rarities.lastIndexOf("SSR");
  const sinceSsr = lastSsr < 0 ? 10 : rarities.length - 1 - lastSsr;
  await expect(page.getByTestId("gacha-pity")).toContainText(`あと ${1000 - sinceSsr} 回`);

  // ポイントが足りないと引けない
  await page.getByRole("button", { name: /1回引く/ }).click();
  await expect(page.getByText(/ポイントが 100 足りません/)).toBeVisible();

  // レアチケットは R 以上
  await page.getByRole("button", { name: "レア", exact: true }).click();
  await page.getByRole("button", { name: /^1回引く/ }).click();
  const card = page.getByTestId("gacha-result").getByTestId("gacha-result-card");
  await expect(card).toHaveCount(1);
  expect(await card.getAttribute("data-rarity")).not.toBe("N");
});

test("図鑑: 未獲得の語源のある単語（SR）はシルエットと豆知識のチラ見せだけ。交換すると答えが見られる", async ({ page }) => {
  await seedGacha(page, { exPoints: 3000 });
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

  await sheet.getByRole("button", { name: /交換ポイント 3000 で交換/ }).click();
  await expect(sheet.getByRole("heading", { name: "sandwich" })).toBeVisible();
  await expect(sheet.getByTestId("word-trivia")).toContainText("サンドイッチ伯爵");
  await expect(sheet.getByTestId("word-trivia")).toContainText("肉をパンに挟ませて");
  await sheet.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-ex")).toHaveText(/^0/);
});

test("com の付く単語を3つ集めると、シークレット単語 companion が解放される", async ({ page }) => {
  // com の付く単語はそろっているが、まだ判定されていない状態から、何か1枚交換する
  await seedGacha(page, { exPoints: 200, cards: { company: 1, combine: 1, compete: 1 } });
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
  await sheet.getByRole("button", { name: /交換ポイント 200 で交換/ }).click();
  await expect(sheet.getByTestId("exchange-unlocks")).toContainText("companion");
  await sheet.getByRole("button", { name: "閉じる" }).click();

  await page.getByRole("button", { name: "シークレット", exact: true }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await page.getByTestId("zukan-tile").filter({ hasText: "companion" }).click();
  await expect(page.getByTestId("word-trivia")).toContainText("パン");
});

test("実績（以前の称号）は図鑑の中にあり、テーマの単語をそろえると達成", async ({ page }) => {
  await seedGacha(page, { cards: { sun: 1, moon: 1, star: 1, planet: 1, sky: 1 }, titles: [] });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "実績", exact: true }).click();
  const stargazer = page.getByTestId("title-item").filter({ hasText: "天体観測者" });
  await expect(stargazer).toContainText("5 / 5");
  await expect(page.getByTestId("title-item").filter({ hasText: "単語コレクター" })).toContainText("5 / 50");
});

test("マイ称号: 集めた単語を組み合わせて称号を作り、付け替えられる", async ({ page }) => {
  await seedGacha(page, { cards: { happy: 1, sun: 1, robot: 1 } });
  await openGacha(page);
  await page.getByRole("button", { name: "マイ称号", exact: true }).click();
  const words = page.getByTestId("title-words");
  await words.getByRole("button", { name: /happy/ }).click();
  await words.getByRole("button", { name: /robot/ }).click();
  await expect(page.getByTestId("title-preview")).toContainText("Happy Robot");
  await page.getByRole("button", { name: "この称号を作る" }).click();
  await expect(page.getByTestId("title-badge")).toContainText("Happy Robot");

  await words.getByRole("button", { name: /sun/ }).click();
  await page.getByRole("button", { name: "この称号を作る" }).click();
  await expect(page.getByTestId("title-badge")).toContainText("Sun");
  await expect(page.getByTestId("my-title")).toHaveCount(2);
  // 前の称号に付け替える
  await page.getByTestId("my-title").filter({ hasText: "Happy Robot" }).getByRole("button", { name: "つける" }).click();
  await expect(page.getByTestId("title-badge")).toContainText("Happy Robot");
  // 進捗の画面にも出る
  await page.getByRole("button", { name: "進捗", exact: true }).click();
  await expect(page.getByTestId("title-badge")).toContainText("Happy Robot");
});


test("学習すると、かかった時間に応じてガチャポイントがもらえる（「まだ」でも）", async ({ page }) => {
  await seedGacha(page, { points: 0 });
  await page.getByRole("button", { name: "覚えた", exact: true }).click();
  await expect(page.getByTestId("earn-toast")).toContainText("+15pt"); // 最初の1枚は5秒ぶん（1秒 3pt）
  await expect(page.getByTestId("remaining")).toHaveText(/^49/);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "覚えてない", exact: true }).click();
  await openGacha(page);
  const points = Number((await page.getByTestId("wallet-points").innerText()).replace(/\D/g, ""));
  expect(points).toBeGreaterThanOrEqual(5 + 1);
  expect(points).toBeLessThan(5 + 20);
});

test("ダブると Lv が上がり、MAX になると表示が変わる", async ({ page }) => {
  await seedGacha(page, { cards: { robot: 4, go: 2 } });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await expect(page.getByTestId("zukan-tile")).toHaveCount(2);
  await page.getByTestId("zukan-tile").filter({ hasText: "robot" }).click();
  await expect(page.getByTestId("word-sheet")).toContainText("MAX！この単語がまたガチャで出ると、交換ポイントになります");
  await expect(page.getByTestId("word-sheet")).toContainText("強制労働");
});

test("図鑑: 単語カードでお気に入り・強化ができ、お気に入りだけに絞ったり並べ替えたりできる", async ({ page }) => {
  await seedGacha(page, { cards: { robot: 1, go: 1, apple: 1 }, exPoints: 70 });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await page.getByTestId("zukan-tile").filter({ hasText: "robot" }).click();
  const sheet = page.getByTestId("word-sheet");
  await sheet.getByRole("button", { name: "お気に入りに追加" }).click();
  // robot は SR（語源のある単語）: +1 は 60（交換ポイント 70 → 10）
  await sheet.getByRole("button", { name: /\+1 に強化する（交換ポイント 60）/ }).click();
  await expect(sheet.getByTestId("enhance-plus")).toHaveText("+1");
  await expect(sheet).toContainText("交換ポイント 10");
  await sheet.getByRole("button", { name: "閉じる" }).click();
  // お気に入りだけ
  await page.getByTestId("zukan-fav").click();
  await expect(page.getByTestId("zukan-tile")).toHaveCount(1);
  await expect(page.getByTestId("zukan-tile")).toContainText("robot");
  await expect(page.getByTestId("zukan-tile")).toContainText("+1");
  await page.getByTestId("zukan-fav").click();
  // 強化の高い順で robot が先頭
  await page.locator("#zukan-sort").selectOption("plus");
  await expect(page.getByTestId("zukan-tile").first()).toContainText("robot");
});

test("引くと光の玉の演出が出て、スキップするとすぐに全部のカードが見られる", async ({ page }) => {
  await openGacha(page);
  await page.getByRole("button", { name: /10連/ }).click();
  await expect(page.getByTestId("gacha-charge")).toBeVisible();
  await page.getByRole("button", { name: /スキップ/ }).click();
  await expect(page.getByTestId("gacha-charge")).toHaveCount(0);
  const result = page.getByTestId("gacha-result");
  await expect(result).toContainText("カードをタップすると詳しく見られます");
  await expect(page.getByRole("button", { name: /スキップ/ })).toHaveCount(0);
  await result.getByTestId("gacha-result-card").first().click();
  await expect(page.getByTestId("word-sheet")).toBeVisible();
});

test("コード: 単語を入れるとその単語とポイント（最大30000pt・1日5回・同じ単語は1回だけ）。開発者コード aaa で無限", async ({ page }) => {
  await seedGacha(page, { points: 0 });
  await openGacha(page);
  await page.getByRole("button", { name: "コード", exact: true }).click();
  await expect(page.getByTestId("code-left")).toContainText("あと 5 / 5 回");
  await page.locator("#gacha-code").fill("robot");
  await page.getByRole("button", { name: "入れる" }).click();
  await expect(page.getByTestId("code-message")).toContainText("robot");
  await expect(page.getByTestId("code-message")).toContainText("単語も手に入れた");
  await expect(page.getByTestId("code-left")).toContainText("あと 4 / 5 回");
  const points = Number((await page.getByTestId("wallet-points").innerText()).replace(/\D/g, ""));
  // robot は SR: 9,000〜18,000pt
  expect(points).toBeGreaterThanOrEqual(9000);
  expect(points).toBeLessThanOrEqual(18000);

  await page.locator("#gacha-code").fill("robot");
  await page.getByRole("button", { name: "入れる" }).click();
  await expect(page.getByTestId("code-message")).toContainText("もう使いました");
  await page.locator("#gacha-code").fill("zzqqxx");
  await page.getByRole("button", { name: "入れる" }).click();
  await expect(page.getByTestId("code-message")).toContainText("単語帳にありません");
  await expect(page.getByTestId("code-left")).toContainText("あと 4 / 5 回");

  await page.locator("#gacha-code").fill("aaa");
  await page.getByRole("button", { name: "入れる" }).click();
  await expect(page.getByTestId("wallet-points")).toHaveText("∞");
  await expect(page.getByTestId("unlimited")).toBeVisible();

  // 無限モードで 100連: まとめて結果が出る
  await page.getByTestId("code-panel").page().getByRole("button", { name: "ガチャ", exact: true }).first().click();
  await page.getByRole("button", { name: /^100連/ }).click();
  await page.getByRole("button", { name: /スキップ/ }).click();
  const summary = page.getByTestId("gacha-summary");
  await expect(summary).toBeVisible();
  let total = 0;
  for (const r of ["SSR", "SR", "R", "N"]) total += Number(await summary.getByTestId(`gacha-count-${r}`).innerText());
  expect(total).toBe(100);
  await page.getByTestId("gacha-result").getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-points")).toHaveText("∞");
});

test("ポイントを全部使って引く", async ({ page }) => {
  await seedGacha(page, { points: 5000 });
  await openGacha(page);
  await page.getByRole("button", { name: /ポイントを全部使って引く/ }).click();
  await page.getByRole("button", { name: /スキップ/ }).click();
  await expect(page.getByTestId("gacha-summary")).toContainText("50 回引いて");
  await page.getByTestId("gacha-result").getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-points")).toHaveText(/^0/);
});

test("SR / SSR ガチャチケットで引ける。チケットは100枚で上のチケットに交換できる", async ({ page }) => {
  await seedGacha(page, { tickets: 100, srTickets: 1, ssrTickets: 1 });
  await openGacha(page);
  const result = page.getByTestId("gacha-result");
  await page.getByRole("button", { name: "SR", exact: true }).click();
  await page.getByRole("button", { name: /^1回引く/ }).click();
  expect(["SR", "SSR"]).toContain(await result.getByTestId("gacha-result-card").getAttribute("data-rarity"));
  await result.getByRole("button", { name: "閉じる" }).click();
  await page.getByRole("button", { name: "SSR", exact: true }).click();
  await page.getByRole("button", { name: /^1回引く/ }).click();
  expect(await result.getByTestId("gacha-result-card").getAttribute("data-rarity")).toBe("SSR");
  await result.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-ssr")).toHaveText("0");

  await page.getByTestId("ticket-upgrade").getByRole("button", { name: /チケット交換/ }).click();
  await page.getByTestId("ticket-upgrade").getByRole("button", { name: /レアチケット → SR チケット/ }).click();
  await expect(page.getByTestId("wallet-tickets")).toHaveText(/^0/);
  await expect(page.getByTestId("wallet-sr")).toHaveText("1");
});

test("ダブるとメダル。ショップで時止め・必殺技・5倍ブーストと交換できる", async ({ page }) => {
  await seedGacha(page, { medals: 100 });
  await openGacha(page);
  await page.getByRole("button", { name: "ショップ", exact: true }).click();
  const shop = page.getByTestId("shop");
  await shop.getByTestId("shop-item").filter({ hasText: "時止めの砂時計" }).getByRole("button").click();
  await expect(shop).toContainText("時止めの砂時計を手に入れた");
  await expect(page.getByTestId("wallet-medals")).toHaveText("60");
  await expect(shop.getByTestId("shop-item").filter({ hasText: "5倍ブースト" }).getByRole("button")).toBeDisabled();
});

test("図鑑は品詞ごとに見られる", async ({ page }) => {
  await seedGacha(page, { cards: { sun: 1, run: 1 } });
  await openGacha(page);
  await page.getByRole("button", { name: "図鑑" }).click();
  await page.getByRole("button", { name: "獲得済み", exact: true }).click();
  await expect(page.getByTestId("zukan-tile")).toHaveCount(2);
  await page.getByRole("button", { name: "動詞", exact: true }).click();
  await expect(page.getByTestId("zukan-tile")).toHaveCount(1);
  await expect(page.getByTestId("zukan-tile")).toContainText("run");
});

test("レアチケットは 10・50・100 連、SR / SSR チケットは 10 連まで引ける", async ({ page }) => {
  await seedGacha(page, { tickets: 60, srTickets: 10, ssrTickets: 10 });
  await openGacha(page);
  await page.getByRole("button", { name: "レア", exact: true }).click();
  const machine = page.getByTestId("gacha-machine");
  await expect(machine.getByRole("button", { name: /^50連/ })).toBeVisible();
  await expect(machine.getByRole("button", { name: /^100連/ })).toBeVisible();
  await machine.getByRole("button", { name: /^50連/ }).click();
  await page.getByRole("button", { name: /スキップ/ }).click();
  await expect(page.getByTestId("gacha-summary")).toContainText("50 回引いて");
  await page.getByTestId("gacha-result").getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("wallet-tickets")).toHaveText("10");

  await page.getByRole("button", { name: "SSR", exact: true }).click();
  await expect(machine.getByRole("button", { name: /^50連/ })).toHaveCount(0);
  await machine.getByRole("button", { name: /^10連/ }).click();
  await page.getByRole("button", { name: /スキップ/ }).click();
  const rarities = await page.getByTestId("gacha-result-card").evaluateAll((els) => els.map((e) => e.dataset.rarity));
  expect(rarities).toEqual(Array(10).fill("SSR"));
});
