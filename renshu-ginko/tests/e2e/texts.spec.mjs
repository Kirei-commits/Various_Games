// 言語テキスト
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';

async function answer(page, id) {
  const q = await page.evaluate((qid) => window.RGA.texts.findQuiz(qid).problem, id);
  if (q.type === 'review') {
    for (const d of q.defects) { await page.click('#hk-line-' + d.line); await page.click('#hk-kind-' + d.kind); }
  } else if (q.type === 'fix') {
    await page.click('#hk-line-' + q.bugLine);
    await page.check('#hk-choice-' + q.answer);
  } else {
    await page.check('#hk-choice-' + q.answer);
  }
  await page.click('#tx-submit');
}

test('言語テキスト: 4つのコースがあり、章の前に資料が配られ、読解問題を解いて章を終えるとバッジ', async ({ page }) => {
  await onboard(page);
  await page.goto('/#/texts');
  for (const id of ['js', 'react', 'java', 'python']) await expect(page.locator('#tx-course-' + id)).toBeVisible();
  await page.click('#tx-course-java');
  // 2章は1章を終えるまで開かない
  await expect(page.locator('#tx-open-java-2')).toHaveCount(0);
  await page.click('#tx-open-java-1');
  await expect(page.locator('#tx-handout')).toContainText('この章に関係する単元');
  await expect(page.locator('.tx-figure')).toBeVisible();
  const ids = await page.evaluate(() => window.RGA.texts.quizOf(window.RGA.texts.courseById('java').chapters[0]).map((q) => q.id));
  // 1問目: まちがえるとフィードバック → 正解
  const q0 = await page.evaluate((id) => window.RGA.texts.findQuiz(id).problem, ids[0]);
  await page.check('#hk-choice-' + ((q0.answer + 1) % q0.choices.length));
  await page.click('#tx-submit');
  await expect(page.locator('#hk-feedback')).toContainText('違う');
  await answer(page, ids[0]);
  await expect(page.locator('#tx-why')).toContainText('正解');
  // 2問目: ヒントを全部開けて答えを見る
  await page.click('#tx-next');
  const n = await page.evaluate((id) => window.RGA.texts.findQuiz(id).problem.hints.length, ids[1]);
  await expect(page.locator('#tx-reveal')).toHaveCount(0);
  for (let i = 0; i < n; i++) await page.click('#tx-hint');
  await page.click('#tx-reveal');
  await expect(page.locator('#tx-why')).toContainText('答えと解説');
  for (const id of ids.slice(2)) {
    await page.click('#tx-next');
    await answer(page, id);
  }
  await page.click('#tx-next');
  await expect(page.locator('.chapter-card').first()).toContainText('設計図マスター');
  await expect(page.locator('#tx-open-java-2')).toBeVisible();
  await page.goto('/#/home');
  await expect(page.locator('#home-retry')).toContainText('言語テキスト');
  await page.goto('/#/texts');
  await expect(page.locator('#tx-badges')).toContainText('設計図マスター');
});
