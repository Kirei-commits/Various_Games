/**
 * 一日の空の色。待ち時間が無いので一日も速く回る（3分で一巡）。
 * **明るいゲームなので、暗くしすぎない。** 夜も濃い青どまりにする。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF } from './helpers.mjs';

const GF = loadGF(['data.js', 'engine.js', 'render.js']);
const { skyAt } = GF.Render;

/** 明るさ（0..255）。人の目の感じ方に合わせた重みで測る */
const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const phases = Array.from({ length: 101 }, (_, i) => i / 100);

test('一日じゅう、空が暗くなりすぎない', () => {
  for (const p of phases) {
    const c = skyAt(p);
    for (const [name, col] of [['上', c.top], ['下', c.bot]]) {
      assert.ok(lum(col) >= 100,
        `${(p * 100).toFixed(0)}% の空の${name}が暗い（明るさ ${lum(col).toFixed(0)}）。` +
        'ポップな見た目を壊さないため、夜も濃い青どまりにする');
    }
  }
});

test('土の色（茶）と近づきすぎる時間帯が無い', () => {
  // 空と畑が同系色になると、農園の輪郭が読めなくなる（夕方を橙にして実際に起きた）
  const soil = [0xd3, 0xa0, 0x6a];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const p of phases) {
    const c = skyAt(p);
    assert.ok(dist(c.bot, soil) > 60,
      `${(p * 100).toFixed(0)}% の空が土の色に近い（距離 ${dist(c.bot, soil).toFixed(0)}）`);
  }
});

test('一日の半分くらいは、はっきりした青空でいる', () => {
  // 隣の色へずっと補間していると、青と桃が混ざった灰色の帯が長く居座る
  const blue = phases.filter((p) => {
    const c = skyAt(p);
    return c.top[2] > 220 && c.top[2] - c.top[0] > 80;    // 青が強い
  });
  assert.ok(blue.length >= phases.length * 0.35,
    `青空の時間が短い（${Math.round(blue.length / phases.length * 100)}%）`);
});

test('色はなめらかに移る（隣り合う時刻で飛ばない）', () => {
  let prev = skyAt(0);
  for (const p of phases.slice(1)) {
    const c = skyAt(p);
    for (const k of ['top', 'bot']) {
      const jump = Math.max(...c[k].map((v, i) => Math.abs(v - prev[k][i])));
      assert.ok(jump < 40, `${(p * 100).toFixed(0)}% で色が飛んでいる（${k} の差 ${jump}）`);
    }
    prev = c;
  }
});

test('一日は3分で一巡する（待ち時間が無いぶん速く回す）', () => {
  assert.equal(GF.Render.DAY_MS, 180_000);
  // ちょうど一巡すると朝に戻る
  const a = skyAt(0), b = skyAt(1);
  assert.deepEqual(a.top, b.top);
  assert.deepEqual(a.bot, b.bot);
});
