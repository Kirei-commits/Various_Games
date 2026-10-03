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

/** 報酬の表示からポイントを読む（例: 「ガチャポイント +100」） */
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
  // ステージは最初から第51章（単語編・基礎）
  await expect(page.getByTestId("battle-chapter")).toContainText("第51章");
  await expect(page.getByTestId("battle-record")).toContainText("☆☆☆");
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("battle")).toBeVisible();
  await expect(page.getByTestId("enemy").first()).toBeVisible();

  // ザコを全部倒すとボス。「ボス出現！」は最初の1回だけで、攻撃しても何度も出ない（出た回数を数える）
  await page.evaluate(() => {
    window.__bossFlashes = 0;
    new MutationObserver((list) => {
      for (const m of list)
        for (const n of m.addedNodes) if (n.nodeType === 1 && n.dataset?.testid === "battle-flash" && n.textContent.startsWith("ボス出現")) window.__bossFlashes += 1;
    }).observe(document.body, { childList: true, subtree: true });
  });
  const end = Date.now() + 40000;
  while (Date.now() < end && !(await page.getByTestId("battle-clear").isVisible())) {
    const correct = page.locator('[data-testid="battle-choice"][data-correct="1"]');
    if (await correct.count()) await correct.first().click({ timeout: 2000 }).catch(() => {});
    else await page.waitForTimeout(30);
  }
  // ボスを倒すと「STAGE CLEAR!」の演出を見せてから結果の画面
  await expect(page.getByTestId("battle-clear")).toBeVisible();
  await expect(page.getByTestId("battle-result")).toBeVisible();
  expect(await page.evaluate(() => window.__bossFlashes)).toBe(1);
  await expect(page.getByTestId("battle-result-title")).toHaveText("STAGE CLEAR!");
  await expect(page.getByTestId("battle-stars")).toHaveText("★★★");
  // 次のステージ・もう一度・設定に戻るは、結果の画面の上のほう（報酬より前）にある
  const actionsY = (await page.getByTestId("battle-result-actions").boundingBox()).y;
  const rewardY = (await page.getByTestId("battle-reward").boundingBox()).y;
  expect(actionsY).toBeLessThan(rewardY);
  await expect(page.getByTestId("battle-reward")).toContainText("レアチケット +8");
  const points = await rewardPoints(page);
  expect(points).toBeGreaterThanOrEqual(300);
  expect(points).toBeLessThanOrEqual(900);

  await page.getByRole("button", { name: "設定に戻る" }).click();
  await expect(page.getByTestId("battle-record")).toContainText("★★★");
  // ガチャのポイントとチケットに入っている（はじめてボーナス 1000pt・1枚と合わせて）
  await page.getByRole("button", { name: "ガチャ", exact: true }).first().click();
  await expect(page.getByTestId("wallet-points")).toHaveText((1000 + points).toLocaleString("en-US"));
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
  await expect(page.getByTestId("battle-scope")).toContainText("単語全部から");
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

  await page.getByRole("button", { name: "バトルをやめる" }).click();
  await expect(page.getByTestId("battle-result-title")).toHaveText("RESULT");
  await expect(page.getByText("最高得点を更新！")).toBeVisible();
  await expect(page.getByTestId("battle-reward")).toContainText("レアチケット +1"); // 3体倒せば報酬あり
  expect(await rewardPoints(page)).toBeGreaterThanOrEqual(100);
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
  await expect(page.getByTestId("battle-scope")).toContainText("単語全部から");
  await page.getByRole("button", { name: "難易度順", exact: true }).click();
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy")).toHaveCount(2);
  const ids = await page.getByTestId("enemy").evaluateAll((els) => els.map((e) => e.dataset.phraseId));
  for (const id of ids) expect(Number(LIB.byId[id].chapterId.slice(2))).toBeLessThan(71);
});

test("難易度5段階: ★1 を選ぶと、やさしい章（基礎）の単語が出る。範囲はタップで開いて選べる", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10;
    window.__swipetalkBattleSpeed = 0;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: "エンドレス", exact: true }).click();
  await page.getByTestId("battle-scope").click();
  const panel = page.getByTestId("battle-scope-panel");
  await panel.getByRole("button", { name: /単語の難易度（5段階）/ }).click();
  await panel.getByRole("button", { name: /★1 やさしい/ }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByTestId("battle-scope")).toContainText("★1 やさしい");
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy")).toHaveCount(2);
  const ids = await page.getByTestId("enemy").evaluateAll((els) => els.map((e) => e.dataset.phraseId));
  for (const id of ids) expect(Number(LIB.byId[id].chapterId.slice(2))).toBeLessThan(71);
});

test("ステージの章は、部をタップして開いてから選ぶ", async ({ page }) => {
  await openBattle(page);
  await page.getByTestId("battle-chapter").click();
  const panel = page.getByTestId("battle-chapter-panel");
  await panel.getByRole("button", { name: /単語編・応用/ }).click();
  await panel.getByRole("button", { name: /^第100章/ }).click();
  await expect(page.getByTestId("battle-chapter")).toContainText("第100章");
});

test("撃破した単語を結果画面で復習でき、⭐ でお気に入りにできる", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10;
    window.__swipetalkBattleSpeed = 0;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: /バトル開始/ }).click();
  for (let i = 0; i < 3; i++) {
    const correct = page.locator('[data-testid="battle-choice"][data-correct="1"]');
    await expect(correct).toHaveCount(1);
    await correct.click();
    await expect(page.getByTestId("battle-score")).toHaveText(String((i + 1) * 10));
  }
  await page.getByRole("button", { name: "バトルをやめる" }).click();
  const review = page.getByTestId("defeated-review");
  await expect(review.getByTestId("defeated-item")).toHaveCount(3);
  const first = review.getByTestId("defeated-item").first();
  await expect(first).toContainText("タップで答え");
  await first.click();
  await expect(first).not.toContainText("タップで答え");
  await first.getByTestId("fav").click();
  await expect(first.getByTestId("fav")).toHaveAttribute("aria-pressed", "true");
});

test("道具: 時止めで敵が止まり、必殺技でわからない敵を倒せる（苦手に入る）", async ({ page }) => {
  await page.evaluate(() => {
    const state = { version: 5, learned: {}, gacha: { starter: true, items: { freeze: 1, special: 1 } } };
    localStorage.setItem("swipetalk:v2", JSON.stringify(state));
  });
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 3;
    window.__swipetalkBattleSpeed = 1;
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy").first()).toBeVisible();
  await page.getByRole("button", { name: /時止め ×1/ }).click();
  await expect(page.getByTestId("battle-frozen")).toBeVisible();
  await expect(page.getByRole("button", { name: /時止め ×0/ })).toBeDisabled();
  const enemy = page.locator('[data-testid="enemy"][data-target="1"]');
  const id = await enemy.getAttribute("data-phrase-id");
  await page.getByRole("button", { name: /必殺技 ×1/ }).click();
  await expect(page.getByTestId("battle-flash")).toContainText("必殺技");
  await expect(page.locator(`[data-testid="enemy"][data-phrase-id="${id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "バトルをやめる" }).click();
  await expect(page.getByText("間違えた・逃した単語（苦手に追加しました）")).toBeVisible();
});

test("長いフレーズでも、敵の札と問題文が見切れない（折り返して戦場の中に収まる）", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10;
    window.__swipetalkBattleSpeed = 0;
  });
  await page.reload();
  await openBattle(page);
  await page.getByTestId("battle-chapter").click();
  const panel = page.getByTestId("battle-chapter-panel");
  await panel.getByRole("button", { name: /もっと話せる編/ }).click();
  await panel.getByRole("button", { name: /^第41章/ }).click();
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy")).toHaveCount(3);
  const field = await page.getByTestId("battle-field").boundingBox();
  for (const label of await page.getByTestId("enemy-label").all()) {
    const box = await label.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(field.x - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(field.x + field.width + 1);
    // 文字が札からはみ出していない（… で切れていない）
    expect(await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  // となりの敵の札どうしが重ならない
  const boxes = [];
  for (const label of await page.getByTestId("enemy-label").all()) boxes.push(await label.boundingBox());
  boxes.sort((a, b) => a.x - b.x);
  for (let i = 1; i < boxes.length; i++) {
    const [a, b] = [boxes[i - 1], boxes[i]];
    const overlapY = a.y < b.y + b.height && b.y < a.y + a.height;
    if (overlapY) expect(a.x + a.width).toBeLessThanOrEqual(b.x + 1);
  }
  const target = page.locator('[data-testid="enemy"][data-target="1"]');
  const id = await target.getAttribute("data-phrase-id");
  await expect(target.getByTestId("enemy-label")).toHaveText(LIB.byId[id].english);
});

test("狙う敵に切り替わったときに英単語を読み上げる（出てきただけでは読まない）。狙う敵には攻撃までの秒数が出る", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10; // 敵がすぐ出てくる
    window.__swipetalkBattleSpeed = 0; // 敵は近づかない
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("enemy")).toHaveCount(3);
  const spoken = () => page.evaluate(() => window.__spoken.map((u) => u.text));
  const target = page.locator('[data-testid="enemy"][data-target="1"]');
  const word = LIB.byId[await target.getAttribute("data-phrase-id")].english;
  await expect.poll(spoken).toContain(word);
  // 狙っていない敵の単語はまだ読まない
  const other = page.locator('[data-testid="enemy"][data-target="0"]').first();
  const otherWord = LIB.byId[await other.getAttribute("data-phrase-id")].english;
  expect(await spoken()).not.toContain(otherWord);
  // 狙う敵の下に、攻撃してくるまでの秒数
  await expect(page.getByTestId("enemy-countdown")).toHaveCount(1);
  await expect(target.getByTestId("enemy-countdown")).toHaveText(/攻撃まで \d+秒/);
  // タップで狙いを変えると、その単語を読む
  await other.dispatchEvent("pointerdown");
  await expect.poll(spoken).toContain(otherWord);
});

test("ステージの敵の数を 10・50・100 から選べる。複数いるときはタップした敵を狙える", async ({ page }) => {
  await page.addInitScript(() => {
    window.__swipetalkBattleTime = 10; // 敵がすぐ出てくる
    window.__swipetalkBattleSpeed = 0; // 敵は近づかない
  });
  await page.reload();
  await openBattle(page);
  await page.getByRole("button", { name: "50体" }).click();
  await page.getByRole("button", { name: /バトル開始/ }).click();
  await expect(page.getByTestId("battle")).toContainText("敵 0 / 50");
  await expect(page.getByTestId("enemy")).toHaveCount(3);
  // 狙っていない敵をタップすると、その敵が狙いになり、選択肢もその単語になる
  const other = page.locator('[data-testid="enemy"][data-target="0"]').first();
  const id = await other.getAttribute("data-phrase-id");
  await other.dispatchEvent("pointerdown");
  await expect(page.locator(`[data-testid="enemy"][data-phrase-id="${id}"]`)).toHaveAttribute("data-target", "1");
  await expect(page.locator('[data-testid="enemy"][data-target="1"]')).toHaveCount(1);
  await page.locator('[data-testid="battle-choice"][data-correct="1"]').first().click();
  await expect(page.locator(`[data-testid="enemy"][data-phrase-id="${id}"]`)).toHaveCount(0);
  await expect(page.getByTestId("battle")).toContainText("敵 1 / 50");
});
