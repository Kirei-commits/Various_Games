// ハッカソン・レビューモードの検査: 問題の形がそろい、お手本の答えで合格し、ずれた答えでは落ちる
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const H = RGA.hack;
const TYPES = ['review', 'fix', 'conflict', 'predict', 'comment', 'talk'];
const all = () => H.SPRINTS.flatMap((s) => H.problemsOf(s).map((p) => ({ s, p })));
const codeLines = (p) => String(p.code || '').split('\n');

test('スプリントは1から順に並び、番号が重ならない', () => {
  H.SPRINTS.forEach((s, i) => assert.equal(s.no, i + 1));
  assert.ok(H.SPRINTS.length >= 1 && H.SPRINTS.length <= H.TOTAL_SPRINTS);
});

test('スプリントの形（ゴール・事前に配る知識・ブリーフィング・問題2〜3・割り込み・振り返り）', () => {
  for (const s of H.SPRINTS) {
    const at = 'スプリント' + s.no;
    assert.ok(s.title && s.goal, at);
    assert.ok(Array.isArray(s.knowledge) && s.knowledge.length >= 1, at + ' knowledge');
    assert.ok(s.briefing.length >= 2, at + ' briefing');
    assert.ok(s.problems.length >= 2 && s.problems.length <= 3, at + ' problems');
    assert.equal(s.event && s.event.type, 'talk', at + ' event');
    assert.ok(s.retro.length >= 1, at + ' retro');
    assert.ok(H.SM_ORDER.includes(s.sm), at + ' sm');
    for (const [who, text] of [...s.briefing, ...s.retro]) {
      assert.ok(H.CAST_BY_ID[who], at + ' 話し手 ' + who);
      assert.ok(typeof text === 'string' && text.length > 0, at);
    }
  }
});

test('問題の id は重ならず、ヒントは3〜5段階、解説がある', () => {
  const ids = all().map(({ p }) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const { s, p } of all()) {
    assert.ok(p.id.startsWith('S' + String(s.no).padStart(2, '0') + '-'), p.id);
    assert.ok(TYPES.includes(p.type), p.id + ' type');
    assert.ok(p.hints.length >= 3 && p.hints.length <= 5, p.id + ' hints ' + p.hints.length);
    assert.ok(p.why && p.title, p.id);
    assert.ok(H.CAST_BY_ID[p.by], p.id + ' by');
    assert.ok(H.LANGS[p.lang], p.id + ' lang');
    assert.ok([1, 2, 3, 5].includes(p.points), p.id + ' points');
  }
});

test('せりふの {名前} はすべて登場人物', () => {
  const texts = [];
  for (const s of H.SPRINTS) {
    texts.push(...s.briefing.map((b) => b[1]), ...s.retro.map((b) => b[1]));
    for (const p of H.problemsOf(s)) {
      texts.push(p.story || '', p.text || '', p.why, ...p.hints);
      if (p.options && p.type === 'talk') for (const o of p.options) texts.push(o.text, o.note || '', ...o.reply.map((r) => r[1]));
    }
  }
  for (const t of texts) for (const m of t.matchAll(/\{(\w+)\}/g)) assert.ok(H.CAST_BY_ID[m[1]], '不明な名前 {' + m[1] + '}: ' + t.slice(0, 40));
});

test('お手本の答え（答えを見る）で合格する', () => {
  for (const { p } of all()) assert.equal(H.grade(p, H.answerWork(p)).pass, true, p.id);
});

test('review: 欠陥の行は空行でなく、種類が正しい。何も選ばないと落ちる', () => {
  const kinds = H.REVIEW_KINDS.map((k) => k.id);
  for (const { p } of all().filter((x) => x.p.type === 'review')) {
    const lines = codeLines(p);
    assert.ok(p.defects.length >= 1, p.id);
    for (const d of p.defects) {
      assert.ok(lines[d.line - 1] && lines[d.line - 1].trim(), p.id + ' 行 ' + d.line + ' が空');
      assert.ok(kinds.includes(d.kind), p.id + ' kind ' + d.kind);
      assert.ok(d.why, p.id);
    }
    assert.equal(H.grade(p, { marks: {} }).pass, false, p.id);
  }
});

test('fix: バグの行は空行でなく、選択肢は重ならず、違う行・違う直し方では落ちる', () => {
  for (const { p } of all().filter((x) => x.p.type === 'fix')) {
    const lines = codeLines(p);
    assert.ok(lines[p.bugLine - 1] && lines[p.bugLine - 1].trim(), p.id);
    assert.ok(p.fixes.length >= 3 && p.fixes.length <= 4 && p.answer >= 0 && p.answer < p.fixes.length, p.id);
    assert.equal(new Set(p.fixes).size, p.fixes.length, p.id);
    assert.equal(H.grade(p, { line: p.bugLine === 1 ? 2 : 1, choice: p.answer }).pass, false, p.id);
    assert.equal(H.grade(p, { line: p.bugLine, choice: (p.answer + 1) % p.fixes.length }).pass, false, p.id);
  }
});

test('conflict: マーカーがそろい、解決案にはマーカーが残っていない', () => {
  for (const { p } of all().filter((x) => x.p.type === 'conflict')) {
    assert.ok(/^<<<<<<< /m.test(p.conflict) && /^=======$/m.test(p.conflict) && /^>>>>>>> /m.test(p.conflict), p.id);
    assert.ok(p.context, p.id);
    assert.ok(p.options.length >= 3 && p.options.length <= 4 && p.answer >= 0 && p.answer < p.options.length, p.id);
    for (const o of p.options) assert.ok(!/^(<<<<<<<|=======|>>>>>>>)/m.test(o), p.id + ' 解決案にマーカー');
    assert.equal(new Set(p.options).size, p.options.length, p.id);
  }
});

test('predict: 選択肢は重ならない', () => {
  for (const { p } of all().filter((x) => x.p.type === 'predict')) {
    assert.ok(p.code && p.q, p.id);
    assert.ok(p.choices.length >= 3 && p.answer >= 0 && p.answer < p.choices.length, p.id);
    assert.equal(new Set(p.choices).size, p.choices.length, p.id);
  }
});

test('comment: お手本は合格、短い・乱暴な言い方・観点不足は落ちる', () => {
  for (const { p } of all().filter((x) => x.p.type === 'comment')) {
    assert.ok(p.checks.length >= p.min, p.id);
    assert.ok(p.focus.every((l) => codeLines(p)[l - 1] && codeLines(p)[l - 1].trim()), p.id + ' focus');
    assert.equal(H.gradeComment(p, 'いいと思います').pass, false, p.id);
    assert.equal(H.gradeComment(p, p.sample + ' こんなのダメです').pass, false, p.id + ' NG');
    assert.equal(H.gradeComment(p, 'このコードについて、もう少し考えた方がよさそうに思いました。').pass, false, p.id + ' 観点なし');
  }
});

test('talk: 最善の選択肢はちょうど1つ、どれにも返事がある', () => {
  for (const { p } of all().filter((x) => x.p.type === 'talk')) {
    assert.ok(H.CAST_BY_ID[p.from] && p.text, p.id);
    assert.equal(p.options.filter((o) => o.best).length, 1, p.id);
    for (const o of p.options) assert.ok(o.reply.length >= 1 && o.reply.every((r) => H.CAST_BY_ID[r[0]]), p.id);
  }
});

test('進み具合: 全部解くと次のスプリントが開く。答えを見た問題のポイントは半分', () => {
  let pr = H.emptyProgress();
  assert.equal(H.unlockedUpTo(pr), 1);
  const s1 = H.SPRINTS[0];
  const [first, ...rest] = H.problemsOf(s1);
  pr = H.solve(pr, first, true, 1);
  for (const p of rest) pr = H.solve(pr, p, false, 1);
  const st = H.sprintStatus(pr, s1);
  assert.equal(st.complete, true);
  assert.equal(st.points, st.total - first.points + Math.ceil(first.points / 2));
  if (H.SPRINTS.length > 1) assert.equal(H.unlockedUpTo(pr), 2);
  // 自力で解いたあとに答えを見ても、自力のまま
  const again = H.solve(H.solve(H.emptyProgress(), first, false, 1), first, true, 2);
  assert.equal(again.solved[first.id].revealed, false);
});

test('名前の置き換えと、スクラムマスターの交代', () => {
  assert.equal(H.fill('{player}と{madoka}', { player: 'ミナト' }), 'ミナトと早瀬 まどか');
  assert.equal(H.fill('{unknown}'), '{unknown}');
  assert.deepEqual([1, 2, 6, 7].map(H.scrumMaster), ['madoka', 'rio', 'player', 'madoka']);
  const sys = H.personaPrompt('shiraishi', { shiraishi: '白石さん', player: 'ミナト' }, H.SPRINTS[0]);
  assert.ok(sys.includes('白石さん') && sys.includes('ミナト') && sys.includes('スプリント1'));
});

test('関係者の割り込み・仕様のひっくり返しは3〜4スプリントに1回（それ以外の回は、PO・ユーザー・チームとのやりとり）', () => {
  const stake = new Set(H.CAST.filter((c) => c.group === 'stake').map((c) => c.id));
  const marked = H.SPRINTS.filter((s) => s.event.interrupt).map((s) => s.no);
  for (const s of H.SPRINTS) if (stake.has(s.event.from)) assert.ok(s.event.interrupt, 'スプリント' + s.no + ' の関係者の割り込みに interrupt: true がない');
  assert.ok(marked.length && marked[0] <= 4, '最初の割り込みは4スプリント目まで');
  for (let i = 1; i < marked.length; i++) {
    const gap = marked[i] - marked[i - 1];
    assert.ok(gap >= 3 && gap <= 4, 'スプリント' + marked[i - 1] + ' → ' + marked[i] + ' の間隔が ' + gap);
  }
  assert.ok(H.TOTAL_SPRINTS - marked[marked.length - 1] <= 4);
});
