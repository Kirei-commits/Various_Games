/**
 * Web Audio API で効果音をその場で合成する。音声ファイルを持たないため配信物が増えない。
 * 自動再生制限があるので、最初の操作まで AudioContext を作らない。
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

  function tone({ freq = 440, to = freq, dur = 0.12, type = 'sine', gain = 0.15, delay = 0 }) {
    const ac = context();
    if (!ac) return;
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const amp = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise({ dur = 0.2, gain = 0.2, delay = 0 }) {
    const ac = context();
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    const amp = ac.createGain();
    src.buffer = buf;
    amp.gain.value = gain;
    src.connect(amp).connect(ac.destination);
    src.start(ac.currentTime + delay);
  }

  const SFX = {
    select: () => tone({ freq: 660, dur: 0.05, type: 'triangle', gain: 0.06 }),
    attack: () => { tone({ freq: 180, to: 90, dur: 0.18, type: 'sawtooth', gain: 0.12 }); noise({ dur: 0.14, gain: 0.1 }); },
    block:  () => { tone({ freq: 900, to: 1400, dur: 0.1, type: 'square', gain: 0.07 }); },
    hit:    () => { noise({ dur: 0.25, gain: 0.22 }); tone({ freq: 120, to: 60, dur: 0.25, type: 'sawtooth', gain: 0.14 }); },
    heal:   () => { tone({ freq: 520, to: 880, dur: 0.22, type: 'sine', gain: 0.1 }); },
    pray:   () => { [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.08, delay: i * 0.07 })); },
    defeat: () => { tone({ freq: 300, to: 60, dur: 0.6, type: 'sawtooth', gain: 0.16 }); },
    win:    () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.12, delay: i * 0.12 })); },
    lose:   () => { [400, 340, 280, 200].forEach((f, i) => tone({ freq: f, dur: 0.35, type: 'sine', gain: 0.12, delay: i * 0.14 })); }
  };

  function play(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 音が出せなくてもゲームは続ける */ } }
  }

  global.GA = global.GA || {};
  global.GA.Audio = {
    play,
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
