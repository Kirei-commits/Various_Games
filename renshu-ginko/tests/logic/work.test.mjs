// 配属先モード（実案件）: 週の形、問題の採点、経営シミュレーションの数字の動き
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const W = RGA.work;
const H = RGA.hack;
const TYPES = ['talk', 'order', 'fix', 'predict', 'review', 'comment'];
const names = (t) => [...String(t || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
const problems = () => [...W.WEEKS.flatMap((w) => [w.task, w.incident].filter(Boolean)), ...W.INCIDENTS];

test('24週がそろい、学ぶ「仕事の進め方」が書いてある', () => {
  assert.deepEqual(W.WEEKS.map((w) => w.no), Array.from({ length: W.TOTAL_WEEKS }, (_, i) => i + 1));
  for (const w of W.WEEKS) {
    assert.ok(w.title && w.skill && w.briefing.length >= 2 && w.retro.length >= 1 && w.task, '第' + w.no + '週');
    for (const [who, text] of [...w.briefing, ...w.retro]) {
      assert.ok(H.CAST_BY_ID[who] && text, '第' + w.no + '週 話し手 ' + who);
      for (const n of names(text)) assert.ok(H.CAST_BY_ID[n], '不明な名前 {' + n + '}');
    }
  }
});

test('障害は台本で4回以上、抽選の障害は6種類以上。障害はログを読む（fix）・順番（order）・会話（talk）', () => {
  assert.ok(W.WEEKS.filter((w) => w.incident).length >= 4);
  assert.ok(W.INCIDENTS.length >= 6);
  for (const p of [...W.WEEKS.map((w) => w.incident).filter(Boolean), ...W.INCIDENTS]) assert.ok(['fix', 'order', 'talk'].includes(p.type), p.id);
});

test('問題: id は重ならず、ヒント3〜5段階、お手本で合格し、ずれた答えでは落ちる', () => {
  const list = problems();
  assert.equal(new Set(list.map((p) => p.id)).size, list.length);
  for (const p of list) {
    assert.ok(TYPES.includes(p.type), p.id);
    assert.ok(p.hints.length >= 3 && p.hints.length <= 5, p.id + ' hints');
    assert.ok(p.why && p.title && H.CAST_BY_ID[p.by] && H.LANGS[p.lang], p.id);
    for (const t of [p.story, p.text, p.prompt, p.why, ...p.hints, ...(p.items || [])]) for (const n of names(t)) assert.ok(H.CAST_BY_ID[n], p.id + ' 不明な名前 {' + n + '}');
    assert.equal(W.grade(p, W.answerWork(p)).pass, true, p.id + ' お手本');
    if (p.type === 'order') {
      assert.ok(p.items.length >= 3 && new Set(p.items).size === p.items.length, p.id);
      assert.notDeepEqual(H.initialOrder(p), p.items, p.id + ' 最初の並びが答えと同じ');
      assert.equal(W.grade(p, { order: H.initialOrder(p) }).pass, false, p.id);
    }
    if (p.type === 'fix') {
      const lines = p.code.split('\n');
      assert.ok(lines[p.bugLine - 1] && lines[p.bugLine - 1].trim(), p.id);
      assert.equal(W.grade(p, { line: p.bugLine, choice: (p.answer + 1) % p.fixes.length }).pass, false, p.id);
    }
    if (p.type === 'talk') assert.equal(p.options.filter((o) => o.best).length, 1, p.id);
    if (p.type === 'comment') {
      assert.equal(H.gradeComment(p, 'よろしくお願いします').pass, false, p.id);
      assert.equal(H.gradeComment(p, p.sample + ' ダメです').pass, false, p.id);
    }
    if (p.consult) {
      assert.ok(H.CAST_BY_ID[p.consult.who] && p.consult.q && p.consult.lines.length >= 2, p.id + ' consult');
      for (const [who] of p.consult.lines) assert.ok(H.CAST_BY_ID[who], p.id);
    }
  }
});

test('経営: 配分は合計10。新機能は利用者を増やし負債をためる。運用は障害を起きにくくする。休息で体力が戻る', () => {
  const base = W.START;
  assert.equal(W.validAlloc({ feature: 4, quality: 3, ops: 2, care: 1 }), true);
  assert.equal(W.validAlloc({ feature: 5, quality: 3, ops: 2, care: 1 }), false);
  assert.equal(W.validAlloc({ feature: 10, quality: 0, ops: 0, care: -0 }), true);
  const feat = W.simulateWeek(base, { feature: 10, quality: 0, ops: 0, care: 0 }, { event: 'self' });
  const qual = W.simulateWeek(base, { feature: 0, quality: 10, ops: 0, care: 0 }, { event: 'self' });
  assert.ok(feat.metrics.users > qual.metrics.users);
  assert.ok(feat.metrics.debt > base.debt && qual.metrics.debt < base.debt);
  const rest = W.simulateWeek({ ...base, stamina: 40 }, { feature: 0, quality: 0, ops: 0, care: 10 }, {});
  assert.ok(rest.metrics.stamina > 40);
  assert.ok(W.incidentRisk(base, { ops: 6 }) < W.incidentRisk(base, { ops: 0 }));
  // 自力で障害を解くと、答えを見たときより被害が小さい
  const a = { feature: 4, quality: 3, ops: 2, care: 1 };
  const self = W.simulateWeek(base, a, { event: 'self', incident: 'self' });
  const rev = W.simulateWeek(base, a, { event: 'self', incident: 'revealed' });
  assert.ok(self.metrics.users > rev.metrics.users && self.metrics.trust > rev.metrics.trust);
  // 数字は範囲の中に収まる（ゲームオーバーはない）
  let m = { ...base };
  for (let i = 0; i < 24; i++) m = W.simulateWeek(m, { feature: 10, quality: 0, ops: 0, care: 0 }, { incident: 'revealed' }).metrics;
  assert.ok(m.rating >= 1 && m.stamina >= 0 && m.debt <= 100);
  assert.ok(W.bossComment(m, { rating: -1 }, { care: 0 })[1]);
});

test('障害の抽選は週の番号で決まる（同じ選び方なら同じ結果）', () => {
  const a = { feature: 4, quality: 3, ops: 2, care: 1 };
  for (let no = 1; no <= 24; no++) assert.equal(W.rollIncident(no, W.START, a), W.rollIncident(no, W.START, a));
  const scripted = W.WEEKS.find((w) => w.incident);
  if (scripted) assert.equal(W.rollIncident(scripted.no, W.START, a), scripted.incident.id);
});
