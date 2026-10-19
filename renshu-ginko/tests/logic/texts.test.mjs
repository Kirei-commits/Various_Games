// 言語テキストの検査: 形がそろい、お手本の答えで合格し、ずれた答えでは落ちる
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const T = RGA.texts;
const H = RGA.hack;
const TYPES = ['predict', 'fix', 'review'];
const allQuiz = () => T.COURSES.flatMap((c) => c.chapters.flatMap((ch) => ch.sections.flatMap((s) => s.quiz.map((q) => ({ c, ch, s, q })))));
const lines = (code) => String(code || '').split('\n');
const names = (t) => [...String(t).matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

test('4つの言語のコースがそろっている（JavaScript・React・Java・Python）', () => {
  assert.deepEqual(T.COURSES.map((c) => c.id), ['js', 'react', 'java', 'python']);
});

test('コース・章・節の形（章の前に配る資料、図か例のコード、要点、読解問題）', () => {
  for (const c of T.COURSES) {
    assert.ok(c.name && c.icon && c.intro && H.CAST_BY_ID[c.teacher], c.id);
    assert.ok(c.chapters.length >= 5, c.id + ' の章は5つ以上');
    for (const ch of c.chapters) {
      assert.ok(ch.id.startsWith(c.id + '-') && ch.title && ch.badge.icon && ch.badge.name, ch.id);
      assert.ok(ch.handout.units.length >= 1 && ch.handout.knowledge.length >= 1 && ch.handout.talk.length >= 1, ch.id + ' handout');
      assert.ok(ch.sections.length >= 2 && ch.sections.length <= 4, ch.id + ' 節は2〜4');
      for (const s of ch.sections) {
        assert.ok(s.id.startsWith(ch.id + '-') && s.title, s.id);
        assert.ok(s.talk.length >= 2, s.id + ' talk');
        assert.ok(s.figure || s.code, s.id + ' 図か例のコード');
        if (s.figure) assert.ok(s.figure.title && s.figure.text, s.id);
        assert.ok(s.points.length >= 1, s.id + ' points');
        assert.ok(s.quiz.length >= 1, s.id + ' quiz');
        for (const [who, text] of [...ch.handout.talk, ...s.talk]) {
          assert.ok(H.CAST_BY_ID[who] && text, s.id + ' 話し手 ' + who);
          for (const n of names(text)) assert.ok(H.CAST_BY_ID[n], s.id + ' 不明な名前 {' + n + '}');
        }
      }
    }
  }
});

test('id は重ならない', () => {
  const ids = [...T.COURSES.flatMap((c) => c.chapters.flatMap((ch) => [ch.id, ...ch.sections.map((s) => s.id)])), ...allQuiz().map((x) => x.q.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('読解問題: 種類・ヒント3〜5段階・解説。お手本で合格し、ずれた答えで落ちる', () => {
  for (const { s, q } of allQuiz()) {
    assert.ok(q.id.startsWith(s.id + '-'), q.id);
    assert.ok(TYPES.includes(q.type), q.id + ' type');
    assert.ok(H.LANGS[q.lang], q.id + ' lang');
    assert.ok(q.hints.length >= 3 && q.hints.length <= 5, q.id + ' hints');
    assert.ok(q.why && q.title, q.id);
    for (const t of [q.story || '', q.why, ...q.hints]) for (const n of names(t)) assert.ok(H.CAST_BY_ID[n], q.id + ' 不明な名前 {' + n + '}');
    assert.equal(T.grade(q, T.answerWork(q)).pass, true, q.id + ' お手本');
    if (q.type === 'predict') {
      assert.ok(q.choices.length >= 3 && q.answer >= 0 && q.answer < q.choices.length, q.id);
      assert.equal(new Set(q.choices).size, q.choices.length, q.id);
      assert.equal(T.grade(q, { choice: (q.answer + 1) % q.choices.length }).pass, false, q.id);
    }
    if (q.type === 'fix') {
      assert.ok(lines(q.code)[q.bugLine - 1] && lines(q.code)[q.bugLine - 1].trim(), q.id);
      assert.ok(q.fixes.length >= 3 && q.fixes.length <= 4 && new Set(q.fixes).size === q.fixes.length, q.id);
      assert.equal(T.grade(q, { line: q.bugLine, choice: (q.answer + 1) % q.fixes.length }).pass, false, q.id);
    }
    if (q.type === 'review') {
      for (const d of q.defects) assert.ok(lines(q.code)[d.line - 1] && lines(q.code)[d.line - 1].trim() && H.REVIEW_KINDS.some((k) => k.id === d.kind), q.id);
      assert.equal(T.grade(q, { marks: {} }).pass, false, q.id);
    }
  }
});

test('章は順に開き、全問を終えるとバッジ。答えを見ずに全部解くと金', () => {
  const c = T.courseById('java');
  const [ch1, ch2] = c.chapters;
  let pr = T.emptyProgress();
  assert.equal(T.chapterUnlocked(pr, c, ch1.id), true);
  if (ch2) assert.equal(T.chapterUnlocked(pr, c, ch2.id), false);
  const qs = T.quizOf(ch1);
  qs.forEach((q, i) => { pr = T.solve(pr, q, i === 0, 1); });
  assert.equal(T.badgeOf(pr, ch1).gold, false);
  if (ch2) assert.equal(T.chapterUnlocked(pr, c, ch2.id), true);
  pr = T.solve(pr, qs[0], false, 2);
  assert.equal(T.badgeOf(pr, ch1).gold, true, '自力で解き直すと金');
});
