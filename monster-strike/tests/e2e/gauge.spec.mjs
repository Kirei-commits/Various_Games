/**
 * ゲージショット。引っぱっている間ゲージが行き来し、金色の範囲で離すと成功する。
 */
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  page.errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
});

test('ゲージが金色の範囲のときに離すと、ゲージショットになる', async ({ page }) => {
  await pullUnit(page, 'A', 0, 90, { release: false });
  await page.waitForFunction(() => window.__ms.gauge && window.__ms.gauge.ok, null, { polling: 'raf' });
  await page.mouse.up();
  await page.waitForFunction(() => window.__ms.phase !== 'pulling');
  expect(await page.evaluate(() => window.__ms.battle.stats.gauge)).toBe(1);
  await waitPhase(page, 'ready');
  await expectNoErrors(page.errors);
});

test('すぐに離すとゲージショットにならない（ふつうのショット）', async ({ page }) => {
  await pullUnit(page, 'A', 0, 90);
  await waitPhase(page, 'ready');
  expect(await page.evaluate(() => window.__ms.battle.stats.gauge)).toBe(0);
  expect(await page.evaluate(() => window.__ms.turn)).toBe(2);
  await expectNoErrors(page.errors);
});
