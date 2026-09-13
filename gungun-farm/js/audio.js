/**
 * Web Audio API で効果音をその場で合成する。音声ファイルを持たないので配信物が増えない。
 * 自動再生制限があるため、最初の操作まで AudioContext を作らない。
 */
(function (global) {
  'use strict';

  let ctx = null;
  let enabled = true;

  function context() {
    if (!enabled) return null;
    try {
      if (!ctx) {
        const AC = global.AudioContext || global.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) {
      return null;
    }
  }

  function tone({ freq = 440, to = freq, dur = 0.12, type = 'triangle', gain = 0.12, delay = 0 }) {
    const ac = context();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  /** 明るい和音。短く、重ねすぎない（連打されるので耳が痛くならない音量にする）。 */
  const chord = (freqs, opts = {}) => freqs.forEach((f, i) => tone(Object.assign({ freq: f, delay: i * 0.045 }, opts)));

  /**
   * 続けて鳴らすほど音が上がる（収穫のような繰り返す操作用）。
   * 途切れると最初の高さに戻る。同じ音が続くより、段を上がるほうが手応えが出る。
   */
  const ladders = {};
  function ladder(name, gap = 900, steps = 8) {
    const now = (global.performance ? performance.now() : Date.now());
    const l = ladders[name] || (ladders[name] = { at: 0, step: 0 });
    l.step = (now - l.at < gap) ? Math.min(steps, l.step + 1) : 0;
    l.at = now;
    return Math.pow(2, l.step / 12);          // 半音ずつ上がる
  }

  const SFX = {
    tap:     () => tone({ freq: 880, dur: 0.04, gain: 0.05 }),
    plant:   () => tone({ freq: 420, to: 700, dur: 0.09, type: 'sine', gain: 0.08 }),
    harvest: () => {
      const k = ladder('harvest');
      tone({ freq: 760 * k, to: 1180 * k, dur: 0.09, type: 'sine', gain: 0.09 });
    },
    /** まとめて穫れたとき。段を駆け上がる */
    harvestMany: (n) => {
      const k = ladder('harvest');
      for (let i = 0; i < Math.min(4, Math.max(2, Math.round(n / 3))); i++) {
        tone({ freq: 660 * k * Math.pow(2, i / 12 * 2), dur: 0.07, type: 'sine', gain: 0.08, delay: i * 0.045 });
      }
    },
    craft:   () => tone({ freq: 300, to: 520, dur: 0.11, type: 'square', gain: 0.05 }),
    collect: () => chord([880, 1180], { dur: 0.08, gain: 0.07, type: 'sine' }),
    coin:    () => chord([1046, 1568], { dur: 0.1, gain: 0.09 }),
    deliver: () => chord([784, 988, 1318], { dur: 0.14, gain: 0.09 }),
    levelup: () => chord([523, 659, 784, 1046], { dur: 0.22, gain: 0.1 }),
    buy:     () => chord([392, 587], { dur: 0.13, gain: 0.09, type: 'sine' }),
    nope:    () => tone({ freq: 180, to: 120, dur: 0.12, type: 'sawtooth', gain: 0.05 }),
    finish:  () => chord([659, 880, 1318, 1760], { dur: 0.3, gain: 0.1 })
  };

  /* ------------------------------------------------------------------ BGM */

  /**
   * 短い輪を合成して流す。**音源ファイルは持ち込まない**（配信物を増やさない）。
   *
   * 作りは2つに分ける。
   *  - `musicBar()` … その小節で鳴らす音を返すだけの**純粋な関数**（テストできる）
   *  - `musicTick()` … 先読みして予約するだけ（`setInterval` の揺れを音に出さない）
   *
   * 決めごと:
   *  - **乱数を引かない。** ここで引くと注文の抽選がずれる（`Engine` と同じ乱数ではないが、
   *    「音のために遊びが変わる」形はどこにも作らない）。小節番号から決める
   *  - **効果音より小さく。** 収穫の音は数千回鳴る主役なので、BGMはその下に敷く
   *  - **メロディはペンタトニック**（ド レ ミ ソ ラ）。収穫の音は半音ずつ上がるので、
   *    半音を持つ音階だとぶつかる回数が増える
   *  - **夜は薄くする。** 空の色と同じ一日で、メロディを落としてベースだけにする
   */
  const BAR_SEC = 2;                                   // 1小節（120拍/分の4拍）
  const C4 = 261.63;
  const semi = (n) => C4 * Math.pow(2, n / 12);
  //            C     G     Am    F
  const CHORDS = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16];           // ド レ ミ ソ ラ（2オクターブ）
  /** 8小節ぶんの旋律の形。小節番号から引くので、毎回同じ輪になる */
  const SHAPE = [
    [0, 2, 4, 3], [4, 3, 2, 0], [2, 4, 5, 4], [3, 2, 0, 2],
    [4, 5, 6, 5], [5, 4, 3, 4], [2, 3, 4, 6], [4, 2, 1, 0]
  ];

  /**
   * 夜は 0、昼は 1。**区切りは空の色（`Render.SKY`）と同じところに置く。**
   * ずれていると、空はもう夜なのにメロディだけ鳴っている、という時間ができる。
   */
  function brightness(phase) {
    const p = ((phase % 1) + 1) % 1;
    if (p < 0.12) return 1;                        // 朝（もう明るい）
    if (p < 0.50) return 1;                        // 昼
    if (p < 0.74) return 1 - (p - 0.50) / 0.24;    // 夕（だんだん薄く）
    if (p < 0.90) return 0;                        // 夜
    return (p - 0.90) / 0.10;                      // 夜明け
  }

  /**
   * `i` 小節目に鳴らす音。`at` は小節の頭からの秒数。
   * 返すだけで、鳴らしはしない（だからテストできる）。
   */
  function musicBar(i, phase = 0.3) {
    const bar = ((i % 8) + 8) % 8;
    const chord = CHORDS[bar % 4];
    const light = brightness(phase);
    const out = [];

    // ベース。1拍目と3拍目。夜も残す（輪が途切れると止まったように聞こえる）
    for (const beat of [0, 2]) {
      out.push({ freq: semi(chord[0] - 12), at: beat * 0.5, dur: 0.42, gain: 0.030, type: 'sine' });
    }
    // 和音を薄く敷く
    for (const n of chord) {
      out.push({ freq: semi(n), at: 0, dur: 1.7, gain: 0.010 + 0.006 * light, type: 'sine' });
    }
    // メロディ。夜は鳴らさない
    if (light > 0.25) {
      SHAPE[bar].forEach((step, k) => {
        out.push({
          freq: semi(PENTA[step] + 12),
          at: 0.5 + k * 0.375,
          dur: 0.3,
          gain: 0.016 * light,
          type: 'triangle'
        });
      });
    }
    return out;
  }

  const music = { on: false, timer: null, bar: 0, next: 0, phase: 0.3 };

  function musicTick() {
    const ac = context();
    if (!ac || !music.on) return;
    // 裏に回っていた等で遅れたら、輪を巻き戻さず今から続ける（まとめて鳴らさない）
    if (music.next < ac.currentTime) music.next = ac.currentTime + 0.05;
    while (music.next < ac.currentTime + 0.4) {
      const lead = music.next - ac.currentTime;
      for (const n of musicBar(music.bar, music.phase)) {
        tone({ freq: n.freq, dur: n.dur, gain: n.gain, type: n.type, delay: lead + n.at });
      }
      music.bar++;
      music.next += BAR_SEC;
    }
  }

  function startMusic() {
    if (music.on || !enabled) return;
    const ac = context();
    if (!ac) return;
    music.on = true;
    music.next = ac.currentTime + 0.1;
    music.timer = global.setInterval(musicTick, 200);
    musicTick();
  }

  function stopMusic() {
    music.on = false;
    if (music.timer) { global.clearInterval(music.timer); music.timer = null; }
  }

  /** 一日のどこかを伝える（0..1）。空の色と同じ値を渡す */
  const setMusicPhase = (phase) => { music.phase = phase; };

  function play(name, arg) {
    const fn = SFX[name];
    if (fn) { try { fn(arg); } catch (e) { /* 音が鳴らないだけなので握りつぶす */ } }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled) { stopMusic(); if (ctx) { try { ctx.suspend(); } catch (e) { /* noop */ } } }
  }

  global.GF = global.GF || {};
  global.GF.Audio = {
    play, setEnabled, isEnabled: () => enabled,
    startMusic, stopMusic, setMusicPhase, musicBar, brightness,
    isMusicOn: () => music.on, BAR_SEC
  };
})(typeof window !== 'undefined' ? window : globalThis);
