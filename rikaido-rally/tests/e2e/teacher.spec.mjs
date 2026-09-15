import { test, expect } from '@playwright/test';
import { openTeacher, open } from './fixtures.mjs';

const MATERIAL = `# 社内の情報取扱いルール

## 1. 機密区分

機密区分とは、情報の重要度に応じて取扱いの厳しさを決めるための分類です。当社では極秘・秘・社外秘・公開の4段階を用いています。
極秘は、漏えいすると会社の存続に関わる情報を指します。役員会の議事録や、未公表の買収案件がこれにあたります。
社外秘は、社内では自由に閲覧してよいが社外に出してはいけない情報です。
区分は作成した本人が付けるため、迷った場合は上位の区分を選びます。

## 2. 持ち出しの手続き

秘以上の情報を社外に持ち出す場合、事前に所属長の承認が必要です。
承認を得ずに持ち出すと、情報の行き先が記録に残らないため、漏えいが起きたときに範囲を特定できません。
持ち出しの申請では、まず申請書に対象の情報と持ち出し先を書き、次に所属長の承認を受け、最後に情報システム部に届け出ます。

## 3. 事故が起きたとき

情報の紛失や誤送信に気づいたときは、直ちに情報システム部へ連絡します。
連絡が遅れるほど被害は広がるため、自分で解決しようとしてはいけません。
誤送信の場合は、送信先に削除を依頼したうえで、送信内容と宛先の記録を残します。`;

const upload = (page, name, body, mime = 'text/markdown') =>
  page.setInputFiles('#file', { name, mimeType: mime, buffer: Buffer.from(body) });

test('資料を貼り付けてテストを作り、保存して、受講者の画面から出題できる', async ({ page }) => {
  const ctx = await openTeacher(page);

  await page.fill('#source-text', MATERIAL);
  await page.fill('#bank-name', '情報取扱い');
  await page.fill('#rubric', '機密区分の考え方と、持ち出し・事故時の手続きを、理由まで含めて説明できる。');
  await ctx.tap(page.locator('#generate'));

  const report = page.locator('#gen-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('単元');
  // 採点基準と出典が、作った時点で見えている
  await expect(report.locator('.qpreview').first()).toContainText('必須');
  await expect(report.locator('.qpreview').first()).toContainText('出典');

  await ctx.tap(page.locator('#save-bank'));
  await expect(page.locator('#gen-status')).toContainText('保存しました');

  const banks = await ctx.banks();
  const made = banks.find((b) => b.origin === 'authored');
  expect(made, '作った問題集が一覧に入っていない').toBeTruthy();
  expect(made.name).toBe('情報取扱い');

  // 受講者の画面へ回し、実際に出題されるところまで見る
  await ctx.tap(page.locator('.bankrow[data-bank="' + made.id + '"] [data-act="use"]'));
  await expect(page.locator('#screen-learner')).toBeVisible();
  await expect(page.locator('.msg.q')).toHaveCount(1);
  const s = await ctx.session();
  expect(s.bankId).toBe(made.id);
  expect(ctx.errors).toEqual([]);
});

test('作った問題は、模範解答で必ず通る', async ({ page }) => {
  const ctx = await openTeacher(page);
  await page.fill('#source-text', MATERIAL);
  await page.fill('#bank-name', '情報取扱い2');
  await ctx.tap(page.locator('#generate'));
  await ctx.tap(page.locator('#save-bank'));

  const made = (await ctx.banks()).find((b) => b.origin === 'authored');
  await ctx.tap(page.locator('.bankrow[data-bank="' + made.id + '"] [data-act="use"]'));

  for (let i = 0; i < 5; i++) {
    await page.fill('#answer', await ctx.model());
    await page.click('#submit');
    await expect(page.locator('.msg.ok').nth(i)).toBeVisible();
    const next = page.locator('#next');
    if (await next.isVisible()) await ctx.tap(next);
    else await ctx.tap(page.locator('#finish'));
  }
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('.gradebox .big')).toHaveText('A');
  expect(ctx.errors).toEqual([]);
});

test('ファイルを読み込むと、何として読んだかと文字数が出る', async ({ page }) => {
  const ctx = await openTeacher(page);
  await upload(page, 'ルール.md', MATERIAL);

  const row = page.locator('#extracted .file').first();
  await expect(row).toContainText('ルール.md');
  await expect(row).toContainText('markdown');
  await expect(row).toContainText('utf-8');
  await expect(page.locator('#source-text')).toHaveValue(/機密区分/);
  await expect(page.locator('#bank-name')).toHaveValue('ルール');
  expect(ctx.errors).toEqual([]);
});

test('読めないファイルは、理由を出すだけで画面は壊れない', async ({ page }) => {
  const ctx = await openTeacher(page);
  const junk = Buffer.from(Array.from({ length: 400 }, (_, i) => i % 7));
  await page.setInputFiles('#file', { name: 'なぞ.bin', mimeType: 'application/octet-stream', buffer: junk });

  await expect(page.locator('#extracted .err')).toContainText('読めませんでした');
  await expect(page.locator('#source-text')).toHaveValue('');
  // 画面は生きている
  await page.fill('#source-text', MATERIAL);
  await ctx.tap(page.locator('#generate'));
  await expect(page.locator('#gen-report')).toBeVisible();
  expect(ctx.errors).toEqual([]);
});

test('資料が無いまま作ろうとすると、作らずに理由を出す', async ({ page }) => {
  const ctx = await openTeacher(page);
  await ctx.tap(page.locator('#generate'));
  await expect(page.locator('#gen-status')).toContainText('資料を読み込む');
  await expect(page.locator('#gen-report')).toBeHidden();
  expect(ctx.errors).toEqual([]);
});

test('Claude 経路は、生成サーバーが無いことを隠さずに伝える', async ({ page }) => {
  const ctx = await openTeacher(page);
  await page.selectOption('#engine', 'claude');
  // 静的配信サーバーは鍵を持っていないと正直に答える
  await expect(page.locator('#engine-note')).toContainText('ANTHROPIC_API_KEY');

  await page.fill('#source-text', MATERIAL);
  await ctx.tap(page.locator('#generate'));
  await expect(page.locator('#gen-status')).toContainText('ANTHROPIC_API_KEY');
  await expect(page.locator('#gen-report')).toBeHidden();
  expect(ctx.errors).toEqual([]);
});

test('JSON で書き出した問題集を、読み込み直せる', async ({ page }) => {
  const ctx = await openTeacher(page);
  const bank = await page.evaluate(() => JSON.parse(JSON.stringify(window.RR.app.registry.get('java'))));
  bank.id = 'imported-test';
  bank.name = '読み込んだテスト';

  await page.setInputFiles('#import-file', {
    name: 'bank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bank))
  });
  await expect(page.locator('#import-note')).toContainText('読み込んだテスト');
  expect((await ctx.banks()).some((b) => b.id === 'imported-test')).toBe(true);
  expect(ctx.errors).toEqual([]);
});

test('壊れた JSON は取り込まない', async ({ page }) => {
  const ctx = await openTeacher(page);
  await page.setInputFiles('#import-file', {
    name: 'bad.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ id: 'x', units: [{ id: 'u1', label: 'a' }], questions: [{ id: 'q', unit: 'u1' }] }))
  });
  await expect(page.locator('#import-note')).toContainText(/読み込めませんでした|問題集の形/);
  expect((await ctx.banks()).some((b) => b.id === 'x')).toBe(false);
  expect(ctx.errors).toEqual([]);
});

test('同梱の問題集は消せない。作ったものだけ消せる', async ({ page }) => {
  const ctx = await openTeacher(page);
  await expect(page.locator('.bankrow[data-bank="java"] [data-act="delete"]')).toHaveCount(0);

  await page.fill('#source-text', MATERIAL);
  await page.fill('#bank-name', '消す用');
  await ctx.tap(page.locator('#generate'));
  await ctx.tap(page.locator('#save-bank'));
  const made = (await ctx.banks()).find((b) => b.origin === 'authored');

  page.once('dialog', (d) => d.accept());
  await ctx.tap(page.locator('.bankrow[data-bank="' + made.id + '"] [data-act="delete"]'));
  expect((await ctx.banks()).some((b) => b.id === made.id)).toBe(false);
  expect(ctx.errors).toEqual([]);
});

test('作ったテストは、開き直しても残っている', async ({ page }) => {
  const ctx = await openTeacher(page);
  await page.fill('#source-text', MATERIAL);
  await page.fill('#bank-name', '残るテスト');
  await ctx.tap(page.locator('#generate'));
  await ctx.tap(page.locator('#save-bank'));

  const before = (await ctx.banks()).find((b) => b.origin === 'authored').id;
  const after = await open(page, { bank: before });
  expect((await after.banks()).some((b) => b.id === before)).toBe(true);
  expect((await after.session()).bankId).toBe(before);
});
