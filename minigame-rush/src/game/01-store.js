// セーブ（localStorage）。ミニゲームラッシュ全体で1つ。コインはミニゲームで共通
const Store = (() => {
  const KEY = 'mgr.v1';
  const blank = () => ({
    v: 1, coins: 0,
    settings: { bgm: 60, se: 80, mute: false },
    legion: {
      diff: 'normal', mode: 'stage',
      cleared: { easy: 0, normal: 0, hard: 0 },
      stars: { easy: {}, normal: {}, hard: {} },
      best: { easy: null, normal: null, hard: null },
      upgrades: {}, dex: {}, tutorial: false, plays: 0
    }
  });
  let data = blank();
  function merge(a, b) {
    for (const k in b) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') merge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) data = merge(blank(), JSON.parse(raw)); } catch (e) { data = blank(); }
    return data;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても遊べる */ } }
  function reset() { data = blank(); save(); }
  return { load, save, reset, get d() { return data; } };
})();
