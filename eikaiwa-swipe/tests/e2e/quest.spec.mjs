import { test, expect } from "./fixtures.mjs";

/** ガチャの単語を持った状態で、テスト画面の「冒険」を開く */
async function openQuest(page, cards) {
  await page.evaluate((c) => {
    localStorage.setItem("swipetalk:v2", JSON.stringify({ version: 6, learned: {}, gacha: { starter: true, cards: c } }));
  }, cards);
  await page.reload();
  await page.getByRole("button", { name: "テスト", exact: true }).click();
  await page.getByRole("button", { name: "冒険" }).click();
  await expect(page.getByTestId("quest-home")).toBeVisible();
}

/** 正解を選び続けて、今の階の敵を倒す（負けたら false） */
async function winFloor(page) {
  for (let i = 0; i < 60; i++) {
    if (await page.getByRole("button", { name: "つぎの階へ" }).isVisible()) return true;
    if (await page.getByTestId("quest-result").isVisible()) return false;
    const attack = page.getByRole("button", { name: "たたかう" });
    if (await attack.isVisible()) {
      await attack.click();
      await page.locator('[data-testid="quest-choice"][data-correct="1"]').click();
    }
  }
  return false;
}

test("冒険: 集めた単語をおまかせで装備すると能力値が上がり、塔で敵を倒して経験値をもらえる", async ({ page }) => {
  await openQuest(page, { breakfast: 2, park: 1, family: 1 });
  const stats = page.getByTestId("quest-stats");
  const before = await stats.innerText();
  await page.getByRole("button", { name: "おまかせ装備" }).click();
  await expect(page.getByTestId("quest-equip")).toContainText("breakfast");
  await expect(stats).not.toHaveText(before);
  // 装備は7か所。SSR（breakfast）を付けると特製の呪文が使える
  await expect(page.getByTestId("quest-equip").getByRole("listitem")).toHaveCount(7);
  await expect(page.getByTestId("quest-skills")).toBeVisible();

  await page.getByRole("button", { name: "1階から" }).click();
  await expect(page.getByTestId("quest-run")).toBeVisible();
  await expect(page.getByTestId("quest-floor")).toHaveText("1階");
  await expect(page.getByTestId("quest-skill")).toHaveCount(1);
  expect(await winFloor(page)).toBe(true);
  await expect(page.getByTestId("quest-log")).toContainText("たおした");
  await page.getByRole("button", { name: "つぎの階へ" }).click();
  await expect(page.getByTestId("quest-floor")).toHaveText("2階");
  await page.getByRole("button", { name: "にげる（街に帰る）" }).click();
  await expect(page.getByTestId("quest-result")).toContainText("けいけんち: +");
  await expect(page.getByTestId("quest-result")).toContainText("最高記録");
  await page.getByRole("button", { name: "準備にもどる" }).click();
  await expect(page.getByTestId("quest-home")).toContainText("最高 1階");
});

test("冒険: 間違えるとミスになり、正解がメッセージに出る。装備は枠ごとに付け替えられる", async ({ page }) => {
  await openQuest(page, { breakfast: 1, park: 1 });
  await page.getByRole("button", { name: "武器を変える" }).click();
  await page.getByTestId("gear-picker").getByRole("button", { name: /park/ }).click();
  await expect(page.getByTestId("quest-equip")).toContainText("park");
  await page.getByRole("button", { name: "1階から" }).click();
  await page.getByRole("button", { name: "たたかう" }).click();
  await page.locator('[data-testid="quest-choice"][data-correct="0"]').first().click();
  await expect(page.getByTestId("quest-log")).toContainText("ミス！");
  await expect(page.getByTestId("quest-log")).toContainText("正解は");
});

test("冒険: 単語を持っていなくても遊べる（装備なしの案内が出る）", async ({ page }) => {
  await openQuest(page, {});
  await expect(page.getByTestId("quest-home")).toContainText("ガチャで単語を集めると");
  await page.getByRole("button", { name: "1階から" }).click();
  await expect(page.getByTestId("quest-commands")).toBeVisible();
});

test("冒険: ふつうのじゅもんはなく、相性が表示される。5階のボスを倒すと宝箱から冒険限定の単語などが出る", async ({ page }) => {
  // Lv を高くして一撃で倒せるようにする
  await page.evaluate(() => {
    localStorage.setItem("swipetalk:v2", JSON.stringify({ version: 7, learned: {}, quest: { level: 60 }, gacha: { starter: true, cards: {} } }));
  });
  await page.reload();
  await page.getByRole("button", { name: "テスト", exact: true }).click();
  await page.getByRole("button", { name: "冒険" }).click();
  await expect(page.getByTestId("affinity-chart")).toBeVisible();
  await page.getByRole("button", { name: "1階から" }).click();
  await expect(page.getByRole("button", { name: /じゅもん/ })).toHaveCount(0);
  await expect(page.getByTestId("quest-matchup")).toContainText("こうげき");
  for (let f = 1; f <= 5; f++) {
    expect(await winFloor(page)).toBe(true);
    if (f < 5) await page.getByRole("button", { name: "つぎの階へ" }).click();
  }
  await expect(page.getByTestId("quest-chest")).toContainText("5階の たからばこを あけた！");
  await expect(page.getByTestId("quest-chest")).toContainText("ガチャのポイント +30");
  await page.getByTestId("quest-chest").click();
  await page.getByRole("button", { name: "街に帰る" }).click();
  await expect(page.getByTestId("quest-loot")).toContainText("たからばこ（1こ）");
  await expect(page.getByTestId("quest-result")).toContainText("レアチケット: +");
});

test("冒険: 装備をプリセットに保存して、あとで付け替えられる", async ({ page }) => {
  await openQuest(page, { breakfast: 1, park: 1 });
  await page.getByRole("button", { name: "おまかせ装備" }).click();
  await page.getByRole("button", { name: "今の装備をセット1に保存" }).click();
  await expect(page.getByTestId("quest-presets")).toContainText("2か所");
  await page.getByRole("button", { name: "武器を変える" }).click();
  await page.getByTestId("gear-picker").getByRole("button", { name: "はずす" }).click();
  await expect(page.getByTestId("quest-equip")).not.toContainText("breakfast");
  await page.getByRole("button", { name: "セット1を装備する" }).click();
  await expect(page.getByTestId("quest-equip")).toContainText("breakfast");
});

test("冒険: 装備を強化できる（あまりの単語を素材に。同じ単語は3倍）", async ({ page }) => {
  await openQuest(page, { breakfast: 1, park: 4, go: 3 });
  await page.getByRole("button", { name: "武器を変える" }).click();
  await page.getByTestId("gear-picker").getByRole("button", { name: /park/ }).click();
  await page.getByRole("button", { name: "武器を強化" }).click();
  const sheet = page.getByTestId("enhance-sheet");
  await expect(sheet).toContainText("「park」を強化 +0");
  // 同じ単語 park（N）のあまり3枚 = 1 × 3 × 3 = 9pt、go のあまり2枚 = 2pt → 11pt で +1
  await sheet.getByRole("button", { name: "全部" }).first().click();
  await sheet.getByRole("button", { name: "goを足す" }).click();
  await sheet.getByRole("button", { name: "goを足す" }).click();
  await expect(sheet.getByRole("button", { name: /強化する/ })).toContainText("+11pt → +1");
  await sheet.getByRole("button", { name: /強化する/ }).click();
  await expect(page.getByTestId("enhance-message")).toContainText("+0 → +1");
  await expect(sheet).toContainText("+1");
  await sheet.getByRole("button", { name: "閉じる" }).click();
  await expect(page.getByTestId("quest-equip")).toContainText("+1");
});
