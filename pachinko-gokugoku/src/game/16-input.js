// =====================================================================
//  入力（デカボタン・レバー・裏ボタン・スキップ）
// =====================================================================
const Input = {
  down: false, downT: 0, presses: new Float64Array(8), pi: 0, uraFired: false, skipFired: false, clock: 0,
  pushDown() {
    unlock(); if (this.down) return; this.down = true; this.downT = 0; this.uraFired = false; this.skipFired = false;
    UI.btnDown(true); Sound.play('tap', 2);
    this.presses[this.pi] = this.clock; this.pi = (this.pi + 1) % 8;
    const tp = M.sm.top; if (tp) tp.onPush();
    const IN = CFG.input; let n = 0; for (let i = 0; i < 8; i++) if (this.clock - this.presses[i] < IN.uraWindow && this.presses[i] > 0) n++;
    if (n >= IN.uraTaps) this.ura();
  },
  pushUp() { if (!this.down) return; this.down = false; UI.btnDown(false); const tp = M.sm.top; if (tp) tp.onPushRelease(); },
  ura() { // 裏ボタン（一発告知）
    const h = M.cur; if (!URA.allow || !h || !h.hit || h.uraDone) return;
    h.uraDone = true; Patlamp.fire(); setLed('rainbow'); FX.flash(WHITE_A, 0.7); LCD.pop(T('キュイン!!', 70, 'rainbow'), LW / 2, LH / 2 - 40, 1.4, 'zoom');
  },
  skip() { const tp = M.sm.top; if (tp && tp.onSkip) { tp.onSkip(); LCD.pop(T('SKIP', 40, 'white', F_HEAVY), LW / 2, 30, 0.6, 'rise'); } },
  lever() { unlock(); UI.leverAnim(); Sound.play('lever'); const tp = M.sm.top; if (tp) tp.onLever(); },
  update(dt) {
    this.clock += dt;
    if (this.down) {
      this.downT += dt; const tp = M.sm.top; if (tp) tp.onPushHeld(this.downT, dt);
      if (this.downT > CFG.input.uraHold && !this.uraFired) { this.uraFired = true; this.ura(); }
      if (this.downT > CFG.input.skipHold && !this.skipFired) { this.skipFired = true; this.skip(); }
    }
  }
};
