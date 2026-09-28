/*
 * 効果音（Web Audio API でその場で合成する。音声ファイルは使わない）。
 *
 * 電子音っぽさを避けるため、
 * - 音程のある音は、木琴・マリンバのような「叩いてすぐ減衰する」音にする
 *   （基音の正弦波に、4倍音を短く重ねると木の板を叩いた響きに近づく）
 * - スワイプやカードをめくる音は、ノイズを帯域フィルタに通した「さっ」という音にする
 *
 * ブラウザは利用者が画面に触れるまで音を出させないので、最初のタップで unlock() する。
 */

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI ノート番号 → 周波数

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.on = true;
    this.volume = 0.6;
  }

  get available() {
    return typeof window !== "undefined" && !!(window.AudioContext || window.webkitAudioContext);
  }

  /** 最初のタップで呼ぶ。以後、効果音が鳴らせる */
  unlock() {
    if (!this.available) return;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume;
      // 耳に痛い高音を少し丸める
      const soften = this.ctx.createBiquadFilter();
      soften.type = "lowpass";
      soften.frequency.value = 6000;
      this.out.connect(soften);
      soften.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  set(on, volume = this.volume) {
    this.on = on;
    this.volume = volume;
    if (this.out) this.out.gain.value = volume;
  }

  /** 木琴のような1音 */
  mallet(midi, { at = 0, gain = 0.35, decay = 0.45 } = {}) {
    const t = this.ctx.currentTime + at;
    const f = NOTE(midi);
    for (const [ratio, g, d] of [
      [1, gain, decay],
      [4, gain * 0.18, decay * 0.25], // 叩いた瞬間の硬い響き
      [2.01, gain * 0.08, decay * 0.5],
    ]) {
      const osc = this.ctx.createOscillator();
      const env = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = f * ratio;
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(g, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(env);
      env.connect(this.out);
      osc.start(t);
      osc.stop(t + d + 0.05);
    }
  }

  /** 「さっ」という短い空気の音（ノイズを帯域フィルタに通す） */
  whoosh({ at = 0, from = 1800, to = 700, dur = 0.16, gain = 0.25 } = {}) {
    const t = this.ctx.currentTime + at;
    const len = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const band = this.ctx.createBiquadFilter();
    band.type = "bandpass";
    band.Q.value = 0.8;
    band.frequency.setValueAtTime(from, t);
    band.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band);
    band.connect(env);
    env.connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name) {
    if (!this.on || !this.ctx || this.ctx.state !== "running") return;
    switch (name) {
      case "learned": // 覚えた: さっ（右へ）＋ 明るい2音
        this.whoosh({ from: 1200, to: 2400 });
        this.mallet(79, { at: 0.05, gain: 0.28 });
        this.mallet(84, { at: 0.13, gain: 0.3 });
        break;
      case "again": // まだ: さっ（左へ）＋ 低めの1音
        this.whoosh({ from: 1600, to: 600 });
        this.mallet(67, { at: 0.06, gain: 0.22, decay: 0.35 });
        break;
      case "flip":
        this.whoosh({ from: 3000, to: 1500, dur: 0.09, gain: 0.15 });
        break;
      case "tap":
        this.mallet(91, { gain: 0.08, decay: 0.12 });
        break;
      case "correct": // 正解: 軽やかな上がる3音
        this.mallet(72, { gain: 0.28 });
        this.mallet(76, { at: 0.09, gain: 0.28 });
        this.mallet(79, { at: 0.18, gain: 0.32, decay: 0.7 });
        break;
      case "wrong": // 不正解: やわらかく下がる2音（責めない音）
        this.mallet(64, { gain: 0.22, decay: 0.35 });
        this.mallet(60, { at: 0.14, gain: 0.22, decay: 0.5 });
        break;
      case "complete": // テスト完了・章クリア
        [72, 76, 79, 84].forEach((n, i) => this.mallet(n, { at: i * 0.11, gain: 0.26 }));
        this.mallet(88, { at: 0.48, gain: 0.3, decay: 1.2 });
        break;
      case "bonus": // ログインボーナス
        [79, 84, 88, 91].forEach((n, i) => this.mallet(n, { at: i * 0.08, gain: 0.24, decay: 0.8 }));
        break;
      default:
    }
  }
}

/** 何もしない代わり（テストやサーバー描画で使う） */
export const silentSound = { play() {}, unlock() {}, set() {} };
