/*
 * 画面（8章 S-01〜S-08）。ブラウザ専用。
 * 状態は RGA.store の形で localStorage に保存する。学習者のコードは runner の使い捨てワーカーで動かす。
 */
(function () {
  'use strict';
  const { content: C, rules: R, runner, gitsim: G, tutor: T, store: S, core } = window.RGA;

  // ---------------------------------------------------------------- 状態
  let state = S.load(safeStorage('localStorage'), safeStorage('sessionStorage'));
  let saveTimer = null;
  function safeStorage(name) {
    try { const s = window[name]; s.getItem('x'); return s; } catch (e) { return null; }
  }
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => S.save(state, safeStorage('localStorage') || memStore, safeStorage('sessionStorage')), 200);
  }
  const memStore = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = v; }, removeItem(k) { delete this._m[k]; } };
  function update(fn) {
    fn(state);
    persist();
  }
  const now = () => Date.now();
  const uid = (p) => p + '-' + Math.random().toString(36).slice(2, 10);

  // ---------------------------------------------------------------- DOM の小道具
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
        else el.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : String(kid));
    }
    return el;
  }
  const $ = (id) => document.getElementById(id);
  function codeBlock(text, cls) {
    return h('pre', { class: 'code ' + (cls || '') }, h('code', null, text));
  }
  function toast(msg, kind) {
    const el = $('toast');
    el.textContent = msg;
    el.className = 'show ' + (kind || '');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.className = ''; }, 4200);
  }
  function fmtMin(m) {
    return m === undefined || m === null || m === '' ? '—' : (Math.round(Number(m) * 10) / 10) + ' 分';
  }
  function fmtTime(t) {
    const d = new Date(t);
    return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // テキストエリアで Tab を押したら字下げ（Esc のあとの Tab ではフォーカスを移す: キーボードだけで操作できるように）
  function codeEditor(props) {
    const ta = h('textarea', { spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', class: 'editor', ...props });
    let escaped = false;
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { escaped = true; return; }
      if (e.key === 'Tab' && !e.shiftKey && !escaped) {
        e.preventDefault();
        const s = ta.selectionStart;
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(ta.selectionEnd);
        ta.selectionStart = ta.selectionEnd = s + 2;
        ta.dispatchEvent(new Event('input'));
      }
      if (e.key !== 'Tab') escaped = false;
    });
    return ta;
  }

  // ---------------------------------------------------------------- ルーター
  function route() {
    const parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    return { name: parts[0] || 'home', args: parts.slice(1) };
  }
  function go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function render() {
    const r = route();
    const active = document.activeElement;
    const focusId = active && active.id;
    const sel = active && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const main = $('main');
    if (!state.user && r.name !== 'onboarding') { location.replace('#/onboarding'); return; }
    $('nav').hidden = !state.user;
    for (const a of $('nav').querySelectorAll('a')) a.removeAttribute('aria-current');
    const navEl = $('nav-' + ({ unit: 'home' }[r.name] || r.name));
    if (navEl) navEl.setAttribute('aria-current', 'page');
    let view;
    if (r.name === 'onboarding') view = viewOnboarding();
    else if (r.name === 'map') view = viewMap();
    else if (r.name === 'unit') view = viewUnit(r.args[0], r.args[1]);
    else if (r.name === 'repo') view = viewRepo(r.args[0] === 'pr' ? Number(r.args[1]) : null);
    else if (r.name === 'log') view = viewLog();
    else if (r.name === 'settings') view = viewSettings();
    else view = viewHome();
    main.replaceChildren(view);
    if (focusId && $(focusId)) {
      const el = $(focusId);
      el.focus({ preventScroll: true });
      if (sel && 'selectionStart' in el) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* 対応しない要素 */ } }
    }
  }
  let lastRoute = '';
  window.addEventListener('hashchange', () => {
    render();
    const key = route().name + '/' + route().args.join('/');
    if (key !== lastRoute) { window.scrollTo(0, 0); $('main').focus({ preventScroll: true }); }
    lastRoute = key;
  });

  // ---------------------------------------------------------------- S-01 オンボーディング
  const obDraft = { name: '', answers: {}, suggestion: null };
  function viewOnboarding() {
    const promises = [
      ['失敗は罰になりません', 'テストが落ちるのは、次に直す場所を教えてくれているだけ。やり直しは何度でもできます。'],
      ['スコアは誰にも公開しません', 'ランキングもありません。記録はあなたの振り返りのためだけに使います。'],
      ['まず自分で考え、説明できたらAIを解禁', 'どの単元も「AIオフ」で始まり、説明ゲートに合格すると「AIオン」になります。'],
      ['題材はすべて架空です', '実在の顧客情報・社内のコード・パスワードやAPIキーは入力しないでください。入力されたらAIへの送信を止めてお知らせします。'],
    ];
    const survey = C.SURVEY.map((q, i) => h('fieldset', { class: 'survey-q' },
      h('legend', null, (i + 1) + '. ' + q.q),
      h('div', { class: 'scale' }, C.SURVEY_SCALE.map((label, v) => h('label', { class: 'chip' },
        h('input', { type: 'radio', name: 'sv-' + q.id, value: String(v), checked: obDraft.answers[q.id] === v, onchange: () => { obDraft.answers[q.id] = v; } }),
        h('span', null, label))))));
    const sug = obDraft.suggestion;
    return h('div', { class: 'page narrow' },
      h('section', { class: 'hero' },
        h('h1', null, 'ようこそ、練習銀行アカデミーへ'),
        h('p', { class: 'lead' }, '架空の銀行アプリ「練習銀行」を育てながら、AIを前提にした開発（仕様 → AI実装 → 検証 → 運用）を、基礎を失わずに一歩ずつ練習します。')),
      h('section', { class: 'card' },
        h('h2', null, 'このアプリの約束'),
        h('ul', { class: 'promises' }, promises.map(([t, d]) => h('li', null, h('strong', null, t), h('span', null, d))))),
      h('section', { class: 'card' },
        h('h2', null, 'あなたのことを少し教えてください'),
        h('p', { class: 'muted' }, '5問だけの自己評価です。答えは開始する単元の提案にだけ使います。'),
        h('label', { class: 'field' }, h('span', null, '表示名（任意）'),
          h('input', { id: 'ob-name', type: 'text', maxlength: '20', placeholder: '例: 新人A', value: obDraft.name, oninput: (e) => { obDraft.name = e.target.value; } })),
        survey,
        h('button', { id: 'ob-suggest', class: 'btn primary', onclick: () => {
          obDraft.suggestion = R.suggestStart(obDraft.answers);
          render();
          $('ob-result').scrollIntoView({ block: 'center' });
        } }, '開始レベルを提案してもらう')),
      sug && h('section', { class: 'card highlight', id: 'ob-result', tabindex: '-1' },
        h('h2', null, 'おすすめ: ' + C.LEVELS[sug.level - 1].name + ' から'),
        h('ul', null, sug.reasons.map((x) => h('li', null, x))),
        h('p', null, '最初の単元: ', h('strong', null, sug.unitId + '「' + R.unitById(sug.unitId).title + '」')),
        h('p', { class: 'muted' }, 'あくまで提案です。スキルマップから、どの単元でも始められます。'),
        h('div', { class: 'row' },
          h('button', { id: 'ob-start', class: 'btn primary', onclick: () => finishOnboarding(sug, '#/unit/' + sug.unitId) }, 'この単元から始める'),
          h('button', { id: 'ob-home', class: 'btn', onclick: () => finishOnboarding(sug, '#/home') }, 'ホームを見る'))));
  }
  function finishOnboarding(sug, next) {
    update((s) => {
      s.user = { id: uid('learner'), name: obDraft.name.trim() || '学習者', role: 'learner', startLevel: sug.level, survey: { ...obDraft.answers }, createdAt: now() };
    });
    go(next);
  }

  // ---------------------------------------------------------------- 共通: リポジトリ・単元
  function ensureRepo() {
    if (!state.repo) update((s) => { s.repo = G.initRepo(C.REPO_TEMPLATE, now()); });
    return state.repo;
  }
  function enrollmentOf(unitId) {
    return state.enrollments[unitId];
  }
  function ensureEnrollment(unitId) {
    if (!state.enrollments[unitId]) {
      // FR-040: 学習者が単元を始めたとき、練習銀行のリポジトリが無ければ作る
      ensureRepo();
      update((s) => { s.enrollments[unitId] = S.newEnrollment(unitId, now()); });
    }
    return state.enrollments[unitId];
  }
  const stepIndex = (id) => C.STEPS.findIndex((s) => s.id === id);
  function aiModeOf(enr, step) {
    const st = C.STEPS[stepIndex(step)];
    return st && st.ai === 'on' && enr.gate.passed ? 'on' : 'off';
  }
  function statusBadge(unitId) {
    const e = enrollmentOf(unitId);
    if (!e) return h('span', { class: 'badge' }, '未着手');
    if (e.status === 'done') return h('span', { class: 'badge done' }, '修了');
    return h('span', { class: 'badge doing' }, '学習中（' + C.STEPS[stepIndex(e.step)].name + '）');
  }
  function mainTree() {
    return state.repo ? G.tipTree(state.repo, G.MAIN) : C.REPO_TEMPLATE;
  }

  // ---------------------------------------------------------------- S-02 ホーム
  function viewHome() {
    const next = R.nextUnit(state);
    const enr = next && enrollmentOf(next.id);
    const lastJournal = state.journal[state.journal.length - 1];
    const doneCount = Object.values(state.enrollments).filter((e) => e.status === 'done').length;
    return h('div', { class: 'page' },
      h('h1', { class: 'greet' }, 'こんにちは、' + state.user.name + 'さん'),
      h('div', { class: 'home-grid' },
        h('section', { class: 'card next-unit' },
          h('p', { class: 'eyebrow' }, '次にやる1単元'),
          next ? [
            h('h2', null, next.id + '「' + next.title + '」'),
            h('p', { class: 'muted' }, areaName(next.area) + ' ／ ' + C.LEVELS[next.level - 1].name + ' ／ 目安 ' + next.estMinutes + '分'),
            h('ul', { class: 'goals' }, next.goals.map((g) => h('li', null, g))),
            h('button', { id: 'home-start', class: 'btn primary big', onclick: () => go('#/unit/' + next.id) }, enr ? '続きから（' + C.STEPS[stepIndex(enr.step)].name + '）' : '始める'),
          ] : h('p', null, 'MVPの単元をすべて修了しました。おつかれさまでした！ L3 以降は第2段階で追加予定です。')),
        h('section', { class: 'card' },
          h('p', { class: 'eyebrow' }, 'スキルマップ上の現在位置'),
          miniMap(next),
          h('p', { class: 'muted small' }, '修了 ' + doneCount + ' / ' + C.UNITS.length + ' 単元 ・ ', h('a', { href: '#/map' }, 'スキルマップを見る'))),
        h('section', { class: 'card' },
          h('p', { class: 'eyebrow' }, '前回の振り返り'),
          lastJournal ? [h('p', { class: 'muted small' }, fmtTime(lastJournal.time) + ' ・ ' + lastJournal.unitId), h('blockquote', null, lastJournal.text || '（本文なし）')] : h('p', { class: 'muted' }, 'まだありません。単元の最後に、計測結果を見ながら書きます。')),
        bankPreview()));
  }
  function areaName(id) {
    return id + '. ' + C.AREAS.find((a) => a.id === id).name;
  }
  function miniMap(current) {
    const table = h('table', { class: 'minimap', 'aria-label': 'スキルマップの縮小図。現在位置を強調しています' },
      h('thead', null, h('tr', null, h('th', null, ''), C.LEVELS.map((l) => h('th', { scope: 'col' }, 'L' + l.id)))),
      h('tbody', null, C.AREAS.map((a) => h('tr', null,
        h('th', { scope: 'row', title: a.name }, a.id),
        C.LEVELS.map((l) => {
          const units = C.UNITS.filter((u) => u.area === a.id && u.level === l.id);
          const done = units.filter((u) => (enrollmentOf(u.id) || {}).status === 'done').length;
          const here = current && current.area === a.id && current.level === l.id;
          const cls = 'cell' + (units.length ? ' has' : '') + (units.length && done === units.length ? ' full' : done ? ' part' : '') + (here ? ' here' : '');
          return h('td', { class: cls, title: a.name + ' L' + l.id + (units.length ? '（' + done + '/' + units.length + '）' : ''), 'aria-label': a.name + ' L' + l.id + (here ? ' 現在位置' : '') + (units.length ? ' 修了' + done + '/' + units.length : ' 単元なし') }, here ? '●' : '');
        })))));
    return table;
  }

  // 一貫プロジェクト「練習銀行」が育つ様子。main にマージされたコードを実際に動かして見せる
  function bankPreview() {
    const tree = mainTree();
    const sources = Object.keys(tree).filter((p) => p.startsWith('src/')).sort().map((p) => tree[p]);
    const items = C.UNITS.flatMap((u) => u.demos.map((d) => ({ u, d, live: !!tree[u.aiTask.file] })));
    const liveCount = C.UNITS.filter((u) => tree[u.aiTask.file]).length;
    const levelDone = (lv) => C.UNITS.filter((u) => u.level === lv).every((u) => tree[u.aiTask.file]);
    const stage = levelDone(1) && levelDone(2) ? '振り込める銀行（L2 完成）' : levelDone(1) ? '照会できる銀行（L1 完成）' : liveCount ? '育ち始めた銀行' : 'まだ看板だけの銀行';
    const list = h('ul', { class: 'bank-features' });
    items.forEach((it, k) => { it.key = String(k); });
    for (const it of items) {
      list.append(h('li', { class: it.live ? 'live' : 'locked', 'data-unit': it.u.id, 'data-key': it.key },
        h('span', { class: 'feat' }, it.live ? '✓ ' + it.d.label : '🔒 ' + it.d.label),
        h('span', { class: 'val' }, it.live ? '…' : it.u.id + ' の実践でマージすると動きます')));
    }
    const live = items.filter((it) => it.live);
    if (live.length) {
      runner.runInSandbox({ kind: 'evals', sources, evals: live.map((it) => it.d.expr) }).then((out) => {
        live.forEach((it, i) => {
          const li = list.querySelector('li[data-key="' + it.key + '"] .val');
          if (!li) return;
          const o = out[i] || {};
          li.textContent = o.error ? '動きません: ' + o.error : o.value;
          li.classList.toggle('err', !!o.error);
        });
      });
    }
    return h('section', { class: 'card bank', id: 'bank-preview', 'aria-live': 'polite' },
      h('div', { class: 'bank-head' }, h('span', { 'aria-hidden': 'true' }, '🏦'), h('div', null, h('strong', null, '練習銀行'), h('span', { class: 'muted small' }, ' — ' + stage))),
      h('p', { class: 'muted small' }, 'あなたのリポジトリの main にマージされたコードを、その場で動かしています（' + liveCount + ' / ' + C.UNITS.length + ' 機能）。'),
      list);
  }

  // ---------------------------------------------------------------- S-03 スキルマップ
  function viewMap() {
    const grid = h('table', { class: 'skillmap' },
      h('caption', null, '11領域 × 4レベルの到達目標と単元'),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, '領域'), C.LEVELS.map((l) => h('th', { scope: 'col' }, l.name, h('br'), h('small', null, l.span))))),
      h('tbody', null, C.AREAS.map((a) => h('tr', null,
        h('th', { scope: 'row' }, a.id + '. ' + a.name),
        C.LEVELS.map((l) => {
          const units = C.UNITS.filter((u) => u.area === a.id && u.level === l.id);
          return h('td', null, h('p', { class: 'goal' }, a.goals[l.id - 1]),
            units.map((u) => h('a', { class: 'unit-chip ' + ((enrollmentOf(u.id) || {}).status || 'none'), href: '#/unit/' + u.id }, u.id + ' ' + u.title)),
            !units.length && l.id >= 3 ? h('p', { class: 'muted tiny' }, '第' + (l.id - 1) + '段階で追加予定') : null);
        })))));
    const lists = [1, 2].map((lv) => h('section', { class: 'card' },
      h('h2', null, C.LEVELS[lv - 1].name, h('small', { class: 'muted' }, ' — ' + C.LEVELS[lv - 1].done)),
      h('ol', { class: 'unit-list' }, C.UNITS.filter((u) => u.level === lv).map((u) => {
        const missing = R.missingPrereqs(u, state.enrollments);
        return h('li', null,
          h('div', { class: 'unit-row' },
            h('div', null,
              h('strong', null, u.id + '「' + u.title + '」'), ' ', statusBadge(u.id),
              h('p', { class: 'muted small' }, areaName(u.area) + ' ／ 目安 ' + u.estMinutes + '分' + (u.prereq.length ? ' ／ 前提: ' + u.prereq.join(', ') : '')),
              missing.length ? h('p', { class: 'warn small' }, 'おすすめしない: 前提の ' + missing.join(', ') + ' が未修了です（それでも始められます）') : null),
            h('button', { class: 'btn' + (missing.length ? '' : ' primary'), onclick: () => go('#/unit/' + u.id), 'aria-label': u.id + ' を' + (enrollmentOf(u.id) ? '開く' : '始める') }, enrollmentOf(u.id) ? '開く' : '始める')));
      }))));
    const stages = h('section', { class: 'card' }, h('h2', null, '一貫プロジェクト「練習銀行」の成長段階'),
      h('table', { class: 'plain' }, h('thead', null, h('tr', null, h('th', null, 'レベル'), h('th', null, '機能'), h('th', null, '主に鍛える領域'))),
        h('tbody', null, C.BANK_STAGES.map((b) => h('tr', null, h('td', null, 'L' + b.level), h('td', null, b.features), h('td', null, b.areas))))));
    return h('div', { class: 'page' }, h('h1', null, 'スキルマップ'), h('div', { class: 'scroll-x' }, grid), lists, stages);
  }

  // ---------------------------------------------------------------- S-04 単元ワークスペース
  function viewUnit(unitId, stepArg) {
    const unit = R.unitById(unitId);
    if (!unit) return h('div', { class: 'page' }, h('p', null, '単元が見つかりません。'), h('a', { href: '#/map' }, 'スキルマップへ'));
    const enr = ensureEnrollment(unitId);
    const reachable = (id) => {
      const i = stepIndex(id);
      if (i <= stepIndex(enr.step)) return true;
      return C.STEPS.slice(0, i).every((s) => enr.done[s.id]);
    };
    let step = stepArg && stepIndex(stepArg) >= 0 && reachable(stepArg) ? stepArg : enr.step;
    if (step !== enr.step && stepIndex(step) > stepIndex(enr.step)) update(() => { enr.step = step; });
    currentWork = { unitId, step };
    const ai = aiModeOf(enr, step);
    const missing = R.missingPrereqs(unit, state.enrollments);
    const stepper = h('ol', { class: 'stepper', 'aria-label': '単元の5ステップ' }, C.STEPS.map((s, i) => {
      const ok = reachable(s.id);
      return h('li', { class: (enr.done[s.id] ? 'done ' : '') + (s.id === step ? 'current' : '') },
        h('button', { id: 'step-' + s.id, disabled: !ok, 'aria-current': s.id === step ? 'step' : null, onclick: () => go('#/unit/' + unitId + '/' + s.id) },
          h('span', { class: 'num' }, enr.done[s.id] ? '✓' : String(i + 1)), s.name, h('small', null, s.ai === 'off' ? 'AIオフ' : 'AIオン')));
    }));
    const body = {
      understand: () => stepUnderstand(unit, enr),
      practice: () => stepPractice(unit, enr),
      gate: () => stepGate(unit, enr),
      aion: () => stepAiOn(unit, enr),
      reflect: () => stepReflect(unit, enr),
    }[step]();
    return h('div', { class: 'page wide' },
      h('div', { class: 'unit-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, unit.id + ' ／ ' + areaName(unit.area) + ' ／ ' + C.LEVELS[unit.level - 1].name),
          h('h1', null, unit.title)),
        h('div', { id: 'ai-badge', class: 'ai-badge ' + ai, 'data-ai': ai, role: 'status' },
          ai === 'on' ? '✨ AIオン' : '🔒 AIオフ',
          h('small', null, ai === 'on' ? 'AIの実装・チューターが使えます' : 'コード生成・補完は使えません'))),
      missing.length && enr.status !== 'done' ? h('p', { class: 'warn small' }, '前提の ' + missing.join(', ') + ' が未修了です。分からないところがあれば、先にそちらをやってもかまいません。') : null,
      stepper,
      h('div', { class: 'workspace' },
        h('div', { class: 'work-main' }, body),
        tutorPanel(unit, enr, step, ai)));
  }
  let currentWork = null;

  function completeStep(enr, stepId) {
    update(() => {
      enr.done[stepId] = true;
      const next = C.STEPS[stepIndex(stepId) + 1];
      if (next && stepIndex(enr.step) <= stepIndex(stepId)) enr.step = next.id;
    });
  }

  // ---- ステップ1: 理解（AIオフ） ----
  function stepUnderstand(unit, enr) {
    const wrap = h('div', { class: 'stack' });
    if (!enr.estimate) {
      const est = { off: '', on: '' };
      wrap.append(h('section', { class: 'card highlight', id: 'estimate' },
        h('h2', null, '始める前に: かかりそうな時間は？'),
        h('p', { class: 'muted' }, '体感で入力してください。単元の最後に、自動で計測した時間と並べて見せます（体感と実測はずれやすいものです）。'),
        h('div', { class: 'row wrap' },
          h('label', { class: 'field inline' }, h('span', null, 'AIオフ（理解〜説明ゲート）'), h('input', { id: 'est-off', type: 'number', min: '1', max: '600', inputmode: 'numeric', oninput: (e) => { est.off = e.target.value; } }), h('span', null, '分')),
          h('label', { class: 'field inline' }, h('span', null, 'AIオン（実践）'), h('input', { id: 'est-on', type: 'number', min: '1', max: '600', inputmode: 'numeric', oninput: (e) => { est.on = e.target.value; } }), h('span', null, '分'))),
        h('div', { class: 'row' },
          h('button', { id: 'est-save', class: 'btn primary', onclick: () => { update(() => { enr.estimate = { off: Number(est.off) || null, on: Number(est.on) || null, at: now() }; }); render(); } }, '記録して始める'),
          h('button', { id: 'est-skip', class: 'btn ghost', onclick: () => { update(() => { enr.estimate = { off: null, on: null, at: now() }; }); render(); } }, 'あとで'))));
    }
    wrap.append(
      h('section', { class: 'card ticket' }, h('p', { class: 'eyebrow' }, 'チケット'), h('p', null, unit.story)),
      h('section', { class: 'card' }, h('h2', null, 'この単元の学習目標'), h('ul', { class: 'goals' }, unit.goals.map((g) => h('li', null, g)))),
      h('section', { class: 'card concept' }, h('h2', null, '概念'), unit.concept.map((c) => (typeof c === 'string' ? h('p', null, c) : codeBlock(c.code)))));
    const quiz = h('section', { class: 'card' }, h('h2', null, '予測問題'), h('p', { class: 'muted' }, '実行する前に、結果を予測してみましょう。間違えても何度でも選び直せます。'));
    unit.predict.forEach((q, i) => {
      const chosen = enr.predicted[i];
      const checked = enr.predicted['c' + i];
      const correct = checked && chosen === q.answer;
      const order = core.seededShuffle(q.choices.map((_, k) => k), unit.id + 'q' + i);
      quiz.append(h('fieldset', { class: 'quiz' + (checked ? (correct ? ' ok' : ' ng') : '') },
        h('legend', null, '問' + (i + 1) + '. ' + q.q),
        q.code ? codeBlock(q.code) : null,
        h('div', { class: 'choices' }, order.map((k) => h('label', { class: 'choice' },
          h('input', { type: 'radio', name: 'pq-' + i, value: String(k), checked: chosen === k, onchange: () => { update(() => { enr.predicted[i] = k; enr.predicted['c' + i] = false; }); } }),
          h('span', null, q.choices[k])))),
        h('button', { class: 'btn pq-check', 'data-q': String(i), onclick: () => {
          if (enr.predicted[i] === undefined) { toast('選択肢を1つ選んでください'); return; }
          update(() => { enr.predicted['c' + i] = true; });
          render();
        } }, '答え合わせ'),
        checked ? h('p', { class: 'feedback', role: 'status' }, correct ? '正解！ ' + q.why : 'おしい。もう一度考えてみましょう。ヒント: ' + q.why.split('。')[0] + '。') : null));
    });
    const allOk = unit.predict.every((q, i) => enr.predicted['c' + i] && enr.predicted[i] === q.answer);
    quiz.append(h('div', { class: 'row end' }, h('button', { id: 'to-practice', class: 'btn primary', disabled: !allOk, onclick: () => { completeStep(enr, 'understand'); go('#/unit/' + unit.id + '/practice'); } }, allOk ? '練習へ進む' : '全問正解すると練習へ進めます')));
    wrap.append(quiz);
    return wrap;
  }

  // ---- ステップ2: 練習（AIオフ・足場つき） ----
  function currentExercise(unit, enr) {
    const stage = enr.practice.stage || 'parsons';
    const list = R.exercisesOf(unit, stage);
    let ex = list.find((e) => e.id === enr.currentEx);
    if (!ex) ex = list.find((e) => !enr.practice.passed[e.id]) || list[0];
    return ex;
  }
  function exState(enr, ex) {
    if (!enr.exercise[ex.id]) {
      enr.exercise[ex.id] = { order: [], blanks: [], code: ex.code || '', hintLevel: 0, rows: null, error: null, pass: false };
    }
    return enr.exercise[ex.id];
  }
  function stepPractice(unit, enr) {
    const ex = currentExercise(unit, enr);
    const st = exState(enr, ex);
    const tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': '足場の段階' }, C.STAGES.map((s, i) => {
      const list = R.exercisesOf(unit, s.id);
      const passed = list.filter((e) => enr.practice.passed[e.id]).length;
      const sel = s.id === ex.stage;
      return h('button', { role: 'tab', id: 'stage-' + s.id, 'aria-selected': sel ? 'true' : 'false', class: sel ? 'sel' : '', onclick: () => { update(() => { enr.practice.stage = s.id; enr.currentEx = null; }); render(); } },
        (i + 1) + '. ' + s.name, h('small', null, s.desc + '（' + passed + '/' + list.length + '）'));
    }));
    const items = R.exercisesOf(unit, ex.stage);
    const itemNav = items.length > 1 ? h('div', { class: 'row small' }, items.map((e, i) => h('button', { class: 'btn tiny' + (e.id === ex.id ? ' primary' : ''), onclick: () => { update(() => { enr.currentEx = e.id; }); render(); } }, '問' + (i + 1) + (enr.practice.passed[e.id] ? ' ✓' : '')))) : null;

    const work = h('section', { class: 'card exercise' },
      h('div', { class: 'row between' }, h('h2', null, C.STAGES.find((s) => s.id === ex.stage).name + ' ／ ' + ex.id), itemNav),
      h('p', { class: 'prompt' }, ex.prompt),
      ex.mode === 'tests' ? h('p', { class: 'note small' }, 'テストを書く課題です。テスト対象: latest(txs, n) — 日付の新しい順に n 件返す（元の配列は変えない）。正しい実装と、わざと壊した実装（変異体）の両方で実行します。') : null,
      exerciseWidget(ex, st),
      h('div', { class: 'row' },
        h('button', { id: 'ex-submit', class: 'btn primary', onclick: () => submitExercise(unit, enr, ex) }, 'テストを実行'),
        h('button', { id: 'ex-hint', class: 'btn', disabled: st.hintLevel >= 3, onclick: () => {
          update(() => { st.hintLevel += 1; enr.metrics = S.addMetric(enr, 'off', 'hints', 1).metrics; });
          render();
        } }, st.hintLevel >= 3 ? 'ヒントはここまで' : 'ヒント（' + ['方向性', '着目箇所', '部分コード'][st.hintLevel] + '）'),
        h('button', { id: 'ex-reset', class: 'btn ghost', onclick: () => { update(() => { st.order = []; st.blanks = []; st.code = ex.code || ''; st.rows = null; st.error = null; }); render(); } }, '最初に戻す')),
      st.hintLevel ? h('ol', { class: 'hints', 'aria-label': 'ヒント' }, ex.hints.slice(0, st.hintLevel).map((t, i) => h('li', null, h('strong', null, ['方向性', '着目箇所', '部分コード'][i] + ': '), i === 2 ? h('code', null, t) : t))) : null,
      resultsBox('ex-results', st));
    const after = h('div', { class: 'stack' });
    if (st.pass) {
      const p = enr.practice;
      if (ex.stage === 'scratch' || p.complete) {
        after.append(h('div', { class: 'banner ok' }, h('p', null, '練習の最後の段階まで解けました。次は、自分のコードを言葉で説明する「説明ゲート」です。'),
          h('button', { id: 'to-gate', class: 'btn primary', onclick: () => { completeStep(enr, 'practice'); go('#/unit/' + unit.id + '/gate'); } }, '説明ゲートへ')));
      } else if (p.suggestNext && p.stage === ex.stage) {
        const ns = R.nextStage(ex.stage);
        after.append(h('div', { class: 'banner ok' }, h('p', null, 'この段階を2問続けて解けました。足場を1つ外して、次の段階「' + C.STAGES.find((s) => s.id === ns).name + '」に進みませんか？'),
          h('button', { id: 'next-stage', class: 'btn primary', onclick: () => { update(() => { enr.practice.stage = ns; enr.currentEx = null; }); render(); } }, '次の段階へ')));
      } else {
        const nextEx = items.find((e) => !enr.practice.passed[e.id]);
        if (nextEx) after.append(h('div', { class: 'banner ok' }, h('p', null, '合格です。'), h('button', { id: 'next-ex', class: 'btn primary', onclick: () => { update(() => { enr.currentEx = nextEx.id; }); render(); } }, '次の問題へ')));
      }
    }
    return h('div', { class: 'stack' }, tabs, work, after);
  }

  function exerciseWidget(ex, st) {
    if (ex.stage === 'parsons') {
      const all = core.seededShuffle([...ex.lines, ...ex.distractors], ex.id);
      const used = [...st.order];
      const pool = all.filter((line) => { const k = used.indexOf(line); if (k >= 0) { used.splice(k, 1); return false; } return true; });
      const move = (from, to) => { update(() => { const o = st.order; [o[from], o[to]] = [o[to], o[from]]; }); render(); };
      return h('div', { class: 'parsons' },
        h('div', null, h('h3', null, '使える行'), h('ul', { class: 'pool', 'aria-label': '使える行（押すと答えに追加）' }, pool.map((line, i) => h('li', null,
          h('button', { class: 'pool-line', id: 'pool-' + i, onclick: () => { update(() => { st.order.push(line); }); render(); } }, h('code', null, line || ' ')))),
          !pool.length ? h('li', { class: 'muted small' }, '（全部使いました）') : null)),
        h('div', null, h('h3', null, 'あなたの答え'), h('ol', { class: 'answer', 'aria-label': 'あなたの答え（上から順）' }, st.order.map((line, i) => h('li', null,
          h('code', { class: 'ans-line' }, line || ' '),
          h('span', { class: 'ops' },
            h('button', { class: 'icon', 'aria-label': (i + 1) + '行目を上へ', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
            h('button', { class: 'icon', 'aria-label': (i + 1) + '行目を下へ', disabled: i === st.order.length - 1, onclick: () => move(i, i + 1) }, '↓'),
            h('button', { class: 'icon', 'aria-label': (i + 1) + '行目を外す', onclick: () => { update(() => { st.order.splice(i, 1); }); render(); } }, '✕')))),
          !st.order.length ? h('li', { class: 'muted small' }, '左の行を押して、上から順に並べます') : null)));
    }
    if (ex.stage === 'blank') {
      const parts = ex.template.split(/\[\[(\d+)\]\]/);
      const pre = h('pre', { class: 'code blanks' });
      const code = h('code');
      pre.append(code);
      parts.forEach((part, i) => {
        if (i % 2 === 0) code.append(part);
        else {
          const k = Number(part) - 1;
          code.append(h('input', { class: 'blank-input', id: 'blank-' + k, 'aria-label': '空欄' + (k + 1), size: '10', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', value: st.blanks[k] || '', oninput: (e) => { st.blanks[k] = e.target.value; persist(); } }));
        }
      });
      return pre;
    }
    return codeEditor({ id: 'ex-editor', rows: String(Math.max(8, (st.code || '').split('\n').length + 2)), 'aria-label': ex.mode === 'tests' ? 'テストのコード' : 'あなたのコード', value: st.code, oninput: (e) => { st.code = e.target.value; persist(); } });
  }

  function resultsBox(id, st) {
    const box = h('div', { id, class: 'results', 'aria-live': 'polite' });
    if (st.running) { box.append(h('p', { class: 'muted' }, '実行中…')); return box; }
    if (!st.rows && !st.error) return box;
    if (st.error) box.append(h('p', { class: 'err' }, st.error));
    if (st.rows) {
      const passCount = st.rows.filter((r) => r.pass).length;
      box.append(h('p', { class: st.pass ? 'ok' : 'warn' }, st.pass ? '合格！ ' : 'テストが ' + (st.rows.length - passCount) + ' 本、直す場所を教えてくれています。', h('span', { class: 'muted small' }, '（' + passCount + '/' + st.rows.length + ' 通過' + (st.ms !== undefined ? '・' + (st.ms / 1000).toFixed(2) + '秒' : '') + '）')));
      box.append(h('ul', { class: 'test-rows' }, st.rows.map((r) => h('li', { class: r.pass ? 'pass' : 'fail' },
        h('span', { class: 'mark', 'aria-label': r.pass ? '通過' : '失敗' }, r.pass ? '✓' : '✗'),
        h('span', null, r.name),
        !r.pass && r.expected !== undefined ? h('span', { class: 'exp' }, '期待: ', h('code', null, r.expected), ' ／ 実際: ', h('code', null, r.actual)) : null,
        !r.pass && r.error ? h('span', { class: 'exp' }, h('code', null, r.error)) : null,
        r.detail ? h('span', { class: 'exp muted' }, r.detail) : null))));
    }
    return box;
  }

  async function submitExercise(unit, enr, ex) {
    const st = exState(enr, ex);
    const answer = R.assembleAnswer(ex, st);
    st.running = true;
    render();
    const t0 = performance.now();
    const result = await runner.runInSandbox(R.exerciseJob(unit, ex, answer));
    const ms = performance.now() - t0;
    const grade = R.gradeExercise(unit, ex, result, answer);
    update((s) => {
      enr.currentEx = ex.id; // 合格しても、結果を見せるためにこの問題に留まる（次の問題へはボタンで進む）
      st.running = false;
      st.rows = grade.rows;
      st.error = grade.error;
      st.pass = grade.pass;
      st.ms = ms;
      enr.metrics = S.addMetric(enr, 'off', 'submissions', 1).metrics;
      if (!grade.pass) enr.metrics = S.addMetric(enr, 'off', 'failures', 1).metrics;
      enr.practice = R.applyPracticeResult(enr.practice, unit, ex, grade.pass);
      s.submissions = S.pushCapped(s.submissions, { id: uid('sub'), unitId: unit.id, step: 'practice', exId: ex.id, code: answer.slice(0, 4000), pass: grade.pass, failed: grade.rows.filter((r) => !r.pass).map((r) => r.name), time: now() }, S.MAX_SUBMISSIONS);
    });
    render();
    if (grade.pass) toast('合格です！', 'ok');
  }

  // ---- ステップ3: 説明ゲート（S-05） ----
  function scratchCode(unit, enr) {
    const ex = R.exercisesOf(unit, 'scratch')[0];
    const st = enr.exercise[ex.id];
    return { ex, own: st && st.pass ? st.code : '', sample: ex.solution };
  }
  function stepGate(unit, enr) {
    const { own, sample } = scratchCode(unit, enr);
    const g = enr.gate;
    if (!g.draft) g.draft = { what: '', risk: '', view: own ? 'own' : 'sample' };
    const view = g.draft.view === 'own' && own ? 'own' : 'sample';
    const res = g.last;
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h2', null, '説明ゲート'),
        h('p', null, 'このコードについて「何をするか」と「どこが危ないか」を、自分の言葉で書いてください。合格すると、この単元の実践ステップで AI が使えるようになります。'),
        h('div', { class: 'row small' },
          h('button', { class: 'btn tiny' + (view === 'own' ? ' primary' : ''), disabled: !own, onclick: () => { update(() => { g.draft.view = 'own'; }); render(); } }, '自分の解答'),
          h('button', { class: 'btn tiny' + (view === 'sample' ? ' primary' : ''), onclick: () => { update(() => { g.draft.view = 'sample'; }); render(); } }, 'お手本コード')),
        codeBlock(view === 'own' ? own : sample),
        h('label', { class: 'field' }, h('span', null, 'このコードは何をするか'),
          h('textarea', { id: 'gate-what', rows: '3', value: g.draft.what, oninput: (e) => { g.draft.what = e.target.value; persist(); } })),
        h('label', { class: 'field' }, h('span', null, 'どこが危ないか（壊れやすい入力・想定していない使われ方など）'),
          h('textarea', { id: 'gate-risk', rows: '3', value: g.draft.risk, oninput: (e) => { g.draft.risk = e.target.value; persist(); } })),
        h('div', { class: 'row' }, h('button', { id: 'gate-submit', class: 'btn primary', disabled: !!g.scoring, onclick: () => submitGate(unit, enr, view === 'own' ? own : sample) }, g.scoring ? '採点中…' : '説明を提出する'))),
      res ? h('section', { class: 'card ' + (res.pass ? 'highlight' : ''), id: 'gate-result', 'aria-live': 'polite' },
        h('h2', null, res.pass ? '合格！ AIが解禁されました' : 'もう少しです'),
        res.pass ? h('p', null, 'この単元の「実践」ステップで、AIに実装させてレビューする練習ができます。') : h('p', null, '次の観点が足りていません。練習に戻ってコードを見直してもかまいません。何度でも出し直せます。'),
        res.missing.length ? h('ul', { class: 'missing' }, res.missing.map((m) => h('li', null, m))) : null,
        res.llm ? h('p', { class: 'note small' }, 'AIの観点採点: ' + res.llm.feedback) : null,
        res.pass ? h('button', { id: 'to-aion', class: 'btn primary', onclick: () => { go('#/unit/' + unit.id + '/aion'); } }, '実践へ（AIオン）') : h('button', { class: 'btn', onclick: () => go('#/unit/' + unit.id + '/practice') }, '練習に戻る')) : null);
  }

  async function submitGate(unit, enr, code) {
    const g = enr.gate;
    const answer = { what: g.draft.what, risk: g.draft.risk };
    const rule = R.scoreExplanation(unit.gate, answer);
    let llm = null;
    // Q-06: ルール採点に LLM の観点採点を上乗せ（API キーがあり、送信前の検査を通ったときだけ）
    const mask = R.detectSensitive(answer.what + '\n' + answer.risk);
    if (state.settings.apiKey && !state.settings.tutorStopped) {
      if (mask.blocked) {
        logAi({ unitId: unit.id, kind: 'gate-score', input: R.redact(answer.what + '\n' + answer.risk), output: '（送信を止めました）', masking: { blocked: true, labels: mask.labels }, source: 'blocked' });
        toast('説明に ' + mask.labels.join('・') + ' らしき内容があるので、AIへの送信を止めました（ルール採点だけで判定します）', 'warn');
      } else if (rule.pass) {
        update(() => { g.scoring = true; });
        render();
        llm = await T.llmScoreExplanation(unit, code, answer, aiEnv());
        update((s) => {
          g.scoring = false;
          if (llm) {
            Object.assign(s, S.addSpend(s, llm.costUsd, now()));
            logAi({ unitId: unit.id, kind: 'gate-score', input: R.redact(llm.input), output: R.redact(llm.output), masking: { blocked: false, labels: [] }, source: 'llm', model: llm.model });
          }
        });
      }
    }
    const pass = rule.pass && (!llm || (llm.whatOk && llm.riskOk));
    const missing = [...rule.missing];
    if (rule.pass && llm && !pass) missing.push('AIの観点採点で、説明が足りないと判定されました（下の助言を参考に）');
    update((s) => {
      g.attempts += 1;
      g.last = { pass, missing, llm: llm ? { feedback: llm.feedback } : null };
      if (pass && !g.passed) { g.passed = true; g.firstTry = g.attempts === 1; g.passedAt = now(); }
      s.explanations.push({ id: uid('exp'), unitId: unit.id, kind: 'gate', what: answer.what, risk: answer.risk, pass, missing, shared: false, time: now() });
    });
    if (pass) completeStep(enr, 'gate');
    render();
    if (pass) toast('説明ゲートに合格。この単元でAIが解禁されました ✨', 'ok');
  }

  // ---- ステップ4: 実践（AIオン） ----
  function aiEnv() {
    return { settings: state.settings, spentUsd: S.spentThisMonth(state, now()), fetchImpl: window.fetch.bind(window), agentsMd: mainTree()['AGENTS.md'] };
  }
  function prForBranch(branch) {
    if (!state.repo || !branch) return null;
    const list = state.repo.prs.filter((p) => p.head === branch);
    return list.find((p) => p.status === 'merged') || list.find((p) => p.status === 'open') || list[list.length - 1] || null;
  }
  function stepAiOn(unit, enr) {
    const t = unit.aiTask;
    const a = enr.aion;
    const repo = ensureRepo();
    const curFile = G.headTree(repo)[t.file] ?? mainTree()[t.file];
    const pr = prForBranch(a.branch);
    const merged = pr && pr.status === 'merged';
    if (merged && !enr.done.aion) completeStep(enr, 'aion');
    return h('div', { class: 'stack' },
      h('section', { class: 'card ticket' }, h('p', { class: 'eyebrow' }, 'チケット（実践）'), h('p', null, t.ticket),
        h('p', { class: 'muted small' }, 'ファイル: ', h('code', null, t.file), ' ／ 受け入れテスト: ', h('code', null, t.testFile)),
        h('details', null, h('summary', null, '受け入れテストを見る'), codeBlock(t.tests))),
      h('section', { class: 'card' },
        h('h2', null, '1. 仕様を書く'),
        h('p', { class: 'muted small' }, 'ユーザーストーリーと受け入れ基準を書きましょう。AI は仕様に書かれていないことを「いちばん単純な形」で埋めます。境界や例外まで書けているかが、AI の実装の質を決めます。'),
        h('textarea', { id: 'ai-spec', rows: '6', value: a.spec, placeholder: 'ストーリー: 〈誰〉として、〈何〉をしたい。なぜなら〈理由〉。\n受け入れ基準:\n- 〜のとき、〜になる\n- 〜のとき、〜になる', oninput: (e) => { a.spec = e.target.value; persist(); } }),
        h('div', { class: 'row' }, h('button', { id: 'ai-generate', class: 'btn primary', disabled: !!a.generating, onclick: () => generate(unit, enr) }, a.generating ? 'AIが実装中…' : (a.code ? 'もう一度AIに実装させる' : 'AIに実装させる')))),
      a.code ? h('section', { class: 'card' },
        h('h2', null, '2. 差分をレビューして、テストで検証する'),
        a.note ? h('p', { class: 'note' }, h('strong', null, 'AIのメモ: '), a.note) : null,
        h('details', { open: true }, h('summary', null, '差分（いまのブランチの ' + t.file + ' との比較）'), diffView(G.lineDiff(curFile, a.code))),
        h('label', { class: 'field' }, h('span', null, 'AIのコード（直してもかまいません）'),
          codeEditor({ id: 'ai-code', rows: String(Math.min(30, a.code.split('\n').length + 2)), value: a.code, oninput: (e) => { a.code = e.target.value; persist(); } })),
        h('div', { class: 'row' }, h('button', { id: 'ai-run', class: 'btn', disabled: !!a.generating, onclick: () => runAiTests(unit, enr) }, 'テストで検証')),
        resultsBox('ai-results', { rows: a.rows && a.rows.length ? a.rows : null, error: a.error, pass: a.pass, ms: a.ms, running: a.running })) : null,
      a.code ? h('section', { class: 'card' },
        h('h2', null, '3. 説明してから取り込む'),
        h('p', { class: 'muted small' }, 'AIのコードは、何をするか・どこが危ないかを説明できるまで、あなたの成果物（リポジトリ）に取り込めません。'),
        h('label', { class: 'field' }, h('span', null, 'このコードは何をするか'), h('textarea', { id: 'adopt-what', rows: '2', value: a.review.what, oninput: (e) => { a.review.what = e.target.value; persist(); } })),
        h('label', { class: 'field' }, h('span', null, 'どこが危ないか'), h('textarea', { id: 'adopt-risk', rows: '2', value: a.review.risk, oninput: (e) => { a.review.risk = e.target.value; persist(); } })),
        h('div', { class: 'row' }, h('button', { id: 'adopt-submit', class: 'btn primary', onclick: () => adopt(unit, enr) }, a.adopted ? '取り込み直す' : 'リポジトリに取り込む')),
        a.adoptMsg ? h('div', { id: 'adopt-result', class: a.adoptMsg.ok ? 'ok' : 'err', 'aria-live': 'polite' }, h('p', null, a.adoptMsg.text), a.adoptMsg.list && a.adoptMsg.list.length ? h('ul', null, a.adoptMsg.list.map((x) => h('li', null, x))) : null) : null) : null,
      a.adopted ? h('section', { class: 'card ' + (merged ? 'highlight' : '') },
        h('h2', null, '4. コミットして PR を出し、CI を通してマージする'),
        h('p', null, 'ブランチ ', h('code', null, a.branch), ' に取り込みました。', merged ? ' PR #' + pr.id + ' はマージ済みです ✓' : pr ? ' PR #' + pr.id + ' は' + ({ open: 'レビュー待ち（CIを通してマージしましょう）', closed: '閉じられています' }[pr.status] || '') : ' リポジトリ画面でコミットし、PR を作りましょう。'),
        h('div', { class: 'row' },
          h('button', { id: 'to-repo', class: 'btn' + (merged ? '' : ' primary'), onclick: () => go(pr ? '#/repo/pr/' + pr.id : '#/repo') }, 'リポジトリ画面へ'),
          merged ? h('button', { id: 'to-reflect', class: 'btn primary', onclick: () => go('#/unit/' + unit.id + '/reflect') }, '振り返りへ') : null)) : null);
  }

  function diffView(lines) {
    if (!lines.length) return h('p', { class: 'muted small' }, '差分はありません');
    return h('pre', { class: 'code diff' }, h('code', null, lines.map((l) => h('span', { class: l.type === '+' ? 'add' : l.type === '-' ? 'del' : 'ctx' }, l.type + ' ' + l.text + '\n'))));
  }

  async function generate(unit, enr) {
    const a = enr.aion;
    const t = unit.aiTask;
    const repo = ensureRepo();
    const curFile = G.headTree(repo)[t.file];
    const mask = R.detectSensitive(a.spec + '\n' + (curFile || ''));
    if (mask.blocked) {
      logAi({ unitId: unit.id, kind: 'generate', input: R.redact(a.spec), output: '（送信を止めました）', masking: { blocked: true, labels: mask.labels }, source: 'blocked' });
      update(() => { a.note = '仕様に ' + mask.labels.join('・') + ' らしき内容があるので、AIへの送信を止めました。架空の値に置き換えてください。'; });
      toast('AIへの送信を止めました（' + mask.labels.join('・') + '）', 'warn');
      render();
      return;
    }
    update(() => { a.generating = true; });
    render();
    const [out] = await Promise.all([T.generateCode(t, a.spec, { ...aiEnv(), currentFile: curFile }), new Promise((r) => setTimeout(r, 500))]);
    update((s) => {
      a.generating = false;
      a.code = out.code;
      a.note = out.note || '';
      a.rows = [];
      a.error = null;
      a.pass = false;
      a.source = out.source;
      Object.assign(s, S.addSpend(s, out.costUsd, now()));
      logAi({ unitId: unit.id, kind: 'generate', input: R.redact('[仕様]\n' + a.spec), output: R.redact(out.code), masking: { blocked: false, labels: [] }, source: out.source, model: out.model });
    });
    render();
  }

  async function runAiTests(unit, enr) {
    const a = enr.aion;
    update(() => { a.running = true; });
    render();
    const t0 = performance.now();
    const res = await runner.runInSandbox({ sources: [a.code], tests: unit.aiTask.tests });
    update(() => {
      a.running = false;
      a.rows = res.results || [];
      a.error = res.error || null;
      a.pass = !!res.ok;
      a.ms = performance.now() - t0;
      enr.metrics = S.addMetric(enr, 'on', 'submissions', 1).metrics;
      if (!res.ok) enr.metrics = S.addMetric(enr, 'on', 'failures', 1).metrics;
    });
    render();
  }

  function adopt(unit, enr) {
    const a = enr.aion;
    const t = unit.aiTask;
    const chk = R.checkAdoptExplanation(t.review, a.review);
    if (!chk.ok) {
      update(() => { a.adoptMsg = { ok: false, text: '取り込めません。AIのコードを説明してから取り込みましょう（C-03）。', list: chk.missing }; });
      render();
      return;
    }
    let repo = ensureRepo();
    const branch = 'feature/' + unit.id.toLowerCase();
    if (repo.head !== branch) {
      if (repo.branches[branch]) {
        const r = G.checkout(repo, branch);
        if (r.error) { update(() => { a.adoptMsg = { ok: false, text: r.error + '（リポジトリ画面で、いまのブランチの変更をコミットしてください）' }; }); render(); return; }
        repo = r.repo;
      } else {
        if (G.status(repo).length) { update(() => { a.adoptMsg = { ok: false, text: 'いまのブランチ（' + repo.head + '）にコミットしていない変更があります。リポジトリ画面で先にコミットしてください。' }; }); render(); return; }
        if (repo.head !== G.MAIN) repo = G.checkout(repo, G.MAIN).repo;
        repo = G.createBranch(repo, branch).repo;
      }
    }
    repo = G.writeFile(repo, t.file, a.code.endsWith('\n') ? a.code : a.code + '\n');
    repo = G.writeFile(repo, t.testFile, t.tests);
    update((s) => {
      s.repo = repo;
      a.adopted = true;
      a.branch = branch;
      a.adoptMsg = { ok: true, text: 'ブランチ ' + branch + ' に ' + t.file + ' と ' + t.testFile + ' を取り込みました。' + (chk.advice.length ? ' レビューの観点として、こんな危険もあります: ' + chk.advice.join('／') : ''), list: [] };
      s.explanations.push({ id: uid('exp'), unitId: unit.id, kind: 'adopt', what: a.review.what, risk: a.review.risk, pass: true, missing: [], shared: false, time: now() });
    });
    render();
    toast('取り込みました。リポジトリ画面でコミットしてPRを出しましょう', 'ok');
  }

  // ---- ステップ5: 振り返り（S-07） ----
  function stepReflect(unit, enr) {
    const rows = R.metricRows(enr);
    if (!enr.reflection) enr.reflection = { text: '', gap: false, anxiety: null, share: false };
    const rf = enr.reflection;
    const done = enr.status === 'done';
    return h('div', { class: 'stack' },
      h('section', { class: 'card' },
        h('h2', null, '計測結果（AIオフ／AIオン）'),
        h('p', { class: 'muted small' }, '体感ではなく計測で振り返ります。時間はこの単元の画面を開いていた間だけ数えています。'),
        h('div', { class: 'scroll-x' }, h('table', { class: 'plain metrics', id: 'metrics-table' },
          h('thead', null, h('tr', null, h('th', null, ''), h('th', null, '実測の時間'), h('th', null, '事前の体感'), h('th', null, 'テスト失敗'), h('th', null, 'ヒント'), h('th', null, 'チューター質問'))),
          h('tbody', null, rows.map((r) => h('tr', null, h('th', { scope: 'row' }, r.mode), h('td', null, fmtMin(r.minutes)), h('td', null, fmtMin(r.estimate)), h('td', null, String(r.failures)), h('td', null, String(r.hints)), h('td', null, String(r.questions))))))),
        gapNote(rows),
        h('p', { class: 'muted small' }, '説明ゲート: ' + (enr.gate.firstTry ? '1回目で合格' : enr.gate.attempts + '回目で合格'))),
      h('section', { class: 'card' },
        h('h2', null, '学習ジャーナル'),
        h('label', { class: 'field' }, h('span', null, '分かったこと・まだ分からないこと・次に試したいこと'),
          h('textarea', { id: 'journal-text', rows: '5', value: rf.text, disabled: done, oninput: (e) => { rf.text = e.target.value; persist(); } })),
        h('label', { class: 'check' }, h('input', { id: 'gap-noticed', type: 'checkbox', checked: rf.gap, disabled: done, onchange: (e) => { rf.gap = e.target.checked; persist(); } }), '体感と実測が違った'),
        h('fieldset', { class: 'scale-q' }, h('legend', null, '「次の単元に進むのは不安ではない」にどのくらい当てはまりますか？'),
          h('div', { class: 'scale' }, [1, 2, 3, 4, 5].map((v) => h('label', { class: 'chip' }, h('input', { type: 'radio', name: 'anxiety', value: String(v), checked: rf.anxiety === v, disabled: done, onchange: () => { rf.anxiety = v; persist(); } }), h('span', null, ['1 当てはまらない', '2', '3', '4', '5 とても当てはまる'][v - 1]))))),
        h('label', { class: 'check' }, h('input', { id: 'share-journal', type: 'checkbox', checked: rf.share, disabled: done, onchange: (e) => { rf.share = e.target.checked; persist(); } }), 'メンターに共有する（共有しない限り、本文は誰にも見えません）'),
        done ? h('p', { class: 'ok' }, 'この単元は修了しています（' + fmtTime(enr.finishedAt) + '）。') :
          h('div', { class: 'row' }, h('button', { id: 'finish-unit', class: 'btn primary', onclick: () => finishUnit(unit, enr) }, 'この単元を修了する'))));
  }
  function gapNote(rows) {
    const msgs = rows.filter((r) => r.estimate && r.minutes > 0.05).map((r) => {
      const diff = Math.round((r.minutes - r.estimate) / r.estimate * 100);
      return r.mode + 'は体感より' + (diff >= 0 ? diff + '%長く' : -diff + '%短く') + 'かかりました。';
    });
    return msgs.length ? h('p', { class: 'note' }, msgs.join(' ')) : null;
  }
  function finishUnit(unit, enr) {
    const rf = enr.reflection;
    update((s) => {
      enr.status = 'done';
      enr.finishedAt = now();
      enr.done.reflect = true;
      s.journal.push({ id: uid('jr'), unitId: unit.id, text: rf.text, gapNoticed: rf.gap, anxiety: rf.anxiety, shared: rf.share, time: now() });
    });
    toast(unit.id + '「' + unit.title + '」を修了しました。おつかれさまでした！', 'ok');
    go('#/home');
  }

  // ---------------------------------------------------------------- AIチューター
  function tutorContext(unit, enr, step, ai) {
    const base = { unit, aiMode: ai, stepName: C.STEPS[stepIndex(step)].name, history: enr.chat.filter((m) => m.step === step && (m.role === 'user' || m.role === 'assistant')).map((m) => ({ role: m.role, content: m.text })) };
    base.turn = base.history.filter((m) => m.role === 'user').length;
    if (step === 'practice') {
      const ex = currentExercise(unit, enr);
      const st = exState(enr, ex);
      return { ...base, exercise: ex, code: R.assembleAnswer(ex, st), testRows: st.rows || [], hintLevel: st.hintLevel, solution: ex.solution };
    }
    const scratch = R.exercisesOf(unit, 'scratch')[0];
    if (step === 'aion' || step === 'reflect') return { ...base, aiTask: unit.aiTask, spec: enr.aion.spec, code: enr.aion.code, testRows: enr.aion.rows || [], solution: unit.aiTask.good };
    if (step === 'gate') return { ...base, exercise: scratch, code: scratchCode(unit, enr).own, solution: scratch.solution };
    return { ...base, exercise: null, code: '', solution: scratch.solution };
  }

  function tutorPanel(unit, enr, step, ai) {
    const quota = R.tutorQuota(enr, ai);
    const stopped = !!state.settings.tutorStopped;
    const msgs = enr.chat.filter((m) => m.step === step);
    const log = h('div', { id: 'tutor-log', class: 'chat', 'aria-live': 'polite' },
      msgs.length ? msgs.map((m) => h('div', { class: 'msg ' + m.role },
        h('span', { class: 'who' }, { user: 'あなた', assistant: 'チューター', system: 'お知らせ' }[m.role]),
        h('p', null, m.text),
        m.note ? h('p', { class: 'muted tiny' }, m.note) : null)) :
        h('p', { class: 'muted small' }, ai === 'on' ? 'AIオン: 仕様や差分の抜け・危ないところを、質問の形で指摘します。' : 'AIオフ: 答えやコードは出さず、質問とヒントで一緒に考えます。困ったら「分からない」と書いてもだいじょうぶ。'));
    const draft = { text: '' };
    const remainingText = stopped ? '停止中（縮退運転）。ヒントボタンと練習はそのまま使えます' : quota.limited ? 'AIオフ中の残り ' + quota.remaining + ' / ' + quota.limit + ' 回' : 'AIオン中は回数制限なし';
    const panel = h('aside', { class: 'tutor card', 'aria-label': 'AIチューター' },
      h('div', { class: 'row between' }, h('h2', null, 'AIチューター'), h('span', { class: 'chip-mini ' + ai }, ai === 'on' ? 'AIオン' : 'AIオフ')),
      h('p', { id: 'tutor-remaining', class: 'small ' + (quota.limited && quota.remaining <= 3 ? 'warn' : 'muted') }, remainingText),
      h('p', { class: 'muted tiny' }, state.settings.apiKey && !stopped ? 'Claude（' + T.pickModel(state.settings, S.spentThisMonth(state, now())) + '）で応答します' : '練習用のルールベースのチューターで応答します（設定で Claude の API キーを入れると LLM で応答）'),
      log,
      h('label', { class: 'sr-only', for: 'tutor-input' }, 'チューターへの質問'),
      h('textarea', { id: 'tutor-input', rows: '3', placeholder: stopped ? 'チューターは停止中です' : '例: テストが落ちる理由が分かりません', disabled: stopped || (quota.limited && quota.remaining <= 0), oninput: (e) => { draft.text = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendTutor(unit, enr, step, ai, draft.text); } } }),
      h('div', { class: 'row between' },
        h('span', { class: 'muted tiny' }, 'Ctrl+Enter で送信'),
        h('button', { id: 'tutor-send', class: 'btn', disabled: stopped || (quota.limited && quota.remaining <= 0), onclick: () => sendTutor(unit, enr, step, ai, draft.text) }, '質問する')),
      quota.limited && quota.remaining <= 0 ? h('p', { class: 'note small' }, 'この単元のAIオフ中の質問回数（' + quota.limit + '回）を使い切りました。一度自分で試してみましょう。ヒントボタンは使えます。') : null);
    return panel;
  }

  let tutorBusy = false;
  async function sendTutor(unit, enr, step, ai, text) {
    const q = String(text || '').trim();
    if (!q || tutorBusy) return;
    const quota = R.tutorQuota(enr, ai);
    if (quota.limited && quota.remaining <= 0) { toast('この単元のAIオフ中の質問回数を使い切りました。一度自分で試してみましょう'); return; }
    const ctx = tutorContext(unit, enr, step, ai);
    ctx.question = q;
    // FR-052: 送信前のマスキング検査（質問・コード・仕様のどれかに含まれていたら止める）
    const mask = R.detectSensitive([q, ctx.code || '', ctx.spec || ''].join('\n'));
    if (mask.blocked) {
      update(() => {
        enr.chat.push({ step, role: 'user', text: R.redact(q), time: now() });
        enr.chat.push({ step, role: 'system', text: '入力に ' + mask.labels.join('・') + ' らしき内容が含まれていたので、AIへの送信を止めました。実在の情報は入力せず、架空の値に置き換えてください。', time: now() });
        logAi({ unitId: unit.id, kind: 'tutor', input: R.redact(q), output: '（送信を止めました）', masking: { blocked: true, labels: mask.labels }, source: 'blocked' });
      });
      render();
      toast('AIへの送信を止めました（' + mask.labels.join('・') + '）', 'warn');
      return;
    }
    tutorBusy = true;
    update(() => { enr.chat.push({ step, role: 'user', text: q, time: now() }); });
    render();
    const out = await T.askTutor(ctx, aiEnv());
    tutorBusy = false;
    update((s) => {
      enr.chat.push({ step, role: 'assistant', text: out.text, note: out.note || '', time: now() });
      if (ai === 'on') enr.tutorOnCount += 1;
      else enr.tutorOffCount += 1;
      enr.metrics = S.addMetric(enr, ai, 'questions', 1).metrics;
      Object.assign(s, S.addSpend(s, out.costUsd, now()));
      logAi({ unitId: unit.id, kind: 'tutor', input: R.redact(q), output: R.redact(out.text), masking: { blocked: false, labels: [] }, source: out.source, model: out.model });
    });
    render();
    const input = $('tutor-input');
    if (input) input.focus();
  }

  function logAi(entry) {
    state.aiLog = S.appendLog(state.aiLog, entry, now(), state.user && state.user.id);
    persist();
  }

  // ---------------------------------------------------------------- S-06 リポジトリ／PR
  let repoView = { file: null, prTitle: '', commitMsg: '', branchName: '' };
  function viewRepo(prId) {
    const repo = ensureRepo();
    const tree = repo.work;
    const st = G.status(repo);
    const files = Object.keys(tree).sort();
    const file = repoView.file && tree[repoView.file] !== undefined ? repoView.file : 'AGENTS.md';
    const changed = Object.fromEntries(st.map((x) => [x.path, x.kind]));
    const pr = prId ? G.findPr(repo, prId) : null;
    const openForHead = repo.prs.find((p) => p.head === repo.head && p.status === 'open');

    const branchBar = h('section', { class: 'card' },
      h('div', { class: 'row wrap between' },
        h('label', { class: 'field inline' }, h('span', null, 'ブランチ'),
          h('select', { id: 'repo-branch', onchange: (e) => { const r = G.checkout(state.repo, e.target.value); if (r.error) { toast(r.error, 'warn'); render(); return; } update((s) => { s.repo = r.repo; }); render(); } },
            Object.keys(repo.branches).sort().map((b) => h('option', { value: b, selected: b === repo.head }, b + (b === G.MAIN ? '（保護）' : ''))))),
        h('div', { class: 'row' },
          h('label', { class: 'sr-only', for: 'new-branch-name' }, '新しいブランチ名'),
          h('input', { id: 'new-branch-name', type: 'text', placeholder: 'feature/〜', value: repoView.branchName, oninput: (e) => { repoView.branchName = e.target.value; } }),
          h('button', { id: 'new-branch-btn', class: 'btn', onclick: () => { const r = G.createBranch(state.repo, repoView.branchName.trim()); if (r.error) { toast(r.error, 'warn'); return; } update((s) => { s.repo = r.repo; }); repoView.branchName = ''; render(); toast('ブランチを作って切り替えました'); } }, 'ブランチを作る'))),
      repo.head === G.MAIN ? h('p', { class: 'muted small' }, 'main は保護されています。作業はブランチで行い、PR でマージします。') : null);

    const fileList = h('section', { class: 'card' }, h('h2', null, 'ファイル（' + repo.head + '）'),
      h('ul', { class: 'files' }, files.map((p) => h('li', null, h('button', { class: 'linklike' + (p === file ? ' sel' : ''), onclick: () => { repoView.file = p; render(); } }, p, changed[p] ? h('span', { class: 'chg ' + changed[p] }, { added: ' 追加', modified: ' 変更', deleted: ' 削除' }[changed[p]]) : null)))),
      codeBlock(tree[file] || '', 'file-view'));

    const msgOk = /^(feat|fix|docs|test|refactor|chore): \S/.test(repoView.commitMsg.split('\n')[0]) && repoView.commitMsg.split('\n')[0].length <= 50;
    const changes = h('section', { class: 'card' }, h('h2', null, 'コミットしていない変更'),
      st.length ? [
        h('ul', { class: 'small' }, st.map((x) => h('li', null, h('code', null, x.path), ' — ', { added: '追加', modified: '変更', deleted: '削除' }[x.kind]))),
        h('details', null, h('summary', null, '差分を見る'), G.treeDiff(G.headTree(repo), repo.work).map((f) => h('div', null, h('p', { class: 'small' }, h('strong', null, f.path), ' +' + f.added + ' −' + f.removed), diffView(f.lines)))),
        h('label', { class: 'field' }, h('span', null, 'コミットメッセージ（例: feat: 明細の1行表示を追加）'),
          h('input', { id: 'commit-msg', type: 'text', value: repoView.commitMsg, oninput: (e) => { repoView.commitMsg = e.target.value; const hint = $('commit-hint'); if (hint) hint.hidden = /^(feat|fix|docs|test|refactor|chore): \S/.test(e.target.value) && e.target.value.length <= 50; } })),
        h('p', { id: 'commit-hint', class: 'muted tiny', hidden: msgOk }, '1行目は「種類: 何をしたか」を50文字以内で（feat / fix / docs / test / refactor / chore）'),
        h('button', { id: 'commit-btn', class: 'btn primary', onclick: () => doCommit() }, 'コミット'),
      ] : h('p', { class: 'muted small' }, '変更はありません。'));

    const prPanel = h('section', { class: 'card' }, h('h2', null, 'プルリクエスト'),
      repo.head !== G.MAIN && !openForHead ? h('div', { class: 'row wrap' },
        h('label', { class: 'sr-only', for: 'pr-title' }, 'PR のタイトル'),
        h('input', { id: 'pr-title', type: 'text', placeholder: 'PR のタイトル', value: repoView.prTitle, oninput: (e) => { repoView.prTitle = e.target.value; } }),
        h('button', { id: 'pr-create', class: 'btn primary', onclick: () => doOpenPr() }, repo.head + ' → main の PR を作る')) : null,
      repo.prs.length ? h('ul', { class: 'pr-list' }, repo.prs.slice().reverse().map((p) => h('li', null,
        h('a', { class: 'pr-item' + (pr && pr.id === p.id ? ' sel' : ''), href: '#/repo/pr/' + p.id },
          '#' + p.id + ' ' + p.title, ' ', h('span', { class: 'badge ' + p.status }, { open: 'オープン', merged: p.reverted ? 'マージ→リバート' : 'マージ済み', closed: 'クローズ' }[p.status]),
          p.ci ? h('span', { class: 'badge ' + (G.ciIsCurrent(repo, p) || p.status !== 'open' ? p.ci.status : 'stale') }, 'CI ' + (p.status === 'open' && !G.ciIsCurrent(repo, p) ? '古い' : p.ci.status === 'success' ? '✓' : '✗')) : null)))) : h('p', { class: 'muted small' }, 'まだ PR はありません。'));

    const detail = pr ? prDetail(repo, pr) : null;
    const history = h('section', { class: 'card' }, h('h2', null, 'main の履歴'),
      h('ol', { class: 'history small' }, G.log(repo, G.MAIN, 12).map((c) => h('li', null, h('code', null, c.id), ' ', c.message, h('span', { class: 'muted tiny' }, ' ' + fmtTime(c.time))))));
    return h('div', { class: 'page wide' }, h('h1', null, '練習銀行リポジトリ'),
      h('p', { class: 'muted' }, 'ブラウザの中の簡易 Git です。ブランチ → コミット → PR → CI → マージ、まずいときはリバート。'),
      branchBar,
      h('div', { class: 'repo-grid' }, h('div', { class: 'stack' }, detail, changes, prPanel), h('div', { class: 'stack' }, fileList, history)));
  }

  function prDetail(repo, pr) {
    const files = G.prDiff(repo, pr.id);
    const size = G.diffSize(files);
    const current = G.ciIsCurrent(repo, pr);
    const ci = pr.ci;
    const unitHint = state.repo && Object.values(state.enrollments).find((e) => e.aion && e.aion.branch === pr.head);
    return h('section', { class: 'card highlight', id: 'pr-detail' },
      h('div', { class: 'row between wrap' }, h('h2', null, 'PR #' + pr.id + ' ' + pr.title), h('span', { class: 'muted small' }, pr.head + ' → ' + pr.base)),
      size > G.PR_LINE_LIMIT ? h('p', { id: 'pr-size-warning', class: 'warn' }, '差分が' + size + '行あります。' + G.PR_LINE_LIMIT + '行以下に分けましょう（小さいPRほどレビューで見落としが減ります）') : h('p', { class: 'muted small' }, '差分 ' + size + ' 行（' + G.PR_LINE_LIMIT + '行以下 ✓）'),
      h('details', { open: files.length <= 3 }, h('summary', null, '変更されたファイル（' + files.length + '）'), files.map((f) => h('div', null, h('p', { class: 'small' }, h('strong', null, f.path), ' +' + f.added + ' −' + f.removed), diffView(f.lines)))),
      h('div', { id: 'ci-result', class: 'ci', 'aria-live': 'polite' },
        h('h3', null, 'CI（テスト・静的解析）'),
        pr.ciRunning ? h('p', { class: 'muted' }, '実行中…') :
          !ci ? h('p', { class: 'muted small' }, 'まだ実行していません') : [
            h('p', { class: ci.status === 'success' ? 'ok' : 'err' }, ci.status === 'success' ? '✓ CI 成功' : '✗ CI 失敗', h('span', { class: 'muted small' }, '（' + (ci.ms / 1000).toFixed(2) + '秒' + (pr.status === 'open' && !current ? '・最新のコミットではありません' : '') + '）')),
            h('ul', { class: 'test-rows' }, ci.tests.map((t) => h('li', { class: t.pass ? 'pass' : 'fail' }, h('span', { class: 'mark' }, t.pass ? '✓' : '✗'), h('span', null, t.file + ' › ' + t.name), !t.pass && t.expected !== undefined ? h('span', { class: 'exp' }, '期待: ', h('code', null, t.expected), ' ／ 実際: ', h('code', null, t.actual)) : null, !t.pass && t.error ? h('span', { class: 'exp' }, h('code', null, t.error)) : null))),
            ci.lint.length ? h('ul', { class: 'lint small' }, ci.lint.map((l) => h('li', { class: l.level }, (l.level === 'error' ? '✗ ' : '⚠ ') + l.path + ':' + l.line + ' ' + l.msg + '（' + l.rule + '）'))) : h('p', { class: 'muted small' }, '静的解析: 指摘なし'),
          ]),
      h('div', { class: 'row wrap' },
        pr.status === 'open' ? [
          h('button', { id: 'ci-run', class: 'btn', onclick: () => runCi(pr.id) }, 'CI を実行'),
          h('button', { id: 'pr-merge', class: 'btn primary', disabled: !(ci && current && ci.status === 'success'), onclick: () => doMerge(pr.id) }, 'マージ'),
          h('button', { id: 'pr-close', class: 'btn ghost', onclick: () => { const r = G.closePr(state.repo, pr.id); if (r.error) return toast(r.error, 'warn'); update((s) => { s.repo = r.repo; }); render(); } }, 'PR を閉じる'),
        ] : null,
        pr.status === 'merged' && !pr.reverted ? h('button', { id: 'pr-revert', class: 'btn', onclick: () => doRevert(pr.id) }, 'リバート（取り消し）') : null,
        pr.status === 'merged' && unitHint ? h('button', { class: 'btn primary', onclick: () => go('#/unit/' + unitHint.unitId + '/reflect') }, unitHint.unitId + ' の振り返りへ') : null));
  }

  function doCommit() {
    const r = G.commit(state.repo, repoView.commitMsg, now());
    if (r.error) { toast(r.error, 'warn'); return; }
    update((s) => { s.repo = r.repo; });
    repoView.commitMsg = '';
    toast('コミットしました: ' + r.commit.id);
    const open = r.repo.prs.find((p) => p.head === r.repo.head && p.status === 'open');
    if (open) { go('#/repo/pr/' + open.id); runCi(open.id); }
    else render();
  }
  function doOpenPr() {
    const enr = Object.values(state.enrollments).find((e) => e.aion && e.aion.branch === state.repo.head);
    const r = G.openPr(state.repo, { title: repoView.prTitle || state.repo.head, time: now(), unitId: enr ? enr.unitId : null });
    if (r.error) { toast(r.error, 'warn'); return; }
    update((s) => { s.repo = r.repo; });
    repoView.prTitle = '';
    go('#/repo/pr/' + r.pr.id);
    runCi(r.pr.id);
  }
  // FR-042: PR を作ったとき・PR のブランチにコミットしたとき、自動で CI を走らせる
  async function runCi(prId) {
    let repo = state.repo;
    const pr = G.findPr(repo, prId);
    const tree = G.prMergedTree(repo, prId);
    if (!tree) { toast('main とコンフリクトしています', 'warn'); return; }
    pr.ciRunning = true;
    render();
    const t0 = performance.now();
    const job = R.ciJob(tree);
    const results = await runner.runInSandbox(job, 8000);
    const summary = R.summarizeCi(job, results, R.lintTree(tree));
    summary.ms = performance.now() - t0;
    update((s) => {
      s.repo = G.setCi(s.repo, prId, summary);
      delete G.findPr(s.repo, prId).ciRunning;
    });
    render();
  }
  function doMerge(prId) {
    const r = G.mergePr(state.repo, prId, now());
    if (r.error) { toast(r.error, 'warn'); return; }
    const pr = G.findPr(r.repo, prId);
    update((s) => {
      s.repo = r.repo;
      const enr = Object.values(s.enrollments).find((e) => e.aion && e.aion.branch === pr.head);
      if (enr && !enr.done.aion) { enr.done.aion = true; if (stepIndex(enr.step) < stepIndex('reflect')) enr.step = 'reflect'; }
    });
    toast('マージしました。練習銀行が少し育ちました 🏦', 'ok');
    render();
  }
  function doRevert(prId) {
    const r = G.revertPr(state.repo, prId, now());
    if (r.error) { toast(r.error, 'warn'); return; }
    update((s) => { s.repo = r.repo; });
    toast('リバートしました（取り消しのコミットを main に作りました）');
    render();
  }

  // ---------------------------------------------------------------- S-08 AI利用ログ
  let verifyResult = null;
  function viewLog() {
    const log = state.aiLog;
    return h('div', { class: 'page wide' }, h('h1', null, 'AI利用ログ'),
      h('p', { class: 'muted' }, 'AI機能（チューター・実装・採点）への入出力を、日時・単元・学習者IDとともに記録しています。実在の情報らしきものは伏せ字にして残し、送信を止めた記録も残ります。各行はひとつ前の行のハッシュを含むので、書き換えると検証で分かります。'),
      h('div', { class: 'row wrap' },
        h('button', { id: 'log-verify', class: 'btn primary', onclick: () => { verifyResult = S.verifyLog(state.aiLog); render(); } }, 'ハッシュを検証する'),
        h('button', { id: 'log-export', class: 'btn', onclick: () => download('ai-log.json', JSON.stringify(state.aiLog, null, 2)) }, 'JSON で書き出す'),
        verifyResult ? h('p', { id: 'log-verify-result', class: verifyResult.ok ? 'ok' : 'err', role: 'status' }, verifyResult.ok ? '✓ ' + verifyResult.count + '件すべて、改ざんされていません' : '✗ ' + (verifyResult.brokenAt + 1) + '件目以降で改ざんを検知しました') : null),
      log.length ? h('div', { class: 'scroll-x' }, h('table', { class: 'plain log', id: 'log-table' },
        h('thead', null, h('tr', null, ['#', '日時', '単元', '種類', '経路', 'マスキング', '入力 / 出力', 'ハッシュ'].map((x) => h('th', null, x)))),
        h('tbody', null, log.slice().reverse().map((e) => h('tr', { class: e.masking.blocked ? 'blocked' : '' },
          h('td', null, String(e.seq)), h('td', null, fmtTime(e.time)), h('td', null, e.unitId), h('td', null, { tutor: 'チューター', generate: 'AI実装', 'gate-score': '説明の採点' }[e.kind] || e.kind),
          h('td', null, e.source === 'llm' ? 'LLM（' + e.model + '）' : e.source === 'blocked' ? '送信停止' : 'ルールベース'),
          h('td', null, e.masking.blocked ? '⚠ ' + e.masking.labels.join('・') : '—'),
          h('td', null, h('details', null, h('summary', null, e.input.slice(0, 40) + (e.input.length > 40 ? '…' : '')), h('p', { class: 'small' }, h('strong', null, '入力: ')), codeBlock(e.input), h('p', { class: 'small' }, h('strong', null, '出力: ')), codeBlock(e.output))),
          h('td', null, h('code', { class: 'tiny', title: e.hash }, e.hash.slice(0, 10)))))))) : h('p', { class: 'muted' }, 'まだ記録はありません。'));
  }

  // ---------------------------------------------------------------- 設定
  function viewSettings() {
    const s = state.settings;
    const draft = { name: state.user.name, apiKey: s.apiKey || '', remember: !!s.rememberKey, model: s.model || T.MODEL_DEFAULT, budget: s.monthlyBudgetUsd, stop: !!s.tutorStopped };
    return h('div', { class: 'page narrow' }, h('h1', null, '設定'),
      h('section', { class: 'card' }, h('h2', null, 'プロフィール'),
        h('label', { class: 'field' }, h('span', null, '表示名'), h('input', { id: 'set-name', type: 'text', maxlength: '20', value: draft.name, oninput: (e) => { draft.name = e.target.value; } }))),
      h('section', { class: 'card' }, h('h2', null, 'AIチューター（任意）'),
        h('p', { class: 'muted small' }, 'Claude の API キーを入れると、チューター・AI実装・説明の観点採点が本物の LLM になります。入れなければ、練習用のルールベースで動きます（無料・オフライン）。キーはこのブラウザから Anthropic の API にだけ送られます。'),
        h('p', { class: 'note small' }, '組織で使う場合は、API の利用規約とデータの取り扱い（学習に使われない設定か）を事前に確認してください（NFR-07）。業務のキーではなく、練習用に発行したキーを使いましょう。'),
        h('label', { class: 'field' }, h('span', null, 'Claude API キー'), h('input', { id: 'set-apikey', type: 'password', autocomplete: 'off', value: draft.apiKey, placeholder: 'sk-ant-…', oninput: (e) => { draft.apiKey = e.target.value.trim(); } })),
        h('label', { class: 'check' }, h('input', { id: 'set-remember', type: 'checkbox', checked: draft.remember, onchange: (e) => { draft.remember = e.target.checked; } }), 'この端末に保存する（外すと、タブを閉じたら消えます）'),
        h('label', { class: 'field' }, h('span', null, 'モデル'), h('select', { id: 'set-model', onchange: (e) => { draft.model = e.target.value; } },
          [[T.MODEL_DEFAULT, 'Claude Opus 5.5（既定）'], [T.MODEL_LIGHT, 'Claude Haiku 5.5（軽量）']].map(([v, l]) => h('option', { value: v, selected: draft.model === v }, l)))),
        h('label', { class: 'field inline' }, h('span', null, '月の利用料の上限（超えたら軽量モデルに切り替え）'), h('input', { id: 'set-budget', type: 'number', min: '0', step: '0.5', value: String(draft.budget), oninput: (e) => { draft.budget = Number(e.target.value); } }), h('span', null, 'USD')),
        h('p', { class: 'muted small' }, '今月の利用料（概算）: $' + S.spentThisMonth(state, now()).toFixed(4)),
        h('label', { class: 'check' }, h('input', { id: 'set-stop', type: 'checkbox', checked: draft.stop, onchange: (e) => { draft.stop = e.target.checked; } }), 'AIチューターを停止する（障害時の縮退運転を確かめる。AIオフの課題はそのまま続けられます）')),
      h('div', { class: 'row' }, h('button', { id: 'set-save', class: 'btn primary', onclick: () => {
        update((st) => {
          st.user.name = draft.name.trim() || '学習者';
          st.settings = { ...st.settings, apiKey: draft.apiKey, rememberKey: draft.remember, model: draft.model, monthlyBudgetUsd: draft.budget, tutorStopped: draft.stop };
        });
        toast('保存しました', 'ok');
        render();
      } }, '保存')),
      h('section', { class: 'card' }, h('h2', null, 'データ'),
        h('p', { class: 'muted small' }, '学習データはこのブラウザの中にだけ保存されています（サーバーには送りません）。バックアップや別の端末への移行は、書き出したファイルを読み込んでください。'),
        h('div', { class: 'row wrap' },
          h('button', { id: 'data-export', class: 'btn', onclick: () => { const { apiKey, ...settings } = state.settings; download('renshu-ginko-data.json', JSON.stringify({ ...state, settings }, null, 2)); } }, 'すべて書き出す（JSON）'),
          h('label', { class: 'btn', for: 'data-import' }, '書き出したファイルを読み込む'),
          h('input', { id: 'data-import', type: 'file', accept: 'application/json,.json', class: 'sr-only', onchange: (e) => importFile(e.target.files[0]) }),
          h('button', { id: 'data-reset', class: 'btn danger', onclick: () => {
            if (!window.confirm('学習データをすべて消して最初からやり直しますか？（元に戻せません）')) return;
            state = S.defaultState();
            S.save(state, safeStorage('localStorage') || memStore, safeStorage('sessionStorage'));
            go('#/onboarding');
          } }, '最初からやり直す'))));
  }

  function importFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const r = S.importData(String(reader.result), state);
      if (r.error) { toast('読み込めませんでした: ' + r.error, 'warn'); return; }
      if (!window.confirm('今の学習データを、ファイルの内容で置き換えますか？（今のデータは消えます）')) return;
      state = r.state;
      S.save(state, safeStorage('localStorage') || memStore, safeStorage('sessionStorage'));
      toast('読み込みました' + (r.logOk ? '' : '（AI利用ログのハッシュが合いません。改ざんの可能性があります）'), r.logOk ? 'ok' : 'warn');
      go('#/home');
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------- 計測のタイマー（FR-050）
  setInterval(() => {
    if (document.visibilityState !== 'visible' || !state.user) return;
    const r = route();
    let enr = null;
    let mode = null;
    if (r.name === 'unit' && currentWork) {
      enr = enrollmentOf(currentWork.unitId);
      const st = C.STEPS[stepIndex(currentWork.step)];
      if (enr && enr.status !== 'done' && st && st.id !== 'reflect') mode = st.ai === 'on' ? 'on' : 'off';
    } else if (r.name === 'repo' && state.repo) {
      // 実践の途中でリポジトリ画面にいる時間は、その単元の AIオン の時間に数える
      enr = Object.values(state.enrollments).find((e) => e.status !== 'done' && e.step === 'aion' && e.aion.branch === state.repo.head);
      if (enr) mode = 'on';
    }
    if (!enr || !mode) return;
    enr.metrics[mode] = { ...R.emptyMetric(), ...enr.metrics[mode] };
    enr.metrics[mode].ms += 1000;
    if (Date.now() % 5000 < 1000) persist();
  }, 1000);
  window.addEventListener('pagehide', () => S.save(state, safeStorage('localStorage') || memStore, safeStorage('sessionStorage')));

  // E2E テスト用の窓口（状態を覗くだけ）
  window.__RGA_APP = { get state() { return state; }, render };

  if (!location.hash) location.replace(state.user ? '#/home' : '#/onboarding');
  render();
  lastRoute = route().name + '/' + route().args.join('/');
})();
