/*
 * テストの実行（NFR-01）
 * - runSuite / runEvals は外側の変数を一切参照しない。toString() してワーカーに渡すため。
 * - ブラウザでは毎回新しい Web Worker を作り、ネットワーク系の API を潰してから実行し、時間切れなら止める。
 * - Node のテストでは runSuite をそのまま呼ぶ。
 *
 * テストの書き方（学習者のリポジトリの tests/*.test.js も同じ）:
 *   test('0円', () => { expect(formatYen(0)).toBe('¥0'); });
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});

  function runSuite(payload) {
    const sources = payload.sources || [];
    const testCode = payload.tests || '';
    const fmt = (v) => {
      if (v === undefined) return 'undefined';
      if (typeof v === 'function') return '[関数]';
      if (typeof v === 'number' && Number.isNaN(v)) return 'NaN';
      try { return JSON.stringify(v); } catch (e) { return String(v); }
    };
    const eq = (a, b) => {
      if (Object.is(a, b)) return true;
      if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
      if (Array.isArray(a) !== Array.isArray(b)) return false;
      const ka = Object.keys(a);
      const kb = Object.keys(b);
      if (ka.length !== kb.length) return false;
      return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && eq(a[k], b[k]));
    };
    function fail(expected, actual) {
      const e = new Error('期待した値と違います');
      e.isExpectation = true;
      e.expected = expected;
      e.actual = actual;
      return e;
    }
    function expect(actual) {
      const m = {
        toBe(exp) { if (!Object.is(actual, exp)) throw fail(fmt(exp), fmt(actual)); },
        toEqual(exp) { if (!eq(actual, exp)) throw fail(fmt(exp), fmt(actual)); },
        toBeTruthy() { if (!actual) throw fail('真になる値', fmt(actual)); },
        toBeFalsy() { if (actual) throw fail('偽になる値', fmt(actual)); },
        toBeNull() { if (actual !== null) throw fail('null', fmt(actual)); },
        toContain(x) {
          const ok = actual !== null && actual !== undefined && typeof actual.includes === 'function' && actual.includes(x);
          if (!ok) throw fail(fmt(x) + ' を含む', fmt(actual));
        },
        toThrow(sub) {
          if (typeof actual !== 'function') throw fail('関数', fmt(actual));
          let err = null;
          try { actual(); } catch (e) { err = e || new Error(''); }
          if (!err) throw fail(sub ? '「' + sub + '」を含むエラー' : 'エラーになる', 'エラーにならなかった');
          if (sub && !String(err.message).includes(sub)) throw fail('「' + sub + '」を含むエラー', 'エラー「' + err.message + '」');
        },
      };
      m.not = {
        toBe(exp) { if (Object.is(actual, exp)) throw fail(fmt(exp) + ' 以外', fmt(actual)); },
        toEqual(exp) { if (eq(actual, exp)) throw fail(fmt(exp) + ' 以外', fmt(actual)); },
        toContain(x) {
          if (actual !== null && actual !== undefined && typeof actual.includes === 'function' && actual.includes(x)) {
            throw fail(fmt(x) + ' を含まない', fmt(actual));
          }
        },
        toThrow() {
          try { actual(); } catch (e) { throw fail('エラーにならない', 'エラー「' + (e && e.message) + '」'); }
        },
      };
      return m;
    }

    const cases = [];
    const test = (name, fn) => { cases.push({ name: String(name), fn }); };
    const body = '"use strict";\n' + sources.join('\n;\n') + '\n;\n' + testCode;
    try {
      const fn = new Function('test', 'expect', body);
      fn(test, expect);
    } catch (e) {
      const kind = e instanceof SyntaxError ? '構文エラー' : '読み込み中のエラー';
      return { ok: false, error: kind + ': ' + (e && e.message), results: [] };
    }
    const results = cases.map((c) => {
      try {
        c.fn();
        return { name: c.name, pass: true };
      } catch (e) {
        if (e && e.isExpectation) return { name: c.name, pass: false, expected: e.expected, actual: e.actual };
        return { name: c.name, pass: false, error: (e && e.name ? e.name + ': ' : '') + (e && e.message) };
      }
    });
    if (!results.length) return { ok: false, error: 'テストが1つもありません', results };
    return { ok: results.every((r) => r.pass), results };
  }

  // 式を評価して結果を文字列で返す（練習銀行のプレビュー用）
  function runEvals(payload) {
    const sources = payload.sources || [];
    const exprs = payload.evals || [];
    const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
    let fns;
    try {
      const list = exprs.map((e) => '() => (' + e + ')').join(',\n');
      fns = new Function('"use strict";\n' + sources.join('\n;\n') + '\n;\nreturn [' + list + '];')();
    } catch (e) {
      return exprs.map(() => ({ error: String(e && e.message) }));
    }
    return fns.map((f) => {
      try { return { value: show(f()) }; } catch (e) { return { error: String(e && e.message) }; }
    });
  }

  // 1回の依頼で複数の組を実行する（テストを書く課題：正しい実装＋変異体）
  function runJob(job) {
    if (job.kind === 'evals') return runEvals(job);
    if (job.kind === 'many') return job.suites.map((s) => runSuite(s));
    return runSuite(job);
  }

  // ワーカーの中身。ネットワークに出る口を先に潰す（ページ側の CSP の connect-src でも止めている）
  const WORKER_SOURCE = [
    '"use strict";',
    'for (const k of ["fetch","XMLHttpRequest","WebSocket","EventSource","importScripts","indexedDB","caches","BroadcastChannel","Worker","WebTransport"]) {',
    '  try { Object.defineProperty(self, k, { value: undefined, writable: false, configurable: false }); } catch (e) {}',
    '}',
    'const runSuite = ' + runSuite.toString() + ';',
    'const runEvals = ' + runEvals.toString() + ';',
    'const runJob = ' + runJob.toString() + ';',
    'self.onmessage = (e) => { let out; try { out = runJob(e.data); } catch (err) { out = { ok: false, error: String(err && err.message), results: [] }; } self.postMessage(out); };',
  ].join('\n');

  const TIMEOUT_MS = 5000; // NFR-01 の上限（30秒）より短くして、無限ループにすぐ気づけるようにする

  // ブラウザ用。毎回使い捨てのワーカーで動かす（前の実行の副作用を持ち越さない）
  function runInSandbox(job, timeoutMs) {
    const limit = timeoutMs || TIMEOUT_MS;
    const timeoutResult = () => {
      const r = { ok: false, error: '時間切れ（' + limit / 1000 + '秒）: 無限ループになっていませんか？', results: [], timeout: true };
      if (job.kind === 'many') return job.suites.map(() => r);
      if (job.kind === 'evals') return (job.evals || []).map(() => ({ error: '時間切れ' }));
      return r;
    };
    if (typeof g.Worker !== 'function' || typeof g.Blob !== 'function') {
      return Promise.resolve(runJob(job));
    }
    return new Promise((resolve) => {
      let url;
      let worker;
      try {
        url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
        worker = new Worker(url);
      } catch (e) {
        resolve(runJob(job));
        return;
      }
      const done = (out) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve(out);
      };
      const timer = setTimeout(() => done(timeoutResult()), limit);
      worker.onmessage = (e) => done(e.data);
      worker.onerror = (e) => {
        e.preventDefault();
        done({ ok: false, error: '実行エラー: ' + (e.message || '不明'), results: [] });
      };
      worker.postMessage(job);
    });
  }

  RGA.runner = { runSuite, runEvals, runJob, runInSandbox, TIMEOUT_MS };
})(globalThis);
