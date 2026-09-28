import { test, expect, LIB } from "./fixtures.mjs";

async function openBattle(page) {
  await page.getByRole("button", { name: "テスト", exact: true }).first().click();
  await page.getByRole("button", { name: "バトル", exact: true }).click();
  await expect(page.getByRole("button", { name: /バトル開始/ })).toBeVisible();
}

/** 狙っている敵に正しく答え続ける（結果画面が出るまで） */
async function winByChoice(page, timeoutMs = 40000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await page.getByTestId("battle-result").isVisible()) return;
    const correct = page.locator('[data-testid="battle-choice"][data-correct="1"]');
    if (await correct.count()) await correct.first().click({ timeout: 2000 }).catch(() => {});
    else await page.waitForTimeout(50);
  }
}

/** 報酬の表示からポイントを読む（例: 「ガチャポイント +1,000」） */
async function rewardPoints(page) {
  const text = await page.getByTestId("battle-reward").innerText();
  return Number(text.match(/ガチャポイント \+([\d,]+)/)[1].replace(/,/g, ""));
}

test("ステージ: 4択で敵10体とボスを倒すとクリア。ノーダメージで★3、初回はレアチケット8枚", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10; // 敵がすぐ出てくる
    window.__swipetalkBattleSpeed = 0; // 敵は近づかない
  });
  await page.reload();
  await openBattle(page);
  await page.locator("#battle-chapter").selectOption("ch51");
  await expect(page.getByTestId("battle-record")).toContainText("☆☆☆");
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("battle")).toBeVisible();
  await expect(page.getByTestId("enemy").first()).toBeVisible();

  await winByChoice(page);
  await expect(page.getByTestId("battle-result-title")).toHaveText("STAGE CLEAR!");
  await expect(page.getByTestId("battle-stars")).toHaveText("★★★");
  await expect(page.getByTestId("battle-reward")).toContainText("レアチケット +8");
  const points = await rewardPoints(page);
  expect(points).toBeGreaterThanOrEqual(1000);
  expect(points).toBeLessThanOrEqual(3000);

  await page.getByRole("button", { name: "設定に戻る" }).click();
  await expect(page.getByTestId("battle-record")).toContainText("★★★");
  // ガチャのポイントとチケットに入っている（はじめてボーナス 1000pt・1枚と合わせて）
  await page.getByRole("button", { name: "ガチャ", exact: true }).first().click();
  await expect(page.getByTestId("wallet-points")).toHaveText(new RegExp(`^${1000 + points}`));
  await expect(page.getByTestId("wallet-tickets")).toHaveText(/^9/);
});

test("敵が届くと HP が減り、HP がなくなるとゲームオーバー。逃した単語は苦手に入る", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 20;
    window.__swipetalkBattleSpeed = 1;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("battle-result-title")).toHaveText("GAME OVER", { timeout: 15000 });
  await expect(page.getByText("間違えた・逃した単語（苦手に追加しました）")).toBeVisible();
  await page.getByRole("button", { name: "設定に戻る" }).click();
  // 「テスト／バトル」の切り替えで、テストの設定に戻る
  await page.getByRole("button", { name: "テスト", exact: true }).first().click();
  await expect(page.locator("#test-scope")).not.toContainText("苦手な問題（0問）");
});

test("エンドレス: 入力で答えて倒し、間違えると正解が出る。やめると結果と最高得点", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10;
    window.__swipetalkBattleSpeed = 0;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: "エンドレス", exact: true }).click();
  await page.locator("#battle-scope").selectOption("word");
  await page.getByRole("button", { name: "難易度順", exact: true }).click();
  await page.getByRole("button", { name: "入力", exact: true }).click();
  await page.getByRole("button", { name: /バトル開始/ }).click();

  for (let i = 0; i < 3; i++) {
    const enemy = page.locator('[data-testid="enemy"][data-target="1"]');
    await expect(enemy).toHaveCount(1);
    const item = LIB.byId[await enemy.getAttribute("data-phrase-id")];
    await page.locator("#battle-answer").fill(item.japanese.split("／")[0]);
    await page.locator("#battle-answer").press("Enter");
    await expect(page.getByTestId("battle-flash")).toContainText("撃破");
  }
  await expect(page.getByTestId("battle-combo")).toContainText("3 COMBO");

  const enemy = page.locator('[data-testid="enemy"][data-target="1"]');
  await expect(enemy).toHaveCount(1);
  await page.locator("#battle-answer").fill("ぜんぜんちがう");
  await page.locator("#battle-answer").press("Enter");
  await expect(page.getByTestId("battle-flash")).toContainText("正解は");

  await page.getByRole("button", { name: "やめる" }).click();
  await expect(page.getByTestId("battle-result-title")).toHaveText("RESULT");
  await expect(page.getByText("最高得点を更新！")).toBeVisible();
  await expect(page.getByTestId("battle-reward")).toContainText("レアチケット +1"); // 3体倒せば報酬あり
  expect(await rewardPoints(page)).toBeGreaterThanOrEqual(1000);
});

test("ほかのタブを見ているあいだはバトルが止まる", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 20;
    window.__swipetalkBattleSpeed = 1;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy").first()).toBeVisible();
  await page.getByRole("button", { name: "一覧", exact: true }).click();
  await page.waitForTimeout(3000); // 動いていれば、この間にゲームオーバーになる
  await page.getByRole("button", { name: "テスト", exact: true }).first().click();
  await expect(page.getByTestId("battle")).toBeVisible();
});

test("難易度順にすると、エンドレスの最初の敵はやさしい章（基礎）の単語", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10;
    window.__swipetalkBattleSpeed = 0;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: "エンドレス", exact: true }).click();
  await page.locator("#battle-scope").selectOption("word");
  await page.getByRole("button", { name: "難易度順", exact: true }).click();
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy")).toHaveCount(2);
  const ids = await page.getByTestId("enemy").evaluateAll((els) => els.map((e) => e.dataset.phraseId));
  for (const id of ids) expect(Number(LIB.byId[id].chapterId.slice(2))).toBeLessThan(71);
});
