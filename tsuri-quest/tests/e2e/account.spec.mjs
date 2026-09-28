import { test, expect } from '@playwright/test';
import { openGate, signUp, stateOf, catchOne, ready, dismissBonus, USER, PASS } from './fixtures.mjs';

test('最初はログイン画面が出て、ゲームは始まらない', async ({ page }) => {
  await openGate(page);
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#form-new')).toBeVisible();
  await expect(page.locator('#form-load')).toBeHidden();
  await expect(page.locator('#saved-list')).toContainText('まだデータがありません');
});

test('入力が足りないと理由が出て、先へ進めない', async ({ page }) => {
  await openGate(page);
  await page.locator('#btn-create').click();
  await expect(page.locator('#new-error')).toContainText('名前');
  await expect(page.locator('#app')).toBeHidden();

  await page.locator('#new-name').fill('たろう');
  await page.locator('#new-pass').fill('abc');
  await page.locator('#btn-create').click();
  await expect(page.locator('#new-error')).toContainText('パスワード');
  await expect(page.locator('#memo')).toBeHidden();
});

test('新規作成すると、名前・パスワード・バックアップコードを控える画面が出る', async ({ page }) => {
  await openGate(page);
  await page.locator('#new-name').fill(USER);
  await page.locator('#new-pass').fill(PASS);
  await page.locator('#btn-create').click();

  await expect(page.locator('#memo')).toBeVisible();
  await expect(page.locator('#memo-name')).toHaveText(USER);
  await expect(page.locator('#memo-pass')).toHaveText(PASS);
  const code = await page.locator('#memo-code').inputValue();
  expect(code.length).toBeGreaterThan(20);

  // 控えるまで先へ進めない
  await expect(page.locator('#btn-memo-done')).toBeDisabled();
  await page.locator('#memo-ok').check();
  await expect(page.locator('#btn-memo-done')).toBeEnabled();
  await page.locator('#btn-memo-done').click();
  await dismissBonus(page);
  await ready(page);
  await expect(page.locator('#hud-user')).toContainText(USER);
});

test('ログアウトして、同じ名前とパスワードで続きから遊べる', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  await catchOne(page);
  const before = await stateOf(page);

  await page.locator('#btn-logout').click();
  await expect(page.locator('#gate')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();

  await page.locator('#gate-tab-load').click();
  await page.locator('#load-name').fill(USER);
  await page.locator('#load-pass').fill(PASS);
  await page.locator('#btn-login').click();
  await dismissBonus(page);
  await ready(page);

  const after = await stateOf(page);
  expect(after.xp).toBe(before.xp);
  expect(after.catches).toBe(before.catches);
});

test('パスワードが違うとログインできない', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  await page.locator('#btn-logout').click();

  await page.locator('#gate-tab-load').click();
  await page.locator('#load-name').fill(USER);
  await page.locator('#load-pass').fill('chigaupass');
  await page.locator('#btn-login').click();
  await expect(page.locator('#load-error')).toContainText('パスワード');
  await expect(page.locator('#app')).toBeHidden();

  await page.locator('#load-name').fill('いないひと');
  await page.locator('#load-pass').fill(PASS);
  await page.locator('#btn-login').click();
  await expect(page.locator('#load-error')).toContainText('データがありません');
});

test('アカウントごとにデータが分かれる', async ({ page }) => {
  await openGate(page);
  await signUp(page, 'いちろう', 'passwordA');
  await catchOne(page);
  expect((await stateOf(page)).catches).toBe(1);

  await page.locator('#btn-logout').click();
  await signUp(page, 'じろう', 'passwordB');
  expect((await stateOf(page)).catches).toBe(0);
  await expect(page.locator('#hud-user')).toContainText('じろう');

  await page.locator('#btn-logout').click();
  await expect(page.locator('#saved-list')).toContainText('いちろう');
  await expect(page.locator('#saved-list')).toContainText('じろう');
});

test('バックアップコードで別の環境へ持ち出せる', async ({ page, context }) => {
  await openGate(page);
  await signUp(page);
  await catchOne(page);
  const before = await stateOf(page);

  await page.locator('#tab-records').click();
  const code = await page.locator('#backup-code').inputValue();
  expect(code.length).toBeGreaterThan(20);

  // まっさらな別タブ（= 別環境のつもり）へ復元する
  const other = await context.newPage();
  await other.goto('/?reset=1&debug=1');
  await expect(other.locator('#gate')).toBeVisible();
  await other.locator('.gate-restore summary').click();
  await other.locator('#restore-code').fill(code);
  await other.locator('#btn-restore').click();
  await dismissBonus(other);
  await ready(other);

  const after = await stateOf(other);
  expect(after.xp).toBe(before.xp);
  expect(after.catches).toBe(before.catches);
  await expect(other.locator('#hud-user')).toContainText(USER);
  await other.close();
});

test('壊れたバックアップコードは理由を出して止まる', async ({ page }) => {
  await openGate(page);
  await page.locator('.gate-restore summary').click();
  await page.locator('#restore-code').fill('これはコードではありません');
  await page.locator('#btn-restore').click();
  await expect(page.locator('#restore-error')).toContainText('読み取れません');
  await expect(page.locator('#app')).toBeHidden();
});

test('リロードしてもログインしたまま続きから始まる', async ({ page }) => {
  await openGate(page);
  await signUp(page);
  await catchOne(page);
  const before = await stateOf(page);

  await page.goto('/?debug=1');
  await dismissBonus(page);
  await ready(page);
  await expect(page.locator('#gate')).toBeHidden();
  expect((await stateOf(page)).xp).toBe(before.xp);
});
