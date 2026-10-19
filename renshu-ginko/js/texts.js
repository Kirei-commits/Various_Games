/*
 * 言語テキスト（JavaScript・React・Java・Python）。「書けなくても読める」ようになるための読み物と読解問題。コードは動かさない。
 * 純粋。中身は text-*.js が addCourse で足す。問題の形と採点はハッカソン（js/hackathon.js）と同じ（predict / fix / review）。
 *
 * コース   { id, name, icon, teacher, intro, chapters: [章] }
 * 章       { id, title, badge: { icon, name }, handout: { units: [], knowledge: [], talk: [[話し手, せりふ]] }, sections: [節] }
 *            handout は章の前に配られる資料（この章ではこの単元と知識が必要）
 * 節       { id, title, talk: [[話し手, せりふ]], figure?: { title, text }, code?: { lang, text }, points: [要点], quiz: [問題] }
 *            figure.text は等幅で表示する図（箱と矢印）。code は説明用の例
 * 問題     ハッカソンと同じ形。ただし by / points（ポイント）は省ける。predict の code は省ける（文章だけの選択問題）
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const H = RGA.hack;

  const COURSES = [];
  const ORDER = ['js', 'react', 'java', 'python'];
  function addCourse(course) {
    const i = COURSES.findIndex((c) => c.id === course.id);
    if (i >= 0) COURSES[i] = course;
    else COURSES.push(course);
    COURSES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  }
  const courseById = (id) => COURSES.find((c) => c.id === id) || null;
  function findChapter(id) {
    for (const c of COURSES) for (const ch of c.chapters) if (ch.id === id) return { course: c, chapter: ch };
    return null;
  }
  const quizOf = (chapter) => chapter.sections.flatMap((s) => s.quiz);
  function findQuiz(id) {
    for (const c of COURSES) for (const ch of c.chapters) for (const s of ch.sections) for (const q of s.quiz) if (q.id === id) return { course: c, chapter: ch, section: s, problem: q };
    return null;
  }

  // ---- 進み具合 { solved: { 問題id: { revealed, at } }, work: {}, read: { 節id: true } } ----
  function emptyProgress() {
    return { solved: {}, work: {}, read: {}, badges: {} };
  }
  function chapterStatus(progress, chapter) {
    const solved = (progress && progress.solved) || {};
    const list = quizOf(chapter);
    const done = list.filter((q) => solved[q.id]).length;
    const self = list.filter((q) => solved[q.id] && !solved[q.id].revealed).length;
    return { done, count: list.length, complete: done === list.length, self };
  }
  function courseStatus(progress, course) {
    const st = course.chapters.map((ch) => chapterStatus(progress, ch));
    return { chapters: st.filter((x) => x.complete).length, count: course.chapters.length, done: st.reduce((a, x) => a + x.done, 0), total: st.reduce((a, x) => a + x.count, 0) };
  }
  // 章は順番に開く（前の章の問題をすべて終えたら次の章）
  function chapterUnlocked(progress, course, chapterId) {
    const i = course.chapters.findIndex((c) => c.id === chapterId);
    return i <= 0 || chapterStatus(progress, course.chapters[i - 1]).complete;
  }
  function solve(progress, q, revealed, time) {
    const prev = progress.solved[q.id];
    const rev = prev && !prev.revealed ? false : !!revealed;
    return { ...progress, solved: { ...progress.solved, [q.id]: { revealed: rev, at: time } } };
  }
  // 章のバッジ: 全問を終えたらもらえる。答えを見ずに全部解いたら「金」
  function badgeOf(progress, chapter) {
    const st = chapterStatus(progress, chapter);
    if (!st.complete) return null;
    return { ...chapter.badge, gold: st.self === st.count };
  }

  RGA.texts = { COURSES, ORDER, addCourse, courseById, findChapter, findQuiz, quizOf, emptyProgress, chapterStatus, courseStatus, chapterUnlocked, solve, badgeOf, grade: (q, w) => H.grade(q, w), answerWork: (q) => H.answerWork(q) };
})(globalThis);
