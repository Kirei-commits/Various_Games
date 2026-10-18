import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const S = RGA.store;

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('FR-053 / NFR-05 監査ログはハッシュの鎖で改ざんを検知できる', () => {
  let log = [];
  for (let i = 0; i < 5; i++) log = S.appendLog(log, { unitId: 'L1-01', kind: 'tutor', input: 'q' + i, output: 'a' + i }, 1_700_000_000_000 + i, 'learner-1');
  assert.deepEqual(S.verifyLog(log), { ok: true, count: 5, brokenAt: -1 });
  const tampered = log.map((e) => ({ ...e }));
  tampered[2].output = '書き換え';
  assert.equal(S.verifyLog(tampered).brokenAt, 2);
  const dropped = [log[0], log[1], log[3], log[4]];
  assert.equal(S.verifyLog(dropped).ok, false);
  assert.equal(log[0].learnerId, 'learner-1');
  assert.match(log[0].time, /^\d{4}-\d{2}-\d{2}T/);
});

test('API キーは「この端末に保存」を選んだときだけ localStorage に残す（NFR-03）', () => {
  const local = memStorage();
  const session = memStorage();
  const st = S.defaultState();
  st.settings.apiKey = 'sk-ant-xxx';
  S.save(st, local, session);
  assert.ok(!local.getItem(S.KEY).includes('sk-ant'));
  assert.equal(local.getItem(S.KEY_SECRET), null);
  assert.equal(session.getItem(S.KEY_SECRET), 'sk-ant-xxx');
  assert.equal(S.load(local, session).settings.apiKey, 'sk-ant-xxx');
  st.settings.rememberKey = true;
  S.save(st, local, session);
  assert.equal(local.getItem(S.KEY_SECRET), 'sk-ant-xxx');
  assert.equal(S.load(local, memStorage()).settings.apiKey, 'sk-ant-xxx');
});

test('壊れた保存データでも最初から始められる', () => {
  const local = memStorage();
  local.setItem(S.KEY, '{壊れた');
  assert.equal(S.load(local, null).user, null);
});

test('今月の利用料は月が変わると0から', () => {
  let st = S.defaultState();
  st = S.addSpend(st, 1.5, Date.UTC(2026, 9, 10));
  st = S.addSpend(st, 1, Date.UTC(2026, 9, 20));
  assert.equal(S.spentThisMonth(st, Date.UTC(2026, 9, 25)), 2.5);
  assert.equal(S.spentThisMonth(st, Date.UTC(2026, 10, 1)), 0);
});

test('FR-050 計測を足し込む', () => {
  let e = S.newEnrollment('L1-01', 0);
  e = S.addMetric(e, 'off', 'failures', 1);
  e = S.addMetric(e, 'on', 'ms', 60000);
  const rows = RGA.rules.metricRows({ ...e, estimate: { off: 10, on: 5 } });
  assert.equal(rows[0].failures, 1);
  assert.equal(rows[1].minutes, 1);
  assert.equal(rows[1].estimate, 5);
});

test('Q-12 書き出したデータを読み込める（API キーは今の端末のものを残す）', () => {
  const st = S.defaultState();
  st.user = { id: 'learner-x', name: 'A' };
  st.aiLog = S.appendLog([], { unitId: 'L1-01', kind: 'tutor', input: 'q', output: 'a' }, 0, 'learner-x');
  const { apiKey, ...settings } = st.settings;
  const text = JSON.stringify({ ...st, settings });
  const cur = S.defaultState();
  cur.settings.apiKey = 'keep-me';
  const r = S.importData(text, cur);
  assert.equal(r.state.user.id, 'learner-x');
  assert.equal(r.state.settings.apiKey, 'keep-me');
  assert.equal(r.logOk, true);
  assert.match(S.importData('{', cur).error, /JSON/);
  assert.match(S.importData('{"version":2}', cur).error, /version/);
  const tampered = JSON.parse(text);
  tampered.aiLog[0].output = 'x';
  assert.equal(S.importData(JSON.stringify(tampered), cur).logOk, false);
});
