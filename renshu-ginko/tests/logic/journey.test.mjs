// モードをつなぐもの: スプリントとテキストの対応・今日やること・称号
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const J = RGA.journey;
const H = RGA.hack;

test('テキストの章の資料に書いたスプリントは実在し、多くのスプリントに予習できる章がある', () => {
  for (const c of RGA.texts.COURSES) for (const ch of c.chapters) for (const no of J.sprintsOfChapter(ch)) assert.ok(H.SPRINTS.some((s) => s.no === no), ch.id + ' スプリント' + no);
  const covered = H.SPRINTS.filter((s) => J.chaptersOfSprint(s.no).length).length;
  assert.ok(covered >= 12, '予習できる章のあるスプリントが ' + covered);
  assert.deepEqual(J.sprintsOfChapter({ handout: { units: ['ハッカソン スプリント1「a」', 'ハッカソン スプリント10「b」'] } }), [1, 10]);
});

test('今日やること: 始めたばかりなら、ハッカソン・配属先・今日の5問が並ぶ', () => {
  const st = RGA.store.defaultState();
  const plan = J.todayPlan(st, '2026-10-19');
  assert.deepEqual(plan.filter((x) => x.mode !== 'texts').map((x) => x.mode), ['hack', 'work', 'challenge']);
  assert.ok(plan.every((x) => x.href.startsWith('#/')));
  st.challenge = RGA.challenge.recordDaily(RGA.challenge.emptyRecords(), '2026-10-19', 'all', 3);
  assert.ok(!J.todayPlan(st, '2026-10-19').some((x) => x.mode === 'challenge'), '今日の5問を終えたら出さない');
});

test('称号: 条件を満たすと取れて、取ったものは new に出ない', () => {
  const st = RGA.store.defaultState();
  assert.deepEqual(J.earnedTitles(st, '2026-10-19'), []);
  let pr = H.emptyProgress();
  for (const p of H.problemsOf(H.SPRINTS[0])) pr = H.solve(pr, p, false, 1);
  st.hack = pr;
  const fresh = J.newTitles(st, '2026-10-19');
  assert.ok(fresh.includes('first-review'));
  st.titles = Object.fromEntries(fresh.map((id) => [id, 1]));
  assert.deepEqual(J.newTitles(st, '2026-10-19'), []);
  assert.equal(new Set(J.TITLES.map((t) => t.id)).size, J.TITLES.length);
});

test('絆の称号と、今日やることの「新しいエピソード」', () => {
  const H = RGA.hack;
  const st = RGA.store.defaultState();
  let pr = H.emptyProgress();
  for (const s of H.SPRINTS.slice(0, 6)) for (const p of H.problemsOf(s)) pr = H.solve(pr, p, false, 1);
  st.hack = pr;
  assert.ok(J.earnedTitles(st, '2026-10-19').includes('bond-1'));
  assert.ok(J.todayPlan(st, '2026-10-19').some((x) => x.mode === 'bond' && x.href.startsWith('#/hack/team/')));
  st.hack.episodes = Object.fromEntries(RGA.bonds.unreadEpisodes(st).map((e) => [e.key, true]));
  assert.ok(!J.todayPlan(st, '2026-10-19').some((x) => x.mode === 'bond'), '読んだら出さない');
});
