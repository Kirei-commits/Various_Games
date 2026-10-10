// 指・マウスで英雄をつかんで動かす。画面座標 → ワールド座標に直して sim に渡す
const Input = (() => {
  const cv = $('cv');
  let pid = null, heroId = null;
  // 指の真下だと英雄が隠れるので、少し奥（画面の上）にずらして持つ
  const LIFT = 0.3;
  function toWorld(e) {
    const r = cv.getBoundingClientRect();
    return View.toWorld((e.clientX - r.left) / r.width * View.W, (e.clientY - r.top) / r.height * View.H);
  }
  function heroUnder(w) {
    const S = Game.sim.S;
    let best = null, bd = 0.75;
    for (const h of S.heroes) { const d = Math.hypot(h.x - w.x, (h.y - 0.3) - w.y); if (d < bd) { bd = d; best = h; } }
    return best;
  }
  cv.addEventListener('pointerdown', e => {
    Sound.init();
    if (!Game.active || pid !== null) return;
    const w = toWorld(e);
    const S = Game.sim.S;
    if (Game.evolvePick) {
      const h = heroUnder(w);
      if (h && h.tier < CFG.hero.maxTier) Game.pickEvolve(h.id);
      return;
    }
    if (S.phase !== 'play') return;
    const h = heroUnder(w);
    if (!h || !Game.sim.grab(h.id)) return;
    pid = e.pointerId; heroId = h.id;
    try { cv.setPointerCapture(pid); } catch (err) { /* 古いブラウザ */ }
    Game.sim.dragTo(heroId, w.x, w.y + LIFT);
    e.preventDefault();
  });
  cv.addEventListener('pointermove', e => {
    if (e.pointerId !== pid || !Game.active) return;
    const w = toWorld(e);
    Game.sim.dragTo(heroId, w.x, w.y + LIFT);
    e.preventDefault();
  });
  function end(e) {
    if (e.pointerId !== pid) return;
    if (Game.active && Game.sim) Game.onRelease(Game.sim.release(heroId));
    pid = null; heroId = null;
  }
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end);
  /** 一時停止やリタイアのときに、つかんだままの英雄を離す */
  function drop() { if (pid !== null && Game.sim) Game.sim.release(heroId); pid = null; heroId = null; }
  return { drop, get dragging() { return heroId; } };
})();
