/**
 * 能力の画面（📖）: 編成中の5体の能力と、このステージのギミック・対策できるキャラが見える。
 */
import { test, expect } from '@playwright/test';
import { open, expectNoErrors } from './fixtures.mjs';

test('📖 を押すと、5体の能力（アビリティ・ゲージ・友情・SS）とステージのギミックが出る', async ({ page }) => {
  const errors = await open(page, 0);
  await page.locator('#btn-info').click();
  await expect(page.locator('#info')).toBeVisible();
  await expect(page.locator('#info-units .info-unit')).toHaveCount(5);
  const a = page.locator('#info-units .info-unit').first();
  await expect(a).toContainText('アクア');
  await expect(a).toContainText('超アンチダメージウォール');
  await expect(a).toContainText('ゲージ');
  await expect(a).toContainText('ホーミング');
  await expect(a).toContainText('友情3');
  await expect(a).toContainText('ブースト');
  // はじまりの草原: 電気の壁と重力バリア。A は電気の壁の対策ができる
  await expect(page.locator('#info-gimmicks .info-gim')).toHaveCount(2);
  await expect(page.locator('#info-gimmicks')).toContainText('電気の壁');
  await expect(page.locator('#info-gimmicks .info-gim').first()).toContainText('アクア');
  await page.locator('#btn-info-back').click();
  await expect(page.locator('#info')).toBeHidden();
  expect(await page.evaluate(() => window.__ms.phase)).toBe('ready');
  await expectNoErrors(errors);
});

test('編成の画面でも、選んだキャラの能力が説明付きで出る', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await page.locator('#btn-party').click();
  await page.locator('[data-slot="1"]').click();
  await expect(page.locator('#party-detail')).toContainText('ブレイズ');
  await expect(page.locator('#party-detail')).toContainText('竜キラー');
  await expect(page.locator('#party-detail')).toContainText('SS');
});
