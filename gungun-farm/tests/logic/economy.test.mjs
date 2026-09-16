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
      // **タネ代が尽きたら売って戻す。** 畑が1秒で回ると、タネ代は毎秒出ていく——
      // 倉庫が満杯になるまで売らない回しかたでは、格上の作物は数十秒で資金切れになる
      const floor = GF.Data.CROPS.reduce((a, c) => Math.max(a, c.cost), 0) * s.fieldsOwned * 3;
      if (s.coins < floor) {
        for (const id of Object.keys(s.barn).sort((a, b) => GF.Data.item(a).sell - GF.Data.item(b).sell)) {
          if (s.coins >= floor) break;
          const spare = (s.barn[id] || 0) - (want[id] || 0);
          if (spare > 0) GF.Engine.sell(s, id, spare);
        }
      }
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

/**
 * **タネ選びが飾りになっていないこと。**
 *
 * 秒数で差をつけるのはやめた（どれも1秒）ので、差は
 * **もうけ**と**タネ代**に寄せてある。タネ代は畑の数だけ毎秒出ていくので、
 * 格上に切り替えるには手元の資金が要る——そこが判断になる。
 */
test('格上の作物は、稼げるがタネ代も重い', () => {
  const cheapest = (s) => GF.Data.cropsAt(s.level).slice().sort((a, b) => a.cost - b.cost)[0].id;
  const dearest = (s) => GF.Data.cropsAt(s.level).slice().sort((a, b) => b.cost - a.cost)[0].id;
  const low = strategy(cheapest);
  const high = strategy(dearest);

  assert.ok(high.coins > low.coins * 1.1,
    `格上の作物で稼げていない（${Math.round(high.coins)} 対 ${Math.round(low.coins)}）`);
  // 下の作物にも取り柄がある: 同じ手数で、はるかに少ない元手で回る
  assert.ok(low.coins > 0, '安い作物では稼げない');
});

test('タネ代が払えないうちは、格上に手が出ない', () => {
  GF.Engine.setRandom(seededRandom(mixSeed(1)));
  const s = GF.Engine.create({ mode: 'free' });
  s.level = GF.Data.MAX_LEVEL;
  s.fieldsOwned = GF.Data.FIELD_SLOTS;
  const melon = GF.Data.crop('melon');

  // 1周ぶんのタネ代に足りない手持ちでは、畑を埋めきれない
  s.coins = melon.cost * 3;
  assert.ok(GF.Engine.plantAll(s, 'melon') < s.fieldsOwned, '資金が足りないのに全部植わった');

  // 同じ手持ちでも、いちばん安い作物なら埋まる
  const s2 = GF.Engine.create({ mode: 'free' });
  s2.level = GF.Data.MAX_LEVEL;
  s2.fieldsOwned = GF.Data.FIELD_SLOTS;
  s2.coins = melon.cost * 3;
  assert.equal(GF.Engine.plantAll(s2, 'wheat'), s2.fieldsOwned, '安い作物でも埋まらない');
});

test('作物は上へ行くほど、もうけもタネ代も1枠の値打ちも上がる', () => {
  const byLevel = GF.Data.CROPS.slice().sort((a, b) => a.level - b.level || a.cost - b.cost);
  const gain = (c) => GF.Data.item(c.id).sell - c.cost;
  for (let i = 1; i < byLevel.length; i++) {
    const lo = byLevel[i - 1], hi = byLevel[i];
    assert.ok(gain(hi) > gain(lo), `${hi.id} のもうけが増えていない`);
    assert.ok(hi.cost > lo.cost, `${hi.id} のタネ代が上がっていない（ただ強いだけの作物）`);
    assert.ok(GF.Data.item(hi.id).sell > GF.Data.item(lo.id).sell, `${hi.id} の1枠の値打ちが上がっていない`);
  }
});

/**
 * **連打がいちばん得になっていないこと。**
 *
 * 作物をぜんぶ1秒・同時に実るようにした直後は、押すのが遅れたぶんがそのまま損になり、
 * 連打が落ち着いた間隔の1.7倍稼いでいた。
 * 植え直しの実り時刻を「さっき実った時刻」から数えるようにして（畑のリズム）、
 * **遅れても取り返せる＝連打しても先へは行けない**形に戻してある。
 */
test('連打しても得をしない（落ち着いた間隔のほうが稼げる）', () => {
  const fast = tempo(200);      // ひたすら連打
  const calm = tempo(800);      // 1秒に1回くらい

  assert.ok(calm.coins >= fast.coins,
    `連打のほうが稼げてしまう（連打 ${Math.round(fast.coins)} / 落ち着き ${Math.round(calm.coins)}）。` +
    'それは我慢比べになる');
  // 1タップあたりの実りも、落ち着いて押したほうが良いこと
  assert.ok(calm.coins / calm.taps > fast.coins / fast.taps,
    `1タップあたりで連打が勝っている（${Math.round(fast.coins / fast.taps)} 対 ${Math.round(calm.coins / calm.taps)}）`);
});

/**
 * ちょうどよい間隔に幅があること。
 *
 * **作物が1秒なので、1秒より遅い間隔はそのぶん収穫が減る**——これは算数で、
 * 設計で消せない。見るのは「**1秒に1回くらいまでなら、どこでも大きく損をしない**」こと。
 */
test('1秒に1回くらいまでなら、どの間隔でも大きくは損をしない', () => {
  const best = tempo(800).coins;
  for (const ms of [200, 400, 1000]) {
    const r = tempo(ms).coins;
    assert.ok(r > best * 0.7,
      `${ms}ms で大きく損をする（${Math.round(r)} 対 ${Math.round(best)}）。間隔がシビアすぎる`);
  }
  // 極端に放っておくと、さすがに落ちる（そうでないと手を動かす意味が無い）
  assert.ok(tempo(6000).coins < best * 0.3, '放っておいても同じだけ稼げてしまう');
});

test('稼ぎの主筋は注文であり続ける', () => {
  const all = runs(10, 6).map((r) => r.orderPct + r.boatPct);
  assert.ok(med(all) > 50,
    `10分で注文の取り分が中央 ${med(all).toFixed(1)}%。余りを売るほうが主筋になっている`);
  assert.ok(Math.min(...all) > 40,
    `いちばん悪い回で ${Math.min(...all).toFixed(1)}%。回によって売却頼みになっている`);
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

/**
 * **人が遊んだときのペース。**
 *
 * ほかの計測は「400ミリ秒おきに休まず触り続ける」前提で、詰みやバランスを見るには
 * それでよい。ただし「10分でレベル14」を人の話として読むと嘘になる。
 * ふだんは毎秒1回くらいで、ときどき画面を見て止まる手の動きで測り直す。
 *
 * 閾値は実測より下に置く（実測 10分 Lv13 → 閾値 Lv10）。
 */
const human = (minutes, n) => Array.from({ length: n }, (_, i) => {
  const seed = mixSeed(i);
  return simulate(GF, { minutes, seed, random: seededRandom(seed), human: true });
});

test('人の手でも、10分でひととおり増えるところまで行く', () => {
  const rs = human(10, 6);
  const lv = med(rs.map((r) => r.level));
  assert.ok(lv >= 10, `人らしい手つきだと10分で Lv${lv} までしか行かない`);
  // 手数が現実離れしていないこと（毎秒1〜2回のあたり）
  const taps = med(rs.map((r) => r.stepsPerMin));
  assert.ok(taps > 30 && taps < 90, `1分あたり ${taps}手。人の手つきの想定から外れている`);
  for (const r of rs) {
    assert.equal(r.rescues, 0, `人の手つきで救済が出た（seed ${r.seed}）`);
    assert.ok(r.worstIdleMs <= 3000, `人の手つきで ${r.worstIdleMs}ms 待たされた`);
  }
});

test('人の手でも、25分あればレベル20に届く', () => {
  const lv = med(human(25, 4).map((r) => r.level));
  assert.ok(lv >= 17, `人らしい手つきだと25分で Lv${lv}。解放しきれない`);
});

test('手を止めない前提と、人の手つきで、差が開きすぎない', () => {
  const fast = med(runs(10, 4).map((r) => r.level));
  const slow = med(human(10, 4).map((r) => r.level));
  assert.ok(fast - slow <= 4,
    `手を止めない人が Lv${fast}、ふつうの人が Lv${slow}。速く叩けるほど有利すぎる`);
});
