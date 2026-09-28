import { test, expect } from '@playwright/test';
import { openGate, signUp, stateOf, ready, USER, PASS } from './fixtures.mjs';

/** ログインボーナスを閉じずに、出たところで止める。 */
async function signUpToBonus(page, name = USER, pass = PASS) {
  await page.locator('#new-name').fill(name);
  await page.locator('#new-pass').fill(pass);
  await page.locator('#btn-create').click();
  await page.locator('#memo-ok').check();
  await page.locator('#btn-memo-done').click();
}

test('はじめて始めたときにログインボーナスが出る', async ({ page }) => {
  await openGate(page);
  await signUpToBonus(page);

  await expect(page.locator('#bonus')).toBeVisible();
  await expect(page.locator('#bonus-day')).toContainText('1日目');
  await expect(page.locator('.bonus-item')).toHaveCount(1);
  await expect(page.locator('.bonus-pip')).toHaveCount(7);
  await expect(page.locator('.bonus-pip.on')).toHaveCount(1);

  await page.locator('#btn-bonus-ok').click();
  await expect(page.locator('#bonus')).toBeHidden();
  await ready(page);

  const st = await stateOf(page);
  expect(st.coins).toBe(200);
  expect(st.bonusStreak).toBe(1);
  expect(st.bonusDate).not.toBe('');
});

test('同じ日に開き直してもボーナスは出ない', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  const coins = (await stateOf(page)).coins;

  await page.goto('/?debug=1');
  await ready(page);
  await expect(page.locator('#bonus')).toBeHidden();
  expect((await stateOf(page)).coins).toBe(coins);
});

test('翌日に開くと連続日数が伸びる', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  // 「昨日受け取った」ことにして開き直す
  await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    window.FQ.app.debug.setBonusDate(window.FQ.Bonus.dateKey(d));
  });

  await page.goto('/?debug=1');
  await expect(page.locator('#bonus')).toBeVisible();
  await expect(page.locator('#bonus-day')).toContainText('2日目');
  await page.locator('#btn-bonus-ok').click();
  await ready(page);
  expect((await stateOf(page)).bonusStreak).toBe(2);
});

test('日が空くと1日目に戻る', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 5);
    window.FQ.app.state.bonusStreak = 4;
    window.FQ.app.debug.setBonusDate(window.FQ.Bonus.dateKey(d));
  });

  await page.goto('/?debug=1');
  await expect(page.locator('#bonus-day')).toContainText('1日目');
  await page.locator('#btn-bonus-ok').click();
  await ready(page);
  expect((await stateOf(page)).bonusStreak).toBe(1);
});

test('7日続けると実績が解除される', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  for (let day = 2; day <= 7; day++) {
    await page.evaluate(() => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      window.FQ.app.debug.setBonusDate(window.FQ.Bonus.dateKey(d));
    });
    await page.goto('/?debug=1');
    await expect(page.locator('#bonus-day')).toContainText(day + '日目');
    await page.locator('#btn-bonus-ok').click();
    await ready(page);
  }
  const st = await stateOf(page);
  expect(st.bonusStreak).toBe(7);
  expect(st.achievements).toContain('login7');

  await page.locator('#tab-achievements').click();
  await expect(page.locator('[data-ach="login7"]')).toHaveClass(/done/);
});
