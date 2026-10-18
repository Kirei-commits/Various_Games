// TypeScript 対応: npm の typescript と、そのパッケージの型定義で compile を確かめる（ブラウザでは同じ版を CDN から読む）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { RGA } from './setup.mjs';
import '../../js/ts.js';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const LIB_DIR = path.dirname(require.resolve('typescript/lib/lib.es2020.d.ts'));
const libs = await RGA.ts.collectLibs(async (name) => fs.readFileSync(path.join(LIB_DIR, name), 'utf8'));

test('CDN から読むのと同じ版を使っている', () => {
  assert.equal(ts.version, RGA.ts.VERSION);
  assert.ok(libs['lib.es5.d.ts'] && libs['lib.es2020.d.ts'] && libs['lib.decorators.d.ts']);
});

test('型の付いたコードは通り、JavaScript になってテストが動く', () => {
  const r = RGA.ts.compile(ts, libs, "function formatYen(n: number): string {\n  const sign = n < 0 ? '-' : '';\n  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');\n}\n");
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.ok(!r.js.includes(': number'));
  const u = RGA.content.UNITS[0];
  const ex = u.exercises.find((e) => e.stage === 'scratch');
  assert.equal(RGA.runner.runSuite({ sources: [r.js], tests: ex.tests }).ok, true);
});

test('strict では型の無い引数・型の誤りを行番号つきで返す', () => {
  const r = RGA.ts.compile(ts, libs, "function f(n) {\n  return n;\n}\nconst s: string = 1;\n");
  assert.equal(r.ok, false);
  assert.deepEqual(r.diagnostics.map((d) => d.line), [1, 4]);
  assert.match(r.diagnostics[0].message, /implicitly has an 'any' type/);
});

test('noImplicitAny: false なら、AI が書いた JavaScript もそのまま通る', () => {
  for (const u of RGA.content.UNITS) {
    const r = RGA.ts.compile(ts, libs, u.aiTask.good, { noImplicitAny: false });
    assert.equal(r.ok, true, u.id + ': ' + JSON.stringify(r.diagnostics));
  }
});

test('すべての「ゼロから」のお手本に型を付ければ strict で通る（例: L2-01）', () => {
  const code = `function applyTransfer(accounts: Record<string, number>, t: { from: string; to: string; amount: number }): Record<string, number> {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
  if (t.from === t.to) throw new Error('同じ口座には振り込めません');
  if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] = (next[t.to] ?? 0) + t.amount;
  return next;
}`;
  assert.equal(RGA.ts.compile(ts, libs, code).ok, true);
});
