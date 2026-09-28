/**
 * 実ブラウザで1局を通しプレイして、遊びとして壊れていないかを見るハーネス。
 *
 * テストと違うのは「何が起きるか分からない状態で最後まで遊ぶ」こと。
 * 決められた局面を確かめる E2E では見つからない種類の問題
 *   ・操作できる手が無くなって進めなくなる（詰み）
 *   ・自分の手番なのにボタンが全部押せない
 *   ・横スクロールの発生、操作列が画面外へ出る
 *   ・JSエラー
 * を拾う。人の手番の判断はページ内の AI にさせるので、まともな進行になる。
 *
 *   node tests/playtest.mjs                 # 既定のシナリオを全部
 *   node tests/playtest.mjs --games 5       # 局数を増やす
 *   node tests/playtest.mjs --keep          # スクリーンショットを残す
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PLAYTEST_PORT || 8099);
const BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(ROOT, 'playtest-shots');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i === -1 ? fallback : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true);
};
const GAMES = Number(flag('games', 3));
const KEEP = !!flag('keep', false);

const MAX_STEPS = 400;        // 1局の操作回数の上限
const WAIT_LIMIT = 120;       // 相手の手番を待つ上限（1回 100ms）

/** 静的サーバーを立てる（E2Eと同じ serve.mjs を使う） */
function startServer() {
  const proc = spawn(process.execPath, [path.join(ROOT, 'tests', 'serve.mjs')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('サーバーが起動しない')), 10000);
    proc.stdout.on('data', (b) => {
      if (String(b).includes('serving')) { clearTimeout(timer); resolve(proc); }
    });
    proc.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** いまの状態を取り出す（描画ではなく状態を見て判断する） */
const readState = (page) => page.evaluate(() => {
  const g = window.GA.game;
  const s = g.state;
  return {
    busy: g.busy,
    phase: s.phase,
    round: s.round,
    turn: s.turn,
    winner: s.winner,
    logLen: s.events,      // 表示用の log は300件で打ち切られるので総数を見る
    myTurn: s.phase === 'turn' && s.players[s.turn].isHuman,
    iAmOut: !s.players.find((p) => p.isHuman).alive,
    myDefense: s.phase === 'defense'
      && s.players[s.pending.targetId].isHuman && !g.settings.autoDefend,
    recoveries: g.recoveries,
    watchTicks: g.watchTicks,
    gen: g.gen,
    players: s.players.map((p) => ({
      name: p.name, hp: p.hp, alive: p.alive, hand: p.hand.length,
      isHuman: p.isHuman, status: p.status.map((st) => st.id)
    }))
  };
});

/** ページ内の AI に「人の手」を決めさせる */
const decideAction = (page) => page.evaluate(() =>
  JSON.parse(JSON.stringify(window.GA.AI.chooseAction(window.GA.game.state, 'normal'))));

const decideDefense = (page) => page.evaluate(() =>
  JSON.parse(JSON.stringify(window.GA.AI.chooseDefense(window.GA.game.state, 'normal'))));

const needsTarget = (page, uid) => page.evaluate((u) => {
  const me = window.GA.game.state.players.find((p) => p.isHuman);
  const item = me.hand.find((i) => i.uid === u);
  return !!item && window.GA.Items.needsTarget(item);
}, uid);

/** 画面の作りとして壊れていないかを毎手ごとに見る */
async function inspectLayout(page, report, label) {
  const box = await page.evaluate(() => {
    const bar = document.querySelector('.actionbar');
    const r = bar ? bar.getBoundingClientRect() : null;
    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      barBottom: r ? r.y + r.height : 0,
      viewH: window.innerHeight,
      hint: (document.querySelector('#hint') || {}).textContent || ''
    };
  });
  if (box.overflow > 1) report.add('横スクロールが発生', `${label} overflow=${box.overflow}px`);
  if (box.barBottom > box.viewH) {
    report.add('操作列が画面外に出た', `${label} bottom=${Math.round(box.barBottom)} > ${box.viewH}`);
  }
}

class Report {
  constructor() { this.issues = []; this.notes = []; }
  add(kind, detail) { this.issues.push({ kind, detail }); }
  note(text) { this.notes.push(text); }
  get ok() { return this.issues.length === 0; }
}

/** カードを押す。押せない状態なら不具合として記録する。 */
async function clickCard(page, uid, report, label) {
  const card = page.locator(`.card[data-uid="${uid}"]`);
  if (!(await card.count())) { report.add('手札のカードが画面に無い', `${label} uid=${uid}`); return false; }
  if (await card.isDisabled()) {
    const cls = await card.getAttribute('class');
    report.add('選ぶべきカードが押せない', `${label} uid=${uid} class=${cls}`);
    return false;
  }
  await card.click();
  return true;
}

async function clickButton(page, sel, report, label) {
  const btn = page.locator(sel);
  if (await btn.isDisabled() || await btn.isHidden()) {
    report.add('押すべきボタンが押せない', `${label} ${sel}`);
    return false;
  }
  await btn.click();
  return true;
}

/** 1局を通しで遊ぶ */
async function playOne(browser, scenario, report) {
  const context = await browser.newContext(scenario.device || {});
  const page = await context.newPage();
  // 非同期処理の中で投げられた例外は pageerror に出ないことがある。
  // これを取り落とすと「進行が止まった」だけが見えて原因が分からなくなる。
  await page.addInitScript(() => {
    window.__rejections = [];
    window.addEventListener('unhandledrejection', (ev) => {
      const r = ev.reason;
      window.__rejections.push(String((r && (r.stack || r.message)) || r));
    });
  });
  page.on('pageerror', (e) => report.add('JSエラー', `${scenario.name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') report.add('consoleエラー', `${scenario.name}: ${m.text()}`);
  });

  const params = new URLSearchParams({ speed: 'fast', sound: 'off', ...scenario.query });
  await page.goto(`${BASE}/?${params}`);
  await page.waitForSelector('#hand');

  let steps = 0, lastLog = -1, sameLog = 0;
  let shot = 0;
  const snap = async (tag) => {
    if (!KEEP) return;
    await page.screenshot({ path: path.join(SHOTS, `${scenario.slug}-${String(++shot).padStart(2, '0')}-${tag}.png`), fullPage: false });
  };
  await snap('start');

  while (steps < MAX_STEPS) {
    let st = await readState(page);
    if (st.phase === 'over') break;

    // 自分が敗退したら、あとはAI同士の決着を見届けるだけになる。
    // 「待っても自分の番が来ない」のは正常なので、観戦に切り替える。
    if (st.iAmOut) {
      report.note(`${scenario.name}: 自分は ${steps}手目で敗退。以降は観戦`);
      let spectate = 0;
      while (st.phase !== 'over' && spectate++ < 1200) {
        await sleep(100);
        st = await readState(page);
      }
      if (st.phase !== 'over') {
        report.add('観戦中に決着しなくなった', `${scenario.name}: logLen=${st.logLen}`);
      }
      break;
    }

    // 相手の手番と演出の間は待つ
    let waited = 0;
    while ((st.busy || (!st.myTurn && !st.myDefense)) && st.phase !== 'over') {
      await sleep(100);
      st = await readState(page);
      if (st.phase === 'over' || st.iAmOut) break;
      if (++waited > WAIT_LIMIT) {
        const rejections = await page.evaluate(() => window.__rejections.slice());
        for (const r of rejections) report.add('非同期処理が例外で止まった', `${scenario.name}: ${r.split('\n')[0]}`);
        report.add('進行が止まった',
          `${scenario.name}: phase=${st.phase} turn=${st.turn} busy=${st.busy}`
          + ` 見張り番=${st.watchTicks}回 復帰=${st.recoveries}回 世代=${st.gen}`);
        await snap('stalled');
        await context.close();
        return;
      }
    }
    if (st.phase === 'over') break;
    if (st.iAmOut) continue;

    if (st.logLen === lastLog) {
      if (++sameLog > 6) {
        const rejections = await page.evaluate(() => window.__rejections.slice());
        for (const r of rejections) report.add('非同期処理が例外で止まった', `${scenario.name}: ${r.split('\n')[0]}`);
        report.add('操作しても進まない', `${scenario.name}: logLen=${st.logLen} phase=${st.phase}`);
        await snap('nogress');
        await context.close();
        return;
      }
    } else { sameLog = 0; lastLog = st.logLen; }

    const label = `${scenario.name} R${st.round}/${steps}`;
    await inspectLayout(page, report, label);

    if (st.myDefense) {
      const uids = await decideDefense(page);
      let ok = true;
      for (const uid of uids) ok = (await clickCard(page, uid, report, label)) && ok;
      if (shot < 3) await snap('defense');
      await clickButton(page, uids.length && ok ? '#btn-guard' : '#btn-take', report, label);
    } else {
      // 自分の手番。押せる手が一つも無ければ詰み。
      const enabled = await page.evaluate(() => ['#btn-attack', '#btn-use', '#btn-pray']
        .filter((sel) => { const b = document.querySelector(sel); return b && !b.hidden && !b.disabled; }));
      const act = await decideAction(page);

      if (act.type === 'attack') {
        for (const uid of act.uids) await clickCard(page, uid, report, label);
        await page.locator(`#opponents .pcard[data-player="${act.targetId}"]`).click();
      } else if (act.type === 'use') {
        await clickCard(page, act.uid, report, label);
        if (await needsTarget(page, act.uid)) {
          await page.locator(`#opponents .pcard[data-player="${act.targetId}"]`).click();
        } else {
          await clickButton(page, '#btn-use', report, label);
        }
      } else {
        if (!enabled.includes('#btn-pray')) {
          report.add('自分の手番なのに打つ手が無い', `${label} enabled=${enabled.join(',') || 'なし'}`);
          await snap('deadend');
          await context.close();
          return;
        }
        await clickButton(page, '#btn-pray', report, label);
      }
    }
    steps++;
    await sleep(60);
  }

  const rejections = await page.evaluate(() => window.__rejections.slice());
  for (const r of rejections) report.add('非同期処理が例外で止まった', `${scenario.name}: ${r.split('\n')[0]}`);

  const st = await readState(page);
  if (st.phase !== 'over') {
    report.add('上限手数までに決着しない', `${scenario.name}: ${steps}手 / ${MAX_STEPS}`);
  } else {
    // 決着の表示は最後の演出が終わってから出る。見に行くのが早すぎると
    // マークアップの初期値を読んでしまうので、出るまで待つ。
    let shown = false;
    for (let i = 0; i < 60 && !shown; i++) {
      shown = await page.locator('#overlay').isVisible();
      if (!shown) await sleep(150);
    }
    if (!shown) report.add('決着したのに結果が出ない', `${scenario.name}: 9秒待っても出ない`);
    const title = shown ? await page.locator('#overlay-title').textContent().catch(() => '') : '—';
    report.note(`${scenario.name}: ${steps}手で決着（${title}） HP=${st.players.map((p) => `${p.name}:${p.hp}`).join(' ')}`
      + (st.recoveries ? `  ※進行の取りこぼしから ${st.recoveries} 回復帰` : ''));
    if (st.recoveries > 6) {
      report.add('進行の取りこぼしが多すぎる', `${scenario.name}: ${st.recoveries}回`);
    }
  }
  await snap('end');
  await context.close();
}

async function main() {
  await fs.rm(SHOTS, { recursive: true, force: true });
  if (KEEP) await fs.mkdir(SHOTS, { recursive: true });

  const server = await startServer();
  // ブラウザの取得が封じられた環境では PW_CHROMIUM で実行ファイルを指定する
  const browser = await chromium.launch(
    process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  const report = new Report();

  const scenarios = [];
  for (let i = 0; i < GAMES; i++) {
    const seed = String(1000 + i * 137);
    scenarios.push({
      name: `タイマン seed=${seed}`, slug: `duel-${seed}`,
      query: { seed, opponents: '1', level: 'hard' }
    });
    scenarios.push({
      name: `5人乱戦 seed=${seed}`, slug: `melee-${seed}`,
      query: { seed, opponents: '5', level: 'normal' }
    });
    scenarios.push({
      name: `スマホ seed=${seed}`, slug: `mobile-${seed}`,
      device: devices['Pixel 5'],
      query: { seed, opponents: '3', level: 'normal' }
    });
  }

  for (const scenario of scenarios) {
    try {
      await playOne(browser, scenario, report);
    } catch (e) {
      report.add('通しプレイが例外で落ちた', `${scenario.name}: ${e.message}`);
    }
  }

  await browser.close();
  server.kill();

  console.log('\n=== 通しプレイの結果 ===');
  for (const n of report.notes) console.log('  ・' + n);
  if (report.ok) {
    console.log(`\n問題なし — ${scenarios.length}局を通しプレイ (0 issues)`);
    process.exit(0);
  }
  console.log(`\n見つかった問題 ${report.issues.length}件:`);
  const grouped = new Map();
  for (const i of report.issues) {
    if (!grouped.has(i.kind)) grouped.set(i.kind, []);
    grouped.get(i.kind).push(i.detail);
  }
  for (const [kind, details] of grouped) {
    console.log(`\n  ✘ ${kind} (${details.length}件)`);
    for (const d of details.slice(0, 5)) console.log(`      ${d}`);
    if (details.length > 5) console.log(`      … ほか${details.length - 5}件`);
  }
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(2); });
