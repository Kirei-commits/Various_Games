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
  assert.equal(c.body.generationConfig.maxOutputTokens, 4096); // 考える分を見込んで多めにとる
  assert.equal(out.text, 'こんにちは！');
  assert.deepEqual(out.usage, { input_tokens: 100, output_tokens: 20 });
  assert.equal(T.costOf(out.model, out.usage), 0); // 無料枠で使う前提なので数えない
  assert.ok(T.costOf('claude-opus-5-5', out.usage) > 0);
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
  assert.equal(T.modelFor({ provider: 'gemini' }, 0), '自動で選ぶ');
  assert.equal(T.modelFor({ provider: 'gemini', geminiModel: ' gemini-x-flash ' }, 0), 'gemini-x-flash');
  assert.equal(T.modelFor({ provider: 'claude', monthlyBudgetUsd: 1 }, 2), T.MODEL_LIGHT);
});

test('チューターも Gemini で答える（キーがないとルールベース）', async () => {
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: 'まず何を試しましたか？' }] } }], usageMetadata: {} });
  const unit = RGA.content.UNITS[0];
  const ctx = { unit, step: 'practice', question: 'わかりません', solution: unit.exercises[0].solution || '' };
  const out = await T.askTutor(ctx, { settings: { provider: 'gemini', geminiKey: 'k', geminiModel: 'gemini-9-flash' }, spentUsd: 0, fetchImpl: f });
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

// 一覧と生成を URL で答え分ける偽の fetch。gen(model) が { status, body } を返す
function geminiFetch(models, gen) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    if (/\/models\?/.test(url)) return { ok: true, status: 200, json: async () => ({ models }) };
    const model = decodeURIComponent(/models\/([^:]+):/.exec(url)[1]);
    const r = gen(model);
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  fn.calls = calls;
  return fn;
}
const ok = (text) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} } });
const MODELS = [
  { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
  { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.9-flash-preview-11-2026', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-3.8-flash-image', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
  { name: 'models/gemini-4.0-flash', supportedGenerationMethods: ['embedContent'] },
];

test('自動: 一覧から無料枠のある Flash を新しい順に（正式版 → プレビュー、Flash → Lite。Pro・画像・生成できないものは外す）', () => {
  assert.deepEqual(T.rankGeminiModels(MODELS), ['gemini-3.8-flash', 'gemini-3.8-flash-lite', 'gemini-2.5-flash', 'gemini-3.9-flash-preview-11-2026']);
  assert.deepEqual(T.rankGeminiModels(undefined), []);
  assert.equal(T.isAutoGemini({ geminiModel: 'auto' }), true);
  assert.equal(T.isAutoGemini({}), true);
  assert.equal(T.isAutoGemini({ geminiModel: 'gemini-3.8-flash' }), false);
});

test('自動: いちばん新しい Flash で答え、提供の終わったモデルや回数切れなら次の候補に回り、うまくいったモデルを覚える', async () => {
  const settings = { provider: 'gemini', geminiKey: 'auto-key-1' };
  const req = { system: '', messages: [{ role: 'user', content: 'やあ' }] };
  let gone = true;
  const f = geminiFetch(MODELS, (m) => {
    if (m === 'gemini-3.8-flash' && gone) return { status: 404, body: { error: { message: 'This model models/gemini-3.8-flash is no longer available to new users.' } } };
    if (m === 'gemini-3.8-flash-lite') return ok('lite です');
    return ok(m);
  });
  const out = await T.callLLM(f, settings, 0, req);
  assert.equal(out.text, 'lite です');
  assert.equal(out.model, 'gemini-3.8-flash-lite');
  assert.equal(f.calls[0].init.method, 'GET');
  assert.equal(f.calls[0].init.headers['x-goog-api-key'], 'auto-key-1');
  assert.equal(T.modelFor(settings, 0), 'gemini-3.8-flash-lite・自動');
  // 2回目は一覧を取り直さず、うまくいったモデルから
  const n = f.calls.length;
  await T.callLLM(f, settings, 0, req);
  assert.equal(f.calls.length, n + 1);
  assert.ok(f.calls[n].url.includes('gemini-3.8-flash-lite:'));
});

test('自動: 全部の候補が回数切れなら分かる言葉で伝える。ほかの失敗はそのまま。キーが違えば一覧で止まる', async () => {
  const req = { system: '', messages: [{ role: 'user', content: 'a' }] };
  const busy = geminiFetch(MODELS, () => ({ status: 429, body: { error: { message: 'RESOURCE_EXHAUSTED' } } }));
  await assert.rejects(T.callLLM(busy, { provider: 'gemini', geminiKey: 'auto-key-2' }, 0, req), /無料枠の回数/);
  assert.equal(busy.calls.filter((c) => c.init.method !== 'GET').length, 4); // 試すのは4つまで
  const bad = geminiFetch(MODELS, () => ({ status: 500, body: { error: { message: 'internal' } } }));
  await assert.rejects(T.callLLM(bad, { provider: 'gemini', geminiKey: 'auto-key-3' }, 0, req), /internal/);
  assert.equal(bad.calls.length, 2);
  const none = geminiFetch([{ name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] }], () => ok('x'));
  await assert.rejects(T.callLLM(none, { provider: 'gemini', geminiKey: 'auto-key-4' }, 0, req), /見つかりませんでした/);
  const denied = async () => ({ ok: false, status: 400, json: async () => ({ error: { message: 'API key not valid' } }) });
  await assert.rejects(T.callLLM(denied, { provider: 'gemini', geminiKey: 'auto-key-5' }, 0, req), /API キーを確かめて/);
  const broken = async () => ({ ok: false, status: 503, json: async () => { throw new Error('x'); } });
  await assert.rejects(T.callLLM(broken, { provider: 'gemini', geminiKey: 'auto-key-6' }, 0, req), /HTTP 503/);
});

test('以前の既定（gemini-2.5-flash）を保存していた人は、読み込むと自動に戻る', () => {
  const mem = () => ({ m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; }, removeItem(k) { delete this.m[k]; } });
  const local = mem();
  const st = S.defaultState();
  assert.equal(st.settings.geminiModel, 'auto');
  st.settings.geminiModel = 'gemini-2.5-flash';
  S.save(st, local, mem());
  assert.equal(S.load(local, mem()).settings.geminiModel, 'auto');
  st.settings.geminiModel = 'gemini-3.8-flash';
  S.save(st, local, mem());
  assert.equal(S.load(local, mem()).settings.geminiModel, 'gemini-3.8-flash');
});

test('Gemini: 考える分を見込んで出力の上限を多めにとり、JSON を頼むときは JSON で返させる。考えた過程は答えに混ぜず、空や途中切れはエラー', async () => {
  const settings = { provider: 'gemini', geminiKey: 'k', geminiModel: 'gemini-x-flash' };
  const f = fakeFetch({ candidates: [{ content: { parts: [{ text: '考え中…', thought: true }, { text: '[]' }] } }] });
  const out = await T.callLLM(f, settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }], maxTokens: 700, json: true });
  assert.equal(out.text, '[]');
  assert.equal(f.calls[0].body.generationConfig.responseMimeType, 'application/json');
  assert.ok(f.calls[0].body.generationConfig.maxOutputTokens >= 4096);
  const g = fakeFetch({ candidates: [{ content: { parts: [{ text: 'やあ' }] } }] });
  await T.callLLM(g, settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }] });
  assert.equal(g.calls[0].body.generationConfig.responseMimeType, undefined);
  await assert.rejects(T.callLLM(fakeFetch({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] }), settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }] }), /途中で切れ/);
  await assert.rejects(T.callLLM(fakeFetch({ candidates: [{ content: { parts: [{ text: ' ' }] }, finishReason: 'STOP' }] }), settings, 0, { system: '', messages: [{ role: 'user', content: 'a' }] }), /空/);
});
