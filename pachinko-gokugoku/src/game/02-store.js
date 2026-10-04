// =====================================================================
//  永続化（localStorage）
// =====================================================================
const SAVE_KEY = 'gokugoku-pachinko-v1';
const Store = {
  data: null, dirty: false,
  defaults() {
    return {
      balls: 0, invest: 0, totalSpins: 0, spinsSinceHit: 0, hits: 0, firstHits: 0, rushEntries: 0,
      maxPayout: 0, maxChain: 0, lastChain: 0, slump: [0], history: [],
      // 実測値（理論値と比べる）: 左打ちの発射数・ヘソ入賞数・RUSH中の当り数・RUSH終了数
      meas: { leftShots: 0, hesoIn: 0, rushHits: 0, rushEnds: 0 },
      settings: { vol: 3, bright: 3, sakibare: 0, preread: false, autoAim: true, prob: PG.CONFIG.spec.defaultProbDenom, rushMode: 'quick' }
    };
  },
  load() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (s) { const d = JSON.parse(s); const def = this.defaults(); this.data = Object.assign(def, d); this.data.settings = Object.assign(def.settings, d.settings || {}); }
    } catch (e) { /* 壊れたデータは無視 */ }
    if (!this.data) this.data = this.defaults();
    if (!Array.isArray(this.data.slump) || !this.data.slump.length) this.data.slump = [0];
    if (!Array.isArray(this.data.history)) this.data.history = [];
    this.data.meas = Object.assign(this.defaults().meas, this.data.meas || {});
  },
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); this.dirty = false; } catch (e) { } },
  mark() { this.dirty = true; },
  reset() { const st = this.data.settings; this.data = this.defaults(); this.data.settings = st; this.save(); }
};
Store.load();
let D = Store.data;
