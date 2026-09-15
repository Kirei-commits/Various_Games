import { expect } from '@playwright/test';

/**
 * 受講者の画面を開く。?role=learner でログイン画面を飛ばし、?seed で並びを固定する。
 */
export async function open(page, query = {}) {
  const ctx = await openRaw(page, { role: 'learner', seed: '777', bank: 'java', ...query });
  await expect(page.locator('#answer')).toBeVisible();
  await expect(page.locator('.msg.q')).toHaveCount(1);
  return ctx;
}

/** 画面を指定せずに開く（ログイン画面のテスト用） */
export async function openRaw(page, query = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto('/?' + new URLSearchParams(query).toString());
  await page.waitForFunction(() => !!window.RR);

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
      const s = window.RR.session();
      return {
        index: s.index, size: s.size, phase: s.phase, bankId: s.bankId,
        levels: s.records.map((r) => r.level),
        hints: s.records.map((r) => r.hintsUsed),
        qid: s.questions[s.index].id,
        grade: s.summary ? s.summary.grade.grade : null
      };
    }),
    banks: () => page.evaluate(() => window.RR.app.registry.list().map((b) => ({ id: b.id, name: b.name, origin: b.origin }))),
    /** いま出ている問題の模範解答 */
    model: () => page.evaluate(() => {
      const s = window.RR.session();
      return s.questions[s.index].model;
    })
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

/** 講師の画面を開く（合言葉はこの端末でまだ未設定なので、最初の1回で決まる） */
export async function openTeacher(page, query = {}) {
  const ctx = await openRaw(page, { role: 'teacher', seed: '777', ...query });
  await expect(page.locator('#screen-teacher')).toBeVisible();
  return ctx;
}
