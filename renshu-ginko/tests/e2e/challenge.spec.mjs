// チャレンジモード
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';


test('チャレンジ: 今日の5問を最後まで解くと結果が残り、続けた日数が1日になる', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/challenge');
  await page.click('#ch-lang-java');
  await page.click('#ch-daily');
  for (let i = 0; i < 5; i++) {
    await page.click('#ch-submit'); // 何も選ばずに答える（まちがいでも次へ進める）
    await expect(page.locator('#ch-result')).toBeVisible();
    await page.click('#ch-next');
  }
  await expect(page.locator('#ch-finish')).toContainText('5 問中');
  await page.click('#ch-again');
  await page.click('#ch-lang-java');
  await expect(page.locator('#ch-streak')).toHaveText('1 日');
});

test('チャレンジ: バグハントはまちがえると終わる', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/challenge');
  await page.click('#ch-hunt');
  await page.click('#ch-submit');
  await expect(page.locator('#ch-result')).toContainText('残念');
  await page.click('#ch-next');
  await expect(page.locator('#ch-finish')).toContainText('0 問連続');
});
