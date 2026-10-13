// ブラウザから Gemini API（REST）を直接呼ぶ。Python 版 kyozai_quiz/llm.py と同じく無料枠向けに:
// - 呼び出しの間隔を空ける（既定は毎分4回）
// - 429（分あたりの上限）は API が返す retryDelay だけ待って再試行
// - 1日の上限に達したら、それ以降は API を呼ばずにすぐ失敗させる（ページは「未処理」になり、あとで再実行できる）

export const DAILY_QUOTA_MESSAGE =
  "Gemini API の1日あたりの上限に達しました。上限は太平洋時間の0時（日本時間の16時または17時）に戻ります。戻ったら「未処理を再実行」してください";

export class LLMError extends Error {
  /** fatal: 再試行しても同じ結果になるエラー（認証エラー・1日の上限など） */
  constructor(message, { fatal = false } = {}) {
    super(message);
    this.name = "LLMError";
    this.fatal = fatal;
  }
}

export class DailyQuotaExceeded extends LLMError {
  constructor() {
    super(DAILY_QUOTA_MESSAGE, { fatal: true });
    this.name = "DailyQuotaExceeded";
  }
}

const MAX_WAIT_SECONDS = 120;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GeminiClient {
  constructor({ apiKey, model, rpm = 4, retries = 3, backoffMs = 2000, fetchImpl, sleepImpl } = {}) {
    if (!apiKey) throw new LLMError("Gemini の API キーが設定されていません（設定画面で入力してください）");
    this.apiKey = apiKey;
    this.modelName = model;
    this.retries = retries;
    this.backoffMs = backoffMs;
    this.intervalMs = rpm > 0 ? 60000 / rpm : 0;
    this.nextAt = 0;
    this.dailyQuotaExceeded = false;
    this.fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this.sleep = sleepImpl || sleep;
  }

  async waitTurn() {
    if (!this.intervalMs) return;
    const now = Date.now();
    const start = Math.max(now, this.nextAt);
    this.nextAt = start + this.intervalMs;
    if (start > now) await this.sleep(start - now);
  }

  /** images は PNG の base64 文字列の配列 */
  async generateJson(prompt, schema, images = []) {
    if (this.dailyQuotaExceeded) throw new DailyQuotaExceeded();
    const body = {
      contents: [
        {
          role: "user",
          parts: [...images.map((data) => ({ inline_data: { mime_type: "image/png", data } })), { text: prompt }],
        },
      ],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:generateContent`;

    let lastError;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      let waitMs = this.backoffMs * 2 ** attempt;
      await this.waitTurn();
      try {
        const res = await this.fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": this.apiKey },
          body: JSON.stringify(body),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const err = json?.error ?? {};
          if (res.status === 429) {
            if (isDailyQuota(json)) {
              this.dailyQuotaExceeded = true;
              throw new DailyQuotaExceeded();
            }
            const delay = retryDelay(json);
            if (delay != null) {
              if (delay > MAX_WAIT_SECONDS) {
                throw new LLMError(`レート制限: ${Math.round(delay)}秒待つよう指示されたため中断しました`, { fatal: true });
              }
              waitMs = (delay + 1) * 1000;
            }
            lastError = new LLMError(`429 ${err.message ?? ""}`);
          } else if (res.status >= 400 && res.status < 500) {
            // 認証エラーやモデル名の誤りは何度やっても同じなので打ち切る
            throw new LLMError(`Gemini API エラー ${res.status}: ${err.message ?? res.statusText}`, { fatal: true });
          } else {
            lastError = new LLMError(`Gemini API エラー ${res.status}: ${err.message ?? res.statusText}`);
          }
        } else {
          return parseResponse(json, schema);
        }
      } catch (e) {
        if (e.fatal) throw e;
        lastError = e; // 通信エラー・応答の形式不備などは再試行する
      }
      if (attempt < this.retries) await this.sleep(waitMs);
    }
    throw new LLMError(`${this.retries + 1}回試しても失敗しました: ${lastError?.message ?? lastError}`);
  }
}

function parseResponse(json, schema) {
  const candidate = json?.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  if (!text) {
    const reason = json?.promptFeedback?.blockReason ?? candidate?.finishReason ?? "不明";
    throw new LLMError(`空の応答です（理由: ${reason}）`);
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new LLMError("応答が JSON として読めません");
  }
  for (const key of schema.required ?? []) {
    if (!(key in value)) throw new LLMError(`応答に ${key} がありません`);
  }
  return value;
}

const details = (json) => json?.error?.details ?? [];

export function isDailyQuota(json) {
  return details(json).some((d) => (d.violations ?? []).some((v) => String(v.quotaId ?? "").includes("PerDay")));
}

export function retryDelay(json) {
  for (const d of details(json)) {
    if (String(d["@type"] ?? "").endsWith("RetryInfo")) {
      const m = /^([\d.]+)s$/.exec(String(d.retryDelay ?? ""));
      if (m) return Number(m[1]);
    }
  }
  return null;
}
