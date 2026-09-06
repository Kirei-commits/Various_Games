/**
 * Web Audio API で効果音をその場で合成する。
 * 音声ファイルを持たないので、実行時依存ゼロのまま音が出せる。
 *
 * AudioContext はユーザー操作より前に作れない/再開できないブラウザがあるため、
 * 最初の操作で resume する。失敗しても例外を外に出さない（音が出ないだけにする）。
 */
(function (global) {
  'use strict';

  var ctx = null;
  var enabled = true;

  function ensure() {
    if (ctx) return ctx;
    try {
      var AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch (e) { ctx = null; }
    return ctx;
  }

  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) {} }
  }

  function tone(opts) {
    var c = ensure();
    if (!c || !enabled) return;
    try {
      var t0 = c.currentTime + (opts.delay || 0);
      var osc = c.createOscillator();
      var gain = c.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(opts.from, t0);
      if (opts.to && opts.to !== opts.from) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.to), t0 + opts.dur);
      }
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(opts.vol || 0.15, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
      osc.connect(gain).connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + opts.dur + 0.02);
    } catch (e) {}
  }

  function noise(opts) {
    var c = ensure();
    if (!c || !enabled) return;
    try {
      var dur = opts.dur || 0.3;
      var len = Math.floor(c.sampleRate * dur);
      var buf = c.createBuffer(1, len, c.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, opts.decay || 2);
      }
      var src = c.createBufferSource();
      src.buffer = buf;
      var filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = opts.freq || 900;
      filter.Q.value = opts.q || 1;
      var gain = c.createGain();
      gain.gain.value = opts.vol || 0.12;
      src.connect(filter).connect(gain).connect(c.destination);
      src.start(c.currentTime + (opts.delay || 0));
    } catch (e) {}
  }

  var SOUNDS = {
    cast: function () {
      noise({ dur: 0.35, freq: 1500, q: 0.8, vol: 0.10, decay: 1.2 });
      tone({ type: 'sine', from: 900, to: 260, dur: 0.28, vol: 0.06 });
    },
    splash: function () { noise({ dur: 0.25, freq: 600, q: 0.6, vol: 0.12, decay: 3 }); },
    bite: function () {
      tone({ type: 'square', from: 880, to: 880, dur: 0.07, vol: 0.10 });
      tone({ type: 'square', from: 1320, to: 1320, dur: 0.09, vol: 0.10, delay: 0.09 });
    },
    reel: function () { tone({ type: 'triangle', from: 220, to: 200, dur: 0.05, vol: 0.05 }); },
    land: function (stars) {
      var root = 392; // G4
      var steps = [0, 4, 7, 12, 16];
      var n = Math.min(5, Math.max(2, (stars || 1) + 1));
      for (var i = 0; i < n; i++) {
        tone({
          type: 'triangle',
          from: root * Math.pow(2, steps[i] / 12),
          to: root * Math.pow(2, steps[i] / 12),
          dur: 0.24, vol: 0.11, delay: i * 0.075
        });
      }
    },
    miss: function () {
      tone({ type: 'sawtooth', from: 320, to: 90, dur: 0.4, vol: 0.09 });
    },
    snap: function () {
      noise({ dur: 0.18, freq: 2400, q: 2, vol: 0.14, decay: 4 });
      tone({ type: 'sawtooth', from: 500, to: 80, dur: 0.35, vol: 0.09 });
    },
    levelup: function () {
      var seq = [523, 659, 784, 1047];
      for (var i = 0; i < seq.length; i++) {
        tone({ type: 'square', from: seq[i], to: seq[i], dur: 0.16, vol: 0.09, delay: i * 0.09 });
      }
    },
    buy: function () {
      tone({ type: 'square', from: 1200, to: 1600, dur: 0.09, vol: 0.08 });
    },
    achieve: function () {
      var seq = [784, 988, 1175, 1568];
      for (var i = 0; i < seq.length; i++) {
        tone({ type: 'triangle', from: seq[i], to: seq[i], dur: 0.22, vol: 0.10, delay: i * 0.10 });
      }
    }
  };

  global.FQ = global.FQ || {};
  global.FQ.Sfx = {
    setEnabled: function (v) { enabled = !!v; if (enabled) unlock(); },
    isEnabled: function () { return enabled; },
    unlock: unlock,
    play: function (name, arg) {
      if (!enabled) return;
      var fn = SOUNDS[name];
      if (fn) { unlock(); fn(arg); }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
