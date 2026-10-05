// =====================================================================
//  液晶（ビューモデル + 描画）
// =====================================================================
const HERO_P = {}, ENEMY_P = {};
const LCD = {
  scene: 'magma', sceneT: 0, clip: null, magma: null, flame: null, rayGrad: null, glow: null, sky: null, heroG: null, enemyG: null,
  telop: null, stepup: null, judge: null, scoop: null, title: null, cutin: null, battle: null, story: null, round: null, arrow: null, last: null, result: null, lever: null,
  dark: 0, countOverride: null, pops: new PopList(10), embers: [], rushStr: '', chainStr: '', payStr: '', rushLeftStr: '',
  build() {
    const p = new Path2D(); rr(p, 0, 0, LW, LH, LRAD); this.clip = p;
    // マグマテクスチャ（タイル）
    const th = LH * 2, m = mkCanvas(LW, th), x = m.x;
    const bg = x.createLinearGradient(0, 0, 0, th); bg.addColorStop(0, '#1a0200'); bg.addColorStop(0.5, '#3a0800'); bg.addColorStop(1, '#1a0200'); x.fillStyle = bg; x.fillRect(0, 0, LW, th);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      const cx = rnd() * LW, cy = rnd() * th, r = 12 + rnd() * 60, hh = 5 + rnd() * 35;
      for (let k = -1; k <= 1; k++) { const g = x.createRadialGradient(cx, cy + k * th, 0, cx, cy + k * th, r); g.addColorStop(0, `hsla(${hh},100%,${45 + rnd() * 15}%,0.55)`); g.addColorStop(1, 'hsla(0,100%,20%,0)'); x.fillStyle = g; x.beginPath(); x.arc(cx, cy + k * th, r, 0, TAU); x.fill(); }
    }
    x.globalCompositeOperation = 'source-over'; x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3;
    for (let i = 0; i < 40; i++) { x.beginPath(); let cx = rnd() * LW, cy = rnd() * th; x.moveTo(cx, cy); for (let k = 0; k < 5; k++) { cx += (rnd() - 0.5) * 60; cy += (rnd() - 0.5) * 60; x.lineTo(cx, cy); } x.stroke(); }
    this.magma = m;
    const f = mkCanvas(64, 128); const fg = f.x.createRadialGradient(32, 118, 2, 32, 90, 70); fg.addColorStop(0, 'rgba(255,250,200,1)'); fg.addColorStop(0.25, 'rgba(255,170,30,0.9)'); fg.addColorStop(0.6, 'rgba(255,40,0,0.5)'); fg.addColorStop(1, 'rgba(255,0,0,0)');
    f.x.fillStyle = fg; f.x.beginPath(); f.x.moveTo(32, 0); f.x.quadraticCurveTo(64, 70, 54, 110); f.x.quadraticCurveTo(32, 132, 10, 110); f.x.quadraticCurveTo(0, 70, 32, 0); f.x.fill(); this.flame = f;
    const gl = mkCanvas(200, 200); const gg = gl.x.createRadialGradient(100, 100, 0, 100, 100, 100); gg.addColorStop(0, 'rgba(255,255,220,1)'); gg.addColorStop(0.3, 'rgba(255,200,40,0.6)'); gg.addColorStop(1, 'rgba(255,140,0,0)'); gl.x.fillStyle = gg; gl.x.fillRect(0, 0, 200, 200); this.glow = gl;
    const c = Cv.x;
    this.rayGrad = c.createRadialGradient(0, 0, 10, 0, 0, 380); this.rayGrad.addColorStop(0, 'rgba(255,255,200,0.95)'); this.rayGrad.addColorStop(0.4, 'rgba(255,190,20,0.6)'); this.rayGrad.addColorStop(1, 'rgba(255,120,0,0)');
    this.sky = c.createLinearGradient(0, 0, 0, LH); this.sky.addColorStop(0, '#05001a'); this.sky.addColorStop(0.6, '#3a0a3a'); this.sky.addColorStop(1, '#ff5a1a');
    this.storyG = c.createLinearGradient(0, 0, 0, LH); this.storyG.addColorStop(0, '#000814'); this.storyG.addColorStop(0.7, '#1a1440'); this.storyG.addColorStop(1, '#5a3a10');
    this.lastG = c.createRadialGradient(LW / 2, LH / 2, 10, LW / 2, LH / 2, 300); this.lastG.addColorStop(0, '#6a0000'); this.lastG.addColorStop(1, '#080000');
    this.heroG = c.createLinearGradient(0, -165, 0, 0); this.heroG.addColorStop(0, '#fff6c0'); this.heroG.addColorStop(0.4, '#ffcc22'); this.heroG.addColorStop(1, '#7a4a00');
    this.enemyG = c.createLinearGradient(0, -200, 0, 0); this.enemyG.addColorStop(0, '#6a2a8a'); this.enemyG.addColorStop(0.5, '#2a0a3a'); this.enemyG.addColorStop(1, '#0a0010');
    HERO_P.body = new Path2D('M-24,-108 L24,-108 L30,-70 L18,-48 L26,0 L10,0 L2,-36 L-6,0 L-22,0 L-16,-48 L-28,-70 Z');
    HERO_P.head = new Path2D('M-14,-126 a14,14 0 1,0 28,0 a14,14 0 1,0 -28,0 Z M-14,-136 L-6,-160 L0,-142 L8,-164 L12,-140 L24,-152 L16,-128 Z');
    HERO_P.cape = new Path2D('M-24,-108 Q-64,-60 -48,-4 L-30,-12 Q-36,-60 -18,-92 Z');
    HERO_P.sword = new Path2D('M22,-84 L88,-152 L94,-146 L28,-78 Z M14,-92 L38,-70 L34,-66 L10,-88 Z');
    ENEMY_P.body = new Path2D('M-42,-122 Q0,-152 42,-122 L54,-60 L36,0 L12,0 L0,-40 L-12,0 L-36,0 L-54,-60 Z M-52,-102 Q-84,-70 -80,-26 L-68,-30 Q-68,-66 -40,-88 Z M52,-102 Q84,-70 80,-26 L68,-30 Q68,-66 40,-88 Z');
    ENEMY_P.head = new Path2D('M-24,-140 Q0,-178 24,-140 Q22,-116 0,-110 Q-22,-116 -24,-140 Z M-18,-152 Q-44,-182 -32,-206 Q-24,-174 -8,-158 Z M18,-152 Q44,-182 32,-206 Q24,-174 8,-158 Z');
    this.embers.length = 0; for (let i = 0; i < 40; i++) this.embers.push({ x: rnd() * LW, y: rnd() * LH, v: 20 + rnd() * 60, s: 1 + rnd() * 2.5, ph: rnd() * TAU });
  },
  setScene(s) { if (this.scene !== s) { this.scene = s; this.sceneT = 0; } },
  clear() { this.telop = this.stepup = this.judge = this.scoop = this.title = this.cutin = this.battle = this.story = this.round = this.arrow = this.last = this.result = this.lever = null; this.dark = 0; this.countOverride = null; this.pops.clear(); },
  pop(s, x, y, dur, anim, sc) { return this.pops.add(s, x, y, dur, anim, sc); },
  showTelop(colorIdx, startIdx) {
    const texts = ['灼熱の魂が燃え上がる…', '運命の炎が、今目覚める！', '極限の扉が開かれる…', '黄金の伝説が始まる!!'];
    const tx = texts[rnd() * texts.length | 0];
    this.telop = { t: 0, cur: startIdx, fin: colorIdx, up: startIdx < colorIdx ? 1.3 : -1, sp: COLOR_STYLE.map(st => T(tx, 26, st)) };
  },
  setRushInfo() { this.rushLeftStr = M.rushLeft > 0 ? String(M.rushLeft) : '0'; this.chainStr = M.chain + '連'; this.payStr = 'TOTAL ' + fmt(M.rushPayout) + '個'; },
  update(dt) {
    this.sceneT += dt;
    // 文字色が1段ずつ上がっていく（白→青→緑→赤→金→虹）
    const tl = this.telop; if (tl) { tl.t += dt; if (tl.up > 0 && tl.t >= tl.up) { tl.cur++; Sound.play('holdChange'); FX.flash(tl.cur >= 4 ? GOLD_A : WHITE_A, 0.4); if (tl.cur >= tl.fin) tl.up = -1; else tl.up += 0.5; } }
    if (this.stepup) this.stepup.t += dt;
    if (this.judge) this.judge.t += dt;
    if (this.scoop) this.scoop.t += dt;
    if (this.title) { this.title.t += dt; if (this.title.t > this.title.dur) this.title = null; }
    if (this.cutin) { this.cutin.t += dt; if (this.cutin.t > 1.3) this.cutin = null; }
    if (this.arrow) { this.arrow.t += dt; if (this.arrow.dur && this.arrow.t > this.arrow.dur) this.arrow = null; }
    if (this.story) { this.story.t += dt; }
    if (this.lever) this.lever.t += dt;
    if (this.result) this.result.t += dt;
    if (this.battle && this.battle.res) this.battle.resT += dt;
    const b = this.battle; if (b) { b.t += dt; if (b.act) { b.actT += dt; if (!b.applied && b.actT > 0.22) { b.applied = true; const tgt = 1 - b.actor; b.hp[tgt] = Math.max(b.act === 'final' ? 0 : 6, b.hp[tgt] - b.dmg); b.fl[tgt] = 0.35; Sound.play('slash'); FX.shake(b.act === 'final' ? 22 : 6, 0.25); } if (b.actT > 0.6) b.act = null; } b.fl[0] = Math.max(0, b.fl[0] - dt); b.fl[1] = Math.max(0, b.fl[1] - dt); }
    for (let i = 0; i < this.embers.length; i++) { const e = this.embers[i]; e.y -= e.v * dt; e.x += Math.sin(e.ph + this.sceneT * 2) * 10 * dt; if (e.y < -5) { e.y = LH + 5; e.x = rnd() * LW; } }
    // 保留変化アクション
    const hs = M.holds; for (let i = 0; i < hs.length; i++) this.updHoldFx(hs[i], dt);
    if (M.cur) this.updHoldFx(M.cur, dt);
    this.pops.update(dt);
  },
  updHoldFx(h, dt) {
    const f = h.fx; if (!f) return; f.t += dt;
    if (!f.hit && f.t >= 0.36) { f.hit = true; h.dispColor = f.to; Sound.play('holdChange'); FX.flash(f.to === 'rainbow' ? WHITE_A : RED_A, 0.35); const p = this.slotPos(h); if (p) FX.sparks(LX + p.x, LY + p.y, 26, f.to === 'gold' ? 40 : f.to === 'rainbow' ? null : 0, 260); }
    if (f.t > 0.85) h.fx = null;
  },
  slotPos(h) {
    if (h === M.cur) { SLOT.x = 226; SLOT.y = LH - 22; SLOT.r = 16; return SLOT; }
    const i = M.holds.indexOf(h); if (i < 0) return null; SLOT.x = 24 + i * 32; SLOT.y = LH - 20; SLOT.r = 11; return SLOT;
  },
  draw(c, t) {
    c.save(); c.translate(LX, LY); c.clip(this.clip);
    const sc = this.scene, st = this.sceneT;
    if (sc === 'magma' || sc === 'reach') this.drawMagma(c, st, sc === 'reach');
    else if (sc === 'rush') this.drawRays(c, st, 2.6, false);
    else if (sc === 'fever') this.drawRays(c, st, 1.6, true);
    else if (sc === 'battle') this.drawBattleBg(c, st);
    else if (sc === 'story') this.drawStoryBg(c, st);
    else if (sc === 'last') { c.fillStyle = this.lastG; c.fillRect(0, 0, LW, LH); c.fillStyle = RED_A[aIdx(0.15 + 0.15 * Math.sin(st * 8))]; c.fillRect(0, 0, LW, LH); }
    else if (sc === 'result') this.drawRays(c, st, 0.5, false);
    else { c.fillStyle = '#000'; c.fillRect(0, 0, LW, LH); }
    if (this.battle) this.drawBattle(c, t);
    if (this.story) this.drawStory(c, t);
    Reels.draw(c, t);
    if (M.mode === 'rush' && (sc === 'rush' || sc === 'battle' || sc === 'last')) this.drawRushInfo(c, t);
    if (this.round) this.drawRound(c, t);
    if (this.stepup) this.drawStepup(c, t);
    if (this.telop) { const tl = this.telop, s = tl.sp[tl.cur]; const sh = tl.cur >= 4 ? 1 + 0.05 * Math.sin(t * 10) : 1; drawS(c, s, LW / 2 + (tl.t < 0.3 ? (1 - tl.t / 0.3) * 300 : 0), LH - 52, sh * 0.95, 1); }
    if (this.title) this.drawTitle(c, t);
    if (this.cutin) this.drawCutin(c, t);
    if (this.scoop) this.drawScoop(c, t);
    if (this.judge) this.drawJudge(c, t);
    if (this.lever) this.drawLeverPrompt(c, t);
    if (this.last) this.drawLast(c, t);
    if (this.result) this.drawResult(c, t);
    if (this.arrow) this.drawArrowLcd(c, t);
    if (sc !== 'fever' && sc !== 'result' && sc !== 'last') this.drawHolds(c, t);
    this.pops.draw(c, t);
    if (this.dark > 0) { c.fillStyle = BLACK_A[aIdx(this.dark)]; c.fillRect(0, 0, LW, LH); }
    c.restore();
  },
  drawMagma(c, t, reach) {
    const th = LH * 2, off = (t * (reach ? 60 : 16)) % th;
    c.drawImage(this.magma.c, 0, -off, LW, th); c.drawImage(this.magma.c, 0, th - off, LW, th);
    c.globalCompositeOperation = 'lighter';
    const heat = reach ? 1 : 0;
    for (let i = 0; i < 9; i++) { const fx = i * 54 + 12 + Math.sin(t * 1.3 + i) * 8, fh = 80 + 40 * Math.sin(t * 3.1 + i * 1.7) + heat * 70; c.globalAlpha = 0.5; c.drawImage(this.flame.c, fx - 32, LH - fh, 64, fh); }
    c.globalAlpha = 0.9; c.fillStyle = '#ffb040';
    for (let i = 0; i < this.embers.length; i++) { const e = this.embers[i]; c.fillRect(e.x, e.y, e.s, e.s); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    if (reach) { c.fillStyle = RED_A[aIdx(0.18 + 0.12 * Math.sin(t * 9))]; c.fillRect(0, 0, LW, LH); }
  },
  drawRays(c, t, spd, rainbow) {
    c.fillStyle = rainbow ? '#100018' : '#1a0c00'; c.fillRect(0, 0, LW, LH);
    c.save(); c.translate(LW / 2, LH / 2);
    c.globalCompositeOperation = 'lighter';
    for (let layer = 0; layer < 2; layer++) {
      c.rotate(layer === 0 ? t * spd : -t * spd * 2.4);
      const n = layer === 0 ? 16 : 10;
      if (!rainbow) { c.fillStyle = this.rayGrad; c.globalAlpha = layer ? 0.45 : 0.9; c.beginPath(); for (let i = 0; i < n; i++) { const a = i * TAU / n; c.moveTo(0, 0); c.arc(0, 0, 400, a, a + TAU / n / 2.2); c.closePath(); } c.fill(); }
      else { for (let i = 0; i < n; i++) { const a = i * TAU / n; c.fillStyle = hue(i * 360 / n + t * 120); c.globalAlpha = layer ? 0.18 : 0.32; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 400, a, a + TAU / n / 2); c.closePath(); c.fill(); } }
    }
    c.globalAlpha = 1; c.setTransform(R, 0, 0, R, LX * R, LY * R);
    // 渦巻き
    if (!rainbow) { c.strokeStyle = GOLD_A[10]; c.lineWidth = 3; for (let k = 0; k < 3; k++) { c.beginPath(); for (let i = 0; i < 40; i++) { const a = i * 0.32 + t * spd * 3 + k * 2.1, r = i * 6; const xx = LW / 2 + Math.cos(a) * r, yy = LH / 2 + Math.sin(a) * r * 0.7; if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); } }
    drawS(c, this.glow, LW / 2, LH / 2, 1.3 + 0.2 * Math.sin(t * 6), 0.8);
    c.globalCompositeOperation = 'source-over';
    c.restore();
  },
  drawBattleBg(c, t) {
    c.fillStyle = this.sky; c.fillRect(0, 0, LW, LH);
    c.fillStyle = '#120008'; c.beginPath(); c.moveTo(0, 270); for (let i = 0; i <= 10; i++) c.lineTo(i * 46, 262 - Math.abs(Math.sin(i * 1.7)) * 30); c.lineTo(LW, LH); c.lineTo(0, LH); c.closePath(); c.fill();
    c.strokeStyle = GOLD_A[6]; c.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const y = (i * 37 + t * 600) % LH; c.beginPath(); c.moveTo(0, y); c.lineTo(LW * 0.25, y); c.stroke(); c.beginPath(); c.moveTo(LW * 0.75, (y + 150) % LH); c.lineTo(LW, (y + 150) % LH); c.stroke(); }
    if (((t * 3) | 0) % 7 === 0 && (t * 3) % 1 < 0.15) { c.fillStyle = WHITE_A[6]; c.fillRect(0, 0, LW, LH); }
  },
  drawStoryBg(c, t) {
    c.fillStyle = this.storyG; c.fillRect(0, 0, LW, LH);
    c.globalCompositeOperation = 'lighter'; c.fillStyle = '#ffd860';
    for (let i = 0; i < this.embers.length; i++) { const e = this.embers[i]; c.globalAlpha = 0.4 + 0.4 * Math.sin(t * 3 + e.ph); c.fillRect(e.x, e.y, e.s, e.s); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    // 龍のシルエット
    c.save(); c.translate(LW / 2, 150); c.strokeStyle = GOLD_A[5]; c.lineWidth = 16; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i < 30; i++) { const xx = -200 + i * 14, yy = Math.sin(i * 0.45 + t * 2) * 40; if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy); } c.stroke(); c.restore();
  },
  drawHero(c, x, y, s, flash) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#7a0000'; c.fill(HERO_P.cape);
    c.fillStyle = flash > 0 ? '#ffffff' : this.heroG; c.fill(HERO_P.body); c.fill(HERO_P.head);
    c.fillStyle = '#e8f0ff'; c.fill(HERO_P.sword);
    c.lineWidth = 2.5; c.strokeStyle = '#2a1400'; c.stroke(HERO_P.body); c.stroke(HERO_P.head);
    c.restore();
  },
  drawEnemy(c, x, y, s, flash, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = flash > 0 ? '#ffffff' : this.enemyG; c.fill(ENEMY_P.body); c.fill(ENEMY_P.head);
    c.lineWidth = 3; c.strokeStyle = '#ff2050'; c.stroke(ENEMY_P.body); c.stroke(ENEMY_P.head);
    c.fillStyle = (t * 6 | 0) % 2 ? '#ff2020' : '#ffdd00'; c.beginPath(); c.ellipse(-9, -138, 5, 3, 0.3, 0, TAU); c.ellipse(9, -138, 5, 3, -0.3, 0, TAU); c.fill();
    c.restore();
  },
  drawBattle(c, t) {
    const b = this.battle; let hx = 120, ex = 340;
    if (b.act) { const p = Math.min(1, b.actT / 0.5), off = Math.sin(p * Math.PI) * (b.act === 'final' ? 140 : 110); if (b.actor === 0) hx += off; else ex -= off; }
    const dead0 = b.res === 'lose' && b.resT > 0.3, dead1 = b.res === 'win' && b.resT > 0.3;
    if (!dead1 || b.resT < 1.2) this.drawEnemy(c, ex, 270 + (dead1 ? b.resT * 120 : 0), 0.95, b.fl[1], t);
    if (!dead0 || b.resT < 1.2) this.drawHero(c, hx, 272 + (dead0 ? b.resT * 120 : 0), 0.95, b.fl[0]);
    if (b.act && b.actT > 0.18 && b.actT < 0.42) { c.strokeStyle = '#fff'; c.lineWidth = 6; c.globalCompositeOperation = 'lighter'; const tx = b.actor === 0 ? ex : hx; c.beginPath(); c.moveTo(tx - 60, 120); c.lineTo(tx + 60, 240); c.stroke(); c.beginPath(); c.moveTo(tx + 50, 110); c.lineTo(tx - 50, 230); c.stroke(); c.globalCompositeOperation = 'source-over'; }
    // HPバー
    for (let i = 0; i < 2; i++) {
      const bx = i === 0 ? 14 : LW - 214, w = 200;
      c.fillStyle = '#000'; c.fillRect(bx, 64, w, 16); c.fillStyle = i === 0 ? '#ffcc22' : '#c020ff'; c.fillRect(bx + 2, 66, (w - 4) * b.hp[i] / 100, 12);
      c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.strokeRect(bx, 64, w, 16);
    }
    drawS(c, SPR.bh || (SPR.bh = T('極', 26, 'gold')), 24, 52, 0.8); drawS(c, SPR.be || (SPR.be = T('魔王', 26, 'purple')), LW - 30, 52, 0.8);
  },
  drawStory(c, t) {
    const s = this.story; let rem = s.t * 16, cur = 0;
    while (cur < s.pre.length - 1 && rem >= s.pre[cur].length - 1) { rem -= s.pre[cur].length - 1; cur++; }
    const curLine = s.pre[cur], n = Math.min(curLine.length - 1, rem | 0);
    c.fillStyle = BLACK_A[10]; c.fillRect(20, 200, LW - 40, 70);
    c.font = `700 22px ${F_BRUSH}`; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = '#fff3c0';
    if (cur > 0) { const p = s.pre[cur - 1]; c.globalAlpha = 0.6; c.fillText(p[p.length - 1], 34, 218); c.globalAlpha = 1; }
    c.fillText(curLine[n], 34, 250);
  },
  drawRushInfo(c, t) {
    c.textBaseline = 'middle';
    c.textAlign = 'left'; c.font = `400 20px ${F_HEAVY}`; c.fillStyle = '#ffd700'; c.shadowColor = '#f60'; c.shadowBlur = 8; c.fillText(this.chainStr, 14, 22);
    c.font = `400 13px ${F_HEAVY}`; c.fillStyle = '#ffe9a0'; c.fillText(this.payStr, 14, 44);
    c.textAlign = 'right'; c.font = `400 12px ${F_HEAVY}`; c.fillStyle = '#fff'; c.fillText(M.rushMode === 'battle' ? 'BATTLE MODE' : '爆速即当りMODE', LW - 14, 16);
    const cnt = this.countOverride || this.rushLeftStr;
    c.font = `400 34px ${F_HEAVY}`; c.fillStyle = this.countOverride ? hue(t * 800) : '#ffffff'; c.fillText(cnt, LW - 14, 44);
    c.shadowBlur = 0;
  },
  drawRound(c, t) {
    const r = this.round;
    drawS(c, r.sp, LW / 2, 70, 1 + 0.03 * Math.sin(t * 8));
    drawS(c, r.labelSp, LW / 2, 24, 0.7);
    for (let i = 0; i < 10; i++) { const x = LW / 2 - 135 + i * 30, y = 140; c.fillStyle = i < r.count ? hue(i * 36 + t * 300) : '#222'; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); c.strokeStyle = '#ffd700'; c.lineWidth = 2; c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `400 30px ${F_HEAVY}`; c.fillStyle = '#ffe680'; c.shadowColor = '#f60'; c.shadowBlur = 10; c.fillText(r.payStr, LW / 2, 196); c.shadowBlur = 0;
    if (r.endSp) drawS(c, r.endSp, LW / 2, 250, 1 + 0.04 * Math.sin(t * 6));
  },
  drawStepup(c, t) {
    const s = this.stepup, cols = ['#2f7bff', '#20d468', '#ff2323', '#ffb000', '#ffd700'];
    const k = Math.min(1, (s.t % 0.55) / 0.15);
    c.save(); c.translate(LW / 2, 118); c.scale(lerp(1.6, 1, easeOutBack(k)), lerp(1.6, 1, easeOutBack(k)));
    c.fillStyle = cols[s.cur - 1]; c.globalAlpha = 0.9; c.beginPath(); rr(c, -150, -58, 300, 116, 14); c.fill(); c.globalAlpha = 1;
    c.lineWidth = 6; c.strokeStyle = s.cur === 5 ? hue(t * 600) : '#fff'; c.stroke();
    c.restore();
    drawS(c, s.sp[s.cur - 1], LW / 2, 118, 1);
  },
  drawTitle(c, t) {
    const ti = this.title, k = Math.min(1, ti.t / 0.3), fade = ti.t > ti.dur - 0.3 ? (ti.dur - ti.t) / 0.3 : 1;
    c.fillStyle = BLACK_A[aIdx(0.55 * fade)]; c.fillRect(0, 70, LW, 130);
    drawS(c, ti.sp, LW / 2, 125, lerp(2.4, 1, easeOutBack(k)), fade);
    if (ti.sub) drawS(c, ti.sub, LW / 2, 182, 0.8, fade);
  },
  drawCutin(c, t) {
    const ci = this.cutin, k = Math.min(1, ci.t / 0.18), out = ci.t > 1.05 ? (ci.t - 1.05) / 0.25 : 0;
    c.save(); c.translate(lerp(-LW, 0, easeOut(k)) + out * LW, 0);
    c.beginPath(); c.moveTo(0, 100); c.lineTo(LW, 60); c.lineTo(LW, 230); c.lineTo(0, 270); c.closePath();
    c.fillStyle = ci.lv === 5 ? hue(t * 400) : CUTIN_FILL[ci.lv]; c.fill(); c.lineWidth = 6; c.strokeStyle = ci.lv >= 4 ? '#fff' : '#ffd700'; c.stroke();
    c.globalCompositeOperation = 'lighter'; c.fillStyle = WHITE_A[4]; for (let i = 0; i < 8; i++) c.fillRect(((i * 70 + ci.t * 1500) % (LW + 100)) - 50, 70, 8, 190); c.globalCompositeOperation = 'source-over';
    this.drawHero(c, 100, 262, 1.15, 0);
    drawS(c, ci.sp, 290, 165, 1 + 0.06 * Math.sin(t * 20));
    c.restore();
  },
  drawScoop(c, t) {
    const s = this.scoop;
    drawS(c, s.done ? (s.ok ? (SPR.sc1 || (SPR.sc1 = T('昇格!!', 64, 'rainbow'))) : (SPR.sc2 || (SPR.sc2 = T('……', 52, 'white')))) : (SPR.sc3 || (SPR.sc3 = T('連打せよ!!', 50, 'gold'))), LW / 2, 60, 1 + (s.done ? 0 : 0.06 * Math.sin(t * 24)));
    c.fillStyle = '#000'; c.fillRect(56, 248, LW - 112, 26); c.fillStyle = s.gauge >= 1 ? hue(t * 900) : (s.gauge > 0.6 ? '#ff3030' : '#ffd700'); c.fillRect(60, 252, (LW - 120) * Math.min(1, s.gauge), 18);
    c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(56, 248, LW - 112, 26);
    if (!s.done) this.drawButtonIcon(c, LW / 2, 196, 0.55, t);
  },
  drawButtonIcon(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.scale(s, s);
    c.fillStyle = '#5a3a00'; c.beginPath(); c.ellipse(0, 22, 92, 34, 0, 0, TAU); c.fill();
    const g = c.createRadialGradient(-20, -30, 5, 0, 0, 90); g.addColorStop(0, '#fff'); g.addColorStop(0.3, '#ff3030'); g.addColorStop(1, '#600'); c.fillStyle = g;
    const press = (t * 4 | 0) % 2 ? 6 : 0; c.beginPath(); c.ellipse(0, press, 80, 60, 0, 0, TAU); c.fill(); c.lineWidth = 6; c.strokeStyle = '#ffd700'; c.stroke();
    c.restore();
  },
  drawJudge(c, t) {
    const j = this.judge; c.fillStyle = BLACK_A[aIdx(0.35)]; c.fillRect(0, 0, LW, LH);
    if (j.type === 'button') { this.drawButtonIcon(c, LW / 2, 150, 1 + 0.06 * Math.sin(t * 18), t); drawS(c, SPR.jp || (SPR.jp = T('PUSH!!', 54, 'gold', F_HEAVY)), LW / 2, 60, 1 + 0.08 * Math.sin(t * 16)); }
    else { this.drawLeverIcon(c, LW / 2, 180, t); drawS(c, SPR.jl || (SPR.jl = T('レバーを引け!!', 48, 'red')), LW / 2, 50, 1 + 0.08 * Math.sin(t * 16)); }
    const k = 1 - Math.min(1, j.t / j.dur); c.fillStyle = '#000'; c.fillRect(70, 290, LW - 140, 14); c.fillStyle = hue(t * 500); c.fillRect(72, 292, (LW - 144) * k, 10);
  },
  drawLeverIcon(c, x, y, t) {
    const pull = ((t * 3) % 1) < 0.5 ? 0 : 0.6;
    c.save(); c.translate(x, y);
    c.fillStyle = '#a06a00'; c.beginPath(); rr(c, -60, 40, 120, 40, 12); c.fill();
    c.rotate(-0.3 + pull); c.fillStyle = '#ddd'; c.fillRect(-7, -90, 14, 130);
    const g = c.createRadialGradient(-6, -100, 2, 0, -92, 30); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffd700'); g.addColorStop(1, '#7a4a00'); c.fillStyle = g; c.beginPath(); c.arc(0, -96, 28, 0, TAU); c.fill(); c.strokeStyle = '#2a1600'; c.lineWidth = 4; c.stroke();
    c.restore();
  },
  drawLeverPrompt(c, t) {
    const l = this.lever; c.fillStyle = BLACK_A[aIdx(0.4)]; c.fillRect(0, 0, LW, LH);
    if (!l.pulled) { drawS(c, SPR.l1 || (SPR.l1 = T('一撃レバー', 52, 'gold')), LW / 2, 54, 1 + 0.06 * Math.sin(t * 14)); this.drawLeverIcon(c, LW / 2, 196, t); drawS(c, SPR.l2 || (SPR.l2 = T('引け!!', 40, 'red')), LW / 2, 290, 1); }
  },
  drawLast(c, t) {
    const l = this.last;
    drawS(c, SPR.lc1 || (SPR.lc1 = T('LAST CHANCE', 46, 'red', F_HEAVY)), LW / 2, 54, 1 + 0.05 * Math.sin(t * 10));
    drawS(c, SPR.lc2 || (SPR.lc2 = T('ボタン長押しでメーターを溜めろ!!', 22, 'white')), LW / 2, 104, 1);
    const bx = 60, by = 150, bw = LW - 120, bh = 46;
    c.fillStyle = '#000'; c.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    const g = l.meter >= 1 ? hue(t * 900) : l.meter > 0.75 ? '#ff2020' : l.meter > 0.45 ? '#ffb000' : '#3080ff';
    c.fillStyle = g; c.fillRect(bx, by, bw * Math.min(1, l.meter), bh);
    c.strokeStyle = '#ffd700'; c.lineWidth = 4; c.strokeRect(bx - 4, by - 4, bw + 8, bh + 8);
    if (l.state === 'broken') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(bx + bw * l.meter - 20, by - 10); c.lineTo(bx + bw * l.meter + 10, by + 20); c.lineTo(bx + bw * l.meter - 10, by + bh + 10); c.stroke(); }
    if (l.state === 'charge') this.drawButtonIcon(c, LW / 2, 262, 0.5, t);
  },
  drawResult(c, t) {
    const r = this.result;
    c.fillStyle = BLACK_A[10]; c.fillRect(20, 20, LW - 40, LH - 40);
    drawS(c, SPR.rr || (SPR.rr = T('RUSH RESULT', 40, 'gold', F_HEAVY)), LW / 2, 50, 1);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `400 26px ${F_HEAVY}`; c.fillStyle = '#fff'; c.fillText(r.chainStr, LW / 2, 92);
    c.font = `400 36px ${F_HEAVY}`; c.fillStyle = '#ffd700'; c.shadowColor = '#f80'; c.shadowBlur = 12; c.fillText(r.payStr, LW / 2, 132); c.shadowBlur = 0;
    const k = Math.min(1, Math.max(0, (r.t - 1.0) / 0.35));
    if (k > 0) { drawS(c, SPR.rt || (SPR.rt = T('獲得称号', 20, 'white')), LW / 2, 170, 1); drawS(c, r.rankSp, LW / 2, 246, lerp(3, 1, easeOutBack(k)) * (1 + 0.04 * Math.sin(t * 8)), k); }
  },
  drawArrowLcd(c, t) {
    const a = this.arrow, s = a.kind === 'v' ? (SPR.av || (SPR.av = T('Vをねらえ!!', 46, 'rainbow'))) : (SPR.ar || (SPR.ar = T('右をねらえ!', 46, 'gold')));
    c.fillStyle = BLACK_A[aIdx(0.35)]; c.fillRect(0, 0, LW, LH);
    drawS(c, s, LW / 2 - 50, LH / 2 - 10, 1 + 0.06 * Math.sin(t * 12));
    const k = (t * 3) % 1;
    c.save(); c.translate(LW - 96 + k * 24, LH / 2); c.beginPath(); c.moveTo(-60, -34); c.lineTo(10, -34); c.lineTo(10, -70); c.lineTo(80, 0); c.lineTo(10, 70); c.lineTo(10, 34); c.lineTo(-60, 34); c.closePath();
    c.fillStyle = (t * 8 | 0) % 2 ? '#ffd700' : '#ff2020'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#3a1800'; c.stroke(); c.restore();
  },
  drawHolds(c, t) {
    const hs = M.holds, full = hs.length >= 4;
    c.fillStyle = full ? GOLD_A[aIdx(0.35 + 0.3 * Math.sin(t * 10))] : BLACK_A[8];
    c.beginPath(); rr(c, 6, LH - 38, 136, 34, 12); c.fill();
    if (full) { c.lineWidth = 3; c.strokeStyle = (t * 10 | 0) % 2 ? '#fff6b0' : '#ffb000'; c.stroke(); }
    for (let i = 0; i < 4; i++) { c.fillStyle = BLACK_A[12]; c.beginPath(); c.arc(24 + i * 32, LH - 20, 11, 0, TAU); c.fill(); }
    for (let i = 0; i < hs.length; i++) this.drawHold(c, hs[i], 24 + i * 32, LH - 20, 11, t);
    if (M.cur && (this.scene === 'magma' || this.scene === 'reach' || this.scene === 'rush' || this.scene === 'battle' || this.scene === 'story')) {
      c.fillStyle = BLACK_A[10]; c.beginPath(); c.arc(226, LH - 22, 20, 0, TAU); c.fill();
      this.drawHold(c, M.cur, 226, LH - 22, 16, t);
    }
  },
  drawHold(c, h, x, y, r, t) {
    const col = h.dispColor;
    if (col === 'rainbow') c.fillStyle = hue(t * 500); else c.fillStyle = HOLD_FILL[col];
    if (col === 'gold' || col === 'rainbow' || col === 'red') { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.2 * Math.sin(t * 12); c.beginPath(); c.arc(x, y, r * 1.7, 0, TAU); c.fill(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; }
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.drawImage(Board.gloss.c, x - r, y - r, r * 2, r * 2);
    const f = h.fx; if (f) this.drawHoldFx(c, f, x, y, r, t);
  },
  drawHoldFx(c, f, x, y, r, t) {
    const k = f.t;
    if (f.type === 'sword') {
      const p = Math.min(1, k / 0.36), yy = lerp(y - 190, y - 6, easeOut(p));
      c.save(); c.translate(x + (k > 0.36 ? (rnd() - 0.5) * 4 : 0), yy);
      c.fillStyle = '#e8f2ff'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-7, -26); c.lineTo(-5, -110); c.lineTo(5, -110); c.lineTo(7, -26); c.closePath(); c.fill(); c.strokeStyle = '#6a7aa0'; c.lineWidth = 1.5; c.stroke();
      c.fillStyle = '#ffd700'; c.fillRect(-22, -116, 44, 9); c.fillStyle = '#7a0000'; c.fillRect(-5, -150, 10, 34);
      c.restore();
    } else if (f.type === 'bullet') {
      if (k < 0.36) { const p = k / 0.36, bx = lerp(-10, x, p); c.strokeStyle = '#fff6a0'; c.lineWidth = 4; c.beginPath(); c.moveTo(Math.max(0, bx - 120), y); c.lineTo(bx, y); c.stroke(); c.fillStyle = '#ffcc33'; c.beginPath(); c.arc(bx, y, 4, 0, TAU); c.fill(); if (k < 0.08) { c.fillStyle = '#fff'; c.beginPath(); c.arc(4, y, 26, 0, TAU); c.fill(); } }
    } else {
      if (k > 0.1 && k < 0.5) {
        const pts = f.pts; c.strokeStyle = (t * 30 | 0) % 2 ? '#ffffff' : '#ffee55'; c.lineWidth = 5; c.globalCompositeOperation = 'lighter';
        c.beginPath(); c.moveTo(x + pts[0], 0); for (let i = 1; i < 8; i++) c.lineTo(x + pts[i], y * i / 7); c.stroke();
        c.lineWidth = 12; c.globalAlpha = 0.3; c.stroke(); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        if (k < 0.2) { c.fillStyle = WHITE_A[8]; c.fillRect(0, 0, LW, LH); }
      }
    }
    if (k > 0.36 && k < 0.7) { c.globalCompositeOperation = 'lighter'; c.strokeStyle = WHITE_A[aIdx(1 - (k - 0.36) / 0.34)]; c.lineWidth = 4; c.beginPath(); c.arc(x, y, r + (k - 0.36) * 120, 0, TAU); c.stroke(); c.globalCompositeOperation = 'source-over'; }
  }
};
const SLOT = { x: 0, y: 0, r: 0 };
// カットインの帯の色 0=白 1=青 2=緑 3=赤 4=金（5=虹は毎フレーム色相を回す）
const CUTIN_FILL = ['#e8e8f0', '#2f6bff', '#18b858', '#d01010', '#ffcc22'];
