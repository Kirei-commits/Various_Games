/**
 * 主要な画面のスクリーンショットを撮る。
 *
 * 通しプレイ（playtest.mjs）が「壊れていないか」を見るのに対して、
 * これは「見て分かるか」を自分で確かめるためのもの。
 * 一画面に収まっているか、文字があふれていないか、内訳が読めるかを目で見る。
 *
 *   node tests/shots.mjs              # shots/ に出力
 *   PW_CHROMIUM=... node tests/shots.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SHOTS_PORT || 8071);
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = path.join(ROOT, 'shots');

const server = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.mjs')], {
  env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe']
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`ポート ${PORT} でサーバーが起動しない`)), 10000);
  server.stdout.on('data', (b) => { if (String(b).includes('serving')) { clearTimeout(timer); resolve(); } });
  server.on('error', reject);
});

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

const setHand = (page, list) => page.evaluate((l) => {
  const g = window.GA.game;
  const me = g.state.players.find((p) => p.isHuman);
  me.hand = l.map((id) => window.GA.Items.instantiate(id));
  g.ui.selected.clear();
  window.GA.refresh();
}, list);

async function shot(name, device, query, prep) {
  const context = await browser.newContext(device || {});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/?${new URLSearchParams({ speed: 'fast', sound: 'off', ...query })}`);
  await page.waitForSelector('#hand');
  await page.waitForTimeout(400);
  if (prep) await prep(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollHeight - document.documentElement.clientHeight);
  await context.close();
  console.log(`${name}  はみ出し ${overflow}px  ${errors.length ? 'JSエラー: ' + errors.join(' / ') : ''}`);
  return { overflow, errors };
}

const MOBILE = devices['Pixel 5'];
const DESKTOP = { viewport: { width: 1280, height: 800 } };

const results = [];
results.push(await shot('mobile-start', MOBILE, { seed: '7', opponents: '3' }));
results.push(await shot('mobile-melee', MOBILE, { seed: '7', opponents: '5' }, async (page) => {
  await setHand(page, ['cannon', 'inferno', 'hailstorm', 'pike', 'assassin', 'twinblade',
    'armor', 'aegis', 'backfire', 'herb', 'cure', 'poisonmist']);
  await page.evaluate(() => {
    for (const p of window.GA.game.state.players) {
      if (!p.isHuman) p.status = [{ id: 'poison', turns: 3, power: 4 }];
    }
    window.GA.refresh();
  });
}));
results.push(await shot('mobile-defense', MOBILE, { seed: '7', opponents: '1', level: 'hard' }, async (page) => {
  await setHand(page, []);
  await page.evaluate(() => {
    const s = window.GA.game.state;
    s.players[1].hand = ['inferno', 'chainbolt', 'pike'].map((id) => window.GA.Items.instantiate(id));
    window.GA.refresh();
  });
  await page.locator('#btn-pray').click();
  await page.waitForFunction(() => window.GA.game.state.phase === 'defense', null, { timeout: 15000 });
  await setHand(page, ['armor', 'flameshield', 'backfire']);
  await page.locator('#hand .card').first().click();
}));
results.push(await shot('mobile-drawer', MOBILE, { seed: '7', opponents: '3' }, async (page) => {
  await page.locator('#btn-log').click();
}));
results.push(await shot('desktop-start', DESKTOP, { seed: '7', opponents: '3' }));

await browser.close();
server.kill();

const bad = results.filter((r) => r.overflow > 1 || r.errors.length);
if (bad.length) {
  console.error(`\n✘ 一画面に収まっていない、またはJSエラーのある画面が ${bad.length} 件`);
  process.exit(1);
}
console.log(`\nOK — ${results.length}枚撮影、すべて一画面に収まっている`);
