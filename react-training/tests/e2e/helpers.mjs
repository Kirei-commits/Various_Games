import { expect } from '@playwright/test';

/** ページのエラーを集める。テストの最後に空であることを確かめる */
export function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** 横にはみ出していないこと（ページ全体と、コード・構成図の枠の中） */
export async function expectNoSideScroll(page, label) {
  const result = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth - window.innerWidth,
    boxes: [...document.querySelectorAll('.code pre, .tree')].filter((el) => el.scrollWidth > el.clientWidth + 1)
      .length,
  }));
  expect(result, label).toEqual({ page: expect.any(Number), boxes: 0 });
  expect(result.page, `${label}: ページの横はみ出し`).toBeLessThanOrEqual(0);
}

/** いま開いているパートの問題に全部正解し、ミニ課題に「納得した」を付ける */
export async function solvePart(page) {
  const items = page.locator('.quiz-item');
  for (let i = 0; i < (await items.count()); i++) {
    const item = items.nth(i);
    const choices = item.locator('.choice');
    for (let j = 0; j < (await choices.count()); j++) {
      await choices.nth(j).click();
      if (await item.locator('.quiz-result.ok').count()) break;
    }
    await expect(item.locator('.quiz-result.ok')).toBeVisible();
  }
  const tasks = page.locator('.minitask');
  for (let i = 0; i < (await tasks.count()); i++) {
    await tasks.nth(i).getByLabel('自分の答え', { exact: true }).fill('自分の答えのメモ');
    await tasks.nth(i).getByRole('button', { name: '模範解答を見る' }).click();
    await tasks.nth(i).getByLabel('自分の答えと比べて、納得した').check();
  }
}

/** いまの回の、最後のパートまで進む。途中のパートごとに fn を呼ぶ */
export async function walkParts(page, fn) {
  for (;;) {
    await fn();
    const next = page.locator('.part-pager .btn-next');
    if (!(await next.count())) break;
    await next.click();
  }
}

export async function unlockAll(page) {
  await page.getByLabel('すべての回を自由に読めるようにする').check();
}
