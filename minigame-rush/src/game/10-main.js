// 起動・画面サイズ合わせ・毎フレームの処理
(() => {
  Store.load();
  const app = $('app'), cv = $('cv'), g = cv.getContext('2d');
  let q = 1;
  function fit() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const s = Math.min(vw / 720, vh / 1280);
    app.style.width = Math.floor(720 * s) + 'px'; app.style.height = Math.floor(1280 * s) + 'px';
    app.style.fontSize = (24 * s) + 'px';
    // 描画の解像度。高すぎると古いスマホで重いので上限をつける
    q = clamp(s * (window.devicePixelRatio || 1), 0.5, 1.5);
    cv.width = Math.round(720 * q); cv.height = Math.round(1280 * q);
  }
  window.addEventListener('resize', fit);
  fit();
  Render.thumb($('legionThumb'));

  // メニューの後ろでは、ボットが遊ぶデモを流す（音は出さない）
  const demo = { sim: null, bot: null };
  function newDemo() {
    const stage = L.Stage.build(CFG, 3 + Math.floor(Math.random() * 8), 'easy');
    demo.sim = L.createSim(CFG, { stage, rng: Math.random, meta: { atk: 6 } });
    demo.bot = L.createBot(CFG, demo.sim, Math.random, { skill: 1 });
  }
  newDemo();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Game.active && Game.sim && Game.sim.S.phase === 'play' && !Game.over) { Game.togglePause(true); show('pause', true); }
  });
  window.addEventListener('pointerdown', () => Sound.init(), { once: true });

  let last = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    g.setTransform(q, 0, 0, q, 0, 0);
    if (Game.active && Game.sim) Game.frame(dt, g);
    else {
      const S = demo.sim.S;
      for (let i = 0; i < 2; i++) { demo.bot.step(1 / 120); demo.sim.update(1 / 120); }
      if (S.phase === 'choice') demo.bot.step(0);
      if (S.phase === 'win' || S.phase === 'lose' || S.t > 200) newDemo();
      Render.draw(g, { sim: demo.sim, tutorial: null, evolvePick: false });
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  UI.toHub();

  // テスト用の窓口（E2E が状態を読む・時間を早める）
  window.__MGR = {
    screen: () => UI.screen, Game, Store, L, CFG, View,
    sim: () => Game.sim,
    speed: v => { Game.speed = v; },
    bot: on => { Game.autobot = on; Game.bot = null; }
  };
})();
