import { test } from "node:test";
import assert from "node:assert/strict";
import { DailyQuotaExceeded, GeminiClient, isDailyQuota, retryDelay } from "../../js/gemini.js";

const ok = (value) => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: "考え中", thought: true }, { text: JSON.stringify(value) }] } }] }) });
const err = (status, error) => ({ ok: false, status, statusText: "", json: async () => ({ error }) });
const quota = (quotaId, delay) => ({
  code: 429, message: "quota",
  details: [
    { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId }] },
    ...(delay ? [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: delay }] : []),
  ],
});
const schema = { required: ["a"] };

function client(responses) {
  const sleeps = [];
  const calls = [];
  const c = new GeminiClient({
    apiKey: "k", model: "m", rpm: 0, retries: 3,
    fetchImpl: async (url, init) => { calls.push({ url, body: JSON.parse(init.body), headers: init.headers }); return responses.shift(); },
    sleepImpl: async (ms) => { sleeps.push(ms); },
  });
  return { c, sleeps, calls };
}

test("思考パートを除いて JSON を読む・画像とスキーマを送る", async () => {
  const { c, calls } = client([ok({ a: 1 })]);
  assert.deepEqual(await c.generateJson("p", schema, ["IMG"]), { a: 1 });
  assert.match(calls[0].url, /models\/m:generateContent$/);
  assert.equal(calls[0].headers["x-goog-api-key"], "k");
  assert.deepEqual(calls[0].body.contents[0].parts, [{ inline_data: { mime_type: "image/png", data: "IMG" } }, { text: "p" }]);
  assert.deepEqual(calls[0].body.generationConfig, { responseMimeType: "application/json", responseSchema: schema });
});

test("分あたりの上限は retryDelay だけ待って再試行", async () => {
  const { c, sleeps } = client([err(429, quota("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "7s")), ok({ a: 2 })]);
  assert.deepEqual(await c.generateJson("p", schema), { a: 2 });
  assert.deepEqual(sleeps, [8000]);
});

test("1日の上限に達したら、それ以降は API を呼ばない", async () => {
  const { c, calls } = client([err(429, quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier"))]);
  await assert.rejects(c.generateJson("p", schema), DailyQuotaExceeded);
  await assert.rejects(c.generateJson("p", schema), DailyQuotaExceeded);
  assert.equal(calls.length, 1);
});

test("認証エラーは再試行しない・5xx と形式不備は再試行する", async () => {
  const a = client([err(403, { message: "bad key" })]);
  await assert.rejects(a.c.generateJson("p", schema), /403: bad key/);
  assert.equal(a.calls.length, 1);
  const b = client([err(503, { message: "busy" }), ok({ b: 1 }), ok({ a: 3 })]);
  assert.deepEqual(await b.c.generateJson("p", schema), { a: 3 });
  assert.equal(b.calls.length, 3);
  const d = client([err(500, {}), err(500, {}), err(500, {}), err(500, {})]);
  await assert.rejects(d.c.generateJson("p", schema), /4回試しても失敗/);
});

test("エラー詳細の読み取り", () => {
  assert.equal(isDailyQuota({ error: quota("GenerateRequestsPerDayPerProjectPerModel-FreeTier") }), true);
  assert.equal(retryDelay({ error: quota("PerMinute", "37s") }), 37);
  assert.equal(retryDelay(null), null);
});
