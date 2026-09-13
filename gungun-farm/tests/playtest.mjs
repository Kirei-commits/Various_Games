/**
 * 通しプレイ。実ブラウザで、画面のボタンだけを押して農園を回す。
 *
 * E2Eは「決めた局面が期待どおりか」を見る。こちらは「最後まで遊べるか」を見る。
 * 画面から押せる道だけで進むので、engine とUIのズレ（押せるのに効かない、
 * 押せないのに進める）がここで出る。
 *
 *   node tests/playtest.mjs --minutes 6 --speed 8
 *   PW_CHROMIUM=/path/to/chrome node tests/playtest.mjs      # ブラウザを取得できない環境
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i === -1 ? d : args[i + 1]; };

const MINUTES = Number(opt('minutes', 3));       // 農園の中で過ごす分数
/**
 * 時間の倍率。**上げすぎると測るものが変わる。**
 * 1周ぶんの操作は Playwright の往復で 300〜600ms かかるので、倍率を10にすると
 * 「1手のあいだに農園が5秒進む」状態になり、人が遊んだときの挙動から離れる
 * （実際、倍率10では加工が5分で3件しか進まず、詰まりの判定が当てにならなかった）。
 */
const SPEED = Number(opt('speed', 3));
const PORT = Number(opt('port', 8083));
const KEEP = args.includes('--keep');            // スクリーンショットを残す
const SHOTS = path.join(ROOT, 'playtest-shots');

const issues = [];
const note = (msg) => { issues.push(msg); console.log('  ⚠ ' + msg); };

/** 静的サーバーを立てる */
function serve() {
  const p = spawn(process.execPath, [path.join(ROOT, 'tests/serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore'
  });
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = serve();
  await sleep(600);

  if (KEEP) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.PW_CHROMIUM || undefined
  });
  const ctx = await browser.newContext({
    viewport: { width: 393, height: 851 }, deviceScaleFactor: 2,
    hasTouch: true, isMobile: true
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => note('JSエラー: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') note('console.error: ' + m.text()); });

  const url = `http://127.0.0.1:${PORT}/?seed=${Date.now() % 100000}&speed=${SPEED}&sound=off&fresh=1&help=off`;
  await page.goto(url);
  await page.waitForSelector('#fields .field');
  console.log(`通しプレイ開始（農園の中で ${MINUTES}分 / 時間の倍率 ${SPEED}倍）`);

  const deadline = MINUTES * 60_000;
  let round = 0;
  let lastProgress = -1;
  let stalled = 0;
  let shot = 0;

  while (true) {
    const s = await page.evaluate(() => {
      const g = window.GF.game;
      const E = window.GF.Engine;
      const st = g.state;
      return {
        now: st.now, over: st.over, level: st.level, coins: Math.floor(st.coins),
        used: E.barnUsed(st), cap: E.barnCap(st),
        progress: st.stats.harvested + st.stats.crafted + st.stats.delivered,
        delivered: st.stats.delivered, expired: st.stats.expired, rescues: st.stats.rescues,
        machines: st.machines.length, fields: st.fieldsOwned
      };
    });
    if (s.now >= deadline || s.over) { await snap(page, 'final'); break; }

    if (s.progress === lastProgress) stalled++; else stalled = 0;
    lastProgress = s.progress;
    if (stalled === 40) note(`進まなくなった（t=${Math.round(s.now / 1000)}秒 Lv${s.level} コイン${s.coins} 倉庫${s.used}/${s.cap}）`);

    await act(page, s, round);

    if (KEEP && round % 25 === 0 && shot < 8) { await snap(page, String(shot++).padStart(2, '0')); }
    round++;
    await sleep(60);
  }

  const final = await page.evaluate(() => {
    const st = window.GF.game.state;
    return { level: st.level, coins: Math.floor(st.coins), ...st.stats, bestCombo: st.bestCombo };
  });

  // 遊び終わった画面が崩れていないかも見る
  const over = await page.evaluate(() => ({
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (over.y > 1) note(`たてにはみ出している: ${over.y}px`);
  if (over.x > 1) note(`よこにはみ出している: ${over.x}px`);
  if (final.rescues > 0) note(`救済が ${final.rescues}回 発動した（経済のどこかが詰まっている）`);
  if (final.delivered === 0) note('1件も届けられなかった');
  if (final.crafted === 0) note('一度も加工できなかった（こうぼうが画面から使えていない）');

  console.log('\n結果:', JSON.stringify(final));
  await browser.close();
  server.kill();

  if (issues.length) {
    console.error(`\n✘ ${issues.length}件の問題`);
    for (const i of issues) console.error('  - ' + i);
    process.exit(1);
  }
  console.log('\n✓ 0 issues');
}

/** 1周ぶんの操作。人が画面を見て触る順番に近づけている */
async function act(page, s, round) {
  const click = async (sel) => {
    const el = page.locator(sel).first();
    if (await el.count() === 0) return false;
    if (await el.isDisabled().catch(() => true)) return false;
    const ok = await el.click({ timeout: 2000 }).then(() => true).catch(() => false);
    return ok;
  };
  const tab = (name) => page.locator(`.tab[data-tab="${name}"]`).click();

  // 1. 実ったら収穫して、空いたら植える（いちばん手数の多い操作）
  await click('#btn-harvest');
  await click('#btn-plant');

  // 2. こうぼう。出来たものを取り出し、材料があれば仕込む
  await tab('work');
  for (let i = 0; i < 12; i++) if (!await click('.card[data-act="machine"]:not(.off)')) break;

  // 3. ちゅうもん。届けられるものは全部届ける
  await tab('order');
  for (let i = 0; i < 3; i++) if (!await click('.order .go:not([disabled])')) break;

  // 4. みせ。詰まりかけと、本当に金欠のときだけ寄る。
  //    売るのは安いもの（一覧の末尾）から。高いものは注文に使いたい。
  if (s.used >= s.cap - 2 || s.coins < 5) {
    await tab('shop');
    await click('.seg-btn[data-id="sell"]');
    if (s.used >= s.cap - 2) {
      await click('.seg-btn[data-id="buy"]');
      await click('.card[data-act="buy-barn"]:not(.off)');
      await click('.seg-btn[data-id="sell"]');
    }
    for (let i = 0; i < 3; i++) {
      const cheapest = page.locator('.card[data-act="sell"]').last();
      if (await cheapest.count() === 0) break;
      await cheapest.click({ timeout: 2000 }).catch(() => {});
    }
  }

  // 5. 設備投資と、タネの見直し
  if (round % 7 === 3) {
    await tab('shop');
    await click('.seg-btn[data-id="buy"]');
    await click('.card[data-act="buy-machine"]:not(.off)');
    await click('.card[data-act="buy-field"]:not(.off)');
  }
  if (round % 12 === 0) {
    await tab('seed');
    const seeds = page.locator('.card[data-act="seed"]:not(.off)');
    const n = await seeds.count();
    if (n) await seeds.nth(n - 1).click({ timeout: 2000 }).catch(() => {});
  }
}

async function snap(page, name) {
  if (!KEEP) return;
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
