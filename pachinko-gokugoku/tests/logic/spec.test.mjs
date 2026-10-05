// 抽選（src/pure/spec.js）: 理論値が設定どおりか、実際の抽選が理論値どおりに振り分けているか
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { load, drawMany, SETTINGS, seeded } from './helpers.mjs';

const mods = load();
const { cfg, Spec } = mods;
const th = Spec.theory(cfg, { prob: 319.6 });
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} と ${b} の差が ${tol} を超える`);
const HOT = ['金テロップ以上', '金カットイン以上', '金タイトル', '役物落下', '金保留以上', 'ステップ5', '7テン'];

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
  const reachy = h => h.sc.reach === 'sp' || h.sc.reach === 'normal';
  const freq = { '金テロップ以上': h => h.sc.telop >= 4, '金カットイン以上': h => h.sc.cutin >= 4, '金タイトル': h => h.sc.goldTitle, '役物落下': h => h.sc.logoDrop, '金保留以上': h => h.color === 'gold' || h.color === 'rainbow', 'ステップ5': h => h.sc.stepup === 5, '7テン': h => reachy(h) && h.tenpai.includes(7) };
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
  assert.ok(hs.filter(h => h.sc.telop >= 4 || h.sc.cutin >= 4 || h.sc.goldTitle || h.sc.logoDrop).length <= 3, '金系の演出はほぼ出ない');
  assert.ok(hs.filter(h => h.tenpai.includes(7)).length <= 2, '7テンはほぼ出ない');
});

test('赤・金保留のハズレは必ずSPリーチ', () => {
  const hs = drawMany(mods, 300000, { seed: 13, raw: cfg.spec.randRange - 1 }).filter(h => h.color === 'red' || h.color === 'gold');
  assert.ok(hs.length > 100);
  assert.ok(hs.every(h => h.sc.reach === 'sp'));
});

const LINES = Spec.LINES;
/** 3×3 の約束: 列の中で図柄が重ならない / テンパイは h.lines のラインだけ / 揃うのは当りラインだけ */
function checkGrid(h) {
  const [L, C, R] = h.cols;
  for (const col of h.cols) { assert.equal(new Set(col).size, 3, `列に同じ図柄 ${col}`); for (const n of col) assert.ok(n >= 1 && n <= 9); }
  const tenpai = LINES.map((ln, i) => L[ln[0]] === R[ln[2]] ? i : -1).filter(i => i >= 0);
  assert.equal(tenpai.sort().join(), h.lines.map(l => l.line).sort().join(), 'テンパイライン');
  for (const l of h.lines) assert.equal(L[LINES[l.line][0]], l.num);
  const wins = LINES.map((ln, i) => L[ln[0]] === C[ln[1]] && C[ln[1]] === R[ln[2]] ? i : -1).filter(i => i >= 0);
  if (h.hit) { assert.equal(wins.join(), String(h.win)); assert.equal(C[LINES[h.win][1]], h.final); }
  else assert.equal(wins.length, 0, 'ハズレなのに揃っている');
  if (h.lineUp) {
    assert.equal(h.lineUp.length, h.lines.length - 1);
    h.lineUp.forEach((Rk, k) => {
      const t = LINES.map((ln, i) => L[ln[0]] === Rk[ln[2]] ? i : -1).filter(i => i >= 0);
      assert.equal(t.sort().join(), h.lines.slice(0, k + 1).map(l => l.line).sort().join(), `ライン増加の${k + 1}段目`);
    });
  }
}

test('図柄（3×3）: 当りは当りラインだけ揃い、ハズレは揃わない。テンパイは決めたラインだけ', () => {
  for (const h of drawMany(mods, 4000, { seed: 2, force: 'hit' })) {
    checkGrid(h);
    if (h.route === '7direct') assert.equal(h.final, 7); else assert.notEqual(h.final, 7);
    if (h.route !== '7direct') assert.ok(!h.tenpai.includes(7), '7テンは RUSH 直行の当りだけ');
  }
  for (const h of drawMany(mods, 30000, { seed: 3, raw: cfg.spec.randRange - 1 })) {
    checkGrid(h);
    const reach = h.sc.reach === 'normal' || h.sc.reach === 'sp';
    assert.equal(h.lines.length > 0, reach, 'リーチのときだけテンパイ');
  }
  for (const h of drawMany(mods, 3000, { seed: 4, isRush: true })) checkGrid(h);
});

test('テンパイ図柄とライン数の出方が理論値どおり（当り・ハズレ）', () => {
  const reachy = h => h.sc.reach === 'sp' || h.sc.reach === 'normal';
  const hs = drawMany(mods, 40000, { seed: 31, force: 'hit' });
  const ms = drawMany(mods, 200000, { seed: 32, raw: cfg.spec.randRange - 1 });
  for (let x = 1; x <= 9; x++) {
    near(hs.filter(h => reachy(h) && h.tenpai.includes(x)).length / hs.length, th.cues[x + 'テン'].hit, 0.012, `当りの${x}テン`);
    near(ms.filter(h => reachy(h) && h.tenpai.includes(x)).length / ms.length, th.cues[x + 'テン'].miss, 0.004, `ハズレの${x}テン`);
  }
  near(hs.filter(h => h.lines.length >= 2 && reachy(h)).length / hs.length, th.cues['ダブルテンパイ以上'].hit, 0.012, '当りのダブル以上');
  near(ms.filter(h => h.lines.length >= 2).length / ms.length, th.cues['ダブルテンパイ以上'].miss, 0.003, 'ハズレのダブル以上');
  near(ms.filter(h => h.lineUp).length / ms.length, th.cues['ライン増加リーチ'].miss, 0.002, 'ハズレのライン増加');
  near(hs.filter(h => h.lineUp).length / hs.length, th.cues['ライン増加リーチ'].hit, 0.012, '当りのライン増加');
});

test('テンパイの信頼度: 7テンは濃厚、3・5は50〜70%、奇数は偶数より高い、ラインが増えるほど高い', () => {
  const c = th.cues, T = cfg.targets;
  assert.ok(c['7テン'].reliability >= T.sevenTen, `7テン ${c['7テン'].reliability}`);
  for (const x of [3, 5]) { const r = c[x + 'テン'].reliability; assert.ok(r >= T.tenpai35[0] && r <= T.tenpai35[1], `${x}テン ${r}`); }
  for (const o of [1, 3, 5, 9]) for (const e of [2, 4, 6, 8]) assert.ok(c[o + 'テン'].reliability > c[e + 'テン'].reliability, `${o}テン > ${e}テン`);
  assert.ok(c['奇数テン'].reliability > c['偶数テン'].reliability * 2, '奇数テンは偶数テンよりはっきり高い');
  assert.ok(c['リーチ'].reliability < c['ダブルテンパイ以上'].reliability && c['ダブルテンパイ以上'].reliability < c['トリプルテンパイ'].reliability, 'ライン数');
  assert.ok(c['ライン増加リーチ'].reliability > c['ダブルテンパイ以上'].reliability, 'ライン増加はダブルより高い');
});

test('テロップとカットインは白→青→緑→赤→金→虹の6段で、上の色ほど信頼度が高い', () => {
  const SC = cfg.scenario, p = th.hitProb, q = 1 - p;
  const rel = (hitT, missT, v) => { const h = Spec.share(hitT, x => x === v), m = Spec.share(missT, x => x === v); return p * h / (p * h + q * m || 1); };
  for (const [hitT, missT] of [[SC.telopHit, SC.telopMiss], [SC.cutinHit, SC.cutinMiss]]) {
    const r = [0, 1, 2, 3, 4, 5].map(v => rel(hitT, missT, v));
    for (let i = 1; i < 6; i++) assert.ok(r[i] > r[i - 1], `色${i}の信頼度 ${r[i]} <= 色${i - 1} ${r[i - 1]}`);
    assert.ok(r[4] >= cfg.targets.hotReliability && r[5] === 1, '金以上は激熱、虹は確定');
  }
  const hs = drawMany(mods, 20000, { seed: 33, force: 'hit' }).filter(h => h.sc.telop > 0);
  assert.ok(hs.every(h => h.sc.telopStart <= h.sc.telop && h.sc.telopStart >= 0));
  assert.ok(hs.some(h => h.sc.telop - h.sc.telopStart === 2), '2段上がるテロップもある');
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
  const lot = Spec.createLottery(cfg, seeded(1));
  assert.ok(lot.draw(r - 1, true, null, SETTINGS).hit);
  assert.ok(!lot.draw(r, true, null, SETTINGS).hit);
  assert.ok(lot.draw(204, false, null, SETTINGS).hit);
  assert.ok(!lot.draw(205, false, null, SETTINGS).hit);
});
