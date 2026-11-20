import { expect, test } from '@playwright/test';
import { expectNoSideScroll, solvePart, unlockAll, walkParts, watchErrors } from './helpers.mjs';

test('第1回から第4回まで、順番に最後まで進められる', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');

  for (let lesson = 1; lesson <= 4; lesson++) {
    await expect(page.locator('.lesson-no')).toHaveText(`第${lesson}回`);
    // 次の回は、完了するまで開かない
    if (lesson < 4) await expect(page.locator('.nav-item').nth(lesson)).toBeDisabled();

    let part = 0;
    await walkParts(page, async () => {
      part++;
      await expect(page.locator('.part-now')).toContainText(`パート ${part} /`);
      await expectNoSideScroll(page, `第${lesson}回 パート${part}`);
      await solvePart(page);
    });

    await page.getByRole('button', { name: `納得した！ 第${lesson}回を完了する` }).click();
    if (lesson < 4) await page.getByRole('button', { name: `第${lesson + 1}回へ進む` }).click();
  }
  await expect(page.getByText('全4回おつかれさまでした')).toBeVisible();

  // 開き直しても、進み具合・書いた答え・開いていた場所が残っている
  await page.reload();
  await expect(page.getByText('4 / 4 回 完了')).toBeVisible();
  await expect(page.locator('.lesson-no')).toHaveText('第4回');
  await expect(page.getByLabel('自分の答え', { exact: true })).toHaveValue('自分の答えのメモ');
  expect(errors).toEqual([]);
});

test('問題が残っているうちは、回を完了できない', async ({ page }) => {
  await page.goto('/#/1/5');
  await expect(page.getByText('が残っています')).toBeVisible();
  await expect(page.getByRole('button', { name: /第1回を完了する/ })).toHaveCount(0);
});

test('まちがえるとヒントが出て、選び直せる', async ({ page }) => {
  await page.goto('/#/1/5');
  const item = page.locator('.quiz-item').first();
  const choices = item.locator('.choice');
  let sawHint = false;
  for (let i = 0; i < (await choices.count()); i++) {
    await choices.nth(i).click();
    if (await item.locator('.quiz-result.ng').count()) {
      sawHint = true;
      await expect(item.locator('.quiz-result.ng')).toContainText('ヒント');
    } else {
      await expect(item.locator('.quiz-result.ok')).toContainText('正解');
      break;
    }
  }
  // 3択のうち正解は1つなので、順に押せば、ヒントか正解のどちらかは必ず見ている
  expect(sawHint || (await item.locator('.quiz-result.ok').count()) === 1).toBe(true);
});

test('ブラウザの「戻る」で前のパートに戻れる。鍵のかかった回の住所は開けない', async ({ page }) => {
  await page.goto('/');
  await page.locator('.part-pager .btn-next').click();
  await expect(page).toHaveURL(/#\/1\/2$/);
  await page.locator('.part-pager .btn-next').click();
  await expect(page).toHaveURL(/#\/1\/3$/);
  await page.goBack();
  await expect(page.locator('.part-now')).toContainText('パート 2 /');

  await page.goto('/#/3/2');
  await page.reload();
  await expect(page.locator('.lesson-no')).toHaveText('第1回');
});

test('第3回：悪い例と良い例は、同じ動きをする', async ({ page }) => {
  await page.goto('/');
  await unlockAll(page);
  await page.goto('/#/3/1');
  for (const label of ['悪い例（1ファイル）', '良い例（3ファイル）']) {
    await page.getByRole('button', { name: label }).click();
    const demo = page.locator('.demo');
    await expect(demo.getByText('牛乳')).toBeVisible();

    await demo.getByRole('button', { name: '追加' }).click();
    await expect(demo.getByText('品物の名前を入れてください')).toBeVisible();
    // 入力し直し始めたら、エラーは消える
    await demo.getByLabel('買うもの').fill('牛乳');
    await expect(demo.getByText('品物の名前を入れてください')).toHaveCount(0);

    await demo.getByRole('button', { name: '追加' }).click();
    await expect(demo.getByText('「牛乳」はもうメモにあります')).toBeVisible();

    await demo.getByLabel('買うもの').fill('りんご');
    await demo.getByRole('button', { name: '追加' }).click();
    await expect(demo.locator('li', { hasText: 'りんご' })).toBeVisible();
    await expect(demo.getByLabel('買うもの')).toHaveValue('');
  }
});

test('第3回：表示しているコードは、実際のファイルの中身', async ({ page }) => {
  await page.goto('/');
  await unlockAll(page);
  await page.goto('/#/3/3');
  await expect(page.locator('.code', { hasText: 'api/getItems.ts' }).first()).toContainText('export async function getItems');
  await expect(page.locator('.code', { hasText: 'hooks/useShoppingList.ts' }).first()).toContainText('clearInputError');
  await page.goto('/#/3/5');
  await expect(page.locator('.code', { hasText: 'useShoppingList.test.ts' })).toContainText("vi.mock('../api/getItems')");
});
