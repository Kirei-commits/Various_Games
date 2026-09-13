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

  const SFX = {
    tap:     () => tone({ freq: 880, dur: 0.04, gain: 0.05 }),
    plant:   () => tone({ freq: 420, to: 700, dur: 0.09, type: 'sine', gain: 0.08 }),
    harvest: () => tone({ freq: 760, to: 1180, dur: 0.09, type: 'sine', gain: 0.09 }),
    craft:   () => tone({ freq: 300, to: 520, dur: 0.11, type: 'square', gain: 0.05 }),
    collect: () => chord([880, 1180], { dur: 0.08, gain: 0.07, type: 'sine' }),
    coin:    () => chord([1046, 1568], { dur: 0.1, gain: 0.09 }),
    deliver: () => chord([784, 988, 1318], { dur: 0.14, gain: 0.09 }),
    levelup: () => chord([523, 659, 784, 1046], { dur: 0.22, gain: 0.1 }),
    buy:     () => chord([392, 587], { dur: 0.13, gain: 0.09, type: 'sine' }),
    nope:    () => tone({ freq: 180, to: 120, dur: 0.12, type: 'sawtooth', gain: 0.05 }),
    finish:  () => chord([659, 880, 1318, 1760], { dur: 0.3, gain: 0.1 })
  };

  function play(name) {
    const fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 音が鳴らないだけなので握りつぶす */ } }
  }

  function setEnabled(on) {
    enabled = !!on;
    if (!enabled && ctx) { try { ctx.suspend(); } catch (e) { /* noop */ } }
  }

  global.GF = global.GF || {};
  global.GF.Audio = { play, setEnabled, isEnabled: () => enabled };
})(typeof window !== 'undefined' ? window : globalThis);
