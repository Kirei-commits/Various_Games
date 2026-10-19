// メンター用の学習レポート: 進み具合だけを入れ、会話や本文・鍵は入れない
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const P = RGA.report;

test('レポートは進み具合の数と状態だけ。会話・振り返りの本文・AIのやりとり・API キーは入らない', () => {
  const st = RGA.store.defaultState();
  st.user = { id: 'u1', name: 'テスト新人' };
  st.settings.apiKey = 'sk-ant-SECRET-KEY';
  st.journal = [{ text: 'とても個人的な振り返り', time: 1 }];
  st.aiLog = [{ input: '秘密の質問', output: 'x' }];
  let pr = RGA.hack.emptyProgress();
  for (const p of RGA.hack.problemsOf(RGA.hack.SPRINTS[0])) pr = RGA.hack.solve(pr, p, false, 1);
  pr.chat = { rio: [{ role: 'user', text: '内緒の相談' }] };
  st.hack = pr;
  const r = P.buildReport(st, Date.UTC(2026, 9, 19));
  const text = JSON.stringify(r);
  for (const secret of ['SECRET', '個人的な振り返り', '秘密の質問', '内緒の相談']) assert.ok(!text.includes(secret), secret + ' が入っている');
  assert.equal(r.learner, 'テスト新人');
  assert.equal(r.hackathon.sprint, 2);
  assert.equal(r.hackathon.solvedSelf, RGA.hack.problemsOf(RGA.hack.SPRINTS[0]).length);
  assert.equal(r.texts.length, 4);
  assert.equal(r.generatedAt, '2026-10-19T00:00:00.000Z');
});

test('受け取ったファイルを確かめる: 正しいレポートは読め、ほかのファイルは理由つきで断る', () => {
  const r = P.buildReport(RGA.store.defaultState(), 0);
  assert.ok(P.parseReport(JSON.stringify(r)).report);
  assert.ok(P.parseReport('{').error);
  assert.ok(P.parseReport(JSON.stringify({ version: 1 })).error.includes('学習レポートではありません'));
  assert.ok(P.parseReport(JSON.stringify({ ...r, version: 9 })).error.includes('版'));
  const broken = { ...r };
  delete broken.work;
  assert.ok(P.parseReport(JSON.stringify(broken)).error.includes('work'));
});
