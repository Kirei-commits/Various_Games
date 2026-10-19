// 配属先モード（実案件）
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';

async function answer(page, id) {
  const p = await page.evaluate((pid) => window.RGA.work.findProblem(pid).problem, id);
  if (p.type === 'talk') await page.check('#hk-choice-' + p.options.findIndex((o) => o.best));
  else if (p.type === 'fix') { await page.click('#hk-line-' + p.bugLine); await page.check('#hk-choice-' + p.answer); }
  else if (p.type === 'comment') await page.fill('#hk-comment', p.sample);
  else if (p.type === 'review') { for (const d of p.defects) { await page.click('#hk-line-' + d.line); await page.click('#hk-kind-' + d.kind); } }
  else if (p.type === 'order') {
    // 正しい順になるまで、上へ移す
    for (let i = 0; i < p.items.length; i++) {
      const cur = await page.evaluate(() => [...document.querySelectorAll('.order-text')].map((e) => e.textContent));
      let k = cur.indexOf(cur.find((t) => t === p.items[i]) || p.items[i]);
      while (k > i) { await page.click('#hk-up-' + k); k -= 1; }
    }
  } else await page.check('#hk-choice-' + p.answer);
  await page.click('#wk-submit');
}

test('配属先: 力を配分して週を始め、今週の仕事に答え、（障害があれば対応して）週報で数字と上司のひとことを見る', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/home');
  await page.click('#home-work');
  await expect(page.locator('#wk-plan')).toBeVisible();
  // 配分は合計10。1つ減らすと残りが出て始められず、別の所に足すと始められる
  await expect(page.locator('#wk-plus-feature')).toBeDisabled();
  await page.click('#wk-minus-care');
  await expect(page.locator('#wk-start')).toBeDisabled();
  await page.click('#wk-plus-ops');
  await expect(page.locator('#wk-val-ops')).toHaveText('3');
  await expect(page.locator('#wk-start')).toBeEnabled();
  await page.click('#wk-start');
  await answer(page, 'W01-T');
  await expect(page.locator('#wk-why')).toContainText('正解');
  await page.click('#wk-next');
  if (await page.locator('.banner.incident').count()) {
    // 障害: ヒントを全部開けて答えを見る
    const id = await page.evaluate(() => window.__RGA_APP.state.work.incident);
    const n = await page.evaluate((pid) => window.RGA.work.findProblem(pid).problem.hints.length, id);
    for (let i = 0; i < n; i++) await page.click('#wk-hint');
    await page.click('#wk-reveal');
    await page.click('#wk-next');
  }
  await expect(page.locator('#wk-report')).toContainText('第1週の週報');
  await expect(page.locator('#wk-m-users .delta')).toBeVisible();
  await page.click('#wk-next-week');
  await expect(page.locator('main')).toContainText('第2週 / 24');
  await expect(page.locator('#wk-history')).toBeVisible();
});

test('配属先: 障害ではログの行を読んで原因と最初の対処を選ぶ。分からなければ聞きに行ける', async ({ page }) => {
  await onboard(page);
  await page.evaluate(() => { const st = window.__RGA_APP.state; st.work = window.RGA.work.emptyProgress(); st.work.phase = 'incident'; st.work.incident = 'INC-01'; });
  await page.goto('/#/work');
  await expect(page.locator('.banner.incident')).toBeVisible();
  await page.click('#wk-consult summary');
  await expect(page.locator('#wk-consult')).toContainText('直前');
  await page.click('#hk-line-1');
  await page.check('#hk-choice-1');
  await page.click('#wk-submit');
  await expect(page.locator('#hk-feedback')).toContainText('手がかり');
  await answer(page, 'INC-01');
  await expect(page.locator('#wk-why')).toContainText('正解');
});
