// =====================================================================
//  マシン本体（保留・出玉・統計）
// =====================================================================
const M = {
  mode: 'normal', holds: [], cur: null, attackerOpen: false, denchuOpen: false, strong: false, manualStrong: false,
  auto: false, started: false, fireAcc: 0, dcT: 0, chain: 0, rushLeft: 0, rushPayout: 0, rushSpinCount: 0,
  rushMode: D.settings.rushMode, inBonus: false, bonusRush: false, force: null, led: 'normal', ledFlash: 0, arrowT: 0, noFire: false,
  sm: new FSM(),
  needRight() { return this.mode === 'rush' || this.inBonus; },
  ledMode() { return this.ledFlash > 0 ? 'flash' : this.led; },
  addBalls(n) { D.balls += n; Store.mark(); },
  fire() {
    if (D.balls <= 0) { D.balls += CFG.payout.lendBalls; D.invest += CFG.payout.lendYen; Store.mark(); }
    if (Phys.launch(this.strong)) { D.balls--; if (!this.strong) D.meas.leftShots++; Sound.play('shot'); }
  },
  update(dt) {
    const needR = this.needRight();
    this.strong = D.settings.autoAim ? needR : this.manualStrong;
    if (this.arrowT > 0) this.arrowT -= dt;
    if (this.auto && this.started && !this.noFire) {
      const iv = this.inBonus ? CFG.fire.bonus : (this.mode === 'rush' ? CFG.fire.rush : CFG.fire.normal); // 大当り中は爆速消化
      this.fireAcc += dt; while (this.fireAcc >= iv) { this.fireAcc -= iv; this.fire(); }
    } else this.fireAcc = 0;
    if (this.mode === 'rush' && !this.inBonus) { this.dcT += dt; this.denchuOpen = (this.dcT % CFG.denchu.cycle) < CFG.denchu.open; } else this.denchuOpen = false;
    if (this.ledFlash > 0) this.ledFlash -= dt;
    this.sm.update(dt);
  },
  entry(src, virtual) {
    if (src === 'attacker') { const s = this.sm.top; if (s && s.onAttacker) s.onAttacker(); return; }
    if (!virtual) this.addBalls(CFG.payout[src] || 0);
    if (!virtual && src === 'heso' && !this.strong) D.meas.hesoIn++;
    if (src === 'general') { Sound.play('chime'); return; }
    if (!virtual) Sound.play(src === 'heso' ? 'chucker' : 'denchu');
    if (src === 'heso') Board.hesoT = 0.4;
    if (this.holds.length >= CFG.holdMax) return; // オーバーフロー
    const isRush = this.mode === 'rush' || (this.inBonus && this.bonusRush);
    let force = this.force;
    if (force === 'iwakan' && !isRush) force = null; else this.force = null;
    if (force && isRush && force !== 'hit' && force !== 'iwakan' && force !== 'miss') force = 'hit';
    const h = Lottery.draw(rand16(), isRush, force);
    this.holds.push(h);
    if (h.sakibare) {
      h.dispColor = h.color; Sound.play('pokyun'); FX.shake(16, 0.55); this.ledFlash = 1.0; FX.flash(RED_A, 0.45);
      const p = LCD.slotPos(h); if (p) FX.sparks(LX + p.x, LY + p.y, 40, 0, 320);
      LCD.pop(T('先バレ!!', 40, 'red'), LW / 2, 60, 1.2, 'zoom');
    } else if (h.changeAt === 'entry') startHoldFx(h);
    Bus.emit('holds');
  },
  rejudge(isRush) {
    for (let i = 0; i < this.holds.length; i++) { const o = this.holds[i]; if (o.isRush === isRush) continue; const n = Lottery.draw(o.raw, isRush, null); n.changeAt = null; n.color = 'white'; this.holds[i] = n; }
  },
  spinStat(isRush) {
    if (isRush) this.rushSpinCount++; else { D.totalSpins++; D.spinsSinceHit++; }
    const net = Math.round(D.balls - D.invest / (CFG.payout.lendYen / CFG.payout.lendBalls));
    D.slump.push(net); if (D.slump.length > 600) { const a = []; for (let i = 0; i < D.slump.length; i += 2) a.push(D.slump[i]); a.push(D.slump[D.slump.length - 1]); D.slump = a; }
    Counter.dirty = true; Store.mark();
  }
};
function startHoldFx(h) {
  const f = { type: h.fxType, t: 0, to: h.color, hit: false, pts: null };
  if (f.type === 'thunder') { f.pts = new Float32Array(8); for (let i = 0; i < 8; i++) f.pts[i] = i === 7 ? 0 : (rnd() - 0.5) * 50; }
  h.fx = f; Sound.play(f.type);
}
function setLed(m) { M.led = m; }

// ---- 当り揃い後の共通処理 ----
function onAligned(h) {
  if (h.sc && h.sc.scoop && h.sc.scoop.timing === 'post') M.sm.change(new ScoopState(h, 'post'));
  else startFever(h, false);
}
function startFever(h, promoted) {
  const isRush = !!h.isRush;
  const bonus = { isRush, rounds: h.kind === 'regular' ? 3 : 10, rushBound: isRush || h.route === '7direct' || promoted, lever: h.route === 'lever' && !promoted, route: h.route };
  M.sm.change(new FeverState(bonus));
}
function rushEnterFx() {
  FX.pop(T('RUSH突入!!', 92, 'rainbow'), W / 2, 560, 2.2, 'zoom'); FX.rainbow(1.5); FX.confetti(120); FX.shake(18, 0.6); Sound.play('boom'); Sound.speak('ラッシュ突入！');
}
