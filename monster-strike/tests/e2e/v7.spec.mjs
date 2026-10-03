// v7（改修のまとめ）: 難易度4段階・SS 何回でも・ガチャ 50/100連・まとめて強化・ウルトラ進化・音量・プリセット・ボスのドロップ
import { test, expect } from '@playwright/test';
import { pullUnit, waitPhase, client } from './fixtures.mjs';

async function boot(page, save) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  if (save) {
    await page.evaluate((fn) => { const s = JSON.parse(localStorage.getItem('ms.save')); new Function('s', fn)(s); localStorage.setItem('ms.save', JSON.stringify(s)); }, save);
    await page.reload();
  }
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  return errors;
}

test('難易度は EASY / NORMAL / DIFFICULT / GOD の4つ。GOD は敵の HP と攻撃力がずっと大きく、選んだものは残る', async ({ page }) => {
  const errors = await boot(page);
  for (const m of ['easy', 'normal', 'difficult', 'god']) await expect(page.locator('#mode-' + m)).toBeVisible();
  await page.locator('#mode-god').click();
  await expect(page.locator('#mode-god')).toHaveClass(/on/);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  const e = await page.evaluate(() => ({ hp: window.__ms.battle.enemies[0].maxHp, atk: window.__ms.battle.enemies[0].def.atk }));
  const base = await page.evaluate(() => window.MSData.stages[0].waves[0].enemies[0]);
  expect(e.hp).toBeGreaterThanOrEqual(base.hp * 50);
  expect(e.atk).toBeGreaterThan(base.atk * 2);
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  await expect(page.locator('#mode-god')).toHaveClass(/on/);
  await page.locator('#mode-easy').click();
  await expect(page.locator('#mode-easy')).toHaveClass(/on/);
  expect(errors).toEqual([]);
});

test('SS 何回でも: ON にすると最初から SS が使えて、撃ったあとも使える', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#btn-ssfree').click();
  await expect(page.locator('#btn-ssfree')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await page.evaluate(() => window.__ms.setTimeScale(4));
  await expect(page.locator('#btn-ss')).toBeEnabled();
  await page.locator('#btn-ss').click();
  await pullUnit(page, 'A', 0, 120);
  await waitPhase(page, 'ready');
  await page.locator('.ucard[data-idx="0"]').click();
  await expect(page.locator('#btn-ss')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('ガチャ: 50連と100連が引ける（100連で100枚、レア度の高い順、まとめが出る）', async ({ page }) => {
  const errors = await boot(page, 's.gems = 2000;');
  await page.locator('#btn-gacha').click();
  await expect(page.locator('#cost50')).toHaveText('◆ 250');
  await expect(page.locator('#cost100')).toHaveText('◆ 500');
  await page.locator('#btn-pull100').click();
  await expect(page.locator('#pull-results .card')).toHaveCount(100);
  await expect(page.locator('#pull-summary')).toContainText('体');
  await expect(page.locator('#gacha-gems')).toHaveText(String(2000 - 500));
  await page.locator('#btn-pull50').click();
  await expect(page.locator('#pull-results .card')).toHaveCount(50);
  expect(errors).toEqual([]);
});

test('編成: まとめて強化で全員 +5 まで、+5 で同じキャラ5体あればウルトラ進化できる', async ({ page }) => {
  const errors = await boot(page, "s.owned.A.stock = 12; s.owned.B.stock = 2;");
  await page.locator('#btn-party').click();
  await page.locator('#btn-fuse-all').click();
  await expect(page.locator('#rec-note')).toContainText('強化しました');
  const o = await page.evaluate(() => window.__ms.save.owned);
  expect([o.A.plus, o.A.stock, o.B.plus, o.B.stock]).toEqual([5, 7, 2, 0]);
  // A（1番目の枠）をウルトラ進化
  await page.locator('[data-slot="0"]').click();
  await expect(page.locator('#btn-ultra')).toBeEnabled();
  await page.locator('#btn-ultra').click();
  await expect(page.locator('#rec-note')).toContainText('ウルトラ進化');
  await expect(page.locator('[data-slot="0"] .ultra-tag')).toHaveText('極');
  await expect(page.locator('#party-detail')).toContainText('超絶爆発');
  expect(await page.evaluate(() => window.__ms.save.owned.A.ultra)).toBe(true);
  expect(errors).toEqual([]);
});

test('設定: 音量のツマミが4つあり覚えている。手触りのプリセットを登録・呼び出し・削除できる', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await page.locator('#btn-tune').click();
  await expect(page.locator('#volume-list input')).toHaveCount(4);
  await page.locator('[data-volume="bgm"]').fill('30');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ms.volume')).bgm)).toBe(30);
  // 摩擦を変えて登録 → 初期値に戻す → 呼び出すと戻る
  await page.locator('[data-key="friction.linear"]').fill('300');
  await page.locator('#preset-name').fill('テスト');
  await page.locator('#btn-preset-save').click();
  await expect(page.locator('#preset-msg')).toContainText('登録');
  await page.locator('#btn-tune-default').click();
  expect(await page.evaluate(() => window.__ms.world.cfg.friction.linear)).toBe(140);
  await page.locator('#preset-select').selectOption({ label: 'テスト' });
  await page.locator('#btn-preset-load').click();
  expect(await page.evaluate(() => window.__ms.world.cfg.friction.linear)).toBe(300);
  await page.locator('#btn-preset-del').click();
  await expect(page.locator('#preset-select option', { hasText: 'テスト' })).toHaveCount(0);
  await page.locator('#btn-tune-close').click();
  expect(errors).toEqual([]);
});

test('最後のボスを倒すとジェムと宝箱がドロップし、なぞって回収すると報酬に足される', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await page.evaluate(() => window.__ms.setTimeScale(2));
  const next = async () => { await pullUnit(page, await page.evaluate(() => window.__ms.active), 0, -20); };
  const waves = await page.evaluate(() => window.__ms.battle.stage.waves.length);
  for (let w = 0; w < waves; w++) {
    await page.evaluate(() => { const { battle, world } = window.__ms; for (const e of battle.alive()) battle.kill(e.id, world); });
    await next();
    if (w < waves - 1) await waitPhase(page, 'ready');
  }
  await waitPhase(page, 'loot');
  await page.waitForFunction(() => window.__ms.loot.drops.every((d) => d.ready));
  // ドロップを順になぞる
  const drops = await page.evaluate(() => window.__ms.loot.drops);
  const first = await client(page, drops[0].x, drops[0].y);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const d of drops) { const c = await client(page, d.x, d.y); await page.mouse.move(c.x, c.y, { steps: 4 }); }
  await page.mouse.up();
  await expect(page.locator('#result')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#result-text')).toContainText('ドロップ');
  const gems = await page.evaluate(() => window.__ms.loot.gems);
  expect(gems).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('軽量化: ⚙ の「演出」で軽量にすると解像度と粒が減り、覚えている。演出の数には上限がある', async ({ page }) => {
  const errors = await boot(page);
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  expect((await page.evaluate(() => window.__ms.fxMode)).dpr).toBeLessThanOrEqual(2);
  await page.locator('#btn-tune').click();
  await page.locator('#fx-mode').selectOption('low');
  const m = await page.evaluate(() => window.__ms.fxMode);
  expect(m.low).toBe(true);
  expect(m.dpr).toBeLessThanOrEqual(1.5);
  await page.reload();
  await page.waitForFunction(() => window.__ms && window.__ms.phase === 'title');
  expect((await page.evaluate(() => window.__ms.fxMode)).mode).toBe('low');
  // 何発撃っても演出の数は上限を超えない
  await page.locator('#stage-0').click();
  await page.waitForFunction(() => window.__ms.phase === 'ready');
  await page.evaluate(() => window.__ms.setTimeScale(3));
  for (let i = 0; i < 3; i++) {
    await pullUnit(page, await page.evaluate(() => window.__ms.active), 40 - i * 40, 150);
    await waitPhase(page, 'ready');
  }
  const peak = (await page.evaluate(() => window.__ms.fxCount)).peak;
  expect(peak.particles).toBeLessThanOrEqual(260);
  expect(peak.texts).toBeLessThanOrEqual(41);
  expect(errors).toEqual([]);
});
