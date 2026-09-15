import { expect } from '@playwright/test';

/**
 * 受講者の画面を開く。?role=learner でログイン画面を飛ばし、?seed で並びを固定する。
 */
export async function open(page, query = {}) {
  const ctx = await openRaw(page, { role: 'learner', seed: '777', bank: 'java', ...query });
  await expect(page.locator('.msg.q')).toHaveCount(1);
  // 既定は選択式なので、待つのは入力欄ではなく「答えられる状態」
  await expect(page.locator('#skip')).toBeVisible();
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
    /** いまの問題の正解（選択式なら正解の選択肢、記述式なら模範解答） */
    correct: () => page.evaluate(() => {
      const s = window.RR.session();
      const q = s.questions[s.index];
      return s.records[s.index].choiceMode ? q.choices[0] : q.model;
    }),
    /** いまの問題の誤答を1つ */
    wrong: () => page.evaluate(() => {
      const s = window.RR.session();
      const q = s.questions[s.index];
      const rec = s.records[s.index];
      if (!rec.choiceMode) return 'ぜんぜん違うことを書きます';
      return rec.choiceOrder.find((c) => c !== q.choices[0] && !rec.eliminated.includes(c)
        && !rec.inputs.some((i) => i.text === c)) || rec.choiceOrder.find((c) => c !== q.choices[0]);
    })
  };
}

/** 選択肢を1つ押す */
export async function pick(page, ctx, text) {
  await ctx.tap(page.locator('#choices .choice', { hasText: text }).first());
}

/** 記述式の回答欄に書いて送信する */
export async function answer(page, text) {
  await page.fill('#answer', text);
  await page.click('#submit');
}

/** いまの問題に正しく答える（選択式・記述式のどちらでも） */
export async function answerCorrectly(page, ctx) {
  const text = await ctx.correct();
  if (await page.locator('#choices').isVisible()) await pick(page, ctx, text);
  else await answer(page, text);
}

/** いまの問題にわざと間違える */
export async function answerWrong(page, ctx) {
  const text = await ctx.wrong();
  if (await page.locator('#choices').isVisible()) await pick(page, ctx, text);
  else await answer(page, text);
}

/** 1問通して、次の問題（または結果）へ進む */
export async function clearOne(page, ctx) {
  await answerCorrectly(page, ctx);
  await expect(page.locator('.msg.ok').last()).toBeVisible();
  await goNext(page, ctx);
}

/** 「次の問題へ」か「結果を見る」を押す */
export async function goNext(page, ctx) {
  const next = page.locator('#next');
  if (await next.isVisible()) await ctx.tap(next);
  else await ctx.tap(page.locator('#finish'));
}

/** ラリーを最後まで正解で走り切る */
export async function finishAll(page, ctx, size = 10) {
  for (let i = 0; i < size; i++) await clearOne(page, ctx);
  await expect(page.locator('#result')).toBeVisible();
}

/** 講師の画面を開く（合言葉はこの端末でまだ未設定なので、最初の1回で決まる） */
export async function openTeacher(page, query = {}) {
  const ctx = await openRaw(page, { role: 'teacher', seed: '777', ...query });
  await expect(page.locator('#screen-teacher')).toBeVisible();
  return ctx;
}
