// サクサク爽快アップデート（docs/kaikan-plan.md）: 倍速・早送り・ラストヒット・ショットの結果
import { test, expect } from '@playwright/test';
import { open, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

test('倍速ボタンで ×1 ⇔ ×2 が切り替わり、幅は変わらず、読み込み直しても覚えている', async ({ page }) => {
  const errors = await open(page, 0);
  const btn = page.locator('#btn-speed');
  await expect(btn).toHaveText('▶×1');
  const w1 = (await btn.boundingBox()).width;
  await btn.click();
  await expect(btn).toHaveText('▶▶×2');
  await expect(btn).toHaveAttribute('aria-pressed', 'true');
  expect((await btn.boundingBox()).width).toBeCloseTo(w1, 0);
  expect(await page.evaluate(() => window.__ms.tempo.speed)).toBe(2);
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  expect(await page.evaluate(() => window.__ms.tempo.speed)).toBe(2);
  await expect(btn).toHaveText('▶▶×2');
  await btn.click();
  await expect(btn).toHaveText('▶×1');
  await expectNoErrors(errors);
});

test('遅くなったキャラは自動で早送りになり、止まると元の速さに戻る', async ({ page }) => {
  const errors = await open(page, 0);
  // 弱く引いて、すぐ遅くなるショット
  await pullUnit(page, 'A', 0, 45);
  await page.waitForFunction(() => window.__ms.tempo.ff > 1.5, null, { timeout: 10000 });
  await waitPhase(page, 'ready');
  expect(await page.evaluate(() => window.__ms.tempo.ff)).toBe(1);
  await expectNoErrors(errors);
});

test('ウェーブの最後の1体を倒すとスロー＋CLEAR!、残りは早送りで、次のウェーブへ進む', async ({ page }) => {
  const errors = await open(page, 0);
  // 左のスライム（HP 1）だけを残して、A で狙う
  await page.evaluate(() => {
    const ms = window.__ms, [l, ...rest] = ms.battle.alive().sort((a, b) => a.def.x - b.def.x);
    for (const e of rest) ms.battle.kill(e.id, ms.world);
    l.hp = 1;
  });
  const a = await page.evaluate(() => window.__ms.body('A'));
  const tgt = await page.evaluate(() => window.__ms.battle.alive()[0].def);
  const len = Math.hypot(tgt.x - a.x, tgt.y - a.y);
  await pullUnit(page, 'A', -(tgt.x - a.x) / len * 150, -(tgt.y - a.y) / len * 150);
  await page.waitForFunction(() => window.__ms.tempo.cleared, null, { timeout: 15000 });
  const t = await page.evaluate(() => ({ slowmo: window.__ms.tempo.slowmo, texts: window.__ms.texts }));
  expect(t.texts).toContain('CLEAR!');
  await page.waitForFunction(() => window.__ms.phase !== 'moving' || window.__ms.tempo.ff > 2.5, null, { timeout: 10000 });
  await page.waitForFunction(() => window.__ms.texts.some((x) => / HIT  /.test(x)), null, { timeout: 15000 });
  await waitPhase(page, 'ready');
  await expect(page.locator('#wave')).toHaveText(/^2\//);
  await expectNoErrors(errors);
});
