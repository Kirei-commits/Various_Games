// 効果音と BGM（Web Audio で合成する。音のファイルは使わない）
const Sound = (() => {
  let ctx = null, master = null, seBus = null, bgmBus = null, noiseBuf = null;
  const last = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.connect(ctx.destination);
    seBus = ctx.createGain(); seBus.connect(master);
    bgmBus = ctx.createGain(); bgmBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    apply();
  }
  function apply() {
    if (!ctx) return;
    const s = Store.d.settings;
    master.gain.value = s.mute ? 0 : 1;
    seBus.gain.value = s.se / 100 * 0.5;
    bgmBus.gain.value = s.bgm / 100 * 0.22;
  }
  /** 同じ音を短い間に何度も鳴らさない */
  function gate(name, gap) { const t = performance.now(); if (last[name] && t - last[name] < gap) return false; last[name] = t; return true; }
  function tone(f, dur, { type = 'square', vol = 0.3, slide = 0, at = 0, bus = seBus, attack = 0.005 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(bus); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, { vol = 0.3, freq = 1200, q = 1, type = 'bandpass', at = 0, sweep = 0 } = {}) {
    if (!ctx) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(seBus); s.start(t); s.stop(t + dur + 0.02);
  }
  const SE = {
    ui() { tone(880, 0.06, { type: 'triangle', vol: 0.2 }); },
    pick() { if (gate('pick', 45)) tone(1300 + Math.random() * 300, 0.05, { type: 'triangle', vol: 0.12 }); },
    throw() { if (gate('throw', 50)) noise(0.09, { vol: 0.16, freq: 2500, q: 0.8, sweep: 0.4 }); },
    hit() { if (gate('hit', 35)) noise(0.05, { vol: 0.14, freq: 900, q: 2 }); },
    kill() { if (gate('kill', 45)) { tone(520 + Math.random() * 200, 0.08, { type: 'square', vol: 0.08, slide: 0.5 }); noise(0.07, { vol: 0.1, freq: 3000 }); } },
    boom() { if (gate('boom', 80)) { noise(0.3, { vol: 0.3, freq: 300, type: 'lowpass', sweep: 0.3 }); tone(90, 0.25, { type: 'sine', vol: 0.3, slide: 0.5 }); } },
    gate(good) {
      noise(0.25, { vol: 0.25, freq: 4000, q: 0.6, sweep: 0.5 });
      const n = good ? [660, 880, 1320] : [400, 300, 220];
      n.forEach((f, i) => tone(f, 0.15, { type: 'square', vol: 0.12, at: i * 0.07 }));
    },
    cageHit() { if (gate('cage', 70)) tone(1800, 0.05, { type: 'triangle', vol: 0.08 }); },
    cage() { noise(0.4, { vol: 0.3, freq: 2500, q: 0.5, sweep: 0.3 }); [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, { type: 'square', vol: 0.12, at: 0.05 + i * 0.09 })); },
    merge() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.14, { type: 'triangle', vol: 0.18, at: i * 0.05 })); },
    join() { [523, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.15, at: i * 0.07 })); },
    leak() { if (gate('leak', 120)) { tone(140, 0.25, { type: 'sawtooth', vol: 0.2, slide: 0.5 }); } },
    barrier() { if (gate('barrier', 120)) tone(1200, 0.15, { type: 'sine', vol: 0.15, slide: 1.5 }); },
    thunder() { noise(0.6, { vol: 0.4, freq: 600, type: 'lowpass', sweep: 0.2 }); tone(60, 0.5, { type: 'sawtooth', vol: 0.15, slide: 0.6 }); },
    boss() { [196, 185, 175, 165].forEach((f, i) => tone(f, 0.3, { type: 'sawtooth', vol: 0.14, at: i * 0.18 })); },
    win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, { type: 'square', vol: 0.14, at: i * 0.11 })); },
    lose() { [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.2, at: i * 0.2 })); },
    buy() { [880, 1320].forEach((f, i) => tone(f, 0.1, { type: 'square', vol: 0.12, at: i * 0.06 })); }
  };

  // ---- BGM: 4小節を繰り返す小さなシーケンサー ----
  const SONGS = {
    menu: { bpm: 112, bass: [48, 48, 55, 55, 53, 53, 50, 55], lead: [72, 0, 76, 79, 0, 76, 74, 0, 72, 0, 69, 72, 0, 74, 76, 0, 77, 0, 76, 74, 0, 72, 74, 0, 71, 0, 72, 74, 0, 76, 79, 0], wave: 'triangle' },
    battle: { bpm: 138, bass: [45, 45, 48, 48, 43, 43, 50, 52], lead: [69, 72, 76, 72, 74, 72, 69, 0, 67, 69, 72, 69, 71, 67, 64, 0, 65, 69, 72, 76, 74, 72, 74, 76, 77, 76, 74, 72, 71, 72, 74, 0], wave: 'square' },
    boss: { bpm: 152, bass: [40, 40, 40, 43, 41, 41, 39, 38], lead: [64, 0, 64, 67, 63, 0, 63, 66, 64, 0, 71, 0, 70, 69, 68, 0, 64, 0, 64, 67, 63, 0, 63, 66, 76, 75, 74, 73, 72, 71, 70, 0], wave: 'sawtooth' }
  };
  let song = null, step = 0, nextT = 0, timer = null;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function play(name) {
    if (!ctx) return;
    if (song === SONGS[name]) return;
    song = SONGS[name]; step = 0; nextT = ctx.currentTime + 0.1;
    if (!timer) timer = setInterval(tick, 60);
  }
  function stop() { song = null; }
  function tick() {
    if (!ctx || !song) return;
    const sp = 60 / song.bpm / 2;   // 8分音符
    while (nextT < ctx.currentTime + 0.25) {
      const at = nextT - ctx.currentTime;
      const b = song.bass[Math.floor(step / 4) % song.bass.length];
      if (step % 2 === 0) tone(mtof(b), sp * 1.6, { type: 'triangle', vol: 0.5, at, bus: bgmBus });
      const m = song.lead[step % song.lead.length];
      if (m) tone(mtof(m), sp * 0.9, { type: song.wave, vol: 0.16, at, bus: bgmBus });
      if (step % 4 === 2) { // ハイハット
        const s = ctx.createBufferSource(); s.buffer = noiseBuf;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
        const g = ctx.createGain(); const t = ctx.currentTime + at;
        g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
        s.connect(f); f.connect(g); g.connect(bgmBus); s.start(t); s.stop(t + 0.05);
      }
      nextT += sp; step++;
    }
  }
  return { init, apply, play, stop, ...SE };
})();
