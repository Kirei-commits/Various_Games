/**
 * きょうの作物のテスト。
 *
 * このゲームは待ちが無いぶん、同じ輪をひたすら回すことになりやすい。
 * 一日（3分）ごとに1つの作物のもうけが上がることで、
 * **手なりで最適だった選択が3分ごとにずれる**——それが狙い。
 *
 * ただし、これは**タネ選びの取引を壊しかねない**強い仕掛けでもあるので、
 * 「壊れていないこと」を両側から挟んでいる。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF, mixSeed, seededRandom } from './helpers.mjs';

const GF = loadGF(['data.js', 'engine.js']);
const { Engine, Data } = GF;
const DAY = Engine.DAY_MS;

const fresh = (level = 1) => {
  Engine.setRandom(seededRandom(mixSeed(0)));
  const s = Engine.create({ bare: true });
  s.level = level;
  return s;
};

test('一日ごとに、きょうの作物が変わる', () => {
  const s = fresh(20);
  const seen = [];
  for (let d = 0; d < 8; d++) {
    Engine.tick(s, d * DAY + 10);
    seen.push(Engine.todayCrop(s));
  }
  assert.equal(seen.filter(Boolean).length, 8, '毎日ひとつ決まる');
  for (let i = 1; i < seen.length; i++) {
    assert.notEqual(seen[i], seen[i - 1], `${i}日目が前日と同じ（変わったことが分からない）`);
  }
  assert.ok(new Set(seen).size >= 4, `8日で ${new Set(seen).size} 種類しか出ない。偏りすぎ`);
});

test('一日のあいだは変わらない', () => {
  const s = fresh(20);
  Engine.tick(s, 10);
  const first = Engine.todayCrop(s);
  for (let t = 10; t < DAY; t += DAY / 20) {
    Engine.tick(s, t);
    assert.equal(Engine.todayCrop(s), first, '日の途中で入れ替わっている');
  }
});

test('解放していない作物は選ばれない', () => {
  for (const level of [1, 2, 5, 11, 20]) {
    const s = fresh(level);
    for (let d = 0; d < 12; d++) {
      Engine.tick(s, d * DAY + 10);
      const c = Data.crop(Engine.todayCrop(s));
      assert.ok(c && c.level <= level, `Lv${level} で ${c && c.id} が選ばれた`);
    }
  }
});

/**
 * **共有の乱数を引かない。** 引くと注文の抽選がその分ずれて、
 * 「間隔だけを変えて比べる」ような計測が、条件ごとに別の引きを掴んでしまう
 * （実際、これで tempo の比較が 400ms だけ3割落ちたように見えた）。
 */
test('きょうの作物は乱数を引かない', () => {
  const s = fresh(20);
  let draws = 0;
  Engine.setRandom(() => { draws++; return 0.5; });
  for (let d = 0; d < 10; d++) {
    s.now = d * DAY + 10;
    Engine.rollToday(s);
  }
  assert.equal(draws, 0, '乱数を引いている。注文の抽選がずれる');
  assert.ok(Engine.todayCrop(s), '引かないだけで、決まってはいる');
});

test('もうけに倍率が掛かる（売値そのものには掛けない）', () => {
  const s = fresh(20);
  for (const c of Data.CROPS) {
    s.today = { day: 0, crop: c.id };
    const base = Data.item(c.id).sell;
    const up = Engine.unitPrice(s, c.id);
    assert.equal(up - c.cost, Math.ceil((base - c.cost) * Engine.TODAY_BONUS),
      `${c.id} のもうけに倍率が掛かっていない`);
    assert.ok(up < base * Engine.TODAY_BONUS || c.cost === 0,
      `${c.id} が売値まるごと1.5倍になっている（タネ代の高い作物ほど得をしてしまう）`);
  }
});

/**
 * **きょうの作物は「ひとつ格上」には勝ち、「ふたつ格上」には勝てない。**
 *
 * 勝てないと、きょうの作物はただの飾りになる（どうせ格上を植えたほうが得）。
 * 勝ちすぎると、レベルを上げて作物を解放する意味が薄れる。
 * 作物の坂は1段あたり およそ1.2〜1.3倍なので、そのあいだに倍率を置いてある。
 */
test('きょうの作物は、ひとつ格上には勝ち、ふたつ格上には勝てない', () => {
  const s = fresh(20);
  const ladder = Data.CROPS.slice().sort((a, b) => a.cost - b.cost);
  const gain = (c) => Engine.unitPrice(s, c.id) - c.cost;

  for (let i = 0; i < ladder.length; i++) {
    s.today = { day: 0, crop: ladder[i].id };
    if (i + 1 < ladder.length) {
      assert.ok(gain(ladder[i]) > gain(ladder[i + 1]),
        `${ladder[i].id} が ひとつ格上（${ladder[i + 1].id}）に勝てない。きょうの作物が飾りになる`);
    }
    if (i + 2 < ladder.length) {
      assert.ok(gain(ladder[i]) < gain(ladder[i + 2]),
        `${ladder[i].id} が ふたつ格上（${ladder[i + 2].id}）にまで勝つ。レベルを上げる意味が薄れる`);
    }
  }
});

test('店も船の引き取りも、きょうの値段で払う', () => {
  const s = fresh(20);
  Engine.tick(s, 10);
  const id = Engine.todayCrop(s);
  Engine.store(s, id, 4);
  const before = s.coins;
  const got = Engine.sell(s, id, 4);
  assert.equal(got, Engine.unitPrice(s, id) * 4);
  assert.equal(s.coins, before + got);
  assert.ok(got > Data.item(id).sell * 4, 'きょうの作物なのに定価で売れている');
});

test('古い保存にも、きょうの作物が入る', () => {
  const s = fresh(6);
  delete s.today;
  Engine.normalize(s);
  Engine.tick(s, 1000);
  assert.ok(Engine.todayCrop(s), 'normalize を通しても決まらない');
});
