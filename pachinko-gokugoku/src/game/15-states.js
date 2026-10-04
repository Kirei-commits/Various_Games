// =====================================================================
//  各ステート
// =====================================================================
class IdleState extends State {
  constructor() { super(M.mode === 'rush' ? 'RUSH待機' : '通常'); }
  enter() {
    setLed(M.mode === 'rush' ? 'rush' : 'normal'); BGM.set(M.mode === 'rush' ? chainTrack() : 'normal');
    LCD.setScene(M.mode === 'rush' ? 'rush' : 'magma'); Reels.setLayout('big'); M.cur = null;
    LCD.telop = LCD.judge = LCD.scoop = LCD.title = LCD.cutin = LCD.battle = LCD.story = LCD.round = LCD.last = LCD.result = LCD.lever = LCD.stepup = null;
    LCD.dark = 0; LCD.countOverride = null; M.noFire = false;
    Reels.r.forEach(r => r.glow = false);
    if (M.mode === 'rush') LCD.setRushInfo();
  }
  tick() {
    if (this.t < 0.12 || !M.holds.length) return;
    const h = M.holds.shift(); M.cur = h; Bus.emit('holds');
    if (M.mode === 'rush') {
      if (!h.isRush) { const n = Lottery.draw(h.raw, true, null); n.dispColor = h.dispColor; M.cur = n; }
      const c = M.cur;
      if (M.rushLeft <= 1) M.sm.change(new LastChanceState(c));
      else if (M.rushMode === 'battle' && c.rs.battle) M.sm.change(new RushBattleState(c));
      else M.sm.change(new RushSpinState(c));
    } else {
      if (h.isRush) { const n = Lottery.draw(h.raw, false, null); n.dispColor = 'white'; n.color = 'white'; M.cur = n; }
      M.sm.change(new SpinState(M.cur));
    }
  }
}

class SpinState extends State {
  constructor(h) { super('通常変動'); this.h = h; }
  enter() {
    const h = this.h, s = h.sc; M.spinStat(false);
    Reels.startAll(); Reels.setLayout('big'); LCD.setScene('magma'); setLed('normal'); BGM.set('normal');
    const full = M.holds.length >= CFG.holdMax - 1; // 保留満タンから消化した直後は超高速
    const T0 = s.reach === 'none' ? randIn(full ? TM.fullSpin : TM.normalSpin) : TM.reachSpin;
    const tl = this.tl;
    if (h.color !== h.dispColor && !h.fx) tl.at(0.12, () => startHoldFx(h));
    if (s.stepup) tl.at(0.3, () => M.sm.push(new ChanceState(s.stepup)));
    if (s.telop >= 0) tl.at(0.45, () => LCD.showTelop(s.telop, s.telopStart));
    if (s.reach === 'ippatsu') {
      tl.at(0.5, () => { Patlamp.fire(); setLed('rainbow'); FX.flash(WHITE_A, 0.8); LCD.pop(T('確定!!', 80, 'rainbow'), LW / 2, LH / 2, 1.6, 'zoom'); Sound.speak('キュインキュイン！'); });
      tl.at(1.5, () => Reels.stop(0, h.nums[0])).at(1.7, () => Reels.stop(2, h.nums[2])).at(1.9, () => { Reels.stop(1, h.nums[1]); Reels.r.forEach(r => r.glow = true); });
      tl.at(2.6, () => { Sound.play('zudon'); FX.shake(16, 0.4); onAligned(h); });
      return;
    }
    if (s.reach === 'zenkaiten') { tl.at(0.5, () => M.sm.change(new FullRotationState(h))); return; }
    tl.at(T0 * TM.stopL, () => Reels.stop(0, h.nums[0]));
    tl.at(T0 * TM.stopR, () => { Reels.stop(2, h.nums[2]); });
    if (s.reach !== 'none') tl.at(T0 * TM.stopR + 0.3, () => M.sm.change(new ReachState(h)));
    else { tl.at(T0, () => Reels.stop(1, h.nums[1])); tl.at(T0 + 0.35, () => M.sm.change(new IdleState())); }
  }
}

class ChanceState extends State {
  constructor(n) { super('チャンス'); this.n = n; }
  enter() {
    LCD.stepup = { cur: 1, t: 0, sp: [T('STEP1', 46, 'white', F_HEAVY), T('STEP2', 46, 'white', F_HEAVY), T('STEP3', 50, 'red', F_HEAVY), T('STEP4', 54, 'gold', F_HEAVY), T('激アツ', 70, 'rainbow')] };
    LCD.pop(T('CHANCE!', 40, 'gold', F_HEAVY), LW / 2, 36, 0.9, 'zoom');
    const iv = TM.stepupInterval;
    for (let k = 1; k <= this.n; k++) this.tl.at((k - 1) * iv, () => { LCD.stepup.cur = k; LCD.stepup.t = 0; Sound.play('step', k); if (k >= 4) FX.shake(k * 3, 0.25); if (k === 5) { Sound.speak('激アツ！'); FX.flash(GOLD_A, 0.6); } });
    this.tl.at(this.n * iv + 0.35, () => { LCD.stepup = null; M.sm.pop(); });
  }
}

const URA = { allow: false }; // 裏ボタン受付中
class ReachState extends State {
  constructor(h) { super('リーチ'); this.h = h; }
  enter() {
    const h = this.h, s = h.sc; URA.allow = true;
    Sound.play('reach'); Sound.speak('リーチ！'); setLed('reach'); BGM.set('reach'); LCD.setScene('reach');
    Reels.r[0].glow = true; Reels.r[2].glow = true; Reels.slow(1);
    LCD.pop(T('リーチ!!', 64, 'red'), LW / 2, 50, 1.2, 'zoom');
    if (s.reach === 'normal') { this.tl.at(TM.normalReach, () => this.finish()); }
    else {
      this.tl.at(TM.spDevelop, () => { FX.flash(WHITE_A, 0.9); Sound.play('whoosh'); LCD.pop(T('発展!!', 70, 'gold'), LW / 2, LH / 2, 0.8, 'zoom'); });
      this.tl.at(TM.spEnter, () => M.sm.change(new SPReachState(h)));
    }
  }
  finish() {
    if (this.done) return; this.done = true; const h = this.h;
    Reels.stopSlow(1, h.hit ? h.reachNum : h.nums[1]);
    const dur = Reels.r[1].dur;
    this.tl.after(dur + 0.25, () => {
      if (h.hit) { setLed('rainbow'); FX.rainbow(1.2); FX.shake(14, 0.5); Sound.play('boom'); this.tl.after(0.7, () => onAligned(h)); }
      else { Sound.play('lose'); this.tl.after(0.6, () => M.sm.change(new IdleState())); }
    });
  }
  onSkip() { if (this.h.sc.reach === 'normal') { this.tl.t = Math.max(this.tl.t, TM.normalReach); } else M.sm.change(new JudgeState(this.h, true)); }
  exit() { URA.allow = false; }
}

class SPReachState extends State {
  constructor(h) { super('SPリーチ'); this.h = h; }
  enter() {
    const h = this.h, s = h.sc; URA.allow = true;
    const battle = s.spType === 'battle';
    LCD.setScene(battle ? 'battle' : 'story'); BGM.set(battle ? 'battle' : 'reach'); setLed('reach');
    Reels.setLayout('small'); LCD.telop = null;
    const name = battle ? '黄金決戦' : '極伝説 ～覚醒～';
    LCD.title = { t: 0, dur: TM.sp.title, sp: T(name, 64, s.titleColor), sub: T(battle ? 'バトルSPリーチ' : 'ストーリーSPリーチ', 26, 'white') };
    if (s.goldTitle) { Sound.play('kiin'); FX.flash(GOLD_A, 0.6); }
    if (battle) {
      LCD.battle = { hp: [100, 100], fl: [0, 0], act: null, actT: 0, actor: 0, dmg: 0, applied: false, res: null, resT: 0, t: 0 };
      TM.sp.battleActs.forEach((at, i) => this.tl.at(at, () => { const b = LCD.battle; if (!b) return; b.act = 'atk'; b.actor = i % 2; b.actT = 0; b.applied = false; b.dmg = 12 + rnd() * 14; }));
    } else {
      const lines = ['遥か昔、黄金の都に封印されし龍あり…', '千年の時を経て、今その封印が揺らぐ！', '選ばれし者よ、極限の力を解き放て!!'];
      LCD.story = { t: 0, pre: lines.map(l => { const a = []; for (let i = 0; i <= l.length; i++) a.push(l.slice(0, i)); return a; }) };
    }
    if (s.cutin) this.tl.at(TM.sp.cutin, () => { LCD.cutin = { t: 0, gold: s.cutin === 2, sp: T(s.cutin === 2 ? '激熱' : '熱', 84, s.cutin === 2 ? 'gold' : 'white') }; Sound.play('cutin'); if (s.cutin === 2) { FX.shake(14, 0.4); Sound.speak('激熱！'); } });
    if (s.telop >= 0) this.tl.at(TM.sp.telop, () => { const txt = ['チャンス!', '熱い!!', '激アツ!!', '超激アツ!!!'][s.telop]; LCD.pop(T(txt, 54, COLOR_STYLE[s.telop]), LW / 2, 236, 1.4, 'zoom'); Sound.play('holdChange'); if (s.telop >= 2) FX.flash(GOLD_A, 0.5); });
    if (s.logoDrop) this.tl.at(TM.sp.logoDrop, () => { Yaku.drop(); Sound.speak('激アツ！'); });
    this.tl.at(TM.sp.judge, () => M.sm.change(new JudgeState(h, false)));
  }
  onSkip() { M.sm.change(new JudgeState(this.h, true)); }
  exit() { URA.allow = false; }
}

class JudgeState extends State {
  constructor(h, skipped) { super('当否判定'); this.h = h; this.skipped = skipped; this.revealed = false; }
  enter() {
    const s = this.h.sc; URA.allow = true;
    if (this.skipped) { LCD.title = LCD.cutin = null; if (s.reach !== 'normal') { if (s.spType === 'battle' && !LCD.battle) LCD.battle = { hp: [40, 40], fl: [0, 0], act: null, actT: 0, actor: 0, dmg: 0, applied: true, res: null, resT: 0, t: 0 }; if (s.spType === 'battle') LCD.setScene('battle'); else LCD.setScene('story'); } Reels.setLayout('small'); this.reveal(); return; }
    this.type = s.judge; LCD.judge = { type: this.type, t: 0, dur: TM.judge };
    UI.hot(this.type === 'button' ? 'push' : 'lever', true);
    Sound.speak(this.type === 'button' ? 'ボタンを押せ！' : 'レバーを引け！');
  }
  onPush() { if (!this.revealed && this.type === 'button') this.reveal(); }
  onLever() { if (!this.revealed) this.reveal(); }
  tick() { if (!this.revealed && LCD.judge && this.t > LCD.judge.dur) this.reveal(); }
  reveal() {
    this.revealed = true; LCD.judge = null; LCD.story = null; UI.hot('push', false); UI.hot('lever', false);
    const h = this.h, s = h.sc;
    Sound.play('button');
    if (h.hit) {
      FX.shake(26, 0.8); FX.rainbow(1.6); FX.flash(WHITE_A, 1); FX.confetti(100); Sound.play('boom'); setLed('rainbow');
      LCD.pop(T(s.spType === 'battle' ? '勝利!!' : '覚醒!!', 84, 'rainbow'), LW / 2, 130, 1.5, 'zoom');
      if (LCD.battle) { const b = LCD.battle; b.act = 'final'; b.actor = 0; b.actT = 0; b.applied = false; b.dmg = 100; this.tl.after(0.55, () => { if (LCD.battle) { LCD.battle.res = 'win'; LCD.battle.resT = 0; } FX.sparks(LX + 340, LY + 200, 60, 280, 400); }); }
      if (s.logoDrop === false && s.goldTitle && rnd() < 0.5) Yaku.drop();
      if (s.scoop && s.scoop.timing === 'pre') { this.tl.after(1.3, () => M.sm.change(new ScoopState(h, 'pre'))); return; }
      this.tl.after(1.2, () => { LCD.battle = null; LCD.setScene('magma'); Reels.setLayout('big'); Reels.r[1].state = 'spin'; Reels.r[1].vel = 12; });
      this.tl.after(1.6, () => { Reels.stop(1, h.reachNum); Reels.r.forEach(r => r.glow = true); });
      this.tl.after(2.4, () => onAligned(h));
    } else {
      Sound.play('lose'); LCD.pop(T(s.spType === 'battle' ? '敗北…' : '…無念', 64, 'silver'), LW / 2, 130, 1.4, 'zoom');
      if (LCD.battle) { const b = LCD.battle; b.act = 'final'; b.actor = 1; b.actT = 0; b.applied = false; b.dmg = 100; this.tl.after(0.55, () => { if (LCD.battle) { LCD.battle.res = 'lose'; LCD.battle.resT = 0; } }); }
      this.tl.after(1.3, () => { LCD.battle = null; LCD.setScene('magma'); Reels.setLayout('big'); Reels.r[1].state = 'spin'; Reels.r[1].vel = 12; });
      this.tl.after(1.5, () => Reels.stop(1, h.nums[1]));
      this.tl.after(2.1, () => M.sm.change(new IdleState()));
    }
  }
  exit() { URA.allow = false; UI.hot('push', false); UI.hot('lever', false); }
}

class ScoopState extends State {
  constructor(h, timing) { super('昇格スクープ'); this.h = h; this.timing = timing; }
  enter() {
    const h = this.h; this.ok = !!(h.sc.scoop && h.sc.scoop.ok); this.cap = randIn(TM.scoop.failCap);
    LCD.battle = null; LCD.story = null; LCD.setScene('reach'); Reels.setLayout('big');
    if (this.timing === 'pre') { Reels.r[1].state = 'spin'; Reels.r[1].vel = 10; }
    LCD.scoop = { gauge: 0, t: 0, done: false, ok: this.ok };
    UI.hot('push', true); Sound.speak('連打せよ！'); Sound.play('kiin'); setLed('reach');
  }
  onPush() { if (!LCD.scoop || LCD.scoop.done) return; LCD.scoop.gauge += TM.scoop.tapGain; Sound.play('tap', LCD.scoop.gauge * 10); FX.shake(3, 0.08); }
  tick(dt) {
    const s = LCD.scoop; if (!s || s.done) return;
    s.gauge += dt * TM.scoop.autoRate; if (!this.ok) s.gauge = Math.min(s.gauge, this.cap);
    if (this.ok && s.gauge >= 1) this.finish(true);
    else if (this.t > TM.scoop.duration) this.finish(this.ok);
  }
  finish(ok) {
    const s = LCD.scoop; s.done = true; s.gauge = ok ? 1 : s.gauge; UI.hot('push', false); const h = this.h;
    if (ok) {
      Reels.setAll(7); Reels.r.forEach(r => r.glow = true); Sound.play('boom'); FX.shake(24, 0.7); FX.rainbow(1.6); FX.confetti(90); setLed('rainbow');
      FX.pop(T('7図柄昇格!!', 84, 'rainbow'), W / 2, 540, 2, 'zoom'); Sound.speak('昇格！');
      this.tl.after(2.2, () => { LCD.scoop = null; startFever(h, true); });
    } else {
      Sound.play('lose');
      if (this.timing === 'pre') { Reels.stop(1, h.reachNum); }
      this.tl.after(1.4, () => { LCD.scoop = null; startFever(h, false); });
    }
  }
  exit() { UI.hot('push', false); }
}

class FullRotationState extends State {
  constructor(h) { super('全回転'); this.h = h; }
  enter() {
    const h = this.h, Z = TM.zenkaiten; Sound.silence(Z.freeze); BGM.set(null); setLed('off'); LCD.dark = 1; LCD.telop = null;
    this.tl.at(Z.freeze, () => { LCD.dark = 0; Sound.play('gyuin'); FX.rainbow(2); FX.flash(WHITE_A, 1); setLed('rainbow'); Reels.zenkaiten(); LCD.pop(T('全回転', 90, 'rainbow'), LW / 2, 60, 2.4, 'drop'); FX.shake(20, 0.6); Sound.speak('全回転！'); BGM.set(chainTrack()); });
    this.tl.at(Z.stop, () => Reels.stopAllAligned(h.final));
    this.tl.at(Z.align, () => { Sound.play('boom'); FX.shake(24, 0.7); FX.confetti(100); onAligned(h); });
  }
}

class FeverState extends State {
  constructor(bonus) { super('大当り'); this.b = bonus; this.round = 0; this.count = 0; this.pay = 0; this.phase = 'fanfare'; this.ph = 0; this.vPending = false; }
  enter() {
    const b = this.b; M.inBonus = true; M.bonusRush = b.rushBound; M.noFire = false;
    if (!b.isRush) { M.chain = 1; M.rushPayout = 0; D.firstHits++; } else { M.chain++; D.meas.rushHits++; }
    D.hits++; D.maxChain = Math.max(D.maxChain, M.chain);
    this.hist = { s: b.isRush ? M.rushSpinCount : D.spinsSinceHit, r: b.rounds, t: b.isRush ? 'RUSH' : (b.rushBound ? 'FEVER' : 'BONUS') };
    D.history.unshift(this.hist); if (D.history.length > 10) D.history.length = 10;
    D.spinsSinceHit = 0; if (b.isRush) M.rushSpinCount = 0;
    Counter.dirty = true; Store.mark();
    LCD.clear(); LCD.setScene('fever'); Reels.setLayout('hidden'); setLed('rainbow'); BGM.set(chainTrack());
    Sound.play('fanfare'); Sound.speak(b.rushBound ? '大当り！ 極極フィーバー！' : '大当り！');
    FX.shake(20, 0.6); FX.confetti(140); FX.rainbow(2.4);
    FX.pop(T('大当り', 150, 'gold'), W / 2, 500, 2.6, 'zoom');
    this.tl.at(0.9, () => FX.pop(b.rushBound ? T('極極FEVER', 96, 'rainbow') : T('CHANCE BONUS', 70, 'red', F_HEAVY), W / 2, 640, 2.0, 'slide'));
    if (b.isRush) this.tl.at(0.2, () => FX.pop(T(M.chain + '連!!', 90, M.chain >= 10 ? 'rainbow' : 'red'), W / 2, 380, 2.4, 'drop'));
    this.tl.at(TM.fanfare, () => { LCD.arrow = { kind: b.rushBound ? 'v' : 'right', t: 0, dur: 2.2 }; M.arrowT = 2.5; Sound.speak(b.rushBound ? 'Vをねらえ！' : '右をねらえ！'); this.startRound(); });
  }
  startRound() {
    this.round++; this.count = 0; this.rt = 0; this.phase = 'open'; M.attackerOpen = true; Sound.play('open');
    if (this.round === 1 && this.b.rushBound) this.vPending = true;
    const label = this.b.rushBound ? (this.b.isRush ? 'RUSH BONUS' : '極極FEVER') : 'CHANCE BONUS';
    LCD.round = { sp: T('ROUND ' + this.round, 58, this.round >= 10 ? 'rainbow' : 'gold', F_HEAVY), labelSp: T(label, 34, this.b.rushBound ? 'red' : 'blue', F_HEAVY), count: 0, payStr: '+' + fmt(this.pay), endSp: null };
  }
  onAttacker() {
    if (this.phase !== 'open' && this.phase !== 'closing') { M.addBalls(CFG.payout.attacker); return; }
    const pay = CFG.payout.attacker; this.count++; this.pay += pay; M.rushPayout += pay; M.addBalls(pay);
    if (LCD.round) { LCD.round.count = Math.min(CFG.spec.countPerRound, this.count); LCD.round.payStr = '+' + fmt(this.pay); }
    if (this.vPending) { this.vPending = false; Sound.play('v'); FX.pop(T('V入賞!!', 74, 'rainbow'), W / 2, 760, 1.4, 'zoom'); FX.flash(WHITE_A, 0.6); Sound.speak('V！'); }
    if (this.phase === 'closing') { Sound.play('kyuin'); Sound.speak('オーバー入賞！'); FX.pop(T('オーバー入賞!', 44, 'gold'), 600, 820, 1.4, 'rise'); return; }
    Sound.play('entry', this.count);
    if (this.count >= CFG.spec.countPerRound) { Sound.play('kyuin'); this.phase = 'closing'; this.ph = TM.bonus.overWindow; FX.sparks(640, 860, 30, 40, 260); }
  }
  tick(dt) {
    if (this.phase === 'open') { this.rt += dt; if (this.rt > TM.bonus.roundTimeout) { this.phase = 'closing'; this.ph = 0.05; } }
    else if (this.phase === 'closing') { this.ph -= dt; if (this.ph <= 0) { M.attackerOpen = false; this.phase = 'interval'; this.ph = TM.bonus.interval; } }
    else if (this.phase === 'interval') {
      this.ph -= dt;
      if (this.ph <= 0) {
        if (this.b.lever && this.round === TM.bonus.leverAfterRound) { this.phase = 'lever'; M.sm.push(new LeverPromoteState(this)); }
        else if (this.round < this.b.rounds) this.startRound();
        else this.ending();
      }
    }
    if (this.phase === 'open' && !M.strong && M.needRight() && !LCD.arrow) LCD.arrow = { kind: 'right', t: 0, dur: 1.2 };
  }
  resume() { if (this.phase === 'lever') { this.b.lever = false; this.b.rushBound = true; M.bonusRush = true; this.hist.t = 'FEVER'; Counter.dirty = true; this.startRound(); } }
  ending() {
    this.phase = 'end'; M.attackerOpen = false; const b = this.b;
    D.maxPayout = Math.max(D.maxPayout, b.rushBound ? M.rushPayout : this.pay); Counter.dirty = true; Store.mark();
    if (LCD.round) { LCD.round.sp = T('獲得 ' + fmt(this.pay) + '個', 50, 'gold', F_HEAVY); LCD.round.labelSp = T('BONUS END', 30, 'white', F_HEAVY); LCD.round.endSp = b.rushBound ? T(b.isRush ? 'RUSH継続!!' : 'RUSH突入!!', 54, 'rainbow') : T('昇格ならず…', 44, 'silver'); }
    if (!b.rushBound) Sound.play('lose');
    this.tl.after(TM.bonus.ending, () => this.finish());
  }
  finish() {
    const b = this.b; M.inBonus = false; M.bonusRush = false; M.attackerOpen = false; LCD.round = null;
    if (b.rushBound) {
      if (M.mode === 'rush') { M.rushLeft = CFG.spec.rush.stSpins; LCD.setRushInfo(); M.sm.change(new IdleState()); }
      else M.sm.change(new RushSelectState());
    } else { D.lastChain = M.chain; M.chain = 0; Counter.dirty = true; M.sm.change(new IdleState()); }
  }
  exit() { M.attackerOpen = false; }
}

class LeverPromoteState extends State {
  constructor(fever) { super('一撃昇格'); this.fever = fever; this.pulled = false; }
  enter() { LCD.lever = { t: 0, pulled: false }; UI.hot('lever', true); Sound.play('kiin'); Sound.speak('一撃レバーを引け！'); setLed('reach'); BGM.set('reach'); }
  onLever() { if (this.pulled) return; this.pulled = true; LCD.lever.pulled = true; UI.hot('lever', false); Sound.play('lever');
    this.tl.after(0.45, () => { Yaku.drop(); setLed('rainbow'); FX.rainbow(2.2); BGM.set(chainTrack()); });
    this.tl.after(0.9, () => { FX.pop(T('RUSH昇格!!', 100, 'rainbow'), W / 2, 700, 2.2, 'zoom'); Sound.speak('ラッシュ昇格！'); });
    this.tl.after(3.3, () => { LCD.lever = null; M.sm.pop(); });
  }
  onPush() { this.onLever(); }
  tick() { if (!this.pulled && this.t > TM.bonus.leverAuto) this.onLever(); }
  exit() { UI.hot('lever', false); }
}

class RushSelectState extends State {
  constructor() { super('モード選択'); }
  enter() { LCD.clear(); LCD.setScene('rush'); Reels.setLayout('big'); M.noFire = true; UI.showModeSel(true); Sound.speak('モードを選択してください'); this.done = false; }
  select(mode) {
    if (this.done) return; this.done = true; M.rushMode = mode; D.settings.rushMode = mode; Store.mark(); UI.showModeSel(false); UI.syncPanels();
    M.mode = 'rush'; M.rushLeft = CFG.spec.rush.stSpins; M.rushSpinCount = 0; M.dcT = 0; D.rushEntries++; M.rejudge(true); LCD.setRushInfo(); Counter.dirty = true;
    rushEnterFx(); LCD.arrow = { kind: 'right', t: 0, dur: 2 }; M.arrowT = 2.5;
    M.sm.change(new IdleState());
  }
  tick() { UI.modeCd(Math.max(0, Math.ceil(TM.modeSelect - this.t))); if (this.t > TM.modeSelect) this.select(M.rushMode); }
  exit() { UI.showModeSel(false); M.noFire = false; }
}

class RushSpinState extends State {
  constructor(h) { super('RUSH変動'); this.h = h; }
  enter() {
    const h = this.h; M.rushLeft--; M.spinStat(true); LCD.setRushInfo(); LCD.setScene('rush'); Reels.startAll(); Reels.setLayout('big');
    if (h.color !== h.dispColor && !h.fx) this.tl.at(0.02, () => startHoldFx(h));
    const tl = this.tl;
    if (h.hit) {
      const iw = h.rs.iwakan;
      if (iw === 'bgmStop') tl.at(0.05, () => { Sound.cutBgm(1.2); });
      else if (iw === 'lampOff') tl.at(0.05, () => setLed('off'));
      else if (iw === 'count777') tl.at(0.05, () => { LCD.countOverride = '777'; Sound.play('kiin'); });
      const d = iw ? TM.rushIwakanSpin : TM.rushSpin;
      tl.at(d * 0.5, () => Reels.stop(0, h.nums[0], 0.12)).at(d * 0.72, () => Reels.stop(2, h.nums[2], 0.12)).at(d, () => { Reels.stop(1, h.nums[1], 0.12); Reels.r.forEach(r => r.glow = true); });
      tl.at(d + 0.15, () => { Sound.play('zudon'); Sound.play('boom'); FX.shake(22, 0.6); FX.rainbow(1.4); setLed('rainbow'); LCD.pop(T('即当り!!', 80, 'rainbow'), LW / 2, LH / 2, 1.2, 'zoom'); });
      tl.at(d + 1.0, () => { LCD.countOverride = null; onAligned(h); });
    } else {
      const d = TM.rushSpin;
      tl.at(d * 0.44, () => Reels.stop(0, h.nums[0], 0.1)).at(d * 0.68, () => Reels.stop(2, h.nums[2], 0.1)).at(d * 0.92, () => Reels.stop(1, h.nums[1], 0.1));
      tl.at(d * 1.16, () => M.sm.change(new IdleState()));
    }
  }
}

class RushBattleState extends State {
  constructor(h) { super('RUSHバトル'); this.h = h; }
  enter() {
    const h = this.h; M.rushLeft--; M.spinStat(true); LCD.setRushInfo(); LCD.setScene('battle'); Reels.startAll(); Reels.setLayout('small'); BGM.set('battle');
    LCD.battle = { hp: [100, 100], fl: [0, 0], act: null, actT: 0, actor: 0, dmg: 0, applied: false, res: null, resT: 0, t: 0 };
    LCD.pop(T('BATTLE!!', 70, 'red', F_HEAVY), LW / 2, 110, 0.9, 'zoom'); Sound.play('cutin');
    const RB = TM.rushBattle;
    RB.acts.forEach((at, i) => this.tl.at(at, () => { const b = LCD.battle; if (!b) return; b.act = 'atk'; b.actor = i % 2; b.actT = 0; b.applied = false; b.dmg = 15 + rnd() * 15; }));
    this.tl.at(RB.final, () => { const b = LCD.battle; b.act = 'final'; b.actor = h.hit ? 0 : 1; b.actT = 0; b.applied = false; b.dmg = 100; });
    this.tl.at(RB.result, () => {
      LCD.battle.res = h.hit ? 'win' : 'lose'; LCD.battle.resT = 0;
      if (h.hit) { Sound.play('boom'); FX.shake(24, 0.7); FX.rainbow(1.5); setLed('rainbow'); LCD.pop(T('WIN!!', 96, 'rainbow', F_HEAVY), LW / 2, 130, 1.6, 'zoom'); Reels.setAll(h.final); Reels.r.forEach(r => r.glow = true); }
      else { Sound.play('lose'); LCD.pop(T('LOSE…', 70, 'silver', F_HEAVY), LW / 2, 130, 1.2, 'zoom'); Reels.stop(0, h.nums[0], 0.1); Reels.stop(1, h.nums[1], 0.1); Reels.stop(2, h.nums[2], 0.1); }
    });
    this.tl.at(h.hit ? RB.winEnd : RB.loseEnd, () => { LCD.battle = null; if (h.hit) onAligned(h); else M.sm.change(new IdleState()); });
  }
  onPush() { const b = LCD.battle; if (b && !b.res) { FX.shake(4, 0.1); Sound.play('tap', 5); } }
}

class LastChanceState extends State {
  constructor(h) { super('ラストチャンス'); this.h = h; }
  enter() {
    const h = this.h; M.rushLeft = 0; M.spinStat(true); LCD.setRushInfo(); LCD.setScene('last'); Reels.startAll(); Reels.setLayout('small'); BGM.set('reach'); setLed('reach');
    LCD.last = { meter: 0, state: 'charge' }; this.cap = randIn(TM.lastChance.failCap); UI.hot('push', true);
    Sound.speak('ラストチャンス！ ボタン長押し！'); FX.pop(T('LAST CHANCE', 80, 'red', F_HEAVY), W / 2, 560, 1.6, 'zoom'); FX.shake(10, 0.4);
    this.sndT = 0;
  }
  onPushHeld(t, dt) { const l = LCD.last; if (l && l.state === 'charge') l.meter += dt * TM.lastChance.holdRate; }
  tick(dt) {
    const l = LCD.last; if (!l || l.state !== 'charge') return;
    l.meter += dt * TM.lastChance.autoRate; if (!this.h.hit) l.meter = Math.min(l.meter, this.cap);
    this.sndT -= dt; if (this.sndT <= 0) { this.sndT = 0.1; Sound.play('charge', l.meter); }
    if (this.h.hit && (l.meter >= 1 || this.t > TM.lastChance.duration)) this.win();
    else if (!this.h.hit && this.t > TM.lastChance.duration) this.lose();
  }
  win() {
    const l = LCD.last; l.meter = 1; l.state = 'full'; UI.hot('push', false); const h = this.h;
    Sound.play('boom'); FX.shake(28, 0.8); FX.rainbow(2); FX.confetti(120); setLed('rainbow'); Reels.setAll(h.final); Reels.r.forEach(r => r.glow = true);
    FX.pop(T('大当り!!', 120, 'rainbow'), W / 2, 540, 1.8, 'zoom'); Sound.speak('大当り！');
    this.tl.after(1.8, () => { LCD.last = null; M.rushLeft = CFG.spec.rush.stSpins; onAligned(h); });
  }
  lose() {
    const l = LCD.last; l.state = 'broken'; D.meas.rushEnds++; UI.hot('push', false); Sound.play('crack'); FX.shake(12, 0.4);
    Reels.stop(0, this.h.nums[0]); Reels.stop(1, this.h.nums[1]); Reels.stop(2, this.h.nums[2]);
    FX.pop(T('RUSH終了', 80, 'silver'), W / 2, 560, 1.6, 'zoom');
    this.tl.after(2.0, () => M.sm.change(new ResultState()));
  }
  exit() { UI.hot('push', false); }
}

class ResultState extends State {
  constructor() { super('リザルト'); }
  enter() {
    const pay = M.rushPayout, chain = M.chain;
    M.mode = 'normal'; M.rushLeft = 0; M.rejudge(false); M.noFire = true;
    D.lastChain = chain; D.maxPayout = Math.max(D.maxPayout, pay); Counter.dirty = true; Store.mark();
    const rk = CFG.result.ranks.find(r => pay >= r[0]) || CFG.result.ranks[CFG.result.ranks.length - 1];
    const rank = rk[1], style = rk[2], low = rk === CFG.result.ranks[CFG.result.ranks.length - 1];
    LCD.clear(); LCD.setScene('result'); Reels.setLayout('hidden'); setLed(low ? 'normal' : 'rainbow');
    LCD.result = { t: 0, chainStr: chain + '連チャン', payStr: fmt(pay) + '個', rankSp: T(rank, rank.length > 2 ? 62 : 80, style) };
    BGM.set(low ? 'normal' : 'premium');
    this.tl.at(1.1, () => { Sound.play(low ? 'lose' : 'boom'); if (!low) { FX.confetti(rk === CFG.result.ranks[0] ? 200 : 100); FX.shake(18, 0.5); FX.rainbow(1.5); } Sound.speak('称号、' + rank); });
    UI.hot('push', true);
  }
  onPush() { if (this.t > TM.result.closable) this.close(); }
  tick() { if (this.t > TM.result.auto) this.close(); }
  close() { if (this.closed) return; this.closed = true; UI.hot('push', false); M.chain = 0; M.rushPayout = 0; M.noFire = false; Counter.dirty = true; M.sm.change(new IdleState()); }
  exit() { UI.hot('push', false); M.noFire = false; }
}
