// =====================================================================
//  UI（DOM：ボタン・メニュー・デバッグ）
// =====================================================================
const $ = id => document.getElementById(id);
const UI = {
  ballStr: '0', last: { b: null, i: null, s: null }, fpsOn: false,
  init() {
    const push = $('push');
    const capture = (el, e) => { try { el.setPointerCapture(e.pointerId); } catch (_) { } };
    push.addEventListener('pointerdown', e => { e.preventDefault(); capture(push, e); Input.pushDown(); });
    const up = e => { e.preventDefault(); Input.pushUp(); };
    push.addEventListener('pointerup', up); push.addEventListener('pointercancel', up); push.addEventListener('lostpointercapture', up);
    push.addEventListener('dblclick', e => { e.preventDefault(); Input.skip(); });
    const lv = $('lever'); let sy = 0, pulled = false;
    lv.addEventListener('pointerdown', e => { e.preventDefault(); sy = e.clientY; pulled = false; capture(lv, e); });
    lv.addEventListener('pointermove', e => { if (!pulled && e.buttons && e.clientY - sy > 25) { pulled = true; Input.lever(); } });
    lv.addEventListener('pointerup', e => { e.preventDefault(); if (!pulled) Input.lever(); pulled = true; });
    $('bAuto').addEventListener('click', () => { unlock(); M.auto = !M.auto; this.syncBar(); Sound.play('select'); });
    $('bAim').addEventListener('click', () => { unlock(); const was = M.strong; D.settings.autoAim = false; M.manualStrong = !was; M.strong = M.manualStrong; this.syncBar(); this.syncPanels(); Sound.play('select'); });
    $('bMenu').addEventListener('click', () => { unlock(); this.toggle('menu'); });
    $('bDbg').addEventListener('click', () => { unlock(); this.toggle('dbg'); });
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => this.toggle(b.dataset.close, false)));
    document.querySelectorAll('[data-set]').forEach(sp => {
      const key = sp.dataset.set; let vals, labels;
      // 選択肢は設定ファイルから作る（@prob / @sakibare）
      if (sp.dataset.vals === '@prob') { vals = CFG.spec.probDenoms.map(String); labels = vals.map(v => '1/' + v); }
      else if (sp.dataset.vals === '@sakibare') { vals = CFG.holdColor.sakibareOptions.map(String); labels = CFG.holdColor.sakibareOptions.map(v => v ? '1/' + Math.round(1 / v) : 'OFF'); }
      else { vals = sp.dataset.vals.split(','); labels = (sp.dataset.labels || sp.dataset.vals).split(','); }
      vals.forEach((v, i) => { const b = document.createElement('button'); b.className = 'opt'; b.textContent = labels[i]; b.dataset.key = key; b.dataset.val = v; b.addEventListener('click', () => this.setOpt(key, v)); sp.appendChild(b); });
    });
    document.querySelectorAll('[data-force]').forEach(b => b.addEventListener('click', () => { unlock(); this.force(b.dataset.force); }));
    document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => { unlock(); this.cmd(b.dataset.cmd); }));
    document.querySelectorAll('#modesel .mode').forEach(b => b.addEventListener('click', () => { const s = M.sm.top; if (s instanceof RushSelectState) { Sound.play('select'); s.select(b.dataset.mode); } }));
    $('start').addEventListener('pointerdown', e => { e.preventDefault(); unlock(); });
    const cv = $('cv'); let lastTap = 0;
    cv.addEventListener('pointerdown', e => { unlock(); const now = performance.now(); if (now - lastTap < CFG.input.doubleTap * 1000) Input.skip(); lastTap = now; });
    window.addEventListener('keydown', e => {
      if (e.repeat && e.code !== 'Space') return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) Input.pushDown(); }
      else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); Input.lever(); }
      else if (k === 'a') $('bAuto').click(); else if (k === 'r') $('bAim').click();
      else if (k === 'm') this.toggle('menu'); else if (k === 'd') this.toggle('dbg'); else if (k === 's') Input.skip();
    });
    window.addEventListener('keyup', e => { if (e.code === 'Space') { e.preventDefault(); Input.pushUp(); } });
    this.syncBar(); this.syncPanels();
  },
  toggle(id, on) { const el = $(id); const show = on == null ? el.classList.contains('hidden') : on; ['menu', 'dbg'].forEach(p => $(p).classList.add('hidden')); if (show) { el.classList.remove('hidden'); this.syncPanels(); } },
  setOpt(key, v) {
    const S = D.settings; let val = v;
    if (key === 'vol' || key === 'bright') val = parseInt(v, 10); else if (key === 'sakibare' || key === 'prob') val = parseFloat(v); else if (v === 'true' || v === 'false') val = v === 'true';
    S[key] = val; if (key === 'vol') Sound.setVolume(val); if (key === 'rushMode') M.rushMode = val; if (key === 'autoAim' && val) M.manualStrong = false;
    Store.mark(); Store.save(); this.syncPanels(); this.syncBar(); Sound.play('select');
  },
  force(f) {
    M.force = f; Sound.play('select');
    if (f === 'iwakan' && M.mode !== 'rush') { this.cmd('rush'); M.force = 'iwakan'; return; }
    if (M.holds.length < 4) M.entry(M.mode === 'rush' ? 'denchu' : 'heso', true);
    this.toggle('dbg', false);
  },
  cmd(c) {
    if (c === 'rush') {
      M.holds.length = 0; M.cur = null; M.inBonus = false; M.bonusRush = false; M.attackerOpen = false; M.mode = 'normal'; M.chain = 1; M.rushPayout = 0;
      Reels.setLayout('big'); LCD.clear(); M.sm.reset(new RushSelectState()); this.toggle('dbg', false);
    } else if (c === 'fps') { this.fpsOn = !this.fpsOn; $('fps').classList.toggle('hidden', !this.fpsOn); }
    else if (c === 'addballs') { M.addBalls(1000); }
    else if (c === 'reset') { if (confirm('収支・履歴・スランプグラフを含む全データを消去しますか？')) { Store.reset(); D = Store.data; Counter.dirty = true; this.syncPanels(); } }
  },
  syncBar() {
    const a = $('bAuto'); a.innerHTML = 'AUTO<br>' + (M.auto ? 'ON' : 'OFF'); a.classList.toggle('on', M.auto);
    const b = $('bAim'); b.textContent = M.strong ? '右打ち' : '左打ち'; b.classList.toggle('on', M.strong);
    b.classList.toggle('blink', M.needRight() !== M.strong);
  },
  syncPanels() {
    document.querySelectorAll('.opt').forEach(b => { const v = D.settings[b.dataset.key]; b.classList.toggle('on', String(v) === b.dataset.val); });
    const st = $('statBox');
    this.syncSpec();
    if (st) st.innerHTML = `累計回転数 <b>${fmt(D.totalSpins)}</b> / 大当り <b>${D.hits}</b> / 初当り <b>${D.firstHits}</b> / RUSH突入 <b>${D.rushEntries}</b><br>最高出玉 <b>${fmt(D.maxPayout)}</b>個 / 最大連チャン <b>${D.maxChain}</b>連<br>投資 <b>${fmt(D.invest)}</b>円 / 持ち玉 <b>${fmt(D.balls)}</b>玉`;
  },
  /** 理論値（設定ファイルから計算）と、この台で実際に出た値を並べる */
  syncSpec() {
    const el = $('specBox'); if (!el) return;
    const th = PG.Spec.theory(CFG, { prob: D.settings.prob, preread: D.settings.preread }), m = D.meas, T = CFG.targets;
    const pct = v => (v * 100).toFixed(1) + '%', den = v => v > 0 ? '1/' + v.toFixed(1) : '---';
    const first = D.firstHits ? den(D.totalSpins / D.firstHits) + `（${D.firstHits}回）` : '---';
    const rushN = m.rushHits + m.rushEnds, cont = rushN ? pct(m.rushHits / rushN) + `（${rushN}回）` : '---';
    const heso = m.hesoIn ? den(m.leftShots / m.hesoIn) + `（${fmt(m.leftShots)}球）` : '---';
    const cues = Object.entries(th.cues).filter(([, v]) => v.reliability >= 0.5).map(([k, v]) => `${k} ${pct(v.reliability)}`).join(' / ');
    el.innerHTML = `大当り確率 理論 <b>${den(th.hitDenom)}</b>（当り${th.hitThreshold}個/${CFG.spec.randRange}）・実測 <b>${first}</b><br>` +
      `RUSH継続率 理論 <b>${pct(th.continuation)}</b>（${den(th.rushDenom)}×${CFG.spec.rush.stSpins}回転）・実測 <b>${cont}</b><br>` +
      `平均連チャン 理論 <b>${th.expectedChains.toFixed(2)}連</b> / 初当り1回の期待出玉 <b>${fmt(th.payoutPerFirstHit)}個</b><br>` +
      `ヘソ入賞率 目標 <b>${den(1 / T.hesoRate[1])}〜${den(1 / T.hesoRate[0])}</b>・実測 <b>${heso}</b><br>` +
      `激熱信頼度（理論） ${cues}`;
  },
  showModeSel(on) { $('modesel').classList.toggle('hidden', !on); },
  modeCd(n) { const el = $('modeCd'); const s = n + '秒後に自動選択（前回: ' + (M.rushMode === 'battle' ? 'バトル' : '爆速即当り') + '）'; if (el.textContent !== s) el.textContent = s; },
  hot(which, on) { $(which).classList.toggle('hot', on); },
  btnDown(on) { $('push').classList.toggle('down', on); },
  leverAnim() { const lv = $('lever'); lv.classList.add('pulled'); setTimeout(() => lv.classList.remove('pulled'), 380); },
  acc: 0,
  update(dt, fps) {
    this.acc += dt; if (this.acc < 0.15) return; this.acc = 0;
    const b = D.balls, inv = D.invest, bal = Math.round(D.balls * 4 - D.invest);
    if (b !== this.last.b) { this.last.b = b; this.ballStr = fmt(b); $('iBalls').textContent = this.ballStr; }
    if (inv !== this.last.i) { this.last.i = inv; $('iInv').textContent = fmt(inv); }
    if (bal !== this.last.s) { this.last.s = bal; const el = $('iBal'); el.textContent = (bal >= 0 ? '+' : '') + fmt(bal); el.className = bal >= 0 ? 'pos' : 'neg'; }
    const aim = $('bAim'); const want = M.strong ? '右打ち' : '左打ち'; if (aim.textContent !== want) this.syncBar();
    const blink = M.needRight() !== M.strong; if (aim.classList.contains('blink') !== blink) aim.classList.toggle('blink', blink);
    if (this.fpsOn) $('fps').textContent = fps.toFixed(0) + 'fps  balls:' + Phys.active() + '  ' + (M.sm.top ? M.sm.top.name : '');
    const ds = $('dbg'); if (!ds.classList.contains('hidden')) { this.specT = (this.specT || 0) + 1; if (this.specT % 7 === 0) this.syncSpec(); const el = $('dbgState'); el.textContent = '状態: ' + M.sm.stack.map(s => s.name).join(' > ') + ' / モード: ' + M.mode + ' / 保留: ' + M.holds.length + ' / RUSH残: ' + M.rushLeft; }
  }
};
let unlocked = false;
function unlock() {
  Sound.init();
  if (!unlocked) { unlocked = true; M.started = true; M.auto = true; $('start').classList.add('hidden'); UI.syncBar(); }
}
