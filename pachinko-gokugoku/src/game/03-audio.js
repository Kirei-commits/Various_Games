// =====================================================================
//  オーディオ（Web Audio API リアルタイム合成）
// =====================================================================
const VOL_TABLE = [0, 0.12, 0.26, 0.45, 0.7, 1];
const Sound = {
  ctx: null, master: null, sfx: null, bgm: null, rockBus: null, noise: null, on: false, lastShot: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.bgmOut = c.createGain(); this.bgmOut.gain.value = 0.5; this.bgmOut.connect(this.master);
    this.bgm = c.createGain(); this.bgm.connect(this.bgmOut);
    // ノイズバッファ
    const len = c.sampleRate; const b = c.createBuffer(1, len, c.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    this.noise = b;
    // ハードロック用の歪みバス
    const ws = c.createWaveShaper(); const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / n * 2 - 1; curve[i] = Math.tanh(x * 8); }
    ws.curve = curve; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const rg = c.createGain(); rg.gain.value = 0.22; ws.connect(lp); lp.connect(rg); rg.connect(this.bgm); this.rockBus = ws;
    this.on = true; this.setVolume(D.settings.vol); BGM.start();
  },
  setVolume(lv) { if (this.master) this.master.gain.setTargetAtTime(VOL_TABLE[lv], this.ctx.currentTime, 0.03); },
  now() { return this.ctx.currentTime; },
  osc(type, f, t, dur, g, dest, f2, atk) {
    const c = this.ctx, o = c.createOscillator(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const a = atk || 0.005;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + a); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn); gn.connect(dest || this.sfx); o.start(t); o.stop(t + dur + 0.05);
  },
  synth(type, f, t, dur, g, cut, dest, detune, atk) {
    const c = this.ctx, o = c.createOscillator(), fl = c.createBiquadFilter(), gn = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (detune) o.detune.value = detune;
    fl.type = 'lowpass'; fl.frequency.setValueAtTime(cut || 4000, t); fl.Q.value = 2;
    const a = atk || 0.008;
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(g, t + a); gn.gain.setTargetAtTime(0.0001, t + dur * 0.6, dur * 0.25);
    o.connect(fl); fl.connect(gn); gn.connect(dest || this.bgm); o.start(t); o.stop(t + dur * 1.6 + 0.1);
  },
  noiseHit(t, dur, g, type, freq, q, dest, f2) {
    const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), gn = c.createGain();
    s.buffer = this.noise; fl.type = type; fl.frequency.setValueAtTime(freq, t); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur); fl.Q.value = q || 1;
    gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(gn); gn.connect(dest || this.sfx); s.start(t, rnd() * 0.5); s.stop(t + dur + 0.05);
  },
  // 全消音（フリーズ・違和感）
  silence(dur) {
    if (!this.on) return; const t = this.now(), g = this.master.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.setValueAtTime(VOL_TABLE[D.settings.vol], t + dur);
    if (window.speechSynthesis) speechSynthesis.cancel();
  },
  cutBgm(dur) {
    if (!this.on) return; const t = this.now(), g = this.bgmOut.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(0.0001, t); g.setValueAtTime(0.5, t + dur);
  },
  speak(text, pitch) {
    if (!this.on || !window.speechSynthesis || D.settings.vol <= 0) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; u.rate = 1.15; u.pitch = pitch || 1.3; u.volume = Math.min(1, VOL_TABLE[D.settings.vol] * 1.1);
      speechSynthesis.speak(u);
    } catch (e) { }
  },
  play(name, p) {
    if (!this.on) return;
    const t = this.now();
    switch (name) {
      case 'shot': if (t - this.lastShot < 0.08) return; this.lastShot = t; this.noiseHit(t, 0.035, 0.12, 'highpass', 2600); this.osc('square', 180, t, 0.03, 0.05); break;
      case 'chucker': this.osc('square', 1568, t, 0.07, 0.13); this.osc('square', 2093, t + 0.06, 0.12, 0.13); break;
      case 'denchu': this.osc('triangle', 2093, t, 0.06, 0.14); this.osc('triangle', 2637, t + 0.05, 0.08, 0.12); break;
      case 'entry': this.osc('triangle', 2637 + (p || 0) * 60, t, 0.07, 0.2); this.osc('sine', 1318, t, 0.06, 0.1); break;
      case 'kyuin': this.osc('sawtooth', 500, t, 0.28, 0.26, null, 3200); this.osc('square', 1000, t, 0.28, 0.1, null, 5200); break;
      case 'chime': this.osc('sine', 1760, t, 0.3, 0.2); this.osc('sine', 2637, t + 0.08, 0.35, 0.18); break;
      case 'pokyun':
        this.osc('sine', 1700, t, 0.13, 0.55, null, 4300); this.osc('square', 3600, t + 0.03, 0.09, 0.14, null, 1800);
        this.osc('sine', 150, t + 0.05, 0.7, 1, null, 32); this.noiseHit(t + 0.05, 0.45, 0.8, 'lowpass', 700); break;
      case 'boom':
        this.osc('sine', 115, t, 1.3, 1, null, 26); this.osc('triangle', 62, t, 1.1, 0.7, null, 24);
        this.noiseHit(t, 1.1, 1, 'lowpass', 1600, 1, null, 90); this.noiseHit(t, 0.25, 0.5, 'highpass', 2000); break;
      case 'patlamp':
        for (let k = 0; k < 4; k++) { this.osc('sawtooth', 850, t + k * 0.32, 0.3, 0.26, null, 2300); this.osc('square', 1700, t + k * 0.32, 0.3, 0.09, null, 4600); }
        break;
      case 'reach': [440, 554, 659, 880].forEach((f, i) => this.osc('sawtooth', f, t + i * 0.04, 0.55, 0.12)); this.noiseHit(t, 0.4, 0.3, 'bandpass', 1200, 1, null, 5000); break;
      case 'holdChange': this.osc('sine', 2400, t, 0.45, 0.28, null, 3800); this.osc('sine', 3300, t + 0.03, 0.4, 0.16, null, 4800); this.noiseHit(t, 0.2, 0.3, 'highpass', 5000); break;
      case 'sword': this.noiseHit(t, 0.28, 0.6, 'bandpass', 700, 3, null, 7000); this.osc('square', 1300, t + 0.3, 0.35, 0.2); this.osc('sine', 2600, t + 0.3, 0.6, 0.2); break;
      case 'bullet': this.noiseHit(t + 0.12, 0.16, 1, 'lowpass', 3500); this.osc('sine', 3200, t + 0.2, 0.3, 0.18, null, 700); this.osc('sine', 110, t + 0.12, 0.2, 0.6, null, 40); break;
      case 'thunder': this.noiseHit(t + 0.08, 0.22, 1, 'highpass', 900); this.noiseHit(t + 0.1, 1.2, 0.9, 'lowpass', 400, 1, null, 60); this.osc('sine', 70, t + 0.1, 1, 0.7, null, 30); break;
      case 'button': this.osc('sine', 90, t, 0.45, 1, null, 38); this.noiseHit(t, 0.18, 0.7, 'lowpass', 2400); break;
      case 'tap': this.osc('square', 900 + (p || 0) * 40, t, 0.05, 0.12); break;
      case 'lever':
        for (let k = 0; k < 6; k++) this.noiseHit(t + k * 0.035, 0.03, 0.5, 'bandpass', 3000, 4);
        this.osc('square', 160, t + 0.24, 0.22, 0.5, null, 55); this.noiseHit(t + 0.24, 0.3, 0.7, 'lowpass', 900); break;
      case 'stop': this.osc('square', 880, t, 0.04, 0.1); this.osc('sine', 440, t, 0.06, 0.08); break;
      case 'whoosh': this.noiseHit(t, 0.55, 0.6, 'bandpass', 250, 1.2, null, 4000); break;
      case 'fanfare': {
        const seq = [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [1047, 0.6], [1319, 0.72], [1568, 0.84]];
        seq.forEach(s => this.synth('sawtooth', s[0], t + s[1], 0.35, 0.14, 3000, this.sfx));
        [1047, 1319, 1568, 2093].forEach(f => this.synth('sawtooth', f, t + 1.0, 1.4, 0.1, 3500, this.sfx, 7));
        this.osc('sine', 100, t + 1.0, 0.8, 0.8, null, 40);
        break;
      }
      case 'v': [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.osc('sine', f, t + i * 0.06, 0.35, 0.22)); break;
      case 'lose': this.osc('triangle', 420, t, 0.9, 0.28, null, 110); this.osc('sine', 210, t, 0.9, 0.2, null, 60); break;
      case 'kiin': this.osc('sine', 3950, t, 1.3, 0.12); this.osc('sine', 4010, t, 1.3, 0.1); break;
      case 'gyuin': this.osc('sawtooth', 80, t, 1.3, 0.35, null, 2400); this.osc('square', 40, t, 1.3, 0.15, null, 1200); break;
      case 'step': this.osc('square', 500 + (p || 1) * 180, t, 0.18, 0.2); this.osc('sine', 1000 + (p || 1) * 360, t + 0.02, 0.25, 0.14); break;
      case 'cutin': this.noiseHit(t, 0.4, 0.6, 'bandpass', 500, 1, null, 6000); this.osc('sine', 2800, t + 0.15, 0.6, 0.2, null, 1800); break;
      case 'slash': this.noiseHit(t, 0.18, 0.7, 'bandpass', 1500, 2, null, 9000); this.osc('sine', 120, t + 0.06, 0.25, 0.7, null, 40); break;
      case 'open': this.osc('square', 1318, t, 0.1, 0.15); this.osc('square', 1760, t + 0.09, 0.15, 0.15); break;
      case 'select': this.osc('triangle', 1200, t, 0.08, 0.2); break;
      case 'charge': this.osc('sawtooth', 200 + (p || 0) * 1400, t, 0.06, 0.08); break;
      case 'crack': this.noiseHit(t, 0.5, 0.9, 'highpass', 1500); this.osc('triangle', 300, t, 0.6, 0.3, null, 80); break;
      case 'zudon': this.osc('sine', 80, t, 0.6, 1, null, 30); this.noiseHit(t, 0.3, 0.9, 'lowpass', 1200); this.osc('square', 1800, t, 0.12, 0.15, null, 3600); break;
    }
  }
};

// ---- BGM シーケンサ（連チャン数連動） ----
const N = m => 440 * Math.pow(2, (m - 69) / 12);
function kick(t, g) { Sound.osc('sine', 155, t, 0.28, g || 0.9, Sound.bgm, 38, 0.002); }
function snare(t, g) { g = g || 0.35; Sound.noiseHit(t, 0.16, g, 'highpass', 1400, 0.7, Sound.bgm); Sound.osc('triangle', 230, t, 0.1, g * 0.6, Sound.bgm, 170); }
function hat(t, g, open) { Sound.noiseHit(t, open ? 0.22 : 0.04, g || 0.1, 'highpass', 8000, 0.7, Sound.bgm); }
const CH_EDM = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
const MEL_EDM = [76, -1, 76, 79, 81, -1, 79, 76, 74, -1, 72, 74, 76, -1, -1, -1, 72, -1, 72, 74, 76, -1, 74, 72, 71, -1, 67, 71, 74, -1, -1, -1];
const RIFF = [40, 40, 52, 40, 43, 40, 45, 47];
const CH_PREM = [[62, 66, 69], [57, 61, 64], [59, 62, 66], [55, 59, 62]];
const MEL_PREM = [78, -1, 81, -1, 83, -1, 81, 78, 76, -1, 73, -1, 76, -1, -1, -1, 74, -1, 78, -1, 81, -1, 83, 85, 86, -1, -1, -1, 85, -1, 83, -1];
const CH_NORM = [[57, 60, 64, 67], [50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59]];
const TRACKS = {
  normal: {
    bpm: 100, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4, ch = CH_NORM[bar];
      if (i === 0 || i === 10) kick(t, 0.45);
      if (i % 4 === 2) hat(t, 0.05);
      if (i === 0 || i === 6 || i === 12) ch.forEach(m => Sound.synth('triangle', N(m), t, d * 3, 0.035, 1800));
      if (i % 4 === 0) Sound.synth('triangle', N(ch[0] - 12), t, d * 2.5, 0.12, 600);
      if (i === 8 || i === 14) Sound.synth('sine', N(ch[(s >> 2) % 4] + 12), t, d * 2, 0.04, 3000);
    }
  },
  reach: {
    bpm: 152, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4; const root = 38 + [0, 0, 3, 5][bar];
      if (i % 4 === 0) kick(t, 0.85);
      if (i === 4 || i === 12) snare(t, 0.3);
      hat(t, i % 2 ? 0.05 : 0.09);
      Sound.synth('sawtooth', N(root + (i % 4 === 2 ? 12 : 0)), t, d * 0.9, 0.09, 700);
      if (i === 0 || i === 6 || i === 12) [root + 24, root + 27, root + 31].forEach(m => Sound.synth('sawtooth', N(m), t, d * 1.6, 0.04, 2400, null, 8));
      if (bar === 3 && i >= 12) snare(t, 0.2);
    }
  },
  battle: {
    bpm: 168, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4; const root = 40 + [0, 3, 5, 7][bar];
      if (i % 4 === 0 || i === 7) kick(t, 0.9);
      if (i === 4 || i === 12) snare(t, 0.38);
      if (bar === 3) snare(t, 0.12 + i * 0.012);
      hat(t, 0.07);
      Sound.synth('sawtooth', N(root), t, d * 0.8, 0.1, 900);
      if (i % 2 === 0) Sound.synth('square', N(root + 24 + [0, 3, 7, 10][(i >> 1) % 4]), t, d * 0.9, 0.035, 3000);
    }
  },
  edm: {
    bpm: 128, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4, ch = CH_EDM[bar];
      if (i % 4 === 0) kick(t, 1);
      if (i === 4 || i === 12) { snare(t, 0.28); Sound.noiseHit(t, 0.1, 0.25, 'bandpass', 1800, 1, Sound.bgm); }
      if (i % 4 === 2) hat(t, 0.14, true); else hat(t, 0.04);
      if (i % 4 !== 0) Sound.synth('sawtooth', N(ch[0] - 24), t, d * 0.8, 0.13, 500 + (i % 4) * 200);
      Sound.synth('square', N(ch[[0, 1, 2, 1][i % 4]] + 12), t, d * 0.7, 0.045, 2600);
      const m = MEL_EDM[s % 32]; if (m > 0) { Sound.synth('sawtooth', N(m), t, d * 1.8, 0.05, 4500, null, -9); Sound.synth('sawtooth', N(m), t, d * 1.8, 0.05, 4500, null, 9); }
    }
  },
  rock: {
    bpm: 168, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4;
      if (i === 0 || i === 6 || i === 8 || i === 10) kick(t, 1);
      if (i === 4 || i === 12) snare(t, 0.45);
      if (i % 2 === 0) hat(t, i === 0 && bar === 0 ? 0.25 : 0.08, i === 0 && bar === 0);
      const r = RIFF[(i >> 1) % 8] + (bar === 3 ? 5 : 0);
      if (i % 2 === 0) { Sound.synth('sawtooth', N(r), t, d * 1.6, 0.4, 5000, Sound.rockBus); Sound.synth('sawtooth', N(r + 7), t, d * 1.6, 0.3, 5000, Sound.rockBus); }
      else Sound.synth('sawtooth', N(40), t, d * 0.5, 0.3, 2000, Sound.rockBus);
      Sound.synth('triangle', N(r - 12), t, d * 0.9, 0.12, 900);
      if (bar >= 2 && i % 4 === 0) Sound.synth('square', N(r + 24 + [0, 3, 5, 7][(i >> 2)]), t, d * 3, 0.04, 3500);
    }
  },
  premium: {
    bpm: 140, play(s, t, d) {
      const i = s % 16, bar = (s >> 4) % 4, key = ((s >> 7) % 2) * 2, ch = CH_PREM[bar];
      if (i % 4 === 0) kick(t, 0.95);
      if (i === 4 || i === 12) snare(t, 0.3);
      hat(t, i % 2 ? 0.04 : 0.08);
      if (i === 0) ch.forEach(m => { Sound.synth('sawtooth', N(m + key), t, d * 15, 0.03, 1800, null, -10, 0.3); Sound.synth('sawtooth', N(m + key), t, d * 15, 0.03, 1800, null, 10, 0.3); });
      Sound.osc('sine', N(ch[i % 3] + 24 + key), t, d * 3, 0.05, Sound.bgm);
      if (i % 2 === 0) Sound.synth('triangle', N(ch[0] - 12 + key), t, d * 1.6, 0.13, 700);
      const m = MEL_PREM[s % 32]; if (m > 0) { Sound.synth('square', N(m + key), t, d * 2.2, 0.05, 3500); Sound.synth('sawtooth', N(m + key - 12), t, d * 2.2, 0.03, 2000, null, 6); }
    }
  }
};
const BGM = {
  track: null, step: 0, nextTime: 0, timer: null,
  start() { if (!this.timer) this.timer = setInterval(() => this.tick(), 25); },
  set(name) { if (this.track === name) return; this.track = name; this.step = 0; if (Sound.ctx) this.nextTime = Sound.now() + 0.06; },
  tick() {
    const c = Sound.ctx; if (!c || !this.track || c.state !== 'running') return;
    const def = TRACKS[this.track]; if (!def) return;
    const spb = 60 / def.bpm / 4;
    if (this.nextTime < c.currentTime - 0.2) this.nextTime = c.currentTime + 0.02;
    while (this.nextTime < c.currentTime + 0.14) { def.play(this.step, this.nextTime, spb); this.step++; this.nextTime += spb; }
  }
};
const chainTrack = () => M.chain >= 10 ? 'premium' : M.chain >= 5 ? 'rock' : 'edm';
