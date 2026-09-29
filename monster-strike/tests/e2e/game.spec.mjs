import { test, expect } from '@playwright/test';
import { open, phase, body, pullUnit, waitPhase, expectNoErrors } from './fixtures.mjs';

test('起動するとフィールドが描かれ、Aの番から始まる', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#field')).toBeVisible();
  await expect(page.locator('#turn')).toHaveText('1');
  await expect(page.locator('#wave')).toHaveText('1/2');
  await expect(page.locator('#hp-text')).toHaveText('28000 / 28000');
  expect(await page.evaluate(() => window.__ms.battle.alive().length)).toBe(3);
  await expect(page.locator('#active-name')).toHaveText('A');
  await expect(page.locator('#active-type')).toHaveText('反射');
  const box = await page.locator('#field').boundingBox();
  const vp = page.viewportSize();
  // 画面からはみ出さない
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  // 何か描かれている（真っ黒ではない）
  const painted = await page.evaluate(() => {
    const c = document.getElementById('field');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
    return lit;
  });
  expect(painted).toBeGreaterThan(100);
  await expectNoErrors(errors);
});

test('引っぱっている間はガイドが出て、引くほど強くなる', async ({ page }) => {
  const errors = await open(page);
  await pullUnit(page, 'A', 0, 40, { release: false });
  expect(await phase(page)).toBe('pulling');
  const weak = await page.evaluate(() => window.__ms.aim);
  expect(weak).not.toBeNull();
  expect(weak.points).toBeGreaterThan(3);

  const a = await body(page, 'A');
  const to = await page.evaluate(([x, y]) => window.__ms.toClient(x, y), [a.x, a.y + 200]);
  await page.mouse.move(to.x, to.y, { steps: 4 });
  const strong = await page.evaluate(() => window.__ms.aim);
  expect(strong.power).toBeGreaterThan(weak.power);
  expect(strong.power).toBe(1);
  await page.mouse.up();
  await expectNoErrors(errors);
});

test('引きを戻して離すとキャンセルになり、ターンは進まない', async ({ page }) => {
  const errors = await open(page);
  await pullUnit(page, 'A', 0, 120, { release: false });
  const a = await body(page, 'A');
  const back = await page.evaluate(([x, y]) => window.__ms.toClient(x, y), [a.x, a.y + 3]);
  await page.mouse.move(back.x, back.y, { steps: 4 });
  await page.mouse.up();
  expect(await phase(page)).toBe('ready');
  const after = await body(page, 'A');
  expect(after.moving).toBe(false);
  expect([after.x, after.y]).toEqual([a.x, a.y]);
  await expect(page.locator('#turn')).toHaveText('1');
  await expectNoErrors(errors);
});

test('下に引いて離すと上へ飛び、止まるとターンが進んで B の番になる', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  const before = await body(page, 'A');
  await pullUnit(page, 'A', 0, 120);
  expect(await phase(page)).toBe('moving');
  await page.waitForFunction(() => window.__ms.body('A').y < 600);
  const flying = await body(page, 'A');
  expect(flying.y).toBeLessThan(before.y);
  expect(flying.vy).toBeLessThan(0);

  await waitPhase(page, 'ready');
  await expect(page.locator('#turn')).toHaveText('2');
  await expect(page.locator('#active-name')).toHaveText('B');
  await expect(page.locator('#active-type')).toHaveText('貫通');
  const a = await body(page, 'A');
  expect(a.moving).toBe(false);
  await expectNoErrors(errors);
});

test('動いている間は次の発射を受け付けない', async ({ page }) => {
  const errors = await open(page);
  await pullUnit(page, 'A', 0, 170);
  expect(await phase(page)).toBe('moving');
  const b = await body(page, 'B');
  await pullUnit(page, 'B', 0, 170);
  expect((await body(page, 'B')).moving).toBe(false);
  expect(await body(page, 'B')).toMatchObject({ x: b.x, y: b.y });
  await expectNoErrors(errors);
});

test('B を押すと B に交代して撃てる（貫通タイプは敵をすり抜けてダメージを与える）', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  // B をゴーレム（矩形。y=420, 高さ56）の真下へ置き直してから真上へ撃つ
  await page.evaluate(() => { const b = window.__ms.world.get('B'); b.x = 270; b.y = 600; });
  await pullUnit(page, 'B', 0, 170);
  await expect(page.locator('#active-name')).toHaveText('B');
  const seen = await page.evaluate(() => new Promise((resolve) => {
    const t0 = performance.now();
    (function watch() {
      const b = window.__ms.body('B');
      if (b.y < 420 - 28 - 30) return resolve(true);
      if (!b.moving || performance.now() - t0 > 8000) return resolve(false);
      requestAnimationFrame(watch);
    })();
  }));
  expect(seen).toBe(true);
  const golem = await page.evaluate(() => { const e = window.__ms.battle.enemy('w1-golem'); return [e.hp, e.maxHp]; });
  expect(golem[0]).toBeLessThan(golem[1]);
  await waitPhase(page, 'ready');
  await expect(page.locator('#turn')).toHaveText('2');
  // 順番は A → B → C。B の次は C
  await expect(page.locator('#active-name')).toHaveText('C');
  await expectNoErrors(errors);
});

test('反射タイプは敵を通り抜けず、当たるとダメージを与える', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  await page.evaluate(() => { const a = window.__ms.world.get('A'); a.x = 270; a.y = 600; });
  await pullUnit(page, 'A', 0, 170);
  const minY = await page.evaluate(() => new Promise((resolve) => {
    let min = Infinity;
    (function watch() {
      const a = window.__ms.body('A');
      min = Math.min(min, a.y);
      if (a.vy > 0 || !a.moving) return resolve(min);
      requestAnimationFrame(watch);
    })();
  }));
  // ゴーレムの下の辺（420+28）+ A の半径 より上へは行っていない
  expect(minY).toBeGreaterThanOrEqual(420 + 28 + 30 - 1);
  const hp = await page.evaluate(() => window.__ms.battle.enemy('w1-golem').hp);
  expect(hp).toBeLessThan(12000);
  await waitPhase(page, 'ready');
  await expectNoErrors(errors);
});

test('調整パネルで数値を変えると物理に反映され、初期値に戻せる', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#tune')).toBeHidden();
  await page.locator('#btn-tune').click();
  await expect(page.locator('#tune')).toBeVisible();
  const slider = page.locator('input[data-key="wall.restitution"]');
  await slider.fill('0.6');
  expect(await page.evaluate(() => window.__ms.world.cfg.wall.restitution)).toBe(0.6);
  await page.locator('#btn-tune-default').click();
  expect(await page.evaluate(() => window.__ms.world.cfg.wall.restitution)).toBe(0.88);
  await page.locator('#btn-tune-close').click();
  await expect(page.locator('#tune')).toBeHidden();
  await expectNoErrors(errors);
});

test('リセットで配置とターンが初めに戻る', async ({ page }) => {
  const errors = await open(page);
  await page.evaluate(() => window.__ms.setTimeScale(4));
  await pullUnit(page, 'A', 40, 150);
  await waitPhase(page, 'ready');
  await expect(page.locator('#turn')).toHaveText('2');
  await page.locator('#btn-reset').click();
  await expect(page.locator('#turn')).toHaveText('1');
  expect(await body(page, 'A')).toMatchObject({ x: 130, y: 690 });
  await expect(page.locator('#wave')).toHaveText('1/2');
  expect(await page.evaluate(() => window.__ms.battle.alive().length)).toBe(3);
  await expectNoErrors(errors);
});
