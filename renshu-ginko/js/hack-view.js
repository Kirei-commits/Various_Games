/*
 * ハッカソン・レビューモードの画面（ブラウザ専用）
 *   #/hack            ハッカソンのホーム（スプリントの一覧・ベロシティ・答えを見た問題）
 *   #/hack/s/N        スプリント（ブリーフィング → スプリントボード → 振り返り）
 *   #/hack/p/ID       問題（読む・レビューする・直し方を選ぶ・コンフリクトを解く・コメントを書く・関係者に答える）
 *   #/hack/team[/ID]  チームと話す（選択肢の会話。API キーがあれば自由チャットも）
 * app.js が用意する ui（h・update・render など）を受け取って描く。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const H = RGA.hack;

  function progressOf(state) {
    if (!state.hack) state.hack = H.emptyProgress();
    for (const k of Object.keys(H.emptyProgress())) if (!state.hack[k]) state.hack[k] = {};
    return state.hack;
  }
  function namesOf(state) {
    return { ...(state.settings.names || {}), player: state.user ? state.user.name : 'あなた' };
  }
  function workOf(pr, p) {
    if (!pr.work[p.id]) pr.work[p.id] = { hint: 0, marks: {}, line: null, choice: null, text: '', sel: null, tries: 0, result: null };
    return pr.work[p.id];
  }

  function view(ui, args) {
    const sub = args[0];
    if (sub === 's') return viewSprint(ui, Number(args[1]));
    if (sub === 'p') return viewProblem(ui, args[1]);
    if (sub === 'team') return viewTeam(ui, args[1]);
    return viewHackHome(ui);
  }

  // ---------------------------------------------------------------- 共通の部品
  function avatar(ui, id, names) {
    const c = H.CAST_BY_ID[id];
    return ui.h('span', { class: 'avatar', title: c ? c.role : '' }, c ? c.icon : '🙂');
  }
  function talkLines(ui, lines, names, cls) {
    return ui.h('div', { class: 'talk ' + (cls || '') }, lines.map(([who, text]) => ui.h('div', { class: 'bubble-row' + (who === 'player' ? ' me' : '') },
      avatar(ui, who, names),
      ui.h('div', { class: 'bubble' }, ui.h('strong', null, H.nameOf(who, names)), ui.h('span', { class: 'role muted tiny' }, (H.CAST_BY_ID[who] || {}).role || ''), ui.h('p', null, H.fill(text, names))))));
  }
  // 行番号つきのコード。onLine を渡すと行を押せる
  function codeLines(ui, code, opts) {
    const o = opts || {};
    const lines = String(code).split('\n');
    return ui.h('ol', { class: 'hk-code', 'aria-label': o.label || 'コード（行番号つき）' }, lines.map((text, i) => {
      const n = i + 1;
      const mark = o.marks && o.marks[n];
      const cls = 'hk-line' + (o.focus && o.focus.includes(n) ? ' focus' : '') + (o.sel === n ? ' sel' : '') + (mark ? ' marked' : '') + (o.answer && o.answer.includes(n) ? ' answer' : '');
      const body = [ui.h('span', { class: 'ln', 'aria-hidden': 'true' }, String(n)), ui.h('code', null, text || ' '), mark ? ui.h('span', { class: 'kind-badge' }, mark) : null];
      return ui.h('li', { class: cls }, o.onLine && text.trim()
        ? ui.h('button', { class: 'hk-line-btn', id: (o.idPrefix || 'line-') + n, 'aria-pressed': o.sel === n ? 'true' : 'false', 'aria-label': n + '行目: ' + text.trim() + (mark ? '（' + mark + '）' : ''), onclick: () => o.onLine(n) }, body)
        : ui.h('div', { class: 'hk-line-static' }, body));
    }));
  }
  function langTag(ui, p) {
    return ui.h('span', { class: 'tag lang-' + p.lang }, H.LANGS[p.lang] || p.lang);
  }
  // 分からないことを聞きに行く（ハッカソンの外の同期・友人・先輩）。押すと会話が開く
  function consultBlock(ui, sprint, pr, names, idp) {
    const list = H.consultsOf(sprint.no);
    if (!list.length) return null;
    return ui.h('div', { class: 'consults stack' }, list.map((c, i) => {
      const key = sprint.no + '-' + i;
      const who = H.CAST_BY_ID[c.who];
      const open = pr.consulted[key];
      return ui.h('div', { class: 'consult' },
        ui.h('button', { class: 'btn consult-btn' + (open ? ' primary' : ''), id: (idp || 'hk-consult-') + i, 'aria-expanded': open ? 'true' : 'false', onclick: () => { ui.update(() => { pr.consulted[key] = !open; }); ui.render(); } },
          who.icon + ' ' + H.nameOf(c.who, names) + 'に聞く: ' + c.topic),
        open ? talkLines(ui, [['player', c.q], ...c.lines], names, 'consult-talk') : null);
    }));
  }

  const TYPE_NAME = { order: '順番に並べる', review: '同期のコードをレビュー', fix: '自分のコードを直す', conflict: 'コンフリクトを解く', predict: '動きを読む', comment: 'レビューコメントを書く', talk: '関係者の割り込み' };

  // ---------------------------------------------------------------- ハッカソンのホーム
  function viewHackHome(ui) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = namesOf(state);
    const upTo = H.unlockedUpTo(pr);
    const vel = H.velocity(pr);
    const maxTotal = Math.max(1, ...vel.map((v) => v.total));
    const current = H.SPRINTS.find((s) => s.no === upTo);
    const retry = (state.retry || []).filter((r) => r.kind === 'hack');
    const done = H.released(pr);
    return ui.h('div', { class: 'page' },
      ui.h('h1', null, '研修ハッカソン: AIお金相談チャット'),
      ui.guide('hack', 'ハッカソン・レビューモードとは', [
        '6人のアジャイルチームで、練習銀行の新サービス「AIお金相談チャット」を' + H.TOTAL_SPRINTS + 'スプリントでリリースします。',
        '問題はすべて「読む・レビューする」もの。コードを書けなくても進められます。',
        '各スプリントの最初に、その章で使う知識が配られます。ヒントは3〜5段階、全部開けると「答えを見る」で先に進めます。',
        '登場人物の名前は仮です。設定で好きな名前に変えられます。',
      ]),
      done ? ui.h('section', { class: 'card highlight', id: 'hk-released' }, ui.h('h2', null, '🎉 リリースしました！'), ui.h('p', null, '「AIお金相談チャット」は無事にリリースされました。答えを見た問題に、もう一度挑戦してみましょう。')) : null,
      ui.h('div', { class: 'home-grid' },
        current ? ui.h('section', { class: 'card next-unit' },
          ui.h('p', { class: 'eyebrow' }, 'いまのスプリント'),
          ui.h('h2', null, 'スプリント' + current.no + '「' + current.title + '」'),
          ui.h('p', { class: 'muted' }, 'ゴール: ' + current.goal),
          ui.h('p', { class: 'small' }, 'スクラムマスター: ' + H.CAST_BY_ID[current.sm].icon + ' ' + H.nameOf(current.sm, names)),
          ui.h('button', { id: 'hk-continue', class: 'btn primary big', onclick: () => ui.go('#/hack/s/' + current.no) }, H.sprintStatus(pr, current).done ? '続きから' : 'スプリントを始める')) : null,
        ui.h('section', { class: 'card' },
          ui.h('p', { class: 'eyebrow' }, 'ベロシティ（スプリントごとのポイント）'),
          ui.h('div', { class: 'velocity', role: 'img', 'aria-label': 'スプリントごとに終えたポイント。答えを見た問題は半分で数えます' }, vel.map((v) => ui.h('div', { class: 'vbar', title: 'S' + v.no + ': ' + v.points + '/' + v.total + 'pt' },
            ui.h('span', { class: 'vfill', style: 'height:' + Math.round((v.points / maxTotal) * 100) + '%' }), ui.h('small', null, String(v.no))))),
          ui.h('p', { class: 'muted tiny' }, '答えを見て進んだ問題は半分のポイントで数えます（記録はあなたの振り返り用で、誰にも公開しません）。')),
        ui.h('section', { class: 'card' },
          ui.h('p', { class: 'eyebrow' }, 'チーム'),
          ui.h('ul', { class: 'cast-mini' }, H.CAST.filter((c) => c.group === 'team').map((c) => ui.h('li', null, c.icon + ' ' + H.nameOf(c.id, names), ui.h('small', { class: 'muted' }, ' ' + c.role)))),
          ui.h('a', { class: 'btn', id: 'hk-team', href: '#/hack/team' }, 'チームと話す'))),
      unreadCard(ui, names),
      smallTalkCard(ui, upTo, names),
      ui.h('section', { class: 'card' }, ui.h('h2', null, 'スプリント'),
        ui.h('ol', { class: 'sprint-grid' }, H.SPRINTS.map((s) => {
          const st = H.sprintStatus(pr, s);
          const locked = s.no > upTo;
          return ui.h('li', { class: 'sprint-card' + (st.complete ? ' done' : '') + (locked ? ' locked' : '') + (s.no === upTo && !done ? ' here' : '') },
            locked ? ui.h('span', { class: 'sprint-btn', 'aria-disabled': 'true' }, ui.h('b', null, 'S' + s.no), ui.h('span', null, '🔒 まだ開いていません'))
              : ui.h('a', { class: 'sprint-btn', id: 'hk-sprint-' + s.no, href: '#/hack/s/' + s.no }, ui.h('b', null, 'S' + s.no + (st.complete ? ' ✓' : '')), ui.h('span', null, s.title), ui.h('small', { class: 'muted' }, st.done + '/' + st.count)));
        })),
        H.SPRINTS.length < H.TOTAL_SPRINTS ? ui.h('p', { class: 'muted small' }, 'スプリント' + (H.SPRINTS.length + 1) + '以降は準備中です。') : null),
      retry.length ? ui.h('section', { class: 'card', id: 'hk-retry' }, ui.h('h2', null, '答えを見た問題（もう一度挑戦）'),
        ui.h('ul', null, retry.map((r) => ui.h('li', null, ui.h('a', { href: r.href }, r.title))))) : null);
  }

  function unreadCard(ui, names) {
    if (!RGA.bonds) return null;
    const list = RGA.bonds.unreadEpisodes(ui.state());
    if (!list.length) return null;
    return ui.h('section', { class: 'card highlight', id: 'hk-new-episodes' }, ui.h('h2', null, '📖 新しいエピソードが読めます'),
      ui.h('ul', null, list.map((e) => ui.h('li', null, ui.h('a', { href: '#/hack/team/' + e.char }, H.CAST_BY_ID[e.char].icon + ' ' + H.nameOf(e.char, names) + '「' + e.title + '」')))));
  }

  // 毎日しゃべる同期との雑談（物語には直接かかわらない）
  function smallTalkCard(ui, no, names) {
    const t = H.smallTalkOf(no);
    if (!t) return null;
    return ui.h('section', { class: 'card', id: 'hk-smalltalk' }, ui.h('h2', null, '☕ 今日の雑談'), talkLines(ui, t.lines, names));
  }

  // このスプリントで使う知識を予習できる言語テキストの章
  function relatedTexts(ui, no) {
    if (!RGA.journey || !RGA.texts) return null;
    const list = RGA.journey.chaptersOfSprint(no);
    if (!list.length) return null;
    return ui.h('div', { class: 'related', id: 'hk-related' }, ui.h('h3', { class: 'small' }, '📚 予習できるテキスト'),
      ui.h('ul', null, list.map(({ course, chapter }) => ui.h('li', null, ui.h('a', { href: '#/texts/s/' + chapter.sections[0].id }, course.icon + ' ' + course.name + ' ' + (course.chapters.indexOf(chapter) + 1) + '章「' + chapter.title + '」')))));
  }

  // ---------------------------------------------------------------- スプリント
  function viewSprint(ui, no) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = namesOf(state);
    const s = H.SPRINTS.find((x) => x.no === no);
    if (!s || no > H.unlockedUpTo(pr)) return ui.h('div', { class: 'page' }, ui.h('p', null, 'このスプリントはまだ開いていません。'), ui.h('a', { href: '#/hack' }, 'ハッカソンへ'));
    const st = H.sprintStatus(pr, s);
    const briefed = pr.briefed[s.no];
    const list = H.problemsOf(s);
    const col = (title, items) => ui.h('div', { class: 'board-col' }, ui.h('h3', null, title + '（' + items.length + '）'), ui.h('ul', null, items.map((p) => ui.h('li', null,
      ui.h('a', { class: 'ticket', id: 'hk-open-' + p.id, href: '#/hack/p/' + p.id }, ui.h('span', { class: 'muted tiny' }, p.id + ' ・ ' + TYPE_NAME[p.type] + ' ・ ' + p.points + 'pt'), ui.h('strong', null, H.fill(p.title, names)),
        pr.solved[p.id] && pr.solved[p.id].revealed ? ui.h('small', { class: 'warn-text' }, '答えを見た') : null)))));
    const working = (p) => !pr.solved[p.id] && pr.work[p.id] && (pr.work[p.id].tries || pr.work[p.id].hint);
    const next = H.SPRINTS.find((x) => x.no === no + 1);
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/hack' }, 'ハッカソン'), ' › スプリント' + s.no),
      ui.h('h1', null, 'スプリント' + s.no + '「' + s.title + '」'),
      ui.h('p', { class: 'muted' }, 'スプリントゴール: ' + s.goal + ' ／ スクラムマスター: ' + H.CAST_BY_ID[s.sm].icon + ' ' + H.nameOf(s.sm, names)),
      ui.h('section', { class: 'card handout', id: 'hk-handout' }, ui.h('h2', null, '📄 この章で配られた資料'),
        ui.h('p', { class: 'small' }, 'この章では、次の単元と知識を使います。'),
        ui.h('ul', null, s.knowledge.map((k) => ui.h('li', null, k))),
        relatedTexts(ui, s.no)),
      ui.h('section', { class: 'card' }, ui.h('h2', null, 'スプリントプランニング'),
        talkLines(ui, s.briefing, names),
        !briefed ? ui.h('div', { class: 'row end' }, ui.h('button', { id: 'hk-start', class: 'btn primary', onclick: () => { ui.update(() => { pr.briefed[s.no] = true; }); ui.render(); } }, 'スプリントを始める')) : null),
      H.consultsOf(s.no).length ? ui.h('section', { class: 'card', id: 'hk-consults' }, ui.h('h2', null, '🤔 分からないことは聞きに行こう'),
        ui.h('p', { class: 'muted small' }, 'ハッカソンの外の同期や先輩に、この章の知識を聞けます（何度でも・記録には影響しません）。'),
        consultBlock(ui, s, pr, names)) : null,
      briefed ? ui.h('section', { class: 'card' }, ui.h('h2', null, 'スプリントボード'),
        ui.h('p', { class: 'muted small' }, st.points + ' / ' + st.total + ' pt'),
        ui.h('div', { class: 'board' },
          col('ToDo', list.filter((p) => !pr.solved[p.id] && !working(p))),
          col('Doing', list.filter(working)),
          col('Done', list.filter((p) => pr.solved[p.id])))) : null,
      st.complete ? ui.h('section', { class: 'card highlight', id: 'hk-retro' }, ui.h('h2', null, 'スプリントレトロスペクティブ'),
        talkLines(ui, s.retro, names),
        ui.h('div', { class: 'row end' }, next ? ui.h('button', { id: 'hk-next-sprint', class: 'btn primary', onclick: () => ui.go('#/hack/s/' + next.no) }, 'スプリント' + next.no + 'へ')
          : ui.h('button', { id: 'hk-back', class: 'btn primary', onclick: () => ui.go('#/hack') }, 'ハッカソンのホームへ'))) : null);
  }

  // ---------------------------------------------------------------- 問題
  function viewProblem(ui, id) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = namesOf(state);
    const found = H.findProblem(id);
    if (!found || found.sprint.no > H.unlockedUpTo(pr)) return ui.h('div', { class: 'page' }, ui.h('p', null, 'この問題はまだ開いていません。'), ui.h('a', { href: '#/hack' }, 'ハッカソンへ'));
    const { sprint, problem: p } = found;
    const w = workOf(pr, p);
    const solved = pr.solved[p.id];
    const done = !!(w.result && w.result.pass) || !!w.revealed;
    const refresh = (fn) => { ui.update(() => fn()); ui.render(); };
    const list = H.problemsOf(sprint);
    const nextP = list.find((x) => x.id !== p.id && !pr.solved[x.id]);

    const head = ui.h('div', { class: 'stack' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/hack' }, 'ハッカソン'), ' › ', ui.h('a', { href: '#/hack/s/' + sprint.no }, 'スプリント' + sprint.no), ' › ' + p.id),
      ui.h('h1', null, H.fill(p.title, names)),
      ui.h('p', { class: 'row small' }, langTag(ui, p), ui.h('span', { class: 'tag' }, TYPE_NAME[p.type]), ui.h('span', { class: 'tag' }, p.points + 'pt'), solved ? ui.h('span', { class: 'tag ok' }, solved.revealed ? '答えを見て完了' : '完了') : null),
      p.story ? talkLines(ui, [[p.by, p.story]], names, 'story') : null);

    const body = problemWidget(ui, p, w, names, done, refresh);
    const hints = p.hints;
    const controls = ui.h('div', { class: 'row' },
      !done ? ui.h('button', { id: 'hk-submit', class: 'btn primary', onclick: () => submit(ui, sprint, p) }, p.type === 'talk' ? 'これで答える' : '提出する') : null,
      !done ? ui.h('button', { id: 'hk-hint', class: 'btn', disabled: w.hint >= hints.length, onclick: () => refresh(() => { w.hint += 1; }) }, w.hint >= hints.length ? 'ヒントはここまで' : 'ヒント ' + (w.hint + 1) + '/' + hints.length) : null,
      !done && w.hint >= hints.length ? ui.h('button', { id: 'hk-reveal', class: 'btn warn', onclick: () => reveal(ui, sprint, p) }, '答えを見る') : null,
      done ? ui.h('button', { id: 'hk-retry-btn', class: 'btn ghost', onclick: () => refresh(() => { pr.work[p.id] = null; workOf(pr, p).hint = 0; }) }, 'もう一度解き直す') : null);
    const hintList = w.hint ? ui.h('ol', { class: 'hints', 'aria-label': 'ヒント' }, hints.slice(0, w.hint).map((t, i) => ui.h('li', null, ui.h('strong', null, 'ヒント' + (i + 1) + ': '), H.fill(t, names)))) : null;
    const feedback = feedbackBox(ui, p, w, names);
    const after = done ? ui.h('section', { class: 'card highlight', id: 'hk-why' },
      ui.h('h2', null, w.revealed ? '答えと解説' : '正解！'),
      w.revealed ? ui.h('p', { class: 'note small' }, '「答えを見た問題」に入れました。ハッカソンのホームから、もう一度挑戦できます。') : null,
      explain(ui, p, names),
      ui.h('div', { class: 'row end' },
        nextP ? ui.h('button', { id: 'hk-next', class: 'btn primary', onclick: () => ui.go('#/hack/p/' + nextP.id) }, '次のタスクへ')
          : ui.h('button', { id: 'hk-to-sprint', class: 'btn primary', onclick: () => ui.go('#/hack/s/' + sprint.no) }, 'スプリントボードへ'))) : null;
    const consult = !done && H.consultsOf(sprint.no).length ? ui.h('details', { class: 'consult-inline', id: 'hk-consult-box' }, ui.h('summary', null, '🤔 分からないときは聞きに行く'), consultBlock(ui, sprint, pr, names, 'hk-pconsult-')) : null;
    return ui.h('div', { class: 'page' }, head, ui.h('section', { class: 'card exercise' }, body, controls, hintList, consult, feedback), after);
  }

  function problemWidget(ui, p, w, names, done, refresh) {
    const h = ui.h;
    if (p.type === 'review') {
      const kindName = (k) => (H.REVIEW_KINDS.find((x) => x.id === k) || {}).name;
      const marks = Object.fromEntries(Object.entries(w.marks || {}).filter(([, k]) => k).map(([l, k]) => [l, kindName(k)]));
      return h('div', { class: 'stack' },
        h('p', { class: 'prompt' }, '気になる行を押して、指摘の種類を選んでください。欠陥をすべて見つけたら提出します。'),
        h('p', { class: 'muted small' }, p.file),
        codeLines(ui, p.code, { marks, sel: w.sel, answer: done ? p.defects.map((d) => d.line) : null, onLine: done ? null : (n) => refresh(() => { w.sel = n; }), idPrefix: 'hk-line-' }),
        !done && w.sel ? h('div', { class: 'kind-picker', role: 'group', 'aria-label': w.sel + '行目の指摘の種類' },
          h('span', { class: 'small' }, w.sel + '行目: '),
          H.REVIEW_KINDS.map((k) => h('button', { class: 'btn tiny' + (w.marks[w.sel] === k.id ? ' primary' : ''), id: 'hk-kind-' + k.id, onclick: () => refresh(() => { w.marks = { ...w.marks, [w.sel]: k.id }; w.sel = null; }) }, k.name)),
          w.marks[w.sel] ? h('button', { class: 'btn tiny ghost', id: 'hk-kind-clear', onclick: () => refresh(() => { const m = { ...w.marks }; delete m[w.sel]; w.marks = m; w.sel = null; }) }, '指摘を外す') : null) : null);
    }
    if (p.type === 'fix') {
      return h('div', { class: 'stack' },
        h('p', { class: 'prompt' }, p.lang === 'text' ? '① 原因の手がかりになる行を押してください。② 最初にやる対処を選んでください。' : '① バグのある行を押してください。② 正しい直し方を選んでください。'),
        h('p', { class: 'muted small' }, p.file),
        codeLines(ui, p.code, { sel: w.line, answer: done ? [p.bugLine] : null, onLine: done ? null : (n) => refresh(() => { w.line = n; }), idPrefix: 'hk-line-' }),
        h('fieldset', { class: 'quiz' }, h('legend', null, p.lang === 'text' ? '最初にやる対処' : '直し方' + (w.line ? '（' + w.line + '行目を）' : '')),
          h('div', { class: 'choices' }, p.fixes.map((f, i) => h('label', { class: 'choice' },
            h('input', { type: 'radio', name: 'hk-fix', id: 'hk-choice-' + i, value: String(i), checked: w.choice === i, disabled: done, onchange: () => refresh(() => { w.choice = i; }) }),
            h('code', null, f))))));
    }
    if (p.type === 'conflict') {
      return h('div', { class: 'stack' },
        h('p', { class: 'prompt' }, 'マージでコンフリクトが起きました。両方の変更の意図を読んで、正しい解決を選んでください。'),
        h('p', { class: 'note small' }, H.fill(p.context, names)),
        h('p', { class: 'muted small' }, p.file),
        h('pre', { class: 'code conflict' }, h('code', null, String(p.conflict).split('\n').map((line) => h('span', { class: /^<<<<<<< /.test(line) ? 'cf-ours' : /^=======$/.test(line) ? 'cf-mid' : /^>>>>>>> /.test(line) ? 'cf-theirs' : '' }, line + '\n')))),
        h('fieldset', { class: 'quiz' }, h('legend', null, '解決後のコード'),
          h('div', { class: 'choices' }, p.options.map((o, i) => h('label', { class: 'choice block' },
            h('input', { type: 'radio', name: 'hk-cf', id: 'hk-choice-' + i, value: String(i), checked: w.choice === i, disabled: done, onchange: () => refresh(() => { w.choice = i; }) }),
            h('pre', { class: 'code small' }, h('code', null, o)))))));
    }
    if (p.type === 'predict') {
      return h('div', { class: 'stack' },
        p.code ? codeLines(ui, p.code) : null,
        h('fieldset', { class: 'quiz' }, h('legend', null, H.fill(p.q, names)),
          h('div', { class: 'choices' }, p.choices.map((c, i) => h('label', { class: 'choice' },
            h('input', { type: 'radio', name: 'hk-pq', id: 'hk-choice-' + i, value: String(i), checked: w.choice === i, disabled: done, onchange: () => refresh(() => { w.choice = i; }) }),
            h('code', null, c))))));
    }
    if (p.type === 'comment') {
      return h('div', { class: 'stack' },
        h('p', { class: 'muted small' }, p.file),
        codeLines(ui, p.code, { focus: p.focus }),
        h('label', { class: 'field' }, h('span', null, H.fill(p.prompt, names)),
          h('textarea', { id: 'hk-comment', rows: '5', value: w.text || '', disabled: done, placeholder: '何が問題か・なぜ・どう直すか。良いところもひとこと添えると伝わりやすくなります。', oninput: (e) => { w.text = e.target.value; ui.persist(); } })));
    }
    if (p.type === 'order') {
      if (!w.order || w.order.length !== p.items.length) w.order = H.initialOrder(p);
      const move = (i, j) => refresh(() => { const o = [...w.order]; [o[i], o[j]] = [o[j], o[i]]; w.order = o; });
      return h('div', { class: 'stack' },
        p.prompt ? h('p', { class: 'prompt' }, H.fill(p.prompt, names)) : h('p', { class: 'prompt' }, '正しい順番に並べ替えてください。'),
        h('ol', { class: 'order-list', 'aria-label': '手順（上から順）' }, w.order.map((item, i) => h('li', { class: 'order-item' },
          h('span', { class: 'order-text' }, H.fill(item, names)),
          done ? null : h('span', { class: 'ops' },
            h('button', { class: 'icon', id: 'hk-up-' + i, 'aria-label': (i + 1) + '番目を上へ', disabled: i === 0, onclick: () => move(i, i - 1) }, '↑'),
            h('button', { class: 'icon', id: 'hk-down-' + i, 'aria-label': (i + 1) + '番目を下へ', disabled: i === w.order.length - 1, onclick: () => move(i, i + 1) }, '↓'))))));
    }
    // talk
    return h('div', { class: 'stack' },
      talkLines(ui, [[p.from, p.text]], names),
      h('fieldset', { class: 'quiz' }, h('legend', null, 'どう答えますか？'),
        h('div', { class: 'choices' }, p.options.map((o, i) => h('label', { class: 'choice' },
          h('input', { type: 'radio', name: 'hk-talk', id: 'hk-choice-' + i, value: String(i), checked: w.choice === i, disabled: done, onchange: () => refresh(() => { w.choice = i; }) }),
          h('span', null, H.fill(o.text, names)))))));
  }

  function feedbackBox(ui, p, w, names) {
    const h = ui.h;
    const r = w.result;
    if (!r || r.pass) return h('div', { id: 'hk-feedback', 'aria-live': 'polite' });
    const items = [];
    if (p.type === 'review') {
      if (r.hits.length) items.push('見つけた欠陥: ' + r.hits.length + ' / ' + p.defects.length);
      if (r.wrongKind.length) items.push(r.wrongKind.join('・') + '行目は、場所は合っていますが種類が違います。');
      if (r.missed.length) items.push('まだ見つかっていない欠陥が ' + r.missed.length + ' 個あります。');
      if (r.extra.length > 1) items.push('欠陥ではない行への指摘が ' + r.extra.length + ' 個あります（1個までは大丈夫）。');
    } else if (p.type === 'fix') {
      items.push(r.lineOk ? '行は合っています。' : (p.lang === 'text' ? '手がかりになる行は別の場所です。' : 'バグのある行は別の場所です。'));
      items.push(r.fixOk ? (p.lang === 'text' ? '対処は合っています。' : '直し方は合っています。') : (p.lang === 'text' ? '最初にやる対処をもう一度考えてみましょう。' : '直し方をもう一度考えてみましょう。'));
    } else if (p.type === 'comment') {
      if (r.ng.length) items.push('言い方に気をつけましょう（「' + r.ng.join('」「') + '」）。指摘はコードに対して、理由とともに。');
      if (r.tooShort) items.push('もう少し具体的に書いてみましょう（何が・なぜ・どう直すか）。');
      if (r.missing.length) items.push('足りない観点（' + r.matched.length + ' / ' + r.need + ' 必要）: ' + r.missing.join('、'));
    } else if (p.type === 'order') {
      items.push('上から ' + r.prefix + ' 番目までは合っています。その次を考え直してみましょう。');
    } else if (p.type === 'talk' && r.option) {
      return h('div', { id: 'hk-feedback', 'aria-live': 'polite', class: 'stack' }, talkLines(ui, r.option.reply, names), r.option.note ? h('p', { class: 'warn-text small' }, H.fill(r.option.note, names)) : null, h('p', { class: 'small' }, 'もう一度、別の答え方を考えてみましょう。'));
    } else {
      items.push('違うようです。もう一度読んでみましょう。');
    }
    return h('div', { id: 'hk-feedback', 'aria-live': 'polite' }, h('ul', { class: 'missing' }, items.map((t) => h('li', null, t))));
  }

  function explain(ui, p, names) {
    const h = ui.h;
    const parts = [];
    if (p.type === 'review') parts.push(h('ul', null, p.defects.map((d) => h('li', null, h('strong', null, d.line + '行目（' + H.REVIEW_KINDS.find((k) => k.id === d.kind).name + '）: '), d.why))));
    if (p.type === 'fix') parts.push(p.lang === 'text' ? h('p', null, p.bugLine + '行目が手がかり。最初の対処: ' + p.fixes[p.answer]) : h('p', null, p.bugLine + '行目を ', h('code', null, p.fixes[p.answer]), ' に直します。'));
    if (p.type === 'conflict') parts.push(ui.codeBlock(p.options[p.answer]));
    if (p.type === 'predict') parts.push(h('p', null, '答え: ', h('code', null, p.choices[p.answer])));
    if (p.type === 'comment') parts.push(h('p', { class: 'small' }, 'コメントの例:'), h('blockquote', null, H.fill(p.sample, names)));
    if (p.type === 'order') parts.push(h('ol', null, p.items.map((x) => h('li', null, H.fill(x, names)))));
    if (p.type === 'talk') {
      const best = p.options.find((o) => o.best);
      parts.push(h('p', null, '答え方: ', H.fill(best.text, names)), talkLines(ui, best.reply, names));
    }
    parts.push(h('p', null, H.fill(p.why, names)));
    return h('div', { class: 'stack' }, parts);
  }

  function submit(ui, sprint, p) {
    const state = ui.state();
    const pr = progressOf(state);
    const w = workOf(pr, p);
    const r = H.grade(p, w);
    const before = H.sprintStatus(pr, sprint).complete;
    ui.update((s) => {
      w.tries += 1;
      w.result = r;
      if (r.pass) {
        s.hack = H.solve(pr, p, false, ui.now());
        s.retry = (s.retry || []).filter((x) => x.ref !== 'hack/' + p.id);
      }
    });
    if (r.pass) afterSolve(ui, sprint, before);
    ui.render();
  }
  function reveal(ui, sprint, p) {
    const state = ui.state();
    const pr = progressOf(state);
    const w = workOf(pr, p);
    const before = H.sprintStatus(pr, sprint).complete;
    ui.update((s) => {
      Object.assign(w, H.answerWork(p), { revealed: true, result: null, sel: null });
      s.hack = H.solve(pr, p, true, ui.now());
      if (!s.hack.solved[p.id].revealed) return; // もう自力で解いた問題は記録しない
      s.retry = [...(s.retry || []).filter((x) => x.ref !== 'hack/' + p.id), { kind: 'hack', ref: 'hack/' + p.id, title: 'スプリント' + sprint.no + ' ' + p.id + '「' + H.fill(p.title, namesOf(s)) + '」', href: '#/hack/p/' + p.id, time: ui.now() }].slice(-50);
    });
    afterSolve(ui, sprint, before, true);
    ui.render();
  }
  function afterSolve(ui, sprint, wasComplete, revealed) {
    const pr = progressOf(ui.state());
    if (!wasComplete && H.sprintStatus(pr, sprint).complete) {
      if (H.released(pr)) ui.celebrate('done', 'リリース！', '「AIお金相談チャット」が世に出ました');
      else ui.celebrate('review', 'スプリント' + sprint.no + ' 完了！', 'レトロスペクティブを見てみましょう');
    } else if (!revealed) {
      ui.toast('正解です！', 'ok');
      ui.sfx('pass');
    }
  }

  // ---------------------------------------------------------------- チームと話す
  const chatDraft = { text: '', sending: false };
  function viewTeam(ui, id) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = namesOf(state);
    const groups = [['team', 'チーム（同期）'], ['po', 'プロダクトオーナー'], ['user', 'ユーザー'], ['boss', '上司'], ['work', '配属先（モバイルバンキング開発グループ）'], ['friend', '同期（ほかの部署・チーム）'], ['outside', '友人（他社のBP）'], ['senpai', '先輩'], ['stake', '関係者']];
    const c = id && H.CAST_BY_ID[id] && id !== 'player' ? H.CAST_BY_ID[id] : null;
    const castBtn = (x) => ui.h('li', null, ui.h('a', { class: 'cast-btn' + (c && c.id === x.id ? ' sel' : ''), id: 'hk-talk-' + x.id, href: '#/hack/team/' + x.id },
      ui.h('span', { class: 'avatar' }, x.icon),
      ui.h('span', null, ui.h('strong', null, H.nameOf(x.id, names)), ui.h('small', { class: 'muted' }, x.role))));
    const list = ui.h('section', { class: 'card' }, ui.h('h2', null, '話す相手'),
      groups.map(([gid, title]) => ui.h('div', null, ui.h('h3', { class: 'small' }, title),
        ui.h('ul', { class: 'cast-list' }, H.CAST.filter((x) => x.group === gid && x.id !== 'player').map(castBtn)))),
      ui.h('p', { class: 'muted tiny' }, '名前は設定で変えられます。'));
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/hack' }, 'ハッカソン'), ' › チームと話す'),
      ui.h('h1', null, 'チームと話す'),
      ui.h('div', { class: 'team-grid' }, list, c ? chatPanel(ui, c, pr, names) : ui.h('section', { class: 'card' }, ui.h('p', { class: 'muted' }, '左から話す相手を選んでください。'))));
  }
  // 絆とエピソード（エピソードのある人だけ）
  function bondBlock(ui, c, pr, names) {
    const B = RGA.bonds;
    if (!B || !B.charsWithEpisodes().includes(c.id)) return null;
    const state = ui.state();
    const pts = B.bondPoints(state, c.id);
    const lv = B.bondLevel(pts);
    const next = B.nextLevelAt(pts);
    const eps = B.episodesOf(state, c.id);
    if (!pr.episodes) pr.episodes = {};
    return ui.h('div', { class: 'bond', id: 'hk-bond' },
      ui.h('p', { class: 'small' }, '🤝 絆 Lv' + lv + '（' + pts + (next ? ' / 次は ' + next : '') + '）'),
      ui.h('span', { class: 'bar' }, ui.h('span', { style: 'width:' + Math.min(100, Math.round((pts / B.LEVELS[B.LEVELS.length - 1]) * 100)) + '%' })),
      ui.h('ul', { class: 'episodes' }, eps.map((e) => ui.h('li', null, e.unlocked
        ? ui.h('details', { id: 'hk-ep-' + e.key, open: pr.openEp === e.key, ontoggle: (ev) => { if (ev.target.open && !pr.episodes[e.key]) { ui.update(() => { pr.episodes = { ...pr.episodes, [e.key]: true }; pr.openEp = e.key; }); ui.render(); } } },
          ui.h('summary', null, '📖 エピソード' + e.level + '「' + e.title + '」' + (e.read ? '' : ' 🆕')), talkLines(ui, e.lines, names))
        : ui.h('span', { class: 'muted small' }, '🔒 エピソード' + e.level + '（絆 Lv' + e.level + ' で読めます）')))),
      ui.h('p', { class: 'muted tiny' }, '一緒にスプリントを終える・聞きに行く・話す・配属先で一緒に働くと、絆が深まります。'));
  }

  function chatPanel(ui, c, pr, names) {
    const h = ui.h;
    const state = ui.state();
    const log = pr.chat[c.id] || [];
    const sprint = H.SPRINTS.find((s) => s.no === H.unlockedUpTo(pr));
    const topics = [...(c.topics || [{ q: 'どんなことを気にしていますか？', a: c.persona }])];
    if (sprint) {
      const line = sprint.briefing.find(([who]) => who === c.id) || sprint.retro.find(([who]) => who === c.id);
      topics.push({ q: '今のスプリントのこと', a: line ? line[1] : 'スプリント' + sprint.no + 'は「' + sprint.goal + '」がゴールだよね。困ったら声をかけて。' });
    }
    const say = (q, a) => { ui.update(() => { pr.chat[c.id] = [...log, { role: 'user', text: q }, { role: 'char', text: a }].slice(-40); }); ui.render(); };
    const ai = !!(state.settings.apiKey && !state.settings.tutorStopped);
    return h('section', { class: 'card chat-panel' },
      h('div', { class: 'row' }, h('span', { class: 'avatar big' }, c.icon), h('div', null, h('h2', null, H.nameOf(c.id, names)), h('p', { class: 'muted small' }, c.role), c.field ? h('p', { class: 'small' }, '相談できること: ' + c.field) : null)),
      bondBlock(ui, c, pr, names),
      h('div', { class: 'talk', id: 'hk-chat-log', 'aria-live': 'polite' }, log.length ? log.map((m) => h('div', { class: 'bubble-row' + (m.role === 'user' ? ' me' : '') },
        h('span', { class: 'avatar' }, m.role === 'user' ? '🧑‍💻' : c.icon),
        h('div', { class: 'bubble' }, h('p', null, H.fill(m.text, names))))) : h('p', { class: 'muted small' }, '話題を選ぶと会話が始まります。')),
      h('div', { class: 'row wrap', role: 'group', 'aria-label': '話題' }, topics.map((t, i) => h('button', { class: 'btn tiny', id: 'hk-topic-' + i, onclick: () => say(t.q, t.a) }, t.q))),
      ai ? h('div', { class: 'stack' },
        h('label', { class: 'field' }, h('span', null, '自由に話す（Claude）'),
          h('textarea', { id: 'hk-free', rows: '2', value: chatDraft.text, placeholder: '個人情報や API キーは書かないでください', oninput: (e) => { chatDraft.text = e.target.value; } })),
        h('div', { class: 'row end' }, h('button', { id: 'hk-free-send', class: 'btn primary', disabled: chatDraft.sending, onclick: () => freeChat(ui, c, pr, names, sprint) }, chatDraft.sending ? '返事を待っています…' : '送る')))
        : h('p', { class: 'muted tiny' }, '設定で Claude の API キーを入れると、選択肢のほかに自由に話せます。'),
      log.length ? h('button', { class: 'btn tiny ghost', onclick: () => { ui.update(() => { pr.chat[c.id] = []; }); ui.render(); } }, '会話を消す') : null);
  }
  async function freeChat(ui, c, pr, names, sprint) {
    const state = ui.state();
    const text = chatDraft.text.trim();
    if (!text) return;
    const R = RGA.rules;
    const T = RGA.tutor;
    const mask = R.detectSensitive(text);
    if (mask.blocked) {
      ui.logAi({ unitId: 'hack', kind: 'hack-chat', input: R.redact(text), output: '（送信を止めました）', masking: { blocked: true, labels: mask.labels }, source: 'blocked' });
      ui.toast(mask.labels.join('・') + ' らしき内容があるので、送信を止めました', 'warn');
      return;
    }
    const log = pr.chat[c.id] || [];
    chatDraft.sending = true;
    ui.render();
    const env = ui.aiEnv();
    const model = T.pickModel(state.settings, env.spentUsd);
    const messages = [...log.slice(-8).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: text }];
    // 会話は user から始め、同じ役が続かないようにする
    while (messages.length && messages[0].role !== 'user') messages.shift();
    let reply;
    try {
      const out = await T.callClaude(env.fetchImpl, { apiKey: state.settings.apiKey, model, system: H.personaPrompt(c.id, names, sprint), messages, maxTokens: 500 });
      reply = R.limitCodeBlocks(out.text);
      ui.update((s) => { Object.assign(s, RGA.store.addSpend(s, T.costOf(out.model, out.usage), ui.now())); });
      ui.logAi({ unitId: 'hack', kind: 'hack-chat', input: text, output: reply, masking: { blocked: false, labels: [] }, source: 'llm', model: out.model });
    } catch (e) {
      reply = '（つながらなかったみたい。選択肢の話題なら、いつでも話せるよ）';
      ui.toast('Claude に接続できませんでした（' + e.message + '）', 'warn');
    }
    chatDraft.sending = false;
    chatDraft.text = '';
    ui.update(() => { pr.chat[c.id] = [...log, { role: 'user', text }, { role: 'char', text: reply }].slice(-40); });
    ui.render();
  }

  // 言語テキスト（text-view.js）も同じ部品で問題を描く
  RGA.hackView = { view, progressOf, namesOf, talkLines, codeLines, problemWidget, feedbackBox, explain, langTag, TYPE_NAME };
})(globalThis);
