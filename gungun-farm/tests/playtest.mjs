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
/**
 * 途中のレベルから始める。
 * 最初から回すと3分ではレベル4までしか行かず、**ふなびん（Lv7）や後半の施設を
 * 一度も踏まないまま「0 issues」になる**。後半だけを見たいときに使う。
 */
const START_LEVEL = Number(opt('level', 0));
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

  if (START_LEVEL > 1) {
    await page.evaluate((lv) => {
      const s = window.GF.game.state, E = window.GF.Engine, D = window.GF.Data;
      s.level = lv; s.xp = 0; s.xpNext = D.xpFor(lv);
      s.coins = 4000; s.barnUp = 4;
      s.fieldsOwned = Math.min(D.FIELD_SLOTS, D.FIELDS_AT_START + Math.floor(lv / 3));
      for (const def of D.machinesAt(lv)) if (!E.ownsMachine(s, def.id)) s.machines.push({ id: def.id, queue: [], done: 0 });
      window.GF.refresh();
    }, START_LEVEL);
  }
  console.log(`通しプレイ開始（農園の中で ${MINUTES}分 / 時間の倍率 ${SPEED}倍` +
    (START_LEVEL > 1 ? ` / Lv${START_LEVEL}から` : '') + '）');

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
        machines: st.machines.length, fields: st.fieldsOwned,
        // 畑をひと回し植え直すのに要るタネ代。**畑が1秒で回るので、ここが毎秒出ていく**
        seedRound: (window.GF.Data.crop(g.ui.seed) || { cost: 0 }).cost * st.fieldsOwned
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
    return { level: st.level, coins: Math.floor(st.coins), ...st.stats, bestCombo: st.bestCombo,
             boatHere: !!st.boat, boatLoaded: st.boat ? Object.values(st.boat.loaded).reduce((a, b) => a + b, 0) : 0 };
  });

  // 遊び終わった画面が崩れていないかも見る
  const over = await page.evaluate(() => ({
    y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    x: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }));
  if (over.y > 1) note(`たてにはみ出している: ${over.y}px`);
  if (over.x > 1) note(`よこにはみ出している: ${over.x}px`);
  if (final.rescues > 0) note(`救済が ${final.rescues}回 発動した（経済のどこかが詰まっている）`);
  // 「配達0件」だけを見るとフレーキーになる。短い回では、注文が大きいと
  // 2分で1件も揃わないことが実際にある（それ自体は壊れていない）。
  // 注文まわりの進みが**どれも**無いときだけ問題にする。
  if (final.delivered === 0 && final.shipped === 0 && (final.boatLoaded || 0) === 0) {
    note('注文もふなびんも一切進まなかった（届ける道が通っていない）');
  }
  if (final.crafted === 0) note('一度も加工できなかった（こうぼうが画面から使えていない）');
  // 積みかけの船が残っているのは普通（出港も期限切れもしていないだけ）。
  // 「一度も来なかった」ことだけを問題にする
  if (START_LEVEL >= 7 && !final.boatHere && final.shipped === 0 && final.boatMissed === 0) {
    note('ふなびんが一度も来なかった（Lv7以降なら来るはず）');
  }
  if (START_LEVEL >= 7 && final.shipped === 0 && final.boatLoaded === 0) {
    note('ふなびんに一度も積めなかった（画面から積む道が通っていない）');
  }

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

  // 1. 主ボタン。実ったものを収穫して、その場に植え直す
  await click('#btn-harvest');

  // 2. 副ボタン。出来たものを取り出して、余った材料で仕込む
  await click('#btn-work');

  // 3. ちゅうもん。届けられるものは全部届け、ふなびんに積めるだけ積む
  await tab('order');
  for (let i = 0; i < 3; i++) if (!await click('.order .go:not([disabled])')) break;
  await click('.boat .boat-go:not([disabled])');      // つむ
  await click('.boat .boat-go:not([disabled])');      // 満載ならしゅっこう

  // 4. みせ。詰まりかけと、タネ代が心もとないときに寄る。
  //    売るのは安いもの（一覧の末尾）から。高いものは注文に使いたい。
  //
  //    **閾値は「ひと回しぶんのタネ代」で見る。** ここを「コイン5未満」のままにしていて、
  //    畑が1秒で回るようになったとき Lv12 で資金が尽きて手が止まった
  //    （倉庫にはまだ93個あったのに、売る判断に入らなかった）。
  if (s.used >= s.cap - 2 || s.coins < s.seedRound * 2) {
    await tab('shop');
    await click('.seg-btn[data-id="sell"]');
    if (s.used >= s.cap - 2) {
      await click('.seg-btn[data-id="buy"]');
      await click('.card[data-act="buy-barn"]:not(.off)');
      await click('.seg-btn[data-id="sell"]');
    }
    for (let i = 0; i < 6; i++) {
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
  if (round % 5 === 0) {
    // 注文 → ふなびん → きょうの作物 の順に畑を向ける。無ければいちばん格上を選ぶ。
    // （船は量を求めるので、畑ごと向けないといつまでも埋まらない）
    const wanted = await page.evaluate(() => {
      const st = window.GF.game.state, E = window.GF.Engine, D = window.GF.Data;
      const crops = D.cropsAt(st.level);
      // 1. 開いている注文が欲しがっている作物（期限が短いので先に見る）
      const want = E.reservedForOrders(st);
      const ordered = crops.find((c) => (want[c.id] || 0) > (st.barn[c.id] || 0));
      if (ordered) return ordered.id;
      // 2. ふなびんがいちばん待っている作物
      if (st.boat) {
        let worst = 0, pick = null;
        for (const c of crops) {
          const need = E.boatNeed(st.boat, c.id) - (st.barn[c.id] || 0);
          if (need > worst) { worst = need; pick = c.id; }
        }
        if (pick) return pick;
      }
      // 3. きょうの作物（もうけが上がっているので、余りを売る筋がいちばん太い）
      const today = E.todayCrop(st);
      if (today && crops.some((c) => c.id === today)) return today;
      return null;
    }).catch(() => null);

    await tab('seed');
    if (wanted) {
      await click(`.card[data-act="seed"][data-id="${wanted}"]:not(.off)`);
    } else {
      const seeds = page.locator('.card[data-act="seed"]:not(.off)');
      const n = await seeds.count();
      if (n) await seeds.nth(n - 1).click({ timeout: 2000 }).catch(() => {});
    }
  }
}

async function snap(page, name) {
  if (!KEEP) return;
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
