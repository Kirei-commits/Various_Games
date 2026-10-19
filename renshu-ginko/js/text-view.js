/*
 * 言語テキストの画面（ブラウザ専用）
 *   #/texts              コースの一覧（JavaScript・React・Java・Python）と、もらったバッジ
 *   #/texts/c/ID         コース（章の一覧。章は順に開く）
 *   #/texts/s/節ID[/n]   節（会話・図・例のコード・要点 → 読解問題。n は節の中の何問目か）
 * 問題の部品はハッカソンと共通（hack-view.js の problemWidget など）。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const T = RGA.texts;
  const H = RGA.hack;
  const V = () => RGA.hackView;

  function progressOf(state) {
    if (!state.texts) state.texts = T.emptyProgress();
    for (const k of Object.keys(T.emptyProgress())) if (!state.texts[k]) state.texts[k] = {};
    return state.texts;
  }
  function workOf(pr, q) {
    if (!pr.work[q.id]) pr.work[q.id] = { hint: 0, marks: {}, line: null, choice: null, text: '', sel: null, tries: 0, result: null };
    return pr.work[q.id];
  }
  function findSection(id) {
    for (const c of T.COURSES) for (const ch of c.chapters) {
      const i = ch.sections.findIndex((s) => s.id === id);
      if (i >= 0) return { course: c, chapter: ch, section: ch.sections[i], index: i };
    }
    return null;
  }

  function view(ui, args) {
    if (args[0] === 'c') return viewCourse(ui, args[1]);
    if (args[0] === 's') return viewSection(ui, args[1], Number(args[2] || 0));
    return viewList(ui);
  }

  function badgeChip(ui, b) {
    return ui.h('span', { class: 'badge-chip' + (b.gold ? ' gold' : ''), title: b.gold ? '答えを見ずに全問正解' : '全問クリア' }, b.icon + ' ' + b.name);
  }

  // ---------------------------------------------------------------- コースの一覧
  function viewList(ui) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = V().namesOf(state);
    const badges = T.COURSES.flatMap((c) => c.chapters.map((ch) => T.badgeOf(pr, ch)).filter(Boolean));
    return ui.h('div', { class: 'page' },
      ui.h('h1', null, '言語テキスト'),
      ui.guide('texts', '言語テキストの使い方', [
        '書けなくても「読める」ようになるための読み物です。コードは動かさず、読んで答えます。',
        '章の最初に「この章で使う単元と知識」の資料が配られます。節ごとに会話・図・要点を読んで、読解問題に答えます。',
        'ヒントは3〜5段階。全部開けると「答えを見る」で先に進めます。章の問題を全部終えるとバッジ、答えを見ずに全部解くと金のバッジです。',
      ]),
      ui.h('div', { class: 'course-grid' }, T.COURSES.map((c) => {
        const st = T.courseStatus(pr, c);
        const teacher = H.CAST_BY_ID[c.teacher];
        return ui.h('a', { class: 'card course-card', id: 'tx-course-' + c.id, href: '#/texts/c/' + c.id },
          ui.h('span', { class: 'course-icon', 'aria-hidden': 'true' }, c.icon),
          ui.h('h2', null, c.name),
          ui.h('p', { class: 'muted small' }, '先生役: ' + teacher.icon + ' ' + H.nameOf(c.teacher, names)),
          ui.h('div', { class: 'meter', role: 'img', 'aria-label': st.done + ' / ' + st.total + ' 問' }, ui.h('span', { style: 'width:' + (st.total ? Math.round((st.done / st.total) * 100) : 0) + '%' })),
          ui.h('p', { class: 'small' }, '章 ' + st.chapters + ' / ' + st.count + ' ・ 問題 ' + st.done + ' / ' + st.total));
      })),
      badges.length ? ui.h('section', { class: 'card', id: 'tx-badges' }, ui.h('h2', null, 'もらったバッジ'), ui.h('div', { class: 'row wrap' }, badges.map((b) => badgeChip(ui, b)))) : null);
  }

  // ---------------------------------------------------------------- コース
  function viewCourse(ui, id) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = V().namesOf(state);
    const c = T.courseById(id);
    if (!c) return ui.h('div', { class: 'page' }, ui.h('p', null, 'コースが見つかりません。'), ui.h('a', { href: '#/texts' }, '言語テキストへ'));
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/texts' }, '言語テキスト'), ' › ' + c.name),
      ui.h('h1', null, c.icon + ' ' + c.name),
      V().talkLines(ui, [[c.teacher, c.intro]], names),
      ui.h('ol', { class: 'chapter-list' }, c.chapters.map((ch, i) => {
        const st = T.chapterStatus(pr, ch);
        const open = T.chapterUnlocked(pr, c, ch.id);
        const b = T.badgeOf(pr, ch);
        const first = ch.sections.find((s) => s.quiz.some((q) => !pr.solved[q.id])) || ch.sections[0];
        return ui.h('li', { class: 'card chapter-card' + (st.complete ? ' done' : '') + (open ? '' : ' locked') },
          ui.h('div', { class: 'row between' }, ui.h('h2', null, (i + 1) + '章 ' + ch.title), b ? badgeChip(ui, b) : ui.h('span', { class: 'muted small' }, ch.badge.icon + ' バッジ: ' + ch.badge.name)),
          ui.h('p', { class: 'muted small' }, ch.sections.map((s) => s.title).join(' ／ ')),
          ui.h('p', { class: 'small' }, '問題 ' + st.done + ' / ' + st.count),
          open ? ui.h('a', { class: 'btn' + (st.complete ? '' : ' primary'), id: 'tx-open-' + ch.id, href: '#/texts/s/' + first.id }, st.done ? (st.complete ? '読み直す' : '続きから') : '読みはじめる')
            : ui.h('p', { class: 'muted small' }, '🔒 前の章の問題を終えると開きます'));
      })));
  }

  // ---------------------------------------------------------------- 節
  function viewSection(ui, id, n) {
    const state = ui.state();
    const pr = progressOf(state);
    const names = V().namesOf(state);
    const found = findSection(id);
    if (!found || !T.chapterUnlocked(pr, found.course, found.chapter.id)) return ui.h('div', { class: 'page' }, ui.h('p', null, 'この節はまだ開いていません。'), ui.h('a', { href: '#/texts' }, '言語テキストへ'));
    const { course, chapter, section, index } = found;
    const q = section.quiz[Math.min(Math.max(n, 0), section.quiz.length - 1)];
    const qi = section.quiz.indexOf(q);
    const prev = chapter.sections[index - 1];
    const next = chapter.sections[index + 1];
    const handout = index === 0 ? ui.h('section', { class: 'card handout', id: 'tx-handout' }, ui.h('h2', null, '📄 この章で配られた資料'),
      V().talkLines(ui, chapter.handout.talk, names),
      ui.h('div', { class: 'handout-grid' },
        ui.h('div', null, ui.h('h3', { class: 'small' }, 'この章に関係する単元'), ui.h('ul', null, chapter.handout.units.map((u) => { const m = u.match(/スプリント(\d+)「/); return ui.h('li', null, m ? ui.h('a', { href: '#/hack/s/' + m[1] }, u) : u); }))),
        ui.h('div', null, ui.h('h3', { class: 'small' }, '先に知っておくこと'), ui.h('ul', null, chapter.handout.knowledge.map((k) => ui.h('li', null, k)))))) : null;
    return ui.h('div', { class: 'page' },
      ui.h('p', { class: 'crumbs' }, ui.h('a', { href: '#/texts' }, '言語テキスト'), ' › ', ui.h('a', { href: '#/texts/c/' + course.id }, course.name), ' › ' + (course.chapters.indexOf(chapter) + 1) + '章 ' + chapter.title),
      ui.h('h1', null, section.title),
      ui.h('p', { class: 'muted small' }, '節 ' + (index + 1) + ' / ' + chapter.sections.length),
      handout,
      ui.h('section', { class: 'card text-body' },
        V().talkLines(ui, section.talk, names),
        section.figure ? ui.h('figure', { class: 'tx-figure' }, ui.h('figcaption', null, '図: ' + section.figure.title), ui.h('pre', { class: 'diagram' }, section.figure.text)) : null,
        section.code ? V().codeLines(ui, section.code.text, { label: '例のコード' }) : null,
        ui.h('div', { class: 'points' }, ui.h('h3', null, '要点'), ui.h('ul', null, section.points.map((p) => ui.h('li', null, p))))),
      quizCard(ui, course, chapter, section, q, qi, names),
      ui.h('div', { class: 'row between' },
        prev ? ui.h('a', { class: 'btn ghost', id: 'tx-prev', href: '#/texts/s/' + prev.id }, '← ' + prev.title) : ui.h('span'),
        next ? ui.h('a', { class: 'btn', id: 'tx-next-section', href: '#/texts/s/' + next.id }, next.title + ' →') : ui.h('a', { class: 'btn', id: 'tx-to-course', href: '#/texts/c/' + course.id }, '章の一覧へ')));
  }

  function quizCard(ui, course, chapter, section, q, qi, names) {
    const pr = progressOf(ui.state());
    const w = workOf(pr, q);
    const done = !!(w.result && w.result.pass) || !!w.revealed;
    const refresh = (fn) => { ui.update(() => fn()); ui.render(); };
    const solved = pr.solved[q.id];
    const tabs = section.quiz.length > 1 ? ui.h('div', { class: 'row small' }, section.quiz.map((x, i) => ui.h('a', { class: 'btn tiny' + (i === qi ? ' primary' : ''), href: '#/texts/s/' + section.id + '/' + i }, '問' + (i + 1) + (pr.solved[x.id] ? ' ✓' : '')))) : null;
    const nextQ = section.quiz[qi + 1];
    const nextSection = chapter.sections[chapter.sections.indexOf(section) + 1];
    return ui.h('section', { class: 'card exercise', id: 'tx-quiz' },
      ui.h('div', { class: 'row between' }, ui.h('h2', null, '読解問題: ' + q.title), tabs),
      ui.h('p', { class: 'row small' }, V().langTag(ui, q), ui.h('span', { class: 'tag' }, V().TYPE_NAME[q.type].replace('同期のコードを', 'コードを').replace('自分のコードを直す', 'バグを直す')), solved ? ui.h('span', { class: 'tag ok' }, solved.revealed ? '答えを見て完了' : '完了') : null),
      q.story ? ui.h('p', { class: 'note small' }, H.fill(q.story, names)) : null,
      V().problemWidget(ui, q, w, names, done, refresh),
      ui.h('div', { class: 'row' },
        !done ? ui.h('button', { id: 'tx-submit', class: 'btn primary', onclick: () => submit(ui, chapter, q, false) }, '答える') : null,
        !done ? ui.h('button', { id: 'tx-hint', class: 'btn', disabled: w.hint >= q.hints.length, onclick: () => refresh(() => { w.hint += 1; }) }, w.hint >= q.hints.length ? 'ヒントはここまで' : 'ヒント ' + (w.hint + 1) + '/' + q.hints.length) : null,
        !done && w.hint >= q.hints.length ? ui.h('button', { id: 'tx-reveal', class: 'btn warn', onclick: () => submit(ui, chapter, q, true) }, '答えを見る') : null,
        done ? ui.h('button', { id: 'tx-retry', class: 'btn ghost', onclick: () => refresh(() => { pr.work[q.id] = null; }) }, 'もう一度解き直す') : null),
      w.hint ? ui.h('ol', { class: 'hints', 'aria-label': 'ヒント' }, q.hints.slice(0, w.hint).map((t, i) => ui.h('li', null, ui.h('strong', null, 'ヒント' + (i + 1) + ': '), H.fill(t, names)))) : null,
      V().feedbackBox(ui, q, w, names),
      done ? ui.h('div', { class: 'stack highlight-box', id: 'tx-why' },
        ui.h('h3', null, w.revealed ? '答えと解説' : '正解！'),
        V().explain(ui, q, names),
        ui.h('div', { class: 'row end' },
          nextQ ? ui.h('a', { class: 'btn primary', id: 'tx-next', href: '#/texts/s/' + section.id + '/' + (qi + 1) }, '次の問題へ')
            : nextSection ? ui.h('a', { class: 'btn primary', id: 'tx-next', href: '#/texts/s/' + nextSection.id }, '次の節へ')
              : ui.h('a', { class: 'btn primary', id: 'tx-next', href: '#/texts/c/' + chapter.id.split('-')[0] }, '章を終える'))) : null);
  }

  function submit(ui, chapter, q, reveal) {
    const state = ui.state();
    const pr = progressOf(state);
    const w = workOf(pr, q);
    const before = T.chapterStatus(pr, chapter).complete;
    const r = reveal ? null : T.grade(q, w);
    ui.update((s) => {
      if (reveal) {
        Object.assign(w, T.answerWork(q), { revealed: true, result: null, sel: null });
        s.texts = T.solve(pr, q, true, ui.now());
        if (s.texts.solved[q.id].revealed) {
          s.retry = [...(s.retry || []).filter((x) => x.ref !== 'text/' + q.id), { kind: 'text', ref: 'text/' + q.id, title: '言語テキスト「' + q.title + '」', href: '#/texts/s/' + q.id.replace(/-q\d+$/, '') + '/' + Math.max(0, findSection(q.id.replace(/-q\d+$/, '')).section.quiz.indexOf(q)), time: ui.now() }].slice(-50);
        }
      } else {
        w.tries += 1;
        w.result = r;
        if (r.pass) {
          s.texts = T.solve(pr, q, false, ui.now());
          s.retry = (s.retry || []).filter((x) => x.ref !== 'text/' + q.id);
        }
      }
    });
    const after = progressOf(ui.state());
    if (!before && T.chapterStatus(after, chapter).complete) {
      const b = T.badgeOf(after, chapter);
      ui.celebrate('done', 'バッジ獲得: ' + b.icon + ' ' + b.name, b.gold ? '答えを見ずに全問正解！ 金のバッジです' : '答えを見ずに解き直すと金のバッジになります');
    } else if (r && r.pass) {
      ui.toast('正解です！', 'ok');
      ui.sfx('pass');
    }
    ui.render();
  }

  RGA.textView = { view, progressOf };
})(globalThis);
