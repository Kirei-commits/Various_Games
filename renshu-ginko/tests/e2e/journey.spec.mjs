// モードをつなぐもの: 今日やること・称号・スプリントと予習テキスト
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';

test('ホームの「今日やること」から各モードへ行け、問題を解くと称号が取れる', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/home');
  await expect(page.locator('#home-today [data-mode="hack"]')).toBeVisible();
  await expect(page.locator('#home-today [data-mode="work"]')).toBeVisible();
  await expect(page.locator('#home-titles')).toContainText('称号 0 /');
  await page.click('#home-today [data-mode="hack"]');
  await expect(page.locator('h1')).toContainText('スプリント1');
  // 予習できるテキストがあれば、そこから章へ飛べる
  const related = await page.evaluate(() => window.RGA.journey.chaptersOfSprint(1).length);
  if (related) {
    await page.click('#hk-related a >> nth=0');
    await expect(page.locator('#tx-handout')).toBeVisible();
    await page.click('#tx-handout a[href^="#/hack/s/"] >> nth=0');
    await expect(page.locator('h1')).toContainText('スプリント');
  }
  await page.goto('/#/hack/s/1');
  await page.click('#hk-start');
  await page.click('#hk-open-S01-2');
  const answer = await page.evaluate(() => window.RGA.hack.findProblem('S01-2').problem.answer);
  await page.check('#hk-choice-' + answer);
  await page.click('#hk-submit');
  await expect(page.locator('#hk-why')).toBeVisible();
  await page.goto('/#/home');
  await expect(page.locator('#home-titles')).toContainText('初レビュー');
});
