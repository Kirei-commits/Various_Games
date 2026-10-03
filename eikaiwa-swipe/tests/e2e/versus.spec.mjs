import { test as base, expect } from "@playwright/test";
import { test } from "./fixtures.mjs";

async function openVersus(page) {
  await page.getByRole("button", { name: "テスト", exact: true }).first().click();
  await page.getByRole("button", { name: "対戦", exact: true }).click();
  await expect(page.getByTestId("versus-home")).toBeVisible();
}

test("1人で練習: 問題と4択が同時に出て、押すとすぐ解説。「次の問題へ」で進み、5秒答えないと答えに移り、解説の5秒後に次へ", async ({ page }) => {
  test.setTimeout(60000);
  await openVersus(page);
  await page.getByRole("radio", { name: "5問" }).click();
  await page.getByRole("button", { name: "1人で練習" }).click();
  const game = page.getByTestId("versus-game");
  await expect(game.getByTestId("versus-progress")).toHaveText("第1問 / 5");
  // 問題と同時に4択が押せる（先に「回答」ボタンを押す必要はない）
  await expect(page.getByTestId("versus-choice")).toHaveCount(4);
  await expect(page.getByTestId("versus-choice").first()).toBeEnabled();
  await page.locator('[data-testid="versus-choice"][data-correct="1"]').click();
  // 答えるとすぐ解説（例文つき）。「次の問題へ」ですぐ次へ
  await expect(page.getByTestId("versus-reveal")).toBeVisible();
  await expect(page.getByTestId("versus-explain")).toBeVisible();
  await expect(page.getByTestId("versus-score").first()).toHaveText("正解 1");
  await page.getByTestId("versus-next").click();
  await expect(game.getByTestId("versus-progress")).toHaveText("第2問 / 5");
  // 答えないまま5秒で答えに移る（押せなくなる）
  await expect(page.getByTestId("versus-reveal")).toBeVisible({ timeout: 7000 });
  await expect(page.getByTestId("versus-choice").first()).toBeDisabled();
  // 解説を5秒見せたら次の問題へ
  await expect(game.getByTestId("versus-progress")).toHaveText("第3問 / 5", { timeout: 7000 });
  // 間違えると、選んだものが × で正解が ○
  const wrong = page.locator('[data-testid="versus-choice"][data-correct="0"]').first();
  await wrong.click();
  await expect(wrong).toContainText("×");
  await expect(page.locator('[data-testid="versus-choice"][data-correct="1"]')).toContainText("○");
  for (let q = 3; q <= 5; q++) {
    if (q > 3) await page.locator('[data-testid="versus-choice"][data-correct="1"]').click();
    await page.getByTestId("versus-next").click();
  }
  await expect(page.getByTestId("versus-results")).toContainText("5問中 3問 正解");
  await page.getByRole("button", { name: "もどる" }).click();
  await expect(page.getByTestId("versus-home")).toBeVisible();
});

test("ログインしていないと、ほかの人との対戦はログインの案内が出る", async ({ page }) => {
  await openVersus(page);
  await expect(page.getByTestId("versus-online")).toContainText(/対戦には Google でのログインが必要です|この版のアプリでは対戦は使えません/);
});

/**
 * 2人の対戦: 同じブラウザの2つのページを「別の人」にする。
 * 部屋は localStorage に置く偽のクラウド（storage イベントでもう1つのページに変化が届く）
 */
function installFakeRooms(uid) {
  window.__swipetalkNoDailyBonus = true;
  window.__swipetalkNoRecorded = true;
  window.__spoken = [];
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => {
      window.__spoken.push(u.text);
      setTimeout(() => u.onend && u.onend(), 0);
    };
  }
  const user = { uid, name: uid === "u1" ? "Aki Tanaka" : "Ben Smith", email: "", photo: "" };
  const keyOf = (code) => `__room:${code}`;
  const read = (code) => JSON.parse(localStorage.getItem(keyOf(code)) || "null");
  window.__swipetalkCloud = {
    available: true,
    onAuthChange(cb) {
      setTimeout(() => cb(user), 0);
      return () => {};
    },
    async signIn() {},
    async signOut() {},
    async load() {
      return null;
    },
    async save() {},
    rooms: {
      watch(code, cb) {
        const onStorage = (e) => e.key === keyOf(code) && cb(read(code));
        const onLocal = (e) => e.detail === code && cb(read(code));
        window.addEventListener("storage", onStorage);
        window.addEventListener("__roomchange", onLocal);
        setTimeout(() => cb(read(code)), 0);
        return () => {
          window.removeEventListener("storage", onStorage);
          window.removeEventListener("__roomchange", onLocal);
        };
      },
      async transact(code, fn) {
        const out = fn(read(code)) || {};
        if (out.room && !out.error) {
          localStorage.setItem(keyOf(code), JSON.stringify(out.room));
          window.dispatchEvent(new CustomEvent("__roomchange", { detail: code }));
        }
        return out;
      },
    },
  };
}

base("2人で対戦: 部屋を作って番号で入り、早押しで先に正解した人がポイント。最後に勝ち負けが出る", async ({ context }) => {
  base.setTimeout(90000);
  const open = async (uid) => {
    const page = await context.newPage();
    await page.addInitScript(installFakeRooms, uid);
    await page.goto("/");
    await openVersus(page);
    return page;
  };
  const aki = await open("u1");
  const ben = await open("u2");

  await aki.getByRole("radio", { name: "5問" }).click();
  await aki.getByRole("button", { name: "部屋を作る" }).click();
  await expect(aki.getByTestId("versus-lobby")).toBeVisible();
  const code = await aki.getByTestId("versus-code").innerText();
  expect(code).toMatch(/^\d{4}$/);
  await expect(aki.getByRole("button", { name: "スタート" })).toBeDisabled();

  await ben.locator("#versus-code").fill("0000");
  await ben.getByRole("button", { name: "入る", exact: true }).click();
  await expect(ben.getByTestId("versus-error")).toContainText("その番号の部屋はありません");
  await ben.locator("#versus-code").fill(code);
  await ben.getByRole("button", { name: "入る", exact: true }).click();
  await expect(ben.getByTestId("versus-players")).toContainText("Aki");
  await expect(aki.getByTestId("versus-players")).toContainText("Ben");

  await aki.getByRole("button", { name: "スタート" }).click();
  for (const p of [aki, ben]) await expect(p.getByTestId("versus-progress")).toHaveText("第1問 / 5");
  // 2人とも同じ問題・同じ順の選択肢
  expect(await aki.getByTestId("versus-question").innerText()).toBe(await ben.getByTestId("versus-question").innerText());
  expect(await aki.getByTestId("versus-choice").allInnerTexts()).toEqual(await ben.getByTestId("versus-choice").allInnerTexts());

  // 1問目: Aki が先に正解 → Aki に1ポイント（全員答えたので、すぐ解説）
  await aki.locator('[data-testid="versus-choice"][data-correct="1"]').click();
  await ben.waitForTimeout(300);
  await ben.locator('[data-testid="versus-choice"][data-correct="1"]').click();
  for (const p of [aki, ben]) {
    await expect(p.getByTestId("versus-reveal")).toBeVisible();
    await expect(p.getByTestId("versus-explain")).toBeVisible();
  }
  await expect(aki.getByTestId("versus-reveal")).toContainText("早押し成功");
  await expect(ben.getByTestId("versus-score").filter({ hasText: "Aki" })).toHaveText("Aki 1");
  // 1人モードにある「次の問題へ」ボタンはなく、解説の5秒後に自動で次へ
  await expect(aki.getByTestId("versus-next")).toHaveCount(0);
  for (const p of [aki, ben]) await expect(p.getByTestId("versus-progress")).toHaveText("第2問 / 5", { timeout: 8000 });

  // 残り4問: Ben だけが正解し、Aki は間違える
  for (let q = 2; q <= 5; q++) {
    for (const p of [aki, ben]) await expect(p.getByTestId("versus-progress")).toHaveText(`第${q}問 / 5`, { timeout: 8000 });
    await aki.locator('[data-testid="versus-choice"][data-correct="0"]').first().click();
    await ben.locator('[data-testid="versus-choice"][data-correct="1"]').click();
    await expect(ben.getByTestId("versus-reveal")).toBeVisible();
  }
  for (const p of [aki, ben]) await expect(p.getByTestId("versus-results")).toBeVisible({ timeout: 8000 });
  await expect(ben.getByTestId("versus-results")).toContainText("あなたの勝ち！");
  await expect(aki.getByTestId("versus-results")).toContainText("Benさんの勝ち");
  await expect(aki.getByTestId("versus-rank").first()).toContainText("Ben");
});
