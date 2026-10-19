// 絆とエピソード
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const B = RGA.bonds;
const H = RGA.hack;
const WANT = ['madoka', 'hikari', 'rio', 'daichi', 'osamu', 'shiraishi', 'kumagai', 'kujo', 'himuro', 'kasuga', 'onizuka', 'yabuki', 'fukamachi', 'kazami', 'saotome', 'miyamoto'];
const NG = ['恋', '好きです', '付き合', 'デート', 'ライバル', '負けない'];

test('エピソード: 16人に Lv1・Lv2 がそろい、話し手と名前はすべて登場人物', () => {
  for (const id of WANT) assert.deepEqual(B.EPISODES.filter((e) => e.char === id).map((e) => e.level).sort(), [1, 2], id);
  const keys = B.EPISODES.map(B.episodeKey);
  assert.equal(new Set(keys).size, keys.length);
  for (const e of B.EPISODES) {
    assert.ok(H.CAST_BY_ID[e.char] && e.title && e.lines.length >= 4 && e.lines.length <= 10, B.episodeKey(e));
    assert.ok(e.lines.some(([who]) => who === e.char) && e.lines.some(([who]) => who === 'player'), B.episodeKey(e) + ' 本人と主人公が話す');
    for (const [who, text] of e.lines) {
      assert.ok(H.CAST_BY_ID[who] && text, B.episodeKey(e) + ' ' + who);
      for (const m of text.matchAll(/\{(\w+)\}/g)) assert.ok(H.CAST_BY_ID[m[1]], B.episodeKey(e) + ' {' + m[1] + '}');
      for (const w of NG) assert.ok(!text.includes(w), B.episodeKey(e) + ' に「' + w + '」（恋愛・ライバルの要素は入れない）');
    }
  }
});

test('絆: 一緒に終えたスプリント・聞きに行った相談・話した回数で深まり、Lv で エピソードが開く', () => {
  const st = RGA.store.defaultState();
  assert.equal(B.bondPoints(st, 'rio'), 0);
  assert.ok(B.episodesOf(st, 'rio').every((e) => !e.unlocked));
  let pr = H.emptyProgress();
  for (const s of H.SPRINTS.slice(0, 6)) for (const p of H.problemsOf(s)) pr = H.solve(pr, p, false, 1);
  st.hack = pr;
  const pts = B.bondPoints(st, 'rio');
  assert.ok(pts >= 3, 'スプリント6までで神崎との絆 ' + pts);
  assert.equal(B.episodesOf(st, 'rio')[0].unlocked, true);
  // 相談は +2、話すのは5回まで
  const c = H.consultsOf(1)[0];
  const before = B.bondPoints(st, c.who);
  st.hack.consulted = { '1-0': true };
  assert.equal(B.bondPoints(st, c.who), before + 2);
  st.hack.chat = { [c.who]: Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'char' : 'user', text: 'x' })) };
  assert.equal(B.bondPoints(st, c.who), before + 2 + 5);
  assert.equal(B.bondLevel(0), 0);
  assert.equal(B.bondLevel(3), 1);
  assert.equal(B.bondLevel(8), 2);
  assert.ok(B.unreadEpisodes(st).length >= 1);
});
