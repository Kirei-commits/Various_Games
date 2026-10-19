// Gemini API への対応: 送り先・形・応答の読み方、AI が使えるかの判定、キーの保存
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const T = RGA.tutor;
const S = RGA.store;

function fakeFetch(reply, status = 200) {
  const calls = [];
  const fn = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 400, status, json: async () => reply }; };
  fn.calls = calls;
  return fn;
}

test('Gemini を選ぶと generateContent に送り、system と会話を Gemini の形にし、応答を読み取る', async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'こんにちは' }, { text: '！' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } });
  const settings = { provider: 'gemini', geminiKey: 'AIza-test', geminiModel: 'gemini-2.5-flash' };
  const out = await T.callLLM(f, settings, 0, { system: 'あなたは先輩です', messages: [{ role: 'user', content: 'やあ' }, { role: 'assistant', content: 'おう' }, { role: 'user', content: '元気？' }], maxTokens: 300 });
  const c = f.calls[0];
  assert.equal(c.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(c.init.headers['x-goog-api-key'], 'AIza-test');
  assert.equal(c.body.systemInstruction.parts[0].text, 'あなたは先輩です');
  assert.deepEqual(c.body.contents.map((x) => x.role), ['user', 'model', 'user']);
  assert.equal(c.body.generationConfig.maxOutputTokens, 300);
  assert.equal(out.text, 'こんにちは！');
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
  assert.ok(T.costOf(out.model, out.usage) > 0);
});

test('Gemini のエラー: モデル名の間違い（404）は直し方を添え、安全の判定で止まったら断られたと伝える', async () => {
  const settings = { provider: 'gemini', geminiKey: 'k', geminiModel: 'gemini-x' };
  await assert.rejects(T.callLLM(fakeFetch({ error: { message: 'model not found' } }, 404), settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }] }), /モデル名/);
  await assert.rejects(T.callLLM(fakeFetch({ candidates: [{ finishReason: 'SAFETY' }] }), settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }] }), /断られ/);
});

test('AI が使えるかは、選んだ会社のキーで決まる（停止中は使わない）', () => {
  assert.equal(T.hasAI({ provider: 'claude', apiKey: 'sk' }), true);
  assert.equal(T.hasAI({ provider: 'gemini', apiKey: 'sk' }), false);
  assert.equal(T.hasAI({ provider: 'gemini', geminiKey: 'AIza' }), true);
  assert.equal(T.hasAI({ provider: 'gemini', geminiKey: 'AIza', tutorStopped: true }), false);
  assert.equal(T.modelFor({ provider: 'gemini' }, 0), T.GEMINI_DEFAULT);
  assert.equal(T.modelFor({ provider: 'claude', monthlyBudgetUsd: 1 }, 2), T.MODEL_LIGHT);
});

test('チューターも Gemini で答える（キーがないとルールベース）', async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'まず何を試しましたか？' }] } }], usageMetadata: {} });
  const unit = RGA.content.UNITS[0];
  const ctx = { unit, step: 'practice', question: 'わかりません', solution: unit.exercises[0].solution || '' };
  const out = await T.askTutor(ctx, { settings: { provider: 'gemini', geminiKey: 'k' }, spentUsd: 0, fetchImpl: f });
  assert.equal(out.source, 'llm');
  assert.ok(f.calls[0].url.includes('generativelanguage'));
  const rule = await T.askTutor(ctx, { settings: { provider: 'gemini' }, spentUsd: 0, fetchImpl: f });
  assert.equal(rule.source, 'rule');
});

test('Gemini のキーも保存データの本体には入らず、書き出しにも入らない', () => {
  const mem = () => ({ m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; }, removeItem(k) { delete this.m[k]; } });
  const local = mem();
  const session = mem();
  const st = S.defaultState();
  st.settings.geminiKey = 'AIza-SECRET';
  st.settings.apiKey = 'sk-SECRET';
  S.save(st, local, session);
  assert.ok(!local.getItem(S.KEY).includes('SECRET'));
  assert.equal(session.getItem(S.KEY_SECRET_GEMINI), 'AIza-SECRET');
  assert.equal(S.load(local, session).settings.geminiKey, 'AIza-SECRET');
  assert.ok(!JSON.stringify(S.exportable(st)).includes('SECRET'));
  st.settings.rememberKey = true;
  S.save(st, local, session);
  assert.equal(local.getItem(S.KEY_SECRET_GEMINI), 'AIza-SECRET');
});
