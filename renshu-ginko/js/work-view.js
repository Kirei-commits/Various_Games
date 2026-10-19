/*
 * 配属先モード（実案件）の画面（ブラウザ専用）
 *   #/work         1週間の流れ: 計画（チームの力の配分）→ 今週の仕事 →（障害）→ 週報（数字と上司のひとこと）
 *   #/work/p/ID    答えを見た問題の解き直し（数字には影響しない）
 * 問題の部品はハッカソンと共通（hack-view.js）。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const W = RGA.work;
  const H = RGA.hack;
  const V = () => RGA.hackView;

  function progressOf(state) {
    if (!state.work) state.work = W.emptyProgress();
    return state.work;
  }
  function workOf(pr, p) {
    if (!pr.work[p.id]) pr.work[p.id] = { hint: 0, marks: {}, line: null, choice: null, text: '', sel: null, tries: 0, result: null };
    return pr.work[p.id];
  }
  const incidentProblem = (pr) => (pr.incident ? W.findProblem(pr.incident).problem : null);

  function view(ui, args) {
    if (args[0] === 'p') return viewRetry(ui, args[1]);
    return viewWeek(ui);
  }

  // ---------------------------------------------------------------- 数字のタイル
  function fmt(id, v) {
    if (id === 'users') return v.toLocaleString('ja-JP') + ' 人';
    if (id === 'rating') return '★ ' + v.toFixed(1);
    if (id === 'cost') return v + ' 万円/月';
    return String(v);
  }
  // 良くなったら緑、悪くなったら橙（負債と費用は減るのが良い）
  function deltaChip(ui, id, d) {
    if (!d) return null;
    const good = (id === 'debt' || id === 'cost') ? d < 0 : d > 0;
    return ui.h('span', { class: 'delta ' + (good ? 'up' : 'down') }, (d > 0 ? '+' : '') + (id === 'users' ? d.toLocaleString('ja-JP') : d));
  }
  function tiles(ui, m, deltas) {
    return ui.h('div', { class: 'work-tiles' }, W.METRICS.map((x) => ui.h('div', { class: 'work-tile', id: 'wk-m-' + x.id },
      ui.h('span', { class: 'muted tiny' }, x.name),
      ui.h('strong', null, fmt(x.id, m[x.id])),
      deltas ? deltaChip(ui, x.id, deltas[x.id]) : null,
      x.id === 'stamina' || x.id === 'debt' || x.id === 'trust' ? ui.h('span', { class: 'bar' + (x.id === 'debt' ? ' debt' : '') }, ui.h('span', { style: 'width:' + m[x.id] + '%' })) : null)));
  }

  // ---------------------------------------------------------------- 1週間
  function viewWeek(ui) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = V().namesOf(state);
    const last = pr.history[pr.history.length - 1];
    const head = [
      ui.h('h1', null, '配属先: モバイルバンキング開発グループ'),
      ui.guide('work', '配属先モードの遊び方', [
        'ハッカソンと同時並行で、練習銀行のスマホアプリを運用しながら、開発チームを運営します。1ターンは1週間、全24週です。',
        '毎週、チームの力（10ポイント）を「新機能・品質・運用・休息」に配分し、今週の仕事（報連相・ヒアリング・見積もり・会議など）に取り組みます。',
        '障害が起きたら、ログを読んで原因を当てたり、対応の順番を選んだりします。分からなければ仲間に聞きに行けます。',
        'ゲームオーバーはありません。結果は数字で返ってきて、上司が一緒に立て直してくれます。',
      ]),
      ui.h('p', { class: 'muted' }, pr.phase === 'done' ? '1年目が終わりました' : '第' + pr.week + '週 / ' + W.TOTAL_WEEKS),
      tiles(ui, pr.metrics, last && pr.phase === 'report' ? last.deltas : null),
    ];
    let body;
    if (pr.phase === 'done') body = doneView(ui, pr, names);
    else {
      const week = W.weekOf(pr.week);
      if (!week) body = ui.h('section', { class: 'card' }, ui.h('p', null, '第' + pr.week + '週は準備中です。'));
      else if (pr.phase === 'plan') body = planView(ui, pr, week, names);
      else if (pr.phase === 'event') body = taskView(ui, pr, week, week.task, names, false);
      else if (pr.phase === 'incident') body = taskView(ui, pr, week, incidentProblem(pr), names, true);
      else body = reportView(ui, pr, week, names);
    }
    return ui.h('div', { class: 'page' }, head, body, historyView(ui, pr));
  }

  function planView(ui, pr, week, names) {
    const a = pr.alloc;
    const used = W.ALLOC.reduce((s, x) => s + a[x.id], 0);
    const left = W.CAPACITY - used;
    const risk = W.incidentRisk(pr.metrics, a);
    const riskName = risk < 0.15 ? '低い' : risk < 0.3 ? 'ふつう' : '高い';
    const set = (id, v) => { ui.update(() => { pr.alloc = { ...pr.alloc, [id]: v }; }); ui.render(); };
    return ui.h('div', { class: 'stack' },
      ui.h('section', { class: 'card' },
        ui.h('p', { class: 'eyebrow' }, '今週学ぶこと: ' + week.skill),
        ui.h('h2', null, '第' + week.no + '週「' + week.title + '」'),
        V().talkLines(ui, week.briefing, names)),
      ui.h('section', { class: 'card', id: 'wk-plan' },
        ui.h('h2', null, 'チームの力の配分（' + W.CAPACITY + 'ポイント）'),
        ui.h('div', { class: 'alloc-list' }, W.ALLOC.map((x) => ui.h('div', { class: 'alloc-row' },
          ui.h('span', { class: 'alloc-name' }, x.icon + ' ' + x.name, ui.h('small', { class: 'muted' }, x.desc)),
          ui.h('span', { class: 'alloc-ctl' },
            ui.h('button', { class: 'icon', id: 'wk-minus-' + x.id, 'aria-label': x.name + 'を減らす', disabled: a[x.id] <= 0, onclick: () => set(x.id, a[x.id] - 1) }, '−'),
            ui.h('strong', { id: 'wk-val-' + x.id, 'aria-live': 'polite' }, String(a[x.id])),
            ui.h('button', { class: 'icon', id: 'wk-plus-' + x.id, 'aria-label': x.name + 'を増やす', disabled: left <= 0, onclick: () => set(x.id, a[x.id] + 1) }, '＋'))))),
        ui.h('p', { class: 'small' }, '残り ' + left + ' ポイント ・ 障害の起きやすさ: ', ui.h('strong', { class: risk >= 0.3 ? 'warn-text' : '' }, riskName)),
        ui.h('div', { class: 'row end' }, ui.h('button', { id: 'wk-start', class: 'btn primary', disabled: !W.validAlloc(a), onclick: () => {
          ui.update(() => {
            pr.incident = W.rollIncident(pr.week, pr.metrics, pr.alloc);
            if (pr.incident) pr.work[pr.incident] = null; // 抽選の障害は何度か起きるので、毎回まっさらにする
            pr.phase = 'event';
          });
          ui.render();
        } }, left ? 'あと ' + left + ' ポイント配分してください' : 'この配分で週を始める'))));
  }

  // 今週の仕事・障害の問題
  function taskView(ui, pr, week, p, names, isIncident) {
    const card = problemCard(ui, pr, p, names, {
      after: () => ui.h('div', { class: 'row end' }, ui.h('button', { id: 'wk-next', class: 'btn primary', onclick: () => {
        if (!isIncident && pr.incident) { ui.update(() => { pr.phase = 'incident'; }); ui.render(); return; }
        finishWeek(ui, pr, week);
      } }, !isIncident && pr.incident ? '次へ' : '週を締める')),
    });
    return ui.h('div', { class: 'stack' },
      isIncident ? ui.h('div', { class: 'banner incident', role: 'alert' }, ui.h('p', null, '🚨 障害が発生しました。落ち着いて、まず状況を読みましょう。')) : ui.h('p', { class: 'eyebrow' }, '今週の仕事（' + week.skill + '）'),
      card);
  }

  function problemCard(ui, pr, p, names, opts) {
    const w = workOf(pr, p);
    const done = !!(w.result && w.result.pass) || !!w.revealed;
    const refresh = (fn) => { ui.update(() => fn()); ui.render(); };
    const consult = p.consult && !done ? ui.h('details', { class: 'consult-inline', id: 'wk-consult' }, ui.h('summary', null, '🤔 ' + H.nameOf(p.consult.who, names) + 'に聞きに行く'),
      V().talkLines(ui, [['player', p.consult.q], ...p.consult.lines], names, 'consult-talk')) : null;
    return ui.h('section', { class: 'card exercise', id: 'wk-task' },
      ui.h('h2', null, H.fill(p.title, names)),
      p.story ? V().talkLines(ui, [[p.by, p.story]], names, 'story') : null,
      p.file ? ui.h('p', { class: 'muted small' }, p.file) : null,
      V().problemWidget(ui, p, w, names, done, refresh),
      ui.h('div', { class: 'row' },
        !done ? ui.h('button', { id: 'wk-submit', class: 'btn primary', onclick: () => submit(ui, pr, p, false) }, p.type === 'talk' ? 'これで答える' : '提出する') : null,
        !done ? ui.h('button', { id: 'wk-hint', class: 'btn', disabled: w.hint >= p.hints.length, onclick: () => refresh(() => { w.hint += 1; }) }, w.hint >= p.hints.length ? 'ヒントはここまで' : 'ヒント ' + (w.hint + 1) + '/' + p.hints.length) : null,
        !done && w.hint >= p.hints.length ? ui.h('button', { id: 'wk-reveal', class: 'btn warn', onclick: () => submit(ui, pr, p, true) }, '答えを見る') : null),
      w.hint ? ui.h('ol', { class: 'hints', 'aria-label': 'ヒント' }, p.hints.slice(0, w.hint).map((t, i) => ui.h('li', null, ui.h('strong', null, 'ヒント' + (i + 1) + ': '), H.fill(t, names)))) : null,
      consult,
      V().feedbackBox(ui, p, w, names),
      done ? ui.h('div', { class: 'stack highlight-box', id: 'wk-why' }, ui.h('h3', null, w.revealed ? '答えと解説' : '正解！'), V().explain(ui, p, names), opts.after()) : null);
  }

  function submit(ui, pr, p, reveal) {
    const w = workOf(pr, p);
    ui.update((s) => {
      if (reveal) {
        Object.assign(w, W.answerWork(p), { revealed: true, result: null, sel: null });
        const prev = pr.solved[p.id];
        pr.solved = { ...pr.solved, [p.id]: { revealed: !(prev && !prev.revealed), at: ui.now() } };
        if (pr.solved[p.id].revealed) s.retry = [...(s.retry || []).filter((x) => x.ref !== 'work/' + p.id), { kind: 'work', ref: 'work/' + p.id, title: '配属先「' + H.fill(p.title, V().namesOf(s)) + '」', href: '#/work/p/' + p.id, time: ui.now() }].slice(-50);
      } else {
        const r = W.grade(p, w);
        w.tries += 1;
        w.result = r;
        if (r.pass) {
          pr.solved = { ...pr.solved, [p.id]: { revealed: false, at: ui.now() } };
          s.retry = (s.retry || []).filter((x) => x.ref !== 'work/' + p.id);
        }
      }
    });
    if (!reveal && w.result && w.result.pass) { ui.toast('正解です！', 'ok'); ui.sfx('pass'); }
    ui.render();
  }

  function finishWeek(ui, pr, week) {
    const st = (p) => (p && pr.work[p.id] && pr.work[p.id].revealed ? 'revealed' : 'self');
    const inc = incidentProblem(pr);
    const outcome = { event: st(week.task), incident: inc ? st(inc) : null };
    const res = W.simulateWeek(pr.metrics, pr.alloc, outcome);
    const boss = W.bossComment(res.metrics, res.deltas, pr.alloc);
    ui.update(() => {
      pr.history = [...pr.history, { no: week.no, alloc: { ...pr.alloc }, deltas: res.deltas, notes: res.notes, boss, incident: pr.incident, outcome, metrics: res.metrics }];
      pr.metrics = res.metrics;
      pr.phase = 'report';
    });
    ui.sfx('pass');
    ui.render();
  }

  function reportView(ui, pr, week, names) {
    const h = pr.history[pr.history.length - 1];
    const isLast = week.no >= W.TOTAL_WEEKS;
    return ui.h('section', { class: 'card highlight', id: 'wk-report' },
      ui.h('h2', null, '第' + week.no + '週の週報'),
      ui.h('ul', { class: 'small' }, [
        '今週の仕事: ' + (h.outcome.event === 'self' ? '自力で対応' : '答えを見て対応'),
        h.incident ? '障害: ' + (h.outcome.incident === 'self' ? '自力で原因を特定' : '答えを見て対応') : '障害: なし',
        ...h.notes,
      ].map((t) => ui.h('li', null, t))),
      V().talkLines(ui, [h.boss], names),
      ui.h('h3', null, '振り返り'),
      V().talkLines(ui, week.retro, names),
      ui.h('div', { class: 'row end' }, ui.h('button', { id: 'wk-next-week', class: 'btn primary', onclick: () => {
        ui.update(() => {
          if (isLast) pr.phase = 'done';
          else { pr.week += 1; pr.phase = 'plan'; pr.incident = null; }
        });
        if (isLast) ui.celebrate('done', '1年目、おつかれさま！', '年次評価を見てみましょう');
        ui.render();
      } }, isLast ? '1年目を締めくくる' : '第' + (week.no + 1) + '週へ')));
  }

  function doneView(ui, pr, names) {
    const r = W.annualReview(pr);
    return ui.h('section', { class: 'card highlight', id: 'wk-done' },
      ui.h('h2', null, '1年目の年次評価: ' + r.grade),
      ui.h('p', null, '24週で取り組んだ仕事と障害のうち、自力で解いたのは ' + r.self + ' / ' + r.total + '。'),
      V().talkLines(ui, [
        ['kumagai', '1年間おつかれさま、{player}くん。数字もいいけど、いちばんの成果は「仕事の進め方」が身についたことだと思うなぁ。'],
        ['shiraishi', '聞き方・伝え方・決め方。どれも、もう安心して任せられるよ。2年目は、後輩に教える側だね。'],
      ], names),
      ui.h('div', { class: 'row end' }, ui.h('button', { id: 'wk-restart', class: 'btn', onclick: () => {
        if (!window.confirm('配属先モードを第1週からやり直しますか？（ほかの記録は消えません）')) return;
        ui.update((s) => { s.work = W.emptyProgress(); });
        ui.render();
      } }, '第1週からやり直す')));
  }

  function historyView(ui, pr) {
    if (!pr.history.length) return null;
    return ui.h('details', { class: 'card', id: 'wk-history' }, ui.h('summary', null, 'これまでの週報（' + pr.history.length + '週）'),
      ui.h('div', { class: 'table-wrap' }, ui.h('table', { class: 'log' },
        ui.h('thead', null, ui.h('tr', null, ['週', '配分（新/品/運/休）', '障害', '利用者', '評価', '負債', '体力', '信頼'].map((t) => ui.h('th', { scope: 'col' }, t)))),
        ui.h('tbody', null, pr.history.map((x) => ui.h('tr', null,
          ui.h('td', null, String(x.no)),
          ui.h('td', null, [x.alloc.feature, x.alloc.quality, x.alloc.ops, x.alloc.care].join(' / ')),
          ui.h('td', null, x.incident ? (x.outcome.incident === 'self' ? '自力' : '答え') : '—'),
          ui.h('td', null, x.metrics.users.toLocaleString('ja-JP')),
          ui.h('td', null, x.metrics.rating.toFixed(1)),
          ui.h('td', null, String(x.metrics.debt)),
          ui.h('td', null, String(x.metrics.stamina)),
          ui.h('td', null, String(x.metrics.trust))))))));
  }

  // ---------------------------------------------------------------- 解き直し
  function viewRetry(ui, id) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = V().namesOf(state);
    const found = W.findProblem(id);
    if (!found) return ui.h('div', { class: 'page' }, ui.h('p', null, '問題が見つかりません。'), ui.h('a', { href: '#/work' }, '配属先へ'));
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/work' }, '配属先'), ' › 解き直し'),
      ui.h('p', { class: 'note small' }, '解き直しです。週の数字には影響しません。'),
      problemCard(ui, pr, found.problem, names, { after: () => ui.h('div', { class: 'row end' }, ui.h('a', { class: 'btn', href: '#/work', id: 'wk-back' }, '配属先へ戻る')) }),
      found.problem && pr.work[found.problem.id] && (pr.work[found.problem.id].revealed || (pr.work[found.problem.id].result || {}).pass)
        ? ui.h('button', { id: 'wk-retry-again', class: 'btn ghost', onclick: () => { ui.update(() => { pr.work[found.problem.id] = null; }); ui.render(); } }, 'もう一度解き直す') : null);
  }

  RGA.workView = { view, progressOf };
})(globalThis);
