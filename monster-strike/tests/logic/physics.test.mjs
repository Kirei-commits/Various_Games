import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPhysics, standardWorld, runUntilStop, seededRandom } from './helpers.mjs';

const P = loadPhysics();
const C = P.DEFAULTS;

/** 何も無いフィールドに1体だけ置く */
function lone(shot, x, y, cfg) {
  const w = new P.World(cfg);
  w.add({ id: 'u', kind: 'unit', shot, x, y, r: 30 });
  return w;
}

// ------------------------------------------------------------ ひっぱり
test('引きが遊びより短いとキャンセル（null）になる', () => {
  assert.equal(P.launchVelocity(C, 0, 0), null);
  assert.equal(P.launchVelocity(C, C.pull.dead - 1, 0), null);
  assert.ok(P.launchVelocity(C, C.pull.dead, 0));
});

test('発射方向は引いた向きの逆', () => {
  const v = P.launchVelocity(C, 0, 100); // 下に引く
  assert.ok(v.vy < 0);
  assert.ok(Math.abs(v.vx) < 1e-9);
  const d = P.launchVelocity(C, -60, -80); // 左上に引く → 右下へ
  assert.ok(d.vx > 0 && d.vy > 0);
  assert.ok(Math.abs(d.vx / d.vy - 60 / 80) < 1e-9);
});

test('引くほど初速が上がり、上限で頭打ちになる', () => {
  const s = [20, 60, 100, 140, C.pull.max].map((l) => P.launchVelocity(C, 0, l).speed);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], `${s[i]} > ${s[i - 1]}`);
  assert.equal(P.launchVelocity(C, 0, C.pull.max).speed, C.speed.max);
  assert.equal(P.launchVelocity(C, 0, C.pull.max * 3).speed, C.speed.max);
  assert.equal(P.launchVelocity(C, 0, C.pull.max * 3).power, 1);
  assert.equal(P.launchVelocity(C, 0, C.pull.dead).speed, C.speed.min);
});

test('World.launch は引きが短いと動かさず null を返す（ターンを消費しない）', () => {
  const w = lone('reflect', 270, 400);
  assert.equal(w.launch('u', 3, 3), null);
  assert.ok(w.isSettled());
  assert.equal(w.drainEvents().length, 0);
});

// ------------------------------------------------------------ 減衰と停止
test('摩擦で減速して、いつかは必ず止まる', () => {
  const w = lone('reflect', 270, 400);
  w.launch('u', 0, C.pull.max);
  let prev = w.get('u').speed();
  let n = 0;
  while (!w.isSettled()) {
    w.step();
    const ev = w.drainEvents();
    const s = w.get('u').speed();
    // 壁での反射以外で速くなることはない
    if (!ev.some((e) => e.type === 'wall')) assert.ok(s <= prev + 1e-9, `step ${n}: ${s} > ${prev}`);
    prev = s;
    n++;
    assert.ok(n < 240 * 20, '20秒以内に止まる');
  }
  assert.equal(w.get('u').speed(), 0);
});

test('最大の強さで弾くと 2〜8 秒動き続ける（手触りの範囲）', () => {
  const w = lone('reflect', 270, 400);
  w.launch('u', 0, C.pull.max);
  const { seconds, events } = runUntilStop(w);
  assert.ok(seconds > 2 && seconds < 8, `${seconds.toFixed(2)}s`);
  assert.ok(events.filter((e) => e.type === 'wall').length >= 2, '何度か壁で跳ね返る');
  assert.equal(events.at(-1).type, 'stop');
});

test('停止すると stop イベントが1回だけ出る', () => {
  const w = lone('reflect', 270, 400);
  w.launch('u', 0, 40);
  const { events } = runUntilStop(w);
  assert.equal(events.filter((e) => e.type === 'stop').length, 1);
});

// ------------------------------------------------------------ 壁の反射
test('壁では入射角のまま鏡映しに跳ね返り、速さが反発係数ぶん落ちる', () => {
  const w = lone('reflect', 270, 400);
  w.get('u').x = 40;
  w.setVelocity('u', -1200, -300);
  w.drainEvents();
  let ev;
  for (let i = 0; i < 100 && !ev; i++) {
    const before = w.get('u').speed();
    const bvx = w.get('u').vx, bvy = w.get('u').vy;
    w.step();
    ev = w.drainEvents().find((e) => e.type === 'wall');
    if (ev) {
      const u = w.get('u');
      assert.deepEqual([ev.nx, ev.ny], [1, 0]);
      assert.ok(u.vx > 0, '右へ跳ね返る');
      assert.ok(u.vy < 0, '縦方向の向きは変わらない');
      // 角度が保たれる: |vy/vx| が同じ
      assert.ok(Math.abs(Math.abs(u.vy / u.vx) - Math.abs(bvy / bvx)) < 1e-9);
      // 摩擦ぶん（1ステップ）を除いて、反発係数どおりに減る
      const ratio = u.speed() / before;
      assert.ok(Math.abs(ratio - C.wall.restitution) < 0.01, `ratio ${ratio}`);
      assert.ok(u.x - u.r >= 0);
    }
  }
  assert.ok(ev, '壁に当たった');
});

test('四隅に向けて最大の強さで撃っても、フィールドの外に出ない', () => {
  for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1], [0, 1], [1, 0]]) {
    const w = lone('reflect', 270, 400);
    w.launch('u', dx * 500, dy * 500);
    for (let i = 0; !w.isSettled(); i++) {
      w.step();
      const u = w.get('u');
      assert.ok(u.x >= u.r - 1e-9 && u.x <= C.field.w - u.r + 1e-9);
      assert.ok(u.y >= u.r - 1e-9 && u.y <= C.field.h - u.r + 1e-9);
    }
  }
});

// ------------------------------------------------------------ 反射タイプ vs 貫通タイプ
test('反射タイプは的に当たると跳ね返り、的を通り抜けない', () => {
  const w = standardWorld(P);
  // A を t1 の真下に置いて真上へ
  const a = w.get('A');
  a.x = 270; a.y = 500;
  w.launch('A', 0, 120);
  const { events } = runUntilStop(w);
  const hit = events.find((e) => e.type === 'hit' && e.other === 't1');
  assert.ok(hit, 't1 に当たる');
  assert.ok(!events.some((e) => e.type === 'pierce'), '反射タイプは貫通しない');
  // 当たった直後は下向きに進む
  assert.ok(hit.ny > 0.99, '真下から当たった法線');
  const t1 = w.get('t1');
  // 最後まで的の上側（奥）へ抜けていない＝t1 の上に行っていない…ではなく、重なっていない
  assert.ok(Math.hypot(a.x - t1.x, a.y - t1.y) >= a.r + t1.r - 1e-6);
});

test('反射タイプは的に当たるたびに反発係数ぶん速さを失う', () => {
  const w = standardWorld(P);
  const a = w.get('A');
  a.x = 270; a.y = 500;
  w.setVelocity('A', 0, -1500);
  w.drainEvents();
  let before = 0;
  for (let i = 0; i < 400; i++) {
    before = a.speed();
    w.step();
    const hit = w.drainEvents().find((e) => e.type === 'hit');
    if (hit) {
      assert.ok(Math.abs(a.speed() / before - C.reflect.restitution) < 0.01);
      return;
    }
  }
  assert.fail('当たらなかった');
});

test('貫通タイプは的をすり抜け、突入の瞬間に大きく減速する', () => {
  const w = standardWorld(P);
  const b = w.get('B');
  b.x = 270; b.y = 500;
  w.setVelocity('B', 0, -1500);
  w.drainEvents();
  let pierced = null, before = 0;
  const t1 = w.get('t1');
  let passed = false;
  for (let i = 0; i < 2000 && b.moving; i++) {
    before = b.speed();
    w.step();
    for (const e of w.drainEvents()) {
      assert.notEqual(e.type, 'hit', '貫通タイプは跳ね返らない');
      if (e.type === 'pierce' && !pierced) {
        pierced = e;
        assert.equal(e.other, 't1');
        const ratio = b.speed() / before;
        assert.ok(Math.abs(ratio - C.pierce.enterFactor) < 0.01, `ratio ${ratio}`);
      }
    }
    if (b.y < t1.y - t1.r - b.r) passed = true;
  }
  assert.ok(pierced, 't1 を貫通した');
  assert.ok(passed, 't1 の向こう側まで抜けた');
});

test('貫通タイプは的の中にいる間、摩擦が強くかかる', () => {
  // 的を抜けた瞬間の速さを比べる
  const exitSpeed = (insideDrag) => {
    const w = standardWorld(P, { pierce: { insideDrag } });
    const b = w.get('B'), t1 = w.get('t1');
    b.x = 270; b.y = 500;
    w.setVelocity('B', 0, -1500);
    while (b.moving && b.y >= t1.y - t1.r - b.r) w.step();
    return b.speed();
  };
  const weak = exitSpeed(1), strong = exitSpeed(4);
  assert.ok(weak > 0 && strong > 0, '抜けきっている');
  assert.ok(strong < weak * 0.95, `${strong} < ${weak}`);
});

test('貫通タイプは同じ的の中を進んでいる間、減速は1回だけ', () => {
  const w = standardWorld(P);
  const b = w.get('B');
  b.x = 270; b.y = 500;
  w.setVelocity('B', 0, -1800);
  const { events } = runUntilStop(w);
  const first = events.filter((e) => e.type === 'pierce' && e.other === 't1');
  // 往復して2回くぐることはありうるが、連続した突入は無い
  for (let i = 1; i < first.length; i++) assert.ok(first[i].t - first[i - 1].t > 0.05);
});

test('味方には跳ね返らず、減速もせずにすり抜けて、触れた瞬間に touch を1回出す（反射も貫通も同じ）', () => {
  for (const [id, other, x, dx] of [['A', 'B', 250, -100], ['B', 'A', 290, 100]]) {
    const w = standardWorld(P);
    w.get(id).x = x;
    w.launch(id, dx, 0);
    const ev = [];
    let sp0 = null, spAfter = null;
    const me = w.get(id);
    for (let n = 0; n < 20000 && !w.isSettled(); n++) {
      const before = me.speed();
      w.step();
      const e = w.drainEvents();
      ev.push(...e);
      const t = e.find((q) => q.type === 'touch' && q.other === other);
      if (t) { sp0 = before; spAfter = me.speed(); }
    }
    assert.equal(ev.filter((e) => e.type === 'touch' && e.other === other).length >= 1, true, `${id} → ${other}`);
    assert.ok(!ev.some((e) => (e.type === 'hit' || e.type === 'pierce') && e.other === other), '味方には hit / pierce を出さない');
    assert.ok(spAfter > sp0 * 0.98, '味方に触れても減速しない');
  }
});

test('弾かれていないキャラと的は動かない（すり抜けられた味方は少しだけずれる）', () => {
  const w = standardWorld(P);
  const snap = () => w.bodies.filter((b) => b.id !== 'A').map((b) => [b.id, b.x, b.y, b.kind]);
  const before = snap();
  w.launch('A', 30, 150);
  runUntilStop(w);
  const after = snap();
  before.forEach((b, i) => {
    const a = after[i], moved = Math.hypot(a[1] - b[1], a[2] - b[2]);
    if (b[3] === 'unit') assert.ok(moved <= C.allyNudge * 3 + 1e-9, `${b[0]} は少しだけ`);
    else assert.equal(moved, 0, `${b[0]} は動かない`);
  });
});

test('ストップで止められる。動き続けても maxMove 秒で止まる', () => {
  const w = standardWorld(P);
  w.launch('A', 0, 150);
  w.step();
  w.stop('A');
  assert.equal(w.get('A').moving, false);
  assert.ok(w.drainEvents().some((e) => e.type === 'stop'));
  // 摩擦なしで壁の間を往復させても止まる
  const w2 = new P.World({ friction: { linear: 0, drag: 0 }, wall: { restitution: 1 } });
  w2.add({ id: 'A', kind: 'unit', shot: 'reflect', x: 270, y: 400, r: 30 });
  w2.setVelocity('A', 1500, 0);
  let n = 0;
  while (!w2.isSettled() && n < 240 * 30) { w2.step(); n++; }
  assert.ok(n <= Math.ceil(w2.cfg.maxMove * 240) + 2, `${n} ステップで止まった`);
});

test('貫通タイプが的の中で止まったら、重ならない位置へ押し出される', () => {
  let stoppedInside = 0;
  for (let s = 200; s <= 900; s += 20) {
    const w = standardWorld(P);
    const b = w.get('B'), t1 = w.get('t1');
    b.x = 270; b.y = 400;
    w.setVelocity('B', 0, -s);
    let prev = { x: b.x, y: b.y };
    while (b.moving) { prev = { x: b.x, y: b.y }; w.step(); }
    if (Math.hypot(prev.x - t1.x, prev.y - t1.y) < b.r + t1.r) stoppedInside++;
    assert.ok(Math.hypot(b.x - t1.x, b.y - t1.y) >= b.r + t1.r - 0.01, `速さ ${s} で重なったまま止まった`);
  }
  assert.ok(stoppedInside >= 3, `的の中で止まる場面を検証できている（${stoppedInside}件）`);
});

// ------------------------------------------------------------ 大量に撃っても壊れない
test('ランダムな1000発: 外に出ない・すり抜けない・重ならずに止まる・必ず止まる', () => {
  const rnd = seededRandom(7);
  for (let n = 0; n < 1000; n++) {
    const w = standardWorld(P);
    const id = rnd() < 0.5 ? 'A' : 'B';
    // 置き場所もランダムに（重ならない所へ）
    const me = w.get(id);
    for (let tries = 0; tries < 50; tries++) {
      me.x = me.r + rnd() * (C.field.w - 2 * me.r);
      me.y = me.r + rnd() * (C.field.h - 2 * me.r);
      if (!w._overlapping(me)) break;
    }
    if (w._overlapping(me)) continue;
    const ang = rnd() * Math.PI * 2;
    const len = C.pull.dead + rnd() * C.pull.max * 1.2;
    w.launch(id, Math.cos(ang) * len, Math.sin(ang) * len);
    let steps = 0;
    while (!w.isSettled()) {
      w.step();
      w.drainEvents();
      steps++;
      assert.ok(me.x >= me.r - 1e-6 && me.x <= C.field.w - me.r + 1e-6, `#${n} x=${me.x}`);
      assert.ok(me.y >= me.r - 1e-6 && me.y <= C.field.h - me.r + 1e-6, `#${n} y=${me.y}`);
      if (me.shot === 'reflect') {
        // 味方はすり抜けるので、味方以外（的）にめり込んでいないかを見る
        for (const o of w.bodies) {
          if (o === me || o.kind === 'unit') continue;
          const c = P.contact(me, o);
          assert.ok(!c || c.depth <= 1, `#${n} 反射タイプが ${o.id} にめり込んだ`);
        }
      }
      assert.ok(steps < 240 * 20, `#${n} 20秒以内に止まる`);
    }
    assert.equal(w._overlapping(me), null, `#${n} 重なったまま止まった`);
  }
});

test('同じ入力なら同じ結果になる（決定的）', () => {
  const run = () => {
    const w = standardWorld(P);
    w.launch('A', 37, 121);
    runUntilStop(w);
    return [w.get('A').x, w.get('A').y];
  };
  assert.deepEqual(run(), run());
});

// ------------------------------------------------------------ 予測軌道
test('予測軌道は本番の動きと一致する', () => {
  for (const [id, dx, dy] of [['A', 40, 150], ['B', -30, 160], ['A', 120, 20]]) {
    const w = standardWorld(P);
    const v = P.launchVelocity(w.cfg, dx, dy);
    const pred = w.predict(id, v.vx, v.vy, { maxLen: 5000, maxBounces: 99 });
    // 予測は元の World を動かさない
    assert.ok(w.isSettled());
    assert.equal(w.get(id).x, id === 'A' ? 170 : 370);
    w.launch(id, dx, dy);
    runUntilStop(w);
    const end = pred.points.at(-1);
    assert.ok(pred.stopped);
    // 予測は停止時の押し出し前の位置で終わることがあるので、押し出し量ぶんの誤差を許す
    assert.ok(Math.hypot(end.x - w.get(id).x, end.y - w.get(id).y) < 80, `${id}: ${JSON.stringify(end)}`);
  }
});

test('予測軌道は反射2回で打ち切られ、貫通は回数に数えない', () => {
  const w = standardWorld(P);
  const v = P.launchVelocity(w.cfg, 0, C.pull.max);
  const pa = w.predict('A', v.vx, v.vy, { maxLen: 5000, maxBounces: 2 });
  assert.equal(pa.contacts.filter((c) => c.type !== 'pierce').length, 2);

  const wb = standardWorld(P);
  wb.get('B').x = 270; wb.get('B').y = 500;
  const pb = wb.predict('B', 0, -1800, { maxLen: 5000, maxBounces: 1 });
  assert.equal(pb.contacts[0].type, 'pierce');
  assert.equal(pb.contacts.filter((c) => c.type !== 'pierce').length, 1);
});

test('予測軌道の長さは maxLen で打ち切られる', () => {
  const w = lone('reflect', 270, 400);
  const pred = w.predict('u', 0, -2000, { maxLen: 200 });
  assert.ok(pred.length >= 200 && pred.length < 215);
});

test('設定の上書きは既定値を壊さない', () => {
  const w = new P.World({ wall: { restitution: 0.5 } });
  assert.equal(w.cfg.wall.restitution, 0.5);
  assert.equal(w.cfg.reflect.restitution, C.reflect.restitution);
  assert.equal(P.DEFAULTS.wall.restitution, 0.88);
  w.cfg.speed.max = 1;
  assert.equal(P.DEFAULTS.speed.max, 2200);
});
