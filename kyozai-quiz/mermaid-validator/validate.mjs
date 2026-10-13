// 標準入力で受け取った Mermaid コードの配列を mermaid.parse() にかけ、
// [{ ok: true } | { ok: false, error: "..." }] を標準出力へ返す。
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { default: mermaid } = await import('mermaid');
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

let input = '';
for await (const chunk of process.stdin) input += chunk;
const codes = JSON.parse(input);

const results = [];
for (const code of codes) {
  try {
    await mermaid.parse(code);
    results.push({ ok: true });
  } catch (e) {
    results.push({ ok: false, error: String(e?.message ?? e).slice(0, 2000) });
  }
}
process.stdout.write(JSON.stringify(results));
