/*
 * 練習銀行アカデミー — 共通の小道具（純粋。DOM・乱数・時計に触れない）
 * ブラウザでは <script> で、Node のテストでは import で読む。どちらも globalThis.RGA に載せる。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});

  // ---- SHA-256（監査ログの改ざん検知に使う。file:// でも動くよう crypto.subtle に頼らない） ----
  const PRIMES = [];
  for (let n = 2; PRIMES.length < 64; n++) {
    if (PRIMES.every((p) => n % p !== 0)) PRIMES.push(n);
  }
  const frac32 = (x) => Math.floor((x - Math.floor(x)) * 0x100000000) >>> 0;
  const K = PRIMES.map((p) => frac32(Math.cbrt(p)));
  const H0 = PRIMES.slice(0, 8).map((p) => frac32(Math.sqrt(p)));
  const ror = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(text) {
    const bytes = new TextEncoder().encode(String(text));
    const len = bytes.length;
    const padded = (((len + 9 + 63) >> 6) << 6);
    const buf = new Uint8Array(padded);
    buf.set(bytes);
    buf[len] = 0x80;
    const dv = new DataView(buf.buffer);
    const bits = len * 8;
    dv.setUint32(padded - 8, Math.floor(bits / 0x100000000));
    dv.setUint32(padded - 4, bits >>> 0);
    const h = H0.slice();
    const w = new Uint32Array(64);
    for (let off = 0; off < padded; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, gg, hh] = h;
      for (let i = 0; i < 64; i++) {
        const S1 = ror(e, 6) ^ ror(e, 11) ^ ror(e, 25);
        const ch = (e & f) ^ (~e & gg);
        const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
        const S0 = ror(a, 2) ^ ror(a, 13) ^ ror(a, 22);
        const maj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + maj) >>> 0;
        hh = gg; gg = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + gg) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }
    return h.map((x) => x.toString(16).padStart(8, '0')).join('');
  }

  // ---- 文字列 ----
  // 全角英数・記号を半角に寄せ、小文字にする（キーワード採点・検知の前処理）
  function norm(text) {
    return String(text || '').normalize('NFKC').toLowerCase();
  }
  function includesAny(text, words) {
    const t = norm(text);
    return words.some((w) => t.includes(norm(w)));
  }

  // ---- 決定的な並べ替え（パーソンズ問題の行の順番。乱数を使わずIDから決める） ----
  function seededShuffle(items, seedText) {
    let s = parseInt(sha256(seedText).slice(0, 8), 16) || 1;
    const next = () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 0x100000000;
    };
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    // 正解の順番そのままに出てしまったら1つずらす
    if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift());
    return out;
  }

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  RGA.core = { sha256, norm, includesAny, seededShuffle, clone };
})(globalThis);
