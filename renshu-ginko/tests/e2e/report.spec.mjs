// メンター用の学習レポート
import { test, expect } from '@playwright/test';
import { onboard } from './helpers.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('メンター用レポート: 書き出したファイルを、メンターが読み込んで見られる。ダッシュボードにもモードの記録が出る', async ({ page }) => {
  // 渡すファイルは英数字だけのパスに置く（日本語の長いテスト名のフォルダだと、ファイルの選択が黙って空になった）
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rga-report-'));
  await onboard(page);
  await page.goto('/#/dashboard');
  await expect(page.locator('#dash-modes')).toContainText('ハッカソン');
  await page.click('#dash-report');
  await expect(page.locator('#report-mine')).toContainText('テスト新人');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#report-export')]);
  const file = path.join(dir, 'report.json');
  await dl.saveAs(file);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.format).toBe('renshu-ginko-report');
  // メンター側: 受け取ったファイルを読み込む（壊れたファイルは断る）
  const bad = path.join(dir, 'bad.json');
  fs.writeFileSync(bad, '{"hello": 1}');
  await page.setInputFiles('#report-import', bad);
  await expect(page.locator('#toast')).toContainText('学習レポートではありません');
  await page.setInputFiles('#report-import', file);
  await expect(page.locator('#report-received')).toContainText('受け取ったレポート');
  await expect(page.locator('#report-received')).toContainText('テスト新人');
});
