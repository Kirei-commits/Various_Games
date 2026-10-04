// =====================================================================
//  画面スケーリング・ビルド・メインループ
// =====================================================================
const Cv = { c: null, x: null };
let fitS = 1, stageEl = null, ox = 0, oy = 0, shaking = false;
function buildAll() {
  Cv.c.width = Math.round(W * R); Cv.c.height = Math.round(H * R);
  TXT.clear(); for (const k in SPR) delete SPR[k]; buildDigits(); Board.build(); Counter.build(); LCD.build(); Yaku.build();
}
function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  fitS = Math.min(vw / W, vh / H); ox = (vw - W * fitS) / 2; oy = (vh - H * fitS) / 2;
  stageEl.style.transform = `translate(${ox}px,${oy}px) scale(${fitS})`;
  const nr = clamp(Math.round((window.devicePixelRatio || 1) * fitS * 4) / 4, 0.5, 2);
  if (nr !== R) { R = nr; buildAll(); }
}
let lastTs = 0, fpsAvg = 60, saveT = 0, speed = 1; // speed: 自動テスト用の早回し倍率
function frame(ts) {
  const dt = Math.min(0.05, lastTs ? (ts - lastTs) / 1000 : 0.016); lastTs = ts;
  fpsAvg = lerp(fpsAvg, 1 / Math.max(dt, 0.001), 0.05);
  for (let i = 0; i < speed; i++) { Input.update(dt); M.update(dt); Phys.update(dt); Reels.update(dt); LCD.update(dt); FX.update(dt); Yaku.update(dt); Patlamp.update(dt); Board.update(dt); }
  UI.update(dt, fpsAvg);
  saveT += dt; if (saveT > 3) { saveT = 0; if (Store.dirty) Store.save(); }
  render(ts / 1000);
  // 画面振動（ステージごと揺らす）
  if (FX.shakeT > 0) { shaking = true; stageEl.style.transform = `translate(${ox + FX.sx * fitS}px,${oy + FX.sy * fitS}px) scale(${fitS})`; }
  else if (shaking) { shaking = false; stageEl.style.transform = `translate(${ox}px,${oy}px) scale(${fitS})`; }
  requestAnimationFrame(frame);
}
function render(t) {
  const x = Cv.x; x.setTransform(R, 0, 0, R, 0, 0);
  x.drawImage(Board.cache.c, 0, 0, W, H);
  Counter.draw(x);
  LCD.draw(x, t);
  Board.drawDynamic(x, t);
  Yaku.draw(x, t);
  Frame.draw(x, t);
  Patlamp.draw(x);
  FX.draw(x, t);
  const br = D.settings.bright; if (br < 3) { x.fillStyle = BLACK_A[br === 1 ? 7 : 3]; x.fillRect(0, 196, W, 976); }
}
function boot() {
  stageEl = $('stage'); Cv.c = $('cv'); Cv.x = Cv.c.getContext('2d');
  Phys = PG.createPhysics(CFG, {
    rng: rnd,
    emit: ev => { if (ev === 'warp') Bus.emit('warp'); else Bus.emit('entry', ev); },
    gates: { denchuOpen: () => M.denchuOpen, attackerOpen: () => M.attackerOpen }
  });
  Frame.build(); FX.init();
  R = 0; fit();
  Bus.on('entry', src => M.entry(src));
  Bus.on('state', () => { UI.syncBar(); });
  M.sm.reset(new IdleState());
  UI.init();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  const flush = () => { if (Store.dirty) Store.save(); };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flush(); if (Sound.ctx) Sound.ctx.suspend(); if (window.speechSynthesis) speechSynthesis.cancel(); }
    else if (Sound.ctx && unlocked) Sound.ctx.resume();
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { buildAll(); });
  requestAnimationFrame(frame);
  // テスト窓口（E2E が待ち時間の短縮と状態の確認に使う）
  window.__PACHI = { setSpeed(v) { speed = v; }, state() { return M.sm.stack.map(s => s.name).join('>'); }, M, Phys, Lottery, Bus, Store, LCD, Reels, FX, UI, Input, Sound, get D() { return D; } };
}
boot();
