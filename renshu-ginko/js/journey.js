/*
 * モードをつなぐもの: ハッカソンのスプリントと言語テキストの章の対応、「今日やること」、称号（実績）。
 * 純粋。状態と日付（YYYY-MM-DD）を引数でもらう。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});

  // ---- スプリント ↔ テキストの章（章の資料に「スプリントN「…」」と書いてあるもの） ----
  function sprintsOfChapter(chapter) {
    const nos = new Set();
    for (const u of chapter.handout.units) for (const m of u.matchAll(/スプリント(\d+)「/g)) nos.add(Number(m[1]));
    return [...nos].sort((a, b) => a - b);
  }
  function chaptersOfSprint(no) {
    const out = [];
    for (const c of RGA.texts.COURSES) for (const ch of c.chapters) if (sprintsOfChapter(ch).includes(no)) out.push({ course: c, chapter: ch });
    return out;
  }

  // ---- 今日やること（各モードの次の一歩） ----
  function todayPlan(state, today) {
    const H = RGA.hack;
    const T = RGA.texts;
    const W = RGA.work;
    const C = RGA.challenge;
    const plan = [];
    const hp = state.hack || H.emptyProgress();
    const no = H.unlockedUpTo(hp);
    const sprint = H.SPRINTS.find((s) => s.no === no);
    if (sprint && !H.released(hp)) {
      const next = H.problemsOf(sprint).find((p) => !(hp.solved || {})[p.id]);
      plan.push({ mode: 'hack', icon: '🧑‍💻', title: 'ハッカソン スプリント' + no, sub: next ? next.title : '振り返りを見る', href: next && (hp.briefed || {})[no] ? '#/hack/p/' + next.id : '#/hack/s/' + no });
      // 今のスプリントに関係するテキストで、まだ終えていない章
      const tp = state.texts || T.emptyProgress();
      const rel = chaptersOfSprint(no).find((x) => T.chapterUnlocked(tp, x.course, x.chapter.id) && !T.chapterStatus(tp, x.chapter).complete);
      if (rel) plan.push({ mode: 'texts', icon: rel.course.icon, title: '予習: ' + rel.course.name + '「' + rel.chapter.title + '」', sub: 'スプリント' + no + 'で使う知識', href: '#/texts/s/' + rel.chapter.sections[0].id });
    }
    const wp = state.work || W.emptyProgress();
    if (wp.phase !== 'done') {
      const week = W.weekOf(wp.week);
      plan.push({ mode: 'work', icon: '🏢', title: '配属先 第' + wp.week + '週', sub: week ? week.skill : '', href: '#/work' });
    }
    const rec = state.challenge || C.emptyRecords();
    if (!rec.daily[today + ':all']) plan.push({ mode: 'challenge', icon: '🎯', title: '今日の5問', sub: '続けた日数 ' + C.dailyStreak(rec, today) + ' 日', href: '#/challenge' });
    return plan;
  }

  // ---- 称号 ----
  const count = (obj, pred) => Object.values(obj || {}).filter(pred || (() => true)).length;
  const TITLES = [
    { id: 'first-unit', icon: '🎓', name: 'はじめの一歩', how: '単元を1つ修了する', check: (s) => count(s.enrollments, (e) => e.status === 'done') >= 1 },
    { id: 'first-review', icon: '🔍', name: '初レビュー', how: 'ハッカソンの問題を1つ解く', check: (s) => count((s.hack || {}).solved) >= 1 },
    { id: 'sprint-6', icon: '🏃', name: 'チームの一員', how: 'ハッカソンのスプリント6を終える', check: (s) => sprintDone(s, 6) },
    { id: 'sprint-12', icon: '⛰️', name: '折り返し地点', how: 'ハッカソンのスプリント12を終える', check: (s) => sprintDone(s, 12) },
    { id: 'release', icon: '🚀', name: 'リリース！', how: 'ハッカソンの24スプリントを終える', check: (s) => RGA.hack.released(s.hack || RGA.hack.emptyProgress()) },
    { id: 'listener', icon: '👂', name: '聞き上手', how: '「聞きに行く」で10回相談する', check: (s) => count((s.hack || {}).consulted, Boolean) >= 10 },
    { id: 'first-badge', icon: '📛', name: '最初のバッジ', how: '言語テキストの章を1つ終える', check: (s) => badges(s).length >= 1 },
    { id: 'polyglot', icon: '🌐', name: 'ポリグロット', how: '4つの言語すべてで1章ずつ終える', check: (s) => RGA.texts.COURSES.every((c) => c.chapters.some((ch) => RGA.texts.badgeOf(s.texts || RGA.texts.emptyProgress(), ch))) },
    { id: 'gold-5', icon: '🥇', name: '金の読み手', how: '金のバッジを5つ集める', check: (s) => badges(s).filter((b) => b.gold).length >= 5 },
    { id: 'week-4', icon: '🏢', name: '配属1か月', how: '配属先で4週を終える', check: (s) => ((s.work || {}).history || []).length >= 4 },
    { id: 'firefighter', icon: '🧯', name: '火消し見習い', how: '配属先の障害を自力で3回解く', check: (s) => ((s.work || {}).history || []).filter((h) => h.incident && h.outcome.incident === 'self').length >= 3 },
    { id: 'year-one', icon: '🌸', name: '1年目修了', how: '配属先で24週を終える', check: (s) => (s.work || {}).phase === 'done' },
    { id: 'daily-3', icon: '📅', name: '三日坊主じゃない', how: '今日の5問を3日続ける', check: (s, today) => RGA.challenge.dailyStreak(s.challenge || RGA.challenge.emptyRecords(), today) >= 3 },
    { id: 'daily-7', icon: '🗓️', name: '1週間皆勤', how: '今日の5問を7日続ける', check: (s, today) => RGA.challenge.dailyStreak(s.challenge || RGA.challenge.emptyRecords(), today) >= 7 },
    { id: 'hunter-10', icon: '🐞', name: 'バグハンター', how: 'バグハントで10問連続正解', check: (s) => Object.values(((s.challenge || {}).best) || {}).some((n) => n >= 10) },
  ];
  function sprintDone(s, no) {
    const sp = RGA.hack.SPRINTS.find((x) => x.no === no);
    return !!sp && RGA.hack.sprintStatus(s.hack || RGA.hack.emptyProgress(), sp).complete;
  }
  function badges(s) {
    const tp = s.texts || RGA.texts.emptyProgress();
    return RGA.texts.COURSES.flatMap((c) => c.chapters.map((ch) => RGA.texts.badgeOf(tp, ch)).filter(Boolean));
  }
  function earnedTitles(state, today) {
    return TITLES.filter((t) => { try { return t.check(state, today); } catch (e) { return false; } }).map((t) => t.id);
  }
  // まだ記録していない称号（お祝いを出すため）
  function newTitles(state, today) {
    const have = state.titles || {};
    return earnedTitles(state, today).filter((id) => !have[id]);
  }

  RGA.journey = { sprintsOfChapter, chaptersOfSprint, todayPlan, TITLES, earnedTitles, newTitles };
})(globalThis);
