/*
 * TypeScript 対応（設定で「TypeScript」を選んだときだけ使う）
 * - コンパイラと型定義（lib.es2020 とそれが参照するもの）を、初めて使うときに CDN から読み込む
 * - 型チェック（strict）をして、JavaScript に変換したコードをテストの実行に回す
 * - compile / collectLibs は ts とファイルの読み方を引数でもらう（Node のテストでは npm の typescript を渡す）
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});

  const VERSION = '5.6.3';
  const BASE = 'https://cdn.jsdelivr.net/npm/typescript@' + VERSION + '/lib/';
  const ROOT_LIB = 'lib.es2020.d.ts';
  const FILE = 'main.ts';

  // lib.es2020.d.ts から /// <reference lib="…" /> をたどって、必要な型定義をすべて集める
  async function collectLibs(readText) {
    const libs = {};
    let queue = [ROOT_LIB];
    while (queue.length) {
      const names = queue.filter((n) => !(n in libs));
      queue = [];
      const texts = await Promise.all(names.map((n) => readText(n)));
      names.forEach((n, i) => {
        libs[n] = texts[i];
        for (const m of texts[i].matchAll(/\/\/\/\s*<reference\s+lib="([^"]+)"\s*\/>/g)) queue.push('lib.' + m[1].toLowerCase() + '.d.ts');
      });
    }
    return libs;
  }

  /**
   * 型チェックして JavaScript にする。
   * opts.noImplicitAny: false にすると strict を外し、型の書かれていない JavaScript も通す（AI の書いたコードなど）
   * 戻り値: { ok, diagnostics: [{ line, message }], js }
   */
  function compile(ts, libs, code, opts) {
    const o = opts || {};
    const options = {
      target: ts.ScriptTarget.ES2020,
      // 型の書かれていない JavaScript（AI の書いたコードなど）を通すときは strict を外す
      strict: o.noImplicitAny !== false,
      lib: [ROOT_LIB],
      types: [],
      noEmitOnError: false,
      removeComments: false,
    };
    let js = '';
    const sources = {};
    const getSource = (name, lang) => {
      if (name === FILE) return ts.createSourceFile(name, code, lang, true);
      if (!(name in libs)) return undefined;
      if (!sources[name]) sources[name] = ts.createSourceFile(name, libs[name], lang, true);
      return sources[name];
    };
    const host = {
      getSourceFile: getSource,
      getDefaultLibFileName: () => ROOT_LIB,
      writeFile: (name, text) => { if (name.endsWith('.js')) js = text; },
      getCurrentDirectory: () => '',
      getDirectories: () => [],
      getCanonicalFileName: (f) => f,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n',
      fileExists: (f) => f === FILE || f in libs,
      readFile: (f) => (f === FILE ? code : libs[f]),
      directoryExists: () => true,
    };
    const program = ts.createProgram([FILE], options, host);
    const file = program.getSourceFile(FILE);
    const diags = [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
    program.emit(file);
    return {
      ok: diags.length === 0,
      diagnostics: diags.map((d) => ({
        line: d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start).line + 1 : 0,
        message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
      })),
      js,
    };
  }

  // ---- ブラウザでの読み込み（初回だけ。失敗したら次に呼ばれたときにやり直す） ----
  let loading = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = g.document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error('読み込めませんでした: ' + src));
      g.document.head.append(el);
    });
  }
  function load() {
    if (!loading) {
      loading = (async () => {
        if (!g.ts) await loadScript(BASE + 'typescript.js');
        const libs = await collectLibs((name) => g.fetch(BASE + name).then((r) => {
          if (!r.ok) throw new Error(name + ' を読み込めませんでした（HTTP ' + r.status + '）');
          return r.text();
        }));
        return { ts: g.ts, libs };
      })();
      loading.catch(() => { loading = null; });
    }
    return loading;
  }
  async function check(code, opts) {
    const { ts, libs } = await load();
    return compile(ts, libs, code, opts);
  }

  RGA.ts = { VERSION, BASE, ROOT_LIB, collectLibs, compile, load, check };
})(globalThis);
