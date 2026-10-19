/*
 * AIチューター（6章）とAIの実装役
 * - 標準はルールベースの疑似チューター（API なし・無料・オフラインで動く）
 * - 学習者が Claude の API キーを設定すると、本物の LLM で応答する。失敗したらルールベースに縮退（NFR-08）
 * - どちらの経路でも、回答は漏えい検査（FR-031）と疑似コード3行の制限を通す
 * ネットワークは呼び出し側から fetchImpl をもらう（テストで差し替えるため）。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const { includesAny, norm } = RGA.core;
  const R = RGA.rules;

  // ---- モデルと料金（NFR-11: 月の上限を超えたら軽量モデルへ） ----
  const MODEL_DEFAULT = 'claude-opus-5-5';
  const MODEL_LIGHT = 'claude-haiku-5-5';
  // Gemini（設定で選べる）。既定は「自動」: キーで使えるモデルの一覧から、無料枠のある新しい Flash を選ぶ。
  // モデル名を入れれば、それを使う（Google AI Studio の表記のまま）
  const GEMINI_DEFAULT = 'auto';
  const PRICES = { // USD / 100万トークン（概算）
    'claude-opus-5-5': { in: 4, out: 20 },
    'claude-haiku-5-5': { in: 0.1, out: 0.5 },
  };
  function pickModel(settings, spentUsd) {
    const budget = Number(settings.monthlyBudgetUsd);
    if (budget > 0 && spentUsd >= budget) return MODEL_LIGHT;
    return settings.model || MODEL_DEFAULT;
  }
  function costOf(model, usage) {
    // Gemini は無料枠で使う前提なので数えない（有料のキーの請求は Google 側で確かめてもらう）
    if (String(model).startsWith('gemini')) return 0;
    const p = PRICES[model] || PRICES[MODEL_DEFAULT];
    return ((usage.input_tokens || 0) * p.in + (usage.output_tokens || 0) * p.out) / 1e6;
  }

  // ---- 6章 システムプロンプト案 v0.1（変数を埋める） ----
  const SYSTEM_PROMPT = `あなたは「練習銀行アカデミー」のAIチューターです。新卒〜中堅のエンジニアが、自分の力で考えて理解できるように導きます。

# 絶対に守ること
- 完成したコードや、テストをそのまま通す修正を書かない。
- コードを示す必要があるときは、3行以内の疑似コードにとどめる。
- 学習者が実在の顧客情報、社内コード、パスワードやAPIキーを貼った場合は、内容に触れずに削除を促す。

# 進め方
1. まず学習者が何を試したかを1つ質問する。
2. 次に、着目すべき箇所や概念を1つだけ示す。
3. 学習者がまだ詰まっていれば、ヒント段階を1つ上げる（方向性 → 着目箇所 → 部分的な疑似コード）。
4. 1回の返答は、日本語で5文以内にする。

# 不安への配慮
- 学習者が「分からない」「できない」と書いたら、まず取り組んだことを認め、問題を一段小さく分けてから質問する。
- 間違いを責めず、どこまでは合っているかを先に伝える。

# 入力情報
- 学習目標: {{learning_goals}}
- 現在のステップ: {{step}}（AIオフ／AIオン）
- 現在のヒント段階: {{hint_level}}
- 学習者のコード: {{learner_code}}
- テスト結果: {{test_result}}`;

  const HINT_NAMES = ['まだ出していない', '方向性', '着目箇所', '部分コード'];

  function describeTests(rows) {
    if (!rows || !rows.length) return 'まだ実行していない';
    return rows.map((r) => (r.pass ? '✓ ' : '✗ ') + r.name + (r.pass ? '' : r.expected ? '（期待 ' + r.expected + ' / 実際 ' + r.actual + '）' : r.error ? '（' + r.error + '）' : r.detail ? '（' + r.detail + '）' : '')).join('\n');
  }

  function buildSystemPrompt(ctx) {
    const vars = {
      learning_goals: ctx.unit.goals.join(' / '),
      step: (ctx.stepName || '') + '（' + (ctx.aiMode === 'on' ? 'AIオン' : 'AIオフ') + '）',
      hint_level: HINT_NAMES[ctx.hintLevel || 0],
      learner_code: ctx.code ? '\n' + ctx.code : '（まだ書いていない）',
      test_result: describeTests(ctx.testRows),
    };
    let text = SYSTEM_PROMPT.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
    if (ctx.aiMode === 'on') text += '\n\n# AIオン段階での役割\n学習者が書いた仕様や差分に対して、抜けや危険箇所を質問の形で指摘する。' + (ctx.spec ? '\n- 学習者の仕様:\n' + ctx.spec : '');
    else text += '\n\n# AIオフ段階での制限\nAIのコード生成・補完は使えない段階。質問とヒントだけで導く。';
    return text;
  }

  // ---- ルールベースの疑似チューター ----
  const ANXIOUS = ['分から', 'わから', 'わかん', 'できない', '無理', 'むり', '難しい', 'むずかしい', '詰ん', '自信がない', '不安'];
  const WANTS_ANSWER = ['答え', '正解', '全部書いて', 'コードを書いて', 'コード書いて', 'コードをください', 'そのまま教えて', '完成'];

  function firstSentence(text) {
    const m = String(text).match(/^[^。！？!?]*[。！？!?]?/);
    return (m ? m[0] : String(text)).trim();
  }
  function clip(sentences) {
    return sentences.filter(Boolean).slice(0, 5).join('');
  }

  function ruleTutor(ctx) {
    const q = ctx.question || '';
    const failed = (ctx.testRows || []).find((r) => !r.pass);
    const ex = ctx.exercise;
    const tip = (ctx.unit.tutorTips || []).find((t) => includesAny(q, t.keys));
    const hasCode = norm(ctx.code || '').replace(/\s/g, '').length > 0;
    const s = [];

    if (includesAny(q, ANXIOUS)) {
      s.push('ここまで手を動かしてきたこと自体が、大事な一歩です。');
      s.push('問題をひとつ小さくしましょう。');
      if (failed && failed.expected) s.push('まず、テスト「' + failed.name + '」だけを見てください。期待している値は ' + failed.expected + ' です。あなたの関数はこの入力で何を返しそうですか？');
      else if (ex) s.push('「' + firstSentence(ex.prompt) + '」のうち、関数が受け取るものと返すものは、それぞれ何ですか？');
      else s.push('いま分かっていることを1つだけ書くとしたら、何ですか？');
      return { text: clip(s), kind: 'encourage' };
    }

    if (includesAny(q, WANTS_ANSWER)) {
      s.push('完成したコードを渡すと、あなたの力にならないので、ここでは書きません。');
      s.push('その代わり、一緒に一歩ずつ進めましょう。');
      if (failed) s.push('いま落ちているテスト「' + failed.name + '」は、何を確かめていると思いますか？');
      else s.push('まず、何を試してみましたか？');
      return { text: clip(s), kind: 'refuse' };
    }

    if (ctx.aiMode === 'on' && ctx.aiTask) {
      const cov = R.specCoverage(ctx.aiTask, ctx.spec || '');
      if (!norm(ctx.spec || '').trim()) {
        s.push('AIに頼む前に、仕様を書いてみましょう。');
        s.push('「〜のとき、〜になる」の形で、受け入れ基準を2つ書くとしたら何ですか？');
        return { text: clip(s), kind: 'spec' };
      }
      if (cov.missing.length) {
        s.push('仕様の書き出しは良い流れです。');
        s.push('ひとつ確かめたいのですが、仕様に「' + cov.missing[0] + '」は書かれていますか？');
        s.push('書かれていないと、AIはどう振る舞うと思いますか？');
        return { text: clip(s), kind: 'spec' };
      }
      if (failed) {
        s.push('テスト「' + failed.name + '」が落ちています。');
        s.push(failed.expected ? '期待は ' + failed.expected + '、実際は ' + failed.actual + ' でした。' : '');
        s.push('AIの差分のうち、どの行がこの結果を作っていそうですか？');
        return { text: clip(s), kind: 'review' };
      }
      s.push('テストは通っていますね。');
      s.push('では、テストが確かめていない入力（空・境界・不正な値）を1つ挙げるとしたら何ですか？');
      s.push('そのとき、この差分はどう動きますか？');
      return { text: clip(s), kind: 'review' };
    }

    if (failed) {
      s.push('どこまで動いているかを先に確かめましょう。通っているテストは ' + (ctx.testRows.filter((r) => r.pass).length) + ' 本あります。');
      if (failed.expected) s.push('テスト「' + failed.name + '」は ' + failed.expected + ' を期待していますが、実際は ' + failed.actual + ' でした。');
      else s.push('テスト「' + failed.name + '」で ' + (failed.error || failed.detail || 'エラー') + ' が出ています。');
      s.push('その値は、どの行で作られていると思いますか？');
      return { text: clip(s), kind: 'debug' };
    }

    if (!hasCode || (ctx.turn || 0) === 0) {
      s.push('質問してくれてありがとう。');
      s.push('まず、何を試してみましたか？');
      if (tip) s.push(tip.tip);
      else if (ex) s.push('関数が受け取るものと返すものを、1文で書いてみるのも良い出発点です。');
      return { text: clip(s), kind: 'ask' };
    }

    if (tip) return { text: clip(['よい着眼点です。', tip.tip]), kind: 'concept' };
    const level = Math.min(ctx.hintLevel || 0, 1); // ルールベースは「方向性」までにとどめ、部分コードは学習者がヒントボタンで開く
    if (ex) s.push('考えるヒントです: ' + ex.hints[level]);
    s.push('それを踏まえて、次に1行だけ変えるとしたら、どこを変えますか？');
    return { text: clip(s), kind: 'hint' };
  }

  // ---- 回答の後処理（どの経路でも通す） ----
  function guardReply(text, solution) {
    // 漏えいの判定は加工前の回答で行う（コードブロックを伏せた後だと、破棄して作り直すべき回答を見逃す）
    return { text: R.limitCodeBlocks(text), leaked: R.leaksSolution(text, solution) };
  }

  // ---- Claude API（ブラウザから直接。キーは学習者自身のもの） ----
  async function callClaude(fetchImpl, { apiKey, model, system, messages, maxTokens, effort }) {
    const body = { model, max_tokens: maxTokens || 1024, system, messages, output_config: { effort: effort || 'low' } };
    const headers = {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    // 安全上の判定で断られたとき、サーバー側で別のモデルに回す（Opus 5.5 のみ。Haiku には無い）
    if (model === MODEL_DEFAULT) {
      body.fallbacks = 'default';
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
    }
    const res = await fetchImpl('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || 'HTTP ' + res.status;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (data.stop_reason === 'refusal') throw new Error('応答が断られました');
    const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    return { text, usage: data.usage || {}, model: data.model || model };
  }

  // ---- Gemini API（ブラウザから直接。キーは学習者自身のもの） ----
  // 新しい Gemini は答える前に「考える」分も出力の上限に数えるので、上限は多めにとる（少ないと答えが途中で切れた）。
  // json: true なら JSON だけを返すよう頼む（グループチャットの返事）
  const GEMINI_MIN_OUTPUT = 4096;
  async function callGemini(fetchImpl, { apiKey, model, system, messages, maxTokens, json }) {
    const generationConfig = { maxOutputTokens: Math.max(GEMINI_MIN_OUTPUT, maxTokens || 1024) };
    if (json) generationConfig.responseMimeType = 'application/json';
    const body = {
      systemInstruction: { parts: [{ text: system || '' }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content) }] })),
      generationConfig,
    };
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && data.error && data.error.message) || 'HTTP ' + res.status;
      const err = new Error(res.status === 404 ? msg + '（設定のモデル名を確かめてください）' : msg);
      err.status = res.status;
      throw err;
    }
    const cand = (data.candidates || [])[0];
    if (!cand || cand.finishReason === 'SAFETY' || (data.promptFeedback && data.promptFeedback.blockReason)) throw new Error('応答が断られました');
    // 考えた過程（thought）は答えに混ぜない
    const text = ((cand.content && cand.content.parts) || []).filter((part) => !part.thought).map((part) => part.text || '').join('');
    if (!text.trim()) throw new Error(cand.finishReason === 'MAX_TOKENS' ? '答えが長すぎて途中で切れました' : '答えが空でした');
    const u = data.usageMetadata || {};
    return { text, usage: { input_tokens: u.promptTokenCount || 0, output_tokens: u.candidatesTokenCount || 0 }, model: model };
  }

  // ---- Gemini のモデルを自動で選ぶ ----
  // 一覧（models.list）から、generateContent が使える Flash / Flash-Lite（無料枠がある）を新しい順に並べる。
  // Pro は無料枠がないので選ばない。正式版を先に、プレビュー版はその後ろ。
  function rankGeminiModels(list) {
    const out = [];
    for (const m of list || []) {
      const name = String((m && m.name) || '').replace(/^models\//, '');
      if (!((m && m.supportedGenerationMethods) || []).includes('generateContent')) continue;
      const hit = /^gemini-(\d+(?:\.\d+)?)-flash(-lite)?(-preview(?:-[\w-]+)?)?$/.exec(name);
      if (!hit) continue;
      out.push({ name, ver: Number(hit[1]), lite: !!hit[2], preview: !!hit[3] });
    }
    out.sort((a, b) => (a.preview - b.preview) || (b.ver - a.ver) || (a.lite - b.lite) || a.name.localeCompare(b.name));
    return out.map((x) => x.name);
  }
  async function listGeminiModels(fetchImpl, apiKey) {
    const res = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', { method: 'GET', headers: { 'x-goog-api-key': apiKey } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(((data && data.error && data.error.message) || 'HTTP ' + res.status) + (res.status === 400 || res.status === 403 ? '（API キーを確かめてください）' : ''));
      err.status = res.status;
      throw err;
    }
    return rankGeminiModels(data.models);
  }
  // キーごとに、選んだ候補と、最後にうまくいったモデルを覚えておく（画面を開いている間だけ）
  const geminiPicked = new Map();
  // 次の候補に回してよい失敗: なくなった・見つからない（404・「no longer available」）、無料枠の回数切れ（429）
  function shouldTryNext(err) {
    return err.status === 404 || err.status === 429 || /no longer available|not found|is not supported/i.test(err.message);
  }
  async function callGeminiAuto(fetchImpl, apiKey, req) {
    let entry = geminiPicked.get(apiKey);
    if (!entry) {
      const candidates = await listGeminiModels(fetchImpl, apiKey);
      if (!candidates.length) throw new Error('このキーで使える Gemini の Flash モデルが見つかりませんでした');
      entry = { candidates, last: candidates[0] };
      geminiPicked.set(apiKey, entry);
    }
    const order = [entry.last, ...entry.candidates.filter((m) => m !== entry.last)].slice(0, 4);
    let lastErr = null;
    for (const model of order) {
      try {
        const out = await callGemini(fetchImpl, { apiKey, model, ...req });
        entry.last = model;
        return out;
      } catch (e) {
        lastErr = e;
        if (!shouldTryNext(e)) throw e;
      }
    }
    throw lastErr.status === 429 ? new Error('無料枠の回数の上限に達しました。少し時間をおいてから試してください') : lastErr;
  }
  function isAutoGemini(settings) {
    const m = String((settings && settings.geminiModel) || '').trim();
    return !m || m === 'auto';
  }

  // 設定で選んだ AI（Claude / Gemini）が使えるか
  function providerOf(settings) {
    return (settings && settings.provider) === 'gemini' ? 'gemini' : 'claude';
  }
  function hasAI(settings) {
    const s = settings || {};
    if (s.tutorStopped) return false;
    return providerOf(s) === 'gemini' ? !!s.geminiKey : !!s.apiKey;
  }
  // 表示用のモデル名（Claude は月の上限を超えると軽量モデル）
  function modelFor(settings, spentUsd) {
    if (providerOf(settings) !== 'gemini') return pickModel(settings, spentUsd || 0);
    if (!isAutoGemini(settings)) return settings.geminiModel.trim();
    const entry = geminiPicked.get(settings.geminiKey);
    return entry ? entry.last + '・自動' : '自動で選ぶ';
  }
  // 選んだ AI を呼ぶ。戻り値は Claude と同じ形 { text, usage: { input_tokens, output_tokens }, model }
  async function callLLM(fetchImpl, settings, spentUsd, req) {
    const model = modelFor(settings, spentUsd);
    if (providerOf(settings) === 'gemini') {
      if (isAutoGemini(settings)) return callGeminiAuto(fetchImpl, settings.geminiKey, req);
      return callGemini(fetchImpl, { apiKey: settings.geminiKey, model, ...req });
    }
    return callClaude(fetchImpl, { apiKey: settings.apiKey, model, ...req });
  }

  /**
   * チューターに質問する。
   * env: { settings, spentUsd, fetchImpl }
   * 戻り値: { text, source: 'rule' | 'llm', model?, costUsd, note? }
   */
  async function askTutor(ctx, env) {
    const solution = ctx.solution || '';
    const rule = () => {
      const r = ruleTutor(ctx);
      return { text: guardReply(r.text, solution).text, source: 'rule', costUsd: 0 };
    };
    const s = env.settings || {};
    if (!hasAI(s) || !env.fetchImpl) return rule();
    const model = modelFor(s, env.spentUsd || 0);
    const system = buildSystemPrompt(ctx);
    const messages = [...(ctx.history || []).slice(-6), { role: 'user', content: ctx.question }];
    let cost = 0;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const sys = attempt === 0 ? system : system + '\n\n# 注意\n前の回答には正解と同じコードが含まれていたため破棄しました。コードを含めず、質問の形で導いてください。';
        const out = await callLLM(env.fetchImpl, s, env.spentUsd || 0, { system: sys, messages });
        cost += costOf(out.model, out.usage);
        const guarded = guardReply(out.text, solution);
        if (!guarded.leaked) {
          return { text: guarded.text, source: 'llm', model: out.model, costUsd: cost, note: attempt ? '答えが含まれていた回答を破棄して作り直しました' : (model === MODEL_LIGHT ? '今月の利用料が上限に達したので軽量モデルで応答しています' : '') };
        }
      }
      return { ...rule(), costUsd: cost, note: 'LLM の回答に正解コードが含まれていたので破棄し、ルールベースで答えました' };
    } catch (e) {
      return { ...rule(), costUsd: cost, note: 'AIチューターに接続できなかったので、ルールベースで答えました（' + e.message + '）', degraded: true };
    }
  }

  // ---- AIの実装役（AIオン段階） ----
  function extractCode(text) {
    const m = String(text).match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/);
    return (m ? m[1] : String(text)).trim() + '\n';
  }
  async function generateCode(task, spec, env) {
    const canned = () => {
      const cov = R.specCoverage(task, spec);
      return cov.complete
        ? { code: task.good, source: 'rule', note: '仕様に沿って実装しました。', costUsd: 0 }
        : { code: task.buggy, source: 'rule', note: task.buggyNote, costUsd: 0, missing: cov.missing };
    };
    const s = (env && env.settings) || {};
    if (!hasAI(s) || !env.fetchImpl) return canned();
    const model = modelFor(s, env.spentUsd || 0);
    const system = 'あなたは架空の銀行アプリ「練習銀行」のコーディングエージェントです。AGENTS.md の約束を守り、指定されたファイルの完全な内容を JavaScript のコードブロック1つで返してください。import / export は使わず、トップレベルの関数宣言で書きます。仕様に書かれていないことは推測で足さず、仮定したことはコードの前に1文で書いてください。\n\n# AGENTS.md\n' + (env.agentsMd || '');
    const user = '# チケット\n' + task.ticket + '\n\n# 実装する関数\n' + task.signature + '\n\n# ファイル\n' + task.file + '\n\n# 仕様（学習者が書いたもの）\n' + spec + (env.currentFile ? '\n\n# 今のファイルの内容\n```js\n' + env.currentFile + '```' : '');
    try {
      const out = await callLLM(env.fetchImpl, s, env.spentUsd || 0, { system, messages: [{ role: 'user', content: user }], maxTokens: 4000, effort: 'medium' });
      const note = firstSentence(out.text.split('```')[0]) || 'LLM が実装しました。';
      return { code: extractCode(out.text), source: 'llm', model: out.model, note, costUsd: costOf(out.model, out.usage) };
    } catch (e) {
      return { ...canned(), note: 'AIに接続できなかったので、練習用の実装役で代わりに書きました（' + e.message + '）。' + canned().note, degraded: true };
    }
  }

  // ---- Q-06 説明ゲートの LLM 観点採点（ルール採点に上乗せ。失敗したらルールだけ） ----
  async function llmScoreExplanation(unit, code, answer, env) {
    const s = (env && env.settings) || {};
    if (!hasAI(s) || !env.fetchImpl) return null;
    const model = modelFor(s, env.spentUsd || 0);
    const pts = (f) => unit.gate[f].points.map((pt) => '- ' + pt.label).join('\n');
    const system = 'あなたは説明ゲートの採点者です。学習者の説明が、コードの「何をするか」と「どこが危ないか」を自分の言葉で正しく説明しているかを判定します。JSON だけを返してください: {"what_ok": true|false, "risk_ok": true|false, "feedback": "日本語で2文以内。足りない観点を質問の形で"}。正解コードは書かないこと。';
    const user = '# コード\n```js\n' + code + '\n```\n\n# 観点（何をするか）\n' + pts('what') + '\n\n# 観点（どこが危ないか）\n' + pts('risk') + '\n\n# 学習者の説明\n何をするか: ' + answer.what + '\nどこが危ないか: ' + answer.risk;
    try {
      const out = await callLLM(env.fetchImpl, s, env.spentUsd || 0, { system, messages: [{ role: 'user', content: user }], maxTokens: 400 });
      const m = out.text.match(/\{[\s\S]*\}/);
      const j = JSON.parse(m ? m[0] : out.text);
      return { whatOk: !!j.what_ok, riskOk: !!j.risk_ok, feedback: String(j.feedback || ''), model: out.model, costUsd: costOf(out.model, out.usage), input: user, output: out.text };
    } catch (e) {
      return null;
    }
  }

  RGA.tutor = { MODEL_DEFAULT, MODEL_LIGHT, GEMINI_DEFAULT, PRICES, rankGeminiModels, listGeminiModels, isAutoGemini, pickModel, costOf, providerOf, hasAI, modelFor, callLLM, callGemini, SYSTEM_PROMPT, buildSystemPrompt, describeTests, ruleTutor, guardReply, callClaude, askTutor, generateCode, extractCode, llmScoreExplanation };
})(globalThis);
