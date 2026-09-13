/**
 * BGMのテスト。**鳴らす部分は測れないが、「何を鳴らすか」は純粋な関数**なので測れる。
 *
 * 見ているのは3つ。
 *  - 効果音より小さいこと（収穫の音が主役。BGMはその下に敷く）
 *  - 音階から外れないこと（ペンタトニックと和音の外の音を混ぜない）
 *  - 空の色と同じ一日で、夜が薄くなること
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGF } from './helpers.mjs';

const GF = loadGF(['data.js', 'engine.js', 'storage.js', 'audio.js']);
const { Audio } = GF;

/** 効果音でいちばん静かなもの（tap = 0.05）より下に居ること */
const SFX_QUIETEST = 0.05;

test('BGMは効果音より小さい', () => {
  for (let i = 0; i < 8; i++) {
    for (const n of Audio.musicBar(i, 0.3)) {
      assert.ok(n.gain < SFX_QUIETEST,
        `${i}小節目に ${n.gain} の音がある。収穫の音を埋めてしまう`);
    }
  }
});

test('小節は8つで一巡し、同じ小節はいつも同じ', () => {
  const at = (i) => JSON.stringify(Audio.musicBar(i, 0.3));
  assert.equal(at(0), at(8), '8小節で戻っていない');
  assert.equal(at(3), at(11));
  assert.notEqual(at(0), at(1), 'どの小節も同じでは輪にならない');
  assert.equal(at(0), at(-8), '負の小節番号でも落ちない');
});

test('音階から外れた音を混ぜない', () => {
  const C4 = 261.63;
  // ド レ ミ ファ ソ ラ シ（C長調）だけ。半音は使わない
  const ok = new Set([0, 2, 4, 5, 7, 9, 11]);
  for (let i = 0; i < 8; i++) {
    for (const phase of [0.3, 0.65, 0.85]) {
      for (const n of Audio.musicBar(i, phase)) {
        const semis = Math.round(12 * Math.log2(n.freq / C4));
        assert.ok(ok.has(((semis % 12) + 12) % 12),
          `${i}小節目に音階の外の音がある（${n.freq.toFixed(1)}Hz）`);
      }
    }
  }
});

test('小節のなかに収まる（次の小節に食い込まない音を作らない）', () => {
  const bar = Audio.BAR_SEC;
  for (let i = 0; i < 8; i++) {
    for (const n of Audio.musicBar(i, 0.3)) {
      assert.ok(n.at >= 0 && n.at < bar, `${i}小節目: at=${n.at} が小節の外`);
      assert.ok(n.at + n.dur <= bar + 0.01, `${i}小節目: 音が次の小節へはみ出す`);
    }
  }
});

test('夜は薄く、昼は明るい（空の色と同じ一日）', () => {
  const day = Audio.musicBar(0, 0.3);
  const night = Audio.musicBar(0, 0.85);
  assert.ok(night.length < day.length, '夜もメロディが鳴っている');
  assert.ok(night.length > 0, '夜に無音になると、止まったように聞こえる');

  const loud = (ns) => ns.reduce((a, n) => a + n.gain, 0);
  assert.ok(loud(night) < loud(day), '夜のほうが賑やか');

  // 昼→夕→夜がなめらか（段差で切り替わると、音が急に消えたように聞こえる）
  let prev = Audio.brightness(0);
  for (let p = 0; p <= 1.0001; p += 0.01) {
    const now = Audio.brightness(p);
    assert.ok(Math.abs(now - prev) < 0.15, `明るさが ${p.toFixed(2)} で飛んでいる`);
    prev = now;
  }
  assert.equal(Audio.brightness(1.05), Audio.brightness(0.05), '一日をまたいでも続く');
});

test('BGMの入り切りは設定に定義されている（書き忘れると復元されない）', () => {
  assert.equal(GF.Store.DEFAULTS.settings.music, true);
});
