/**
 * Claude に作問させる経路（任意）。
 *
 * ブラウザから Anthropic を直接叩くことはしない。叩く作りにすると、
 * ページを開いた全員に API キーが配られることになる。
 * 代わりに、講師が手元で立てたサーバー（tools/studio.mjs）に投げる。鍵はそちらにしか無い。
 *
 * サーバーが居ないとき（GitHub Pages で開いたときなど）は `available()` が false を返し、
 * 講師画面は「この端末で作る」だけを出す。落ちないし、嘘もつかない。
 */

const ENDPOINT = '/api/generate';
const STATUS = '/api/status';

/** 生成サーバーが居るか、Claude が使える状態かを調べる */
export async function probe({ timeoutMs = 1500, fetchImpl = globalThis.fetch } = {}) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetchImpl(STATUS, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { server: false, claude: false, reason: `状態の取得に失敗（${res.status}）` };
    const body = await res.json();
    return {
      server: true,
      claude: !!body.claude,
      model: body.model || null,
      reason: body.claude ? '' : 'サーバーに ANTHROPIC_API_KEY が設定されていません。'
    };
  } catch (e) {
    return { server: false, claude: false, reason: '生成サーバーが見つかりません（npm run studio で立ちます）。' };
  }
}

/**
 * 資料を投げて問題集を作らせる。
 * 返ってくる形は、この端末で作ったとき（generate.js）とまったく同じ。
 */
export async function generateWithClaude(payload, { fetchImpl = globalThis.fetch } = {}) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({ error: `応答を読めませんでした（${res.status}）` }));
  if (!res.ok) throw new Error(body.error || `生成に失敗しました（${res.status}）`);
  if (!body.bank) throw new Error('生成結果に問題集が入っていません。');
  return body;
}

export const ENDPOINTS = { ENDPOINT, STATUS };
