import { expect, test } from '@playwright/test';
import { expectNoSideScroll, unlockAll, watchErrors } from './helpers.mjs';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await unlockAll(page);
  await page.goto('/#/4/2');
});

const tree = (page) => page.locator('.builder-step').last().locator('.tree');

test('見本を選ぶと、構成図とひな形コードができる', async ({ page }) => {
  const errors = watchErrors(page);
  await page.getByRole('button', { name: '家計簿', exact: true }).click();
  await expect(tree(page)).toContainText('expense-entry/');
  // ログインは「送る」形なので、get ではなく send になる
  await expect(tree(page)).toContainText('sendLogin.ts');
  await page.getByRole('button', { name: /src\/features\/login\/hooks\/useLogin\.ts/ }).click();
  await expect(page.locator('.file-list .code')).toContainText("import { sendLogin } from '../api/sendLogin';");
  await expectNoSideScroll(page, '設計図');
  expect(errors).toEqual([]);
});

test('フォルダ名は、打っている途中でも整った形で図に出る', async ({ page }) => {
  await page.getByRole('button', { name: '＋ 機能を足す' }).click();
  const row = page.locator('.feature-row').last();
  await row.getByLabel('フォルダ名（半角英字）').pressSequentially('My Memo');
  await expect(row.locator('.slug-preview')).toContainText('my-memo');
  await expect(tree(page)).toContainText('my-memo/');
  await expect(tree(page)).toContainText('getMyMemo.ts');
  await expect(tree(page)).not.toContainText('My Memo');
});

test('種類の名前（utils）や、画面の中だけの機能を正しく扱う', async ({ page }) => {
  await page.getByRole('button', { name: '＋ 機能を足す' }).click();
  const row = page.locator('.feature-row').last();
  await row.getByLabel('フォルダ名（半角英字）').fill('Utils');
  await expect(page.getByText('「utils」は機能の名前ではなく')).toBeVisible();

  await row.getByLabel('フォルダ名（半角英字）').fill('calculator');
  await row.getByLabel('この機能の形').selectOption('local');
  await expect(tree(page)).toContainText('useCalculator.ts');
  await expect(tree(page)).not.toContainText('api/');
});

test('名前に記号が入っていても、ひな形コードが壊れない', async ({ page }) => {
  await page.getByLabel('アプリの名前（日本語でOK）').fill('A <b> {x}');
  await page.getByRole('button', { name: '＋ 機能を足す' }).click();
  const row = page.locator('.feature-row').last();
  await row.getByLabel('何をする機能？（日本語）').fill('<メモ> {a}');
  await row.getByLabel('フォルダ名（半角英字）').fill('memo');
  await page.getByRole('button', { name: /src\/app\/App\.tsx/ }).click();
  await expect(page.locator('.file-list .code')).toContainText('<h1>{"A <b> {x}"}</h1>');
});

test('設計図は開き直しても残り、リセットすると消える', async ({ page }) => {
  await page.getByRole('button', { name: '読書記録', exact: true }).click();
  await page.reload();
  await expect(page.getByLabel('アプリの名前（日本語でOK）')).toHaveValue('読書ノート');

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '進み具合をリセットする' }).click();
  await expect(page.locator('.lesson-no')).toHaveText('第1回');
  await unlockAll(page);
  await page.goto('/#/4/2');
  await expect(page.getByLabel('アプリの名前（日本語でOK）')).toHaveValue('');
});
