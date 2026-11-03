import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngine } from '../engine.mjs';

const E = loadEngine();

/** 自動で落ちてくる星を止めたゲーム（置いた星だけで確かめる） */
function quiet(extra) {
  const g = E.createGame({ seed: 1, ...extra });
  g.state.spawnTimer = Infinity;
  return g;
}
// エンジンは別の realm（vm）で動くので、比べる前に普通の値へ直す
const plain = (v) => JSON.parse(JSON.stringify(v));
const count = (g, tier) => g.state.balls.filter((b) => b.tier === tier).length;

test('8段階で、名前は太陽系コース、だんだん大きくなる', () => {
  assert.deepEqual(plain(E.TIERS.map((t) => t.name)), ['岩のかけら', '月', '水星', '火星', '地球', '土星', '木星', '太陽']);
  for (let i = 1; i < E.TIERS.length; i++) assert.ok(E.TIERS[i].r > E.TIERS[i - 1].r);
  assert.ok(E.TIERS[7].r < 0.4, '太陽が容器に収まる');
});

test('同じ段階の2つが触れると、1段階上の1つになる', () => {
  const g = quiet();
  // 底でくっついて並べる（重力で互いに押し合い、触れ続ける）
  g.place(1, -0.06, 0.935); g.place(1, 0.06, 0.935);
  g.advance(g.state.opt.mergeDelay * 0.5);
  assert.equal(count(g, 1), 2, '触れてすぐには合体しない');
  assert.equal(g.state.contact.size, 1, '合体しかけの組として数えられる');
  g.advance(g.state.opt.mergeDelay * 0.5 + 0.1);
  assert.equal(count(g, 1), 0);
  assert.equal(count(g, 2), 1);
  assert.equal(g.state.merges, 1);
  assert.equal(g.state.maxTier, 2);
});

test('違う段階どうしは合体しない', () => {
  const g = quiet();
  g.place(1, -0.05, 0.8); g.place(2, 0.06, 0.8);
  g.advance(1);
  assert.equal(g.state.balls.length, 2);
  assert.equal(g.state.merges, 0);
});

test('筒の中では合体しない', () => {
  const g = quiet({ gravity: 0 });
  g.place(1, 0, -1.4); g.place(1, 0, -1.3);
  g.advance(0.2);
  assert.equal(count(g, 1), 2);
});

test('木星2つで太陽になるとクリア。太陽はもう合体しない', () => {
  const g = quiet();
  g.place(7, -0.3, 0.5); g.place(7, 0.3, 0.5);
  g.advance(2.5);
  assert.equal(g.state.status, 'clear');
  assert.equal(count(g, 8), 1);
  const ev = g.drainEvents().map((e) => e.type);
  assert.ok(ev.includes('clear'));

  const h = quiet();
  h.place(8, -0.36, 0.5); h.place(8, 0.36, 0.5);
  h.advance(1);
  assert.equal(count(h, 8), 2);
});

test('合体した星は2つの真ん中に生まれる', () => {
  const g = quiet({ gravity: 0 });
  g.place(3, -0.11, 0.2); g.place(3, 0.11, 0.2); // ちょうど触れる距離
  g.advance(g.state.opt.mergeDelay + 0.02);
  const b = g.state.balls[0];
  assert.equal(b.tier, 4);
  assert.ok(Math.abs(b.x) < 0.02 && Math.abs(b.y - 0.2) < 0.02, `位置 ${b.x},${b.y}`);
});

test('星は容器と筒の外に出ない（タップとシャッフルを混ぜても）', () => {
  const g = E.createGame({ seed: 7 });
  for (let s = 0; s < 40; s++) {
    g.advance(0.5);
    if (s % 3 === 0) g.tap(0, 0.6);
    if (s % 10 === 5) g.shuffle();
    for (const b of g.state.balls) {
      // 筒の中か、筒と円のつなぎ目（円の上の開いているところ）
      const inTube = b.y < 0 && Math.abs(b.x) <= g.state.opt.tubeHalf - b.r + 1e-6;
      const inCircle = Math.hypot(b.x, b.y) <= 1 - b.r + 0.02;
      assert.ok(inTube || inCircle, `はみ出し: tier${b.tier} (${b.x.toFixed(3)}, ${b.y.toFixed(3)})`);
      assert.ok(b.y >= g.state.opt.tubeTop);
    }
  }
});

test('星は上の筒から一定の間隔で出てくる', () => {
  const g = E.createGame({ seed: 3 });
  g.advance(2.4);
  const spawned = g.state.spawned;
  assert.ok(spawned >= 9 && spawned <= 11, `2.4秒で ${spawned} 個`);
});

test('タップすると周りの星が弾き飛ばされる', () => {
  const g = quiet();
  g.place(2, 0.3, 0.75);
  g.advance(1.5); // 底に落ち着かせる
  const b = g.state.balls[0];
  const before = { x: b.x, y: b.y };
  assert.equal(g.tap(b.x - 0.15, b.y + 0.05), 1);
  g.advance(0.15);
  assert.ok(Math.hypot(b.x - before.x, b.y - before.y) > 0.05, '動いていない');
  assert.equal(g.tap(-0.9, -0.2), 0, '遠い星には届かない');
});

test('シャッフルで全部の星が持ち上がる', () => {
  const g = quiet();
  for (let i = 0; i < 5; i++) g.place(i + 1, -0.6 + i * 0.3, 0.6);
  g.advance(2);
  const ys = g.state.balls.map((b) => b.y);
  assert.equal(g.shuffle(), 5);
  g.advance(0.12);
  const lifted = g.state.balls.filter((b, i) => b.y < ys[i] - 0.02).length;
  assert.ok(lifted >= 4, `持ち上がったのは ${lifted} 個`);
});

test('ラインより上で2秒止まり続けるとゲームオーバー', () => {
  const g = E.createGame({ seed: 2, merge: false });
  let overAt = null;
  for (let s = 0; s < 300 && g.state.status === 'running'; s++) g.advance(0.5);
  assert.equal(g.state.status, 'over');
  overAt = g.state.time;
  assert.ok(overAt > 20, '早すぎる');
  // ラインより上に星がいる
  assert.ok(g.state.balls.some((b) => b.y < g.state.opt.lineY));
});

test('ラインを越えても動いている間はゲームオーバーにならない', () => {
  const g = quiet({ gravity: 0 });
  const b = g.place(1, 0, -1.3, 0, 0);
  for (let i = 0; i < 30; i++) { b.px = b.x; b.py = b.y + 0.002; g.advance(0.1); b.y = -1.3; }
  assert.equal(g.state.status, 'running');
});

test('同じ seed なら同じ結果になる', () => {
  const a = E.createGame({ seed: 11 }), b = E.createGame({ seed: 11 });
  a.advance(20); b.advance(20);
  assert.equal(a.state.merges, b.state.merges);
  assert.deepEqual(plain(a.state.balls.map((x) => [x.tier, x.x.toFixed(6)])), plain(b.state.balls.map((x) => [x.tier, x.x.toFixed(6)])));
});

test('離れると合体の待ち時間は最初から', () => {
  const g = quiet({ gravity: 0 });
  const a = g.place(2, -0.082, 0.2), b = g.place(2, 0.082, 0.2);
  g.advance(g.state.opt.mergeDelay * 0.7);
  assert.equal(g.state.contact.size, 1);
  a.x = a.px = -0.5; b.x = b.px = 0.5; // 引き離す
  g.advance(0.05);
  assert.equal(g.state.contact.size, 0);
  a.x = a.px = -0.082; b.x = b.px = 0.082; a.y = a.py = b.y = b.py = 0.2; // くっつけ直す
  g.advance(g.state.opt.mergeDelay * 0.7);
  assert.equal(count(g, 2), 2, '前の待ち時間が残っていない');
});

test('だんだん落ちてくるのが速くなる（下限あり）', () => {
  const g = E.createGame({ seed: 4, spawnWeights: [1] });
  g.state.opt.merge = false;
  g.advance(10);
  const early = g.state.spawned;
  const h = E.createGame({ seed: 4 });
  h.state.opt.merge = false;
  h.state.time = 60; // 60秒たった時点の速さ
  h.advance(10);
  assert.ok(h.state.spawned > early, `序盤10秒 ${early} 個 / 60秒後の10秒 ${h.state.spawned} 個`);
});

test('難しさ：放っておくと失敗することもあるが、ピンチにシャッフルすれば太陽まで届く', () => {
  const results = { hands: [], helped: [] };
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = E.createGame({ seed });
    while (g.state.status === 'running' && g.state.time < 200) g.advance(1);
    results.hands.push(g.state.status);
    const h = E.createGame({ seed });
    let last = -9;
    while (h.state.status === 'running' && h.state.time < 200) {
      h.advance(0.25);
      if (h.state.overTimer > 0.3 && h.state.time - last > 0.8) { h.shuffle(); last = h.state.time; }
    }
    results.helped.push(h.state.status);
    assert.ok(h.state.time > 40, `seed ${seed}: 早すぎる ${h.state.time.toFixed(0)}秒`);
  }
  assert.ok(results.hands.includes('clear'), `放っておいて1度もクリアできない ${results.hands}`);
  assert.ok(results.helped.filter((s) => s === 'clear').length >= 7, `手助けしてもクリアできない ${results.helped}`);
});
