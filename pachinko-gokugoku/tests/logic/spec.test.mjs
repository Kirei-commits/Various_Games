// 抽選（src/pure/spec.js）: 理論値が設定どおりか、実際の抽選が理論値どおりに振り分けているか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, drawMany, SETTINGS } from './helpers.mjs';

const mods = load();
const { cfg, Spec } = mods;
const th = Spec.theory(cfg, { prob: 319.6 });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} と ${b} の差が ${tol} を超える`);
const HOT = ['金テロップ以上', '金カットイン', '金タイトル', '役物落下', '金保留以上', 'ステップ5'];

test('当りの個数は 乱数の範囲 / 分母 を丸めたもの（離散化した本当の確率を使う）', () => {
  assert.equal(Spec.threshold(cfg, 319.6), 205);
  assert.equal(Spec.threshold(cfg, 1), cfg.spec.randRange);
  near(th.hitDenom, 319.69, 0.01, '1/319.6 の実際の確率');
});

test('RUSH の当りは目標の継続率から逆算されている', () => {
  const [lo, hi] = cfg.targets.continuation;
  assert.ok(th.continuation >= lo && th.continuation <= hi, `継続率 ${th.continuation}`);
  near(th.continuation, cfg.spec.rush.targetContinuation, 0.001, '目標との差');
  near(th.continuation, 1 - Math.pow(1 - th.rushProb, cfg.spec.rush.stSpins), 1e-12, '式');
  near(th.expectedChains, 1 / (1 - th.continuation), 1e-12, '平均連チャン');
});

test('激熱演出の信頼度は目標以上（1/319.6、先読みカスタムON/OFFとも）', () => {
  for (const preread of [false, true]) {
    const t = Spec.theory(cfg, { prob: 319.6, preread });
    for (const k of HOT) assert.ok(t.cues[k].reliability >= cfg.targets.hotReliability, `${k} の信頼度 ${t.cues[k].reliability}（先読み${preread}）`);
  }
});

test('実際の抽選の当り確率は理論値どおり（40万回）', () => {
  const n = 400000; const hits = drawMany(mods, n, { seed: 11 }).filter(h => h.hit).length;
  const exp = n * th.hitProb, sd = Math.sqrt(exp);
  assert.ok(Math.abs(hits - exp) < 4 * sd, `当り ${hits} 回（期待 ${exp.toFixed(0)}）`);
});

test('当りの振り分け: FEVER 60% / 見せ方 / リーチ / 激熱演出の出現率が理論値どおり', () => {
  const n = 30000, hs = drawMany(mods, n, { seed: 5, force: 'hit' });
  const fever = hs.filter(h => h.kind === 'fever').length / n;
  const [lo, hi] = cfg.targets.feverRate;
  assert.ok(fever >= lo && fever <= hi, `FEVER ${fever}`);
  const fv = hs.filter(h => h.kind === 'fever');
  for (const [route, w] of cfg.spec.feverRoutes) near(fv.filter(h => h.route === route).length / fv.length, w / 100, 0.02, `見せ方 ${route}`);
  for (const r of ['sp', 'normal', 'zenkaiten', 'ippatsu']) near(hs.filter(h => h.sc.reach === r).length / n, th.reach.hit[r], 0.015, `当りのリーチ ${r}`);
  const freq = { '金テロップ以上': h => h.sc.telop >= 2, '金カットイン': h => h.sc.cutin === 2, '金タイトル': h => h.sc.goldTitle, '役物落下': h => h.sc.logoDrop, '金保留以上': h => h.color === 'gold' || h.color === 'rainbow', 'ステップ5': h => h.sc.stepup === 5 };
  for (const k of HOT) near(hs.filter(freq[k]).length / n, th.cues[k].hit, 0.015, `当りでの ${k}`);
});

test('ハズレの振り分け: リーチの出現率が理論値どおり、確定演出は出ない', () => {
  const n = 200000, hs = drawMany(mods, n, { seed: 9, raw: cfg.spec.randRange - 1 });
  assert.ok(hs.every(h => !h.hit));
  near(hs.filter(h => h.sc.reach === 'sp').length / n, th.reach.miss.sp, 0.003, 'ハズレSP');
  near(hs.filter(h => h.sc.reach === 'normal').length / n, th.reach.miss.normal, 0.004, 'ハズレノーマル');
  assert.equal(hs.filter(h => h.color === 'rainbow').length, 0, '虹保留');
  assert.equal(hs.filter(h => h.sc.stepup === 5).length, 0, 'ステップ5');
  assert.equal(hs.filter(h => h.sakibare).length, 0, '先バレ');
  assert.equal(hs.filter(h => h.sc.reach === 'zenkaiten' || h.sc.reach === 'ippatsu').length, 0, '全回転・一発告知');
  assert.ok(hs.filter(h => h.sc.telop >= 2 || h.sc.cutin === 2 || h.sc.goldTitle || h.sc.logoDrop).length <= 3, '金系の演出はほぼ出ない');
});

test('赤・金保留のハズレは必ずSPリーチ', () => {
  const hs = drawMany(mods, 300000, { seed: 13, raw: cfg.spec.randRange - 1 }).filter(h => h.color === 'red' || h.color === 'gold');
  assert.ok(hs.length > 100);
  assert.ok(hs.every(h => h.sc.reach === 'sp'));
});

test('図柄: 当りは3つ揃い、ハズレのリーチは左右だけ揃う、リーチなしは左右が違う', () => {
  for (const h of drawMany(mods, 3000, { seed: 2, force: 'hit' })) {
    assert.ok(h.nums[0] === h.nums[1] && h.nums[1] === h.nums[2]);
    if (h.route === '7direct') assert.equal(h.final, 7); else assert.notEqual(h.final, 7);
  }
  for (const h of drawMany(mods, 20000, { seed: 3, raw: cfg.spec.randRange - 1 })) {
    for (const n of h.nums) assert.ok(n >= 1 && n <= 9);
    if (h.sc.reach === 'none') assert.notEqual(h.nums[0], h.nums[2]);
    else { assert.equal(h.nums[0], h.nums[2]); assert.notEqual(h.nums[1], h.nums[0]); }
  }
});

test('先バレ: 設定した割合で当りだけに付き、保留は赤以上', () => {
  const n = 20000, settings = { ...SETTINGS, sakibare: 0.1 };
  const hs = drawMany(mods, n, { seed: 4, force: 'hit', settings });
  const saki = hs.filter(h => h.sakibare);
  near(saki.length / n, 0.1, 0.01, '先バレ率');
  assert.ok(saki.every(h => Spec.COLOR_RANK[h.color] >= 3));
  assert.equal(drawMany(mods, 20000, { seed: 4, settings, raw: cfg.spec.randRange - 1 }).filter(h => h.sakibare).length, 0);
});

test('演出チェックの強制はそれぞれの演出になる', () => {
  const one = force => drawMany(mods, 1, { seed: 1, force })[0];
  assert.equal(one('zenkaiten').sc.reach, 'zenkaiten');
  assert.equal(one('ippatsu').sc.reach, 'ippatsu');
  assert.equal(one('battle').sc.spType, 'battle');
  assert.equal(one('story').sc.spType, 'story');
  assert.equal(one('scoop').route, 'scoop');
  assert.ok(one('scoop').sc.scoop.ok);
  assert.equal(one('lever').route, 'lever');
  assert.equal(one('regular').kind, 'regular');
  assert.ok(one('sakibare').sakibare);
  const m = one('miss'); assert.ok(!m.hit); assert.equal(m.sc.reach, 'sp');
  const iw = drawMany(mods, 1, { seed: 1, force: 'iwakan', isRush: true })[0];
  assert.ok(iw.hit && cfg.spec.rush.iwakanTypes.includes(iw.rs.iwakan));
});

test('同じ乱数 raw なら同じ当否（RUSH の出入りで保留を判定し直すときに使う）', () => {
  const r = Spec.rushThreshold(cfg);
  const lot = Spec.createLottery(cfg, () => 0.5);
  assert.ok(lot.draw(r - 1, true, null, SETTINGS).hit);
  assert.ok(!lot.draw(r, true, null, SETTINGS).hit);
  assert.ok(lot.draw(204, false, null, SETTINGS).hit);
  assert.ok(!lot.draw(205, false, null, SETTINGS).hit);
});
