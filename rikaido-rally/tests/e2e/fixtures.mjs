import { expect } from '@playwright/test';

/**
 * ページを開く。?seed で出題の並びを固定し、JSエラーを拾えるようにしておく。
 */
export async function open(page, query = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const params = new URLSearchParams(Object.assign({ seed: '777', bank: 'java' }, query));
  await page.goto('/?' + params.toString());
  await expect(page.locator('#answer')).toBeVisible();
  await expect(page.locator('.msg.q')).toHaveCount(1);

  const hasTouch = await page.evaluate(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0);

  return {
    errors,
    hasTouch,
    /** 端末差を吸収した「押す」。スペック本体に分岐を書かないために使う。 */
    tap: async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      if (hasTouch) {
        const box = await locator.boundingBox();
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await locator.click();
      }
    },
    session: () => page.evaluate(() => {
      const s = window.RR.app.session;
      return {
        index: s.index, size: s.size, phase: s.phase,
        levels: s.records.map((r) => r.level),
        hints: s.records.map((r) => r.hintsUsed),
        qid: s.questions[s.index].id,
        grade: s.summary ? s.summary.grade.grade : null,
        score: s.summary ? s.summary.score : null
      };
    }),
    /** いま出ている問題の模範解答 */
    model: () => page.evaluate(() => window.RR.Rally.current(window.RR.app.session).model)
  };
}

/** 回答欄に書いて送信する */
export async function answer(page, text) {
  await page.fill('#answer', text);
  await page.click('#submit');
}

/** 模範解答で1問通して、次の問題（または結果）へ進む */
export async function clearOne(page, ctx) {
  await answer(page, await ctx.model());
  await expect(page.locator('.msg.ok').last()).toBeVisible();
  const next = page.locator('#next');
  if (await next.isVisible()) await ctx.tap(next);
  else await ctx.tap(page.locator('#finish'));
}
