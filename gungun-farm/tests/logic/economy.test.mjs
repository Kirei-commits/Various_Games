/**
 * 経済のテスト。1局を最後まで回して「詰まないか」「育ちの速さが狙い通りか」を見る。
 *
 * 数値は当て推量ではなく `npm run simulate` の実測から置いている。
 * 閾値は実測より下に置く（実測 Lv14 → 閾値 Lv11）。フレーキーなテストは無いテストより悪い。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';
import { simulate, botStep } from '../bot.mjs';

const GF = loadGF(['data.js', 'engine.js']);
const runs = (minutes, n) => Array.from({ length: n }, (_, i) => {
  const seed = mixSeed(i);
  return simulate(GF, { minutes, seed, random: seededRandom(seed) });
});
const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

test('10分まわしても、何もできない時間ができない', () => {
  for (const r of runs(10, 6)) {
    assert.ok(r.worstStuckMs <= 2000, `何もできない時間が ${r.worstStuckMs}ms あった（seed ${r.seed}）`);
  }
});

test('ふつうに回していれば救済は出番が無い', () => {
  const total = runs(10, 6).reduce((a, r) => a + r.rescues, 0);
  assert.equal(total, 0, '救済が出るなら、経済のどこかが破綻している');
});

test('3分では終わらないが、ちゃんと育つ', () => {
  const rs = runs(3, 8);
  const levels = rs.map((r) => r.level);
  assert.ok(med(levels) >= 5, `3分でレベル${med(levels)}は遅すぎる`);
  assert.ok(Math.max(...levels) < GF.Data.MAX_LEVEL, '3分で上限に着いてしまうと、育つ楽しみが無くなる');
  assert.ok(med(rs.map((r) => r.delivered)) >= 10, '3分で10件は届けられること');
});

test('10分でレベル11以上まで育つ（実測は中央14）', () => {
  const levels = runs(10, 6).map((r) => r.level);
  assert.ok(med(levels) >= 11, `10分でレベル${med(levels)}は遅すぎる`);
});

test('上限レベルには手が届く（20分）', () => {
  const rs = runs(20, 4);
  assert.ok(rs.some((r) => r.level >= GF.Data.MAX_LEVEL - 1),
    `20分回しても Lv${Math.max(...rs.map((r) => r.level))} 止まり`);
});

test('10分あれば、機械も畑もひととおり揃う', () => {
  const rs = runs(10, 6);
  assert.ok(med(rs.map((r) => r.machines)) >= 7, '機械が買えない＝コインが足りていない');
  assert.ok(med(rs.map((r) => r.fields)) >= 9, '畑が広げられていない');
});

test('コインもタネも尽きた行き止まりからは、救済で抜けられる', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(9));
  const s = GF2.Engine.create({ coins: 0 });
  s.barn = {};
  assert.equal(GF2.Engine.plantAll(s, 'wheat'), 0, '前提: 何も植えられない');

  GF2.Engine.tick(s, 100);
  assert.equal(s.stats.rescues, 1);
  assert.ok(s.coins >= GF2.Data.crop('wheat').cost, '救済のあとはタネが買える');
  assert.ok(GF2.Engine.plantAll(s, 'wheat') > 0);
});

test('倉庫に売れるものが残っているうちは救済しない（自力で抜けられる）', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(10));
  const s = GF2.Engine.create({ coins: 0 });
  GF2.Engine.store(s, 'wheat', 1);
  GF2.Engine.tick(s, 100);
  assert.equal(s.stats.rescues, 0);
  assert.equal(s.coins, 0);
});

test('3分チャレンジは3分ちょうどで終わる', () => {
  const GF2 = loadGF(['data.js', 'engine.js']);
  GF2.Engine.setRandom(seededRandom(11));
  const s = GF2.Engine.create({ mode: 'rush', limit: 180_000 });
  GF2.Engine.tick(s, 179_999);
  assert.equal(s.over, false);
  GF2.Engine.tick(s, 180_000);
  assert.equal(s.over, true);

  const coins = s.coins;
  GF2.Engine.tick(s, 300_000);
  assert.equal(s.coins, coins, '終わったあとは時間が進まない');
});

/**
 * タネ選びが「取引」になっているかを、実際に回して確かめる。
 * 短い作物だけ / 長い作物だけ で同じ手順を回し、稼ぎと手数を比べる。
 * **どちらかが全部の指標で勝つなら、それは選択ではない。**
 */
function strategy(pick, minutes = 4, runs = 3) {
  const acc = { coins: 0, xp: 0, taps: 0 };
  for (let r = 0; r < runs; r++) {
    GF.Engine.setRandom(seededRandom(mixSeed(r)));
    const s = GF.Engine.create({ mode: 'free' });
    s.level = 12; s.xp = 0; s.xpNext = GF.Data.xpFor(12);
    s.fieldsOwned = GF.Data.FIELD_SLOTS; s.coins = 5000; s.barnUp = 4;
    let taps = 0;
    for (let t = 0; t <= minutes * 60000; t += 200) {
      GF.Engine.tick(s, t);
      const crop = pick(s);
      if (GF.Engine.harvestAll(s, crop) > 0) taps++;        // 主ボタン1タップぶん
      GF.Engine.workAll(s);
      for (const o of [...s.orders]) if (GF.Engine.canDeliver(s, o)) GF.Engine.deliver(s, o.id);
      const want = GF.Engine.reservedForOrders(s);
      if (GF.Engine.barnFree(s) < 6) {
        for (const id of Object.keys(s.barn).sort((a, b) => GF.Data.item(a).sell - GF.Data.item(b).sell)) {
          if (GF.Engine.barnFree(s) >= GF.Engine.barnCap(s) * 0.4) break;
          const spare = (s.barn[id] || 0) - (want[id] || 0);
          if (spare > 0) GF.Engine.sell(s, id, spare);
        }
      }
      GF.Engine.plantAll(s, crop);
    }
    acc.coins += s.stats.coinsEarned; acc.xp += s.stats.xpEarned; acc.taps += taps;
  }
  return { coins: acc.coins / runs, xp: acc.xp / runs, taps: acc.taps / runs };
}

test('短い作物と長い作物のどちらにも選ぶ理由がある（タネ選びが飾りでないこと）', () => {
  const shortest = (s) => GF.Data.cropsAt(s.level).slice().sort((a, b) => a.sec - b.sec)[0].id;
  const longest = (s) => GF.Data.cropsAt(s.level).slice().sort((a, b) => b.sec - a.sec || b.cost - a.cost)[0].id;
  const fast = strategy(shortest);
  const slow = strategy(longest);

  // 短いほうは稼ぐ。ただし手数を払う
  assert.ok(fast.coins > slow.coins * 1.1,
    `短い作物が稼げていない（${Math.round(fast.coins)} 対 ${Math.round(slow.coins)}）`);
  assert.ok(fast.taps > slow.taps * 2,
    `長い作物で手数が減っていない（${Math.round(fast.taps)} 対 ${Math.round(slow.taps)}回）`);

  // 長いほうにも取り柄がある。全部で負けるなら選ぶ理由が無い
  assert.ok(slow.xp >= fast.xp,
    `長い作物に取り柄が無い（経験値 ${Math.round(slow.xp)} 対 ${Math.round(fast.xp)}）`);
  assert.ok(slow.coins > fast.coins * 0.6,
    `長い作物が稼げなさすぎる（${Math.round(slow.coins)} 対 ${Math.round(fast.coins)}）`);
});

test('1秒あたりの儲けは短いほど良く、1枠の値打ちは長いほど高い', () => {
  const perSec = (c) => (GF.Data.item(c.id).sell - c.cost) / c.sec;
  const bySec = GF.Data.CROPS.slice().sort((a, b) => a.sec - b.sec || a.level - b.level);
  for (let i = 1; i < bySec.length; i++) {
    assert.ok(perSec(bySec[i]) <= perSec(bySec[i - 1]) + 0.001,
      `${bySec[i].id} のほうが1秒あたり儲かる（短い作物を選ぶ理由が消える）`);
  }
  const byLevel = GF.Data.CROPS.slice().sort((a, b) => a.level - b.level || a.sec - b.sec);
  for (let i = 1; i < byLevel.length; i++) {
    assert.ok(GF.Data.item(byLevel[i].id).sell > GF.Data.item(byLevel[i - 1].id).sell,
      `${byLevel[i].id} の1枠の値打ちが上がっていない`);
  }
});

/**
 * 手を動かす間隔だけを変えて成果を比べる。
 * **連打がいちばん得になっていたら、それは我慢比べであって遊びではない。**
 */
function tempo(stepMs, minutes = 4, runs = 3) {
  let coins = 0, taps = 0;
  for (let r = 0; r < runs; r++) {
    GF.Engine.setRandom(seededRandom(mixSeed(r)));
    const s = GF.Engine.create({ mode: 'free' });
    let n = 0;
    for (let t = 0; t <= minutes * 60000; t += stepMs) {
      GF.Engine.tick(s, t);
      const before = s.stats.harvested + s.stats.crafted + s.stats.delivered;
      botStep(GF, s);
      if (s.stats.harvested + s.stats.crafted + s.stats.delivered > before) n++;
    }
    coins += s.stats.coinsEarned; taps += n;
  }
  return { coins: coins / runs, taps: taps / runs };
}

test('連打しても得をしない（落ち着いた間隔のほうが稼げる）', () => {
  const fast = tempo(200);      // ひたすら連打
  const calm = tempo(800);      // 1秒に1回くらい

  assert.ok(calm.coins >= fast.coins,
    `連打のほうが稼げてしまう（連打 ${Math.round(fast.coins)} / 落ち着き ${Math.round(calm.coins)}）。` +
    'それは我慢比べになる');
  assert.ok(calm.taps < fast.taps * 0.6,
    `落ち着いた間隔で手数が減っていない（${Math.round(fast.taps)} → ${Math.round(calm.taps)}）`);
});

test('ちょうどよい間隔に幅がある（狙って合わせなくていい）', () => {
  const best = tempo(800).coins;
  for (const ms of [400, 1500]) {
    const r = tempo(ms).coins;
    assert.ok(r > best * 0.7,
      `${ms}ms で大きく損をする（${Math.round(r)} 対 ${Math.round(best)}）。間隔がシビアすぎる`);
  }
  // 極端に放っておくと、さすがに落ちる（そうでないと手を動かす意味が無い）
  assert.ok(tempo(6000).coins < best * 0.6, '放っておいても同じだけ稼げてしまう');
});

/**
 * **稼ぎの主筋が「余りを売っただけ」に戻っていないか。**
 *
 * 一度、稼ぎの55%が売却になって注文がおまけに落ちていた（ふなびんを足して直した）。
 * そのあと、**農園だけが育って注文の枠が3つのままだった**ために、
 * 25分では 注文ぜんぶ 50.6% / 売る 51.2% と、また同じところへ戻っていた。
 * 注文の枠をレベルで増やして 59% に戻してある。
 */
test('稼ぎの主筋は注文であり続ける', () => {
  for (const r of runs(10, 6)) {
    const orders = r.orderPct + r.boatPct;
    assert.ok(orders > 50,
      `10分で注文の取り分が ${orders.toFixed(1)}%（seed ${r.seed}）。` +
      '余りを売るほうが主筋になっている');
  }
});

test('農園が育ちきっても、余りを売るだけのゲームに戻らない', () => {
  const all = runs(25, 6).map((r) => r.orderPct + r.boatPct);
  assert.ok(med(all) > 45,
    `25分で注文の取り分が ${med(all).toFixed(1)}%。生産だけが増えて注文が追いついていない`);
});

test('注文の枠はレベルに沿って増える', () => {
  const { orderSlotsAt } = GF.Data;
  assert.equal(orderSlotsAt(1), 3);
  for (let lv = 2; lv <= 20; lv++) {
    assert.ok(orderSlotsAt(lv) >= orderSlotsAt(lv - 1), `Lv${lv} で枠が減っている`);
  }
  assert.ok(orderSlotsAt(20) > orderSlotsAt(1), 'レベル20でも枠が増えていない');
  // 枠が増えたレベルは、レベルアップの知らせに出る
  for (const r of GF.Data.ORDER_SLOTS) {
    if (r.level === 1) continue;
    assert.ok(GF.Data.unlockedAt(r.level).some((u) => u.kind === 'order'),
      `Lv${r.level} の枠追加が「解放されたもの」に出ていない`);
  }
});
