// 画面（ハブ・メニュー・強化・図鑑・設定・2択・結果）
const UI = (() => {
  const U = { screen: 'hub' };
  const lg = () => Store.d.legion;
  const SCREENS = ['hub', 'lmenu', 'hud'];
  function only(id) { for (const s of SCREENS) show(s, s === id); U.screen = id === 'hud' ? 'game' : id; }
  function coins() { for (const id of ['hubCoins', 'lmCoins', 'upCoins']) $(id).textContent = fmtNum(Store.d.coins); }

  U.toHub = () => { only('hub'); coins(); };
  U.toMenu = () => { only('lmenu'); coins(); renderMenu(); };
  U.toGame = () => { only('hud'); for (const p of ['pause', 'result', 'choice', 'upPanel', 'dexPanel', 'setPanel']) show(p, false); show('evolveHint', false); };

  function renderMenu() {
    const d = lg();
    for (const b of $('diffTabs').children) b.classList.toggle('on', b.dataset.diff === d.diff);
    for (const b of $('modeTabs').children) b.classList.toggle('on', b.dataset.mode === d.mode);
    show('stagePane', d.mode === 'stage'); show('endlessPane', d.mode === 'endless');
    const cleared = d.cleared[d.diff], stars = d.stars[d.diff];
    const total = Object.values(stars).reduce((a, b) => a + b, 0);
    $('stageSummary').textContent = `クリア ${cleared} / ${CFG.stage.count}　★ ${total} / ${CFG.stage.count * 3}`;
    const grid = $('stageGrid');
    let html = '';
    for (let n = 1; n <= CFG.stage.count; n++) {
      const st = stars[n] || 0;
      const cls = n <= cleared ? 'clear' : n === cleared + 1 ? 'next' : 'lock';
      html += `<button type="button" class="${cls}" data-n="${n}" ${cls === 'lock' ? 'disabled' : ''}>${n}<span class="st">${n <= cleared ? '★'.repeat(st) + '☆'.repeat(3 - st) : ''}</span></button>`;
    }
    grid.innerHTML = html;
    const next = grid.querySelector('.next');
    if (next) next.scrollIntoView({ block: 'center' });
    const b = d.best[d.diff];
    $('endlessBest').textContent = b ? `最高記録: WAVE ${b.wave}・${b.kills}体撃破` : '最高記録: まだなし';
  }

  // ---- 強化 ----
  function renderUp() {
    const ups = lg().upgrades;
    $('upList').innerHTML = CFG.upgradeOrder.map(k => {
      const u = CFG.upgrades[k], lv = ups[k] || 0, cost = L.upgradeCost(CFG, k, lv);
      const max = lv >= u.max;
      return `<div class="up"><div class="nm"><b>${u.name}</b><small>${u.desc}</small></div><span class="lv">Lv ${lv}/${u.max}</span>
        <button class="btn" type="button" data-up="${k}" ${max || cost > Store.d.coins ? 'disabled' : ''}>${max ? 'MAX' : '<span>🪙 ' + fmtNum(cost) + '</span>'}</button></div>`;
    }).join('');
    coins();
  }
  $('upList').addEventListener('click', e => {
    const b = e.target.closest('[data-up]'); if (!b) return;
    const k = b.dataset.up, ups = lg().upgrades, lv = ups[k] || 0, cost = L.upgradeCost(CFG, k, lv);
    if (cost > Store.d.coins) return;
    Store.d.coins -= cost; ups[k] = lv + 1; Store.save(); Sound.buy(); renderUp();
  });

  // ---- 図鑑 ----
  function renderDex() {
    const dex = lg().dex;
    let n = 0, cells = '';
    for (const type of CFG.heroOrder) for (let t = 1; t <= CFG.hero.maxTier; t++) {
      const ok = (dex[type] || 0) >= t; if (ok) n++;
      cells += `<div class="cell ${ok ? '' : 'unknown'}"><canvas width="96" height="96" data-h="${type}" data-t="${t}" data-ok="${ok ? 1 : 0}"></canvas><span>${ok ? CFG.heroes[type].names[t - 1] : '？？？'}</span><span>${'★'.repeat(t)}</span></div>`;
    }
    $('dexList').innerHTML = cells;
    $('dexCount').textContent = `${n} / ${CFG.heroOrder.length * CFG.hero.maxTier}`;
    for (const c of $('dexList').querySelectorAll('canvas')) {
      const g = c.getContext('2d');
      g.drawImage(Sprites.hero(c.dataset.h, +c.dataset.t), 0, 0, 96, 96);
      if (c.dataset.ok !== '1') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = '#111'; g.fillRect(0, 0, 96, 96); }
    }
  }

  // ---- 2択 ----
  U.openChoice = ch => {
    const c = $('choiceImg'), g = c.getContext('2d');
    g.clearRect(0, 0, 200, 200); g.drawImage(Sprites.hero(ch.hero, ch.tier), 0, 0, 200, 200);
    $('choiceName').textContent = `${'★'.repeat(ch.tier)} ${CFG.heroes[ch.hero].names[ch.tier - 1]}（${CFG.weapons[CFG.heroes[ch.hero].weapon].name}）`;
    $('chJoinSub').textContent = ch.canJoin ? '盤面に加わる' : '英雄がいっぱい';
    $('chJoin').disabled = !ch.canJoin;
    $('chEvolve').disabled = !ch.canEvolve;
    show('evolveHint', false); show('choice', true);
  };
  U.closeChoice = (pick) => { show('choice', false); show('evolveHint', !!pick); };

  // ---- 結果 ----
  U.openResult = ({ win, stars, rw, S, mode, n, record }) => {
    $('resTitle').textContent = mode === 'endless' ? (record ? '新記録！' : 'エンドレス終了') : (win ? 'STAGE CLEAR!' : '拠点が落ちた…');
    $('resStars').innerHTML = mode === 'stage' ? [1, 2, 3].map(i => i <= stars ? '<b>★</b>' : '★').join('') : '';
    const lines = [];
    if (mode === 'endless') lines.push(['到達ウェーブ', S.wave]);
    lines.push(['撃破', S.kills + '体']);
    lines.push(['撃破コイン', '🪙 ' + fmtNum(rw.kills)]);
    if (rw.clear) lines.push(['クリアボーナス', '🪙 ' + fmtNum(rw.clear)]);
    if (rw.wave) lines.push(['ウェーブボーナス', '🪙 ' + fmtNum(rw.wave)]);
    $('resLines').innerHTML = lines.map(([a, b]) => `<div><span>${a}</span><b>${b}</b></div>`).join('') + `<div class="total"><span>合計</span><b>🪙 ${fmtNum(rw.total)}</b></div>`;
    show('resNext', mode === 'stage' && win && n < CFG.stage.count);
    $('resRetry').textContent = win ? 'もう一度' : 'リトライ';
    show('result', true);
  };

  function confirm(text, yes) {
    $('confirmText').textContent = text; show('confirm', true);
    $('confirmYes').onclick = () => { show('confirm', false); yes(); };
    $('confirmNo').onclick = () => show('confirm', false);
  }
  function openSettings() {
    const s = Store.d.settings;
    $('volBgm').value = s.bgm; $('volSe').value = s.se; $('mute').checked = s.mute;
    show('setPanel', true);
  }

  // ---- ボタン ----
  onTap('openLegion', () => { Sound.init(); Sound.play('menu'); U.toMenu(); });
  onTap('hubSettings', openSettings);
  onTap('lmBack', U.toHub);
  $('diffTabs').addEventListener('click', e => { const b = e.target.closest('[data-diff]'); if (!b) return; Sound.ui(); lg().diff = b.dataset.diff; Store.save(); renderMenu(); });
  $('modeTabs').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (!b) return; Sound.ui(); lg().mode = b.dataset.mode; Store.save(); renderMenu(); });
  $('stageGrid').addEventListener('click', e => { const b = e.target.closest('[data-n]'); if (!b || b.disabled) return; Sound.ui(); Game.start({ mode: 'stage', n: +b.dataset.n, diff: lg().diff }); });
  onTap('startEndless', () => Game.start({ mode: 'endless', diff: lg().diff }));
  onTap('openUp', () => { renderUp(); show('upPanel', true); });
  onTap('upClose', () => { show('upPanel', false); coins(); });
  onTap('openDex', () => { renderDex(); show('dexPanel', true); });
  onTap('dexClose', () => show('dexPanel', false));
  onTap('openSet', openSettings);
  onTap('setClose', () => show('setPanel', false));
  for (const [id, key] of [['volBgm', 'bgm'], ['volSe', 'se']]) $(id).addEventListener('input', e => { Store.d.settings[key] = +e.target.value; Sound.apply(); Store.save(); });
  $('mute').addEventListener('change', e => { Store.d.settings.mute = e.target.checked; Sound.apply(); Store.save(); });
  onTap('resetData', () => confirm('セーブデータをすべて消しますか？（コイン・強化・図鑑も消えます）', () => { Store.reset(); Sound.apply(); show('setPanel', false); U.toHub(); }));

  onTap('pauseBtn', () => { Game.togglePause(true); show('pause', true); });
  onTap('resume', () => { show('pause', false); Game.togglePause(false); });
  onTap('retry', () => { show('pause', false); Game.quit(); Game.start({ mode: Game.mode, n: Game.n, diff: Game.diff }); });
  onTap('quit', () => { show('pause', false); Game.quit(); U.toMenu(); });
  onTap('chJoin', () => Game.choose('join'));
  onTap('chEvolve', () => Game.choose('evolve'));
  onTap('evolveCancel', () => Game.cancelEvolve());
  onTap('resNext', () => { show('result', false); Game.quit(); Game.start({ mode: 'stage', n: Game.n + 1, diff: Game.diff }); });
  onTap('resRetry', () => { show('result', false); Game.quit(); Game.start({ mode: Game.mode, n: Game.n, diff: Game.diff }); });
  onTap('resUp', () => { show('result', false); Game.quit(); U.toMenu(); renderUp(); show('upPanel', true); });
  onTap('resMenu', () => { show('result', false); Game.quit(); U.toMenu(); });

  return U;
})();
