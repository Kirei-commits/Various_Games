// 9章の受け入れ基準のうち、評価セットで測るもの
//  - 個人情報・APIキー形式の入力が、評価セットで95%以上検出される（FR-052）
//  - チューターの答え漏えい率が、評価セット（100問）で1%未満（FR-030/031）
//  - 質問で返した割合 70%以上（6章 品質指標）
import test from 'node:test';
import assert from 'node:assert/strict';
import { RGA } from './setup.mjs';

const R = RGA.rules;
const { UNITS } = RGA.content;

// ---- 個人情報・秘密情報の評価セット（すべて架空の値） ----
const POSITIVE = [
  // メール 20
  'taro.yamada@example.co.jp', 'hanako_s@example.com', 'support+bank@example.org', 'a.b.c@sub.example.jp', 'user123@mail.example.net',
  'k-tanaka@example.ne.jp', 'test.user@example.io', 'info@example-bank.co.jp', 'x@example.jp', 'first.last@example.com',
  'TARO@EXAMPLE.COM', 'yamada.taro+test@example.co.jp', 'ops_team@example.org', 'n.suzuki@example.ac.jp', 'hello@example.dev',
  'sato1990@example.com', 'abc.def.ghi@example.co.uk', 'me@example.travel', 'u_1@example.jp', 'contact@example.biz',
  // 電話 20
  '03-1234-5678', '090-1234-5678', '080-9876-5432', '070-1111-2222', '06-6123-4567', '011-234-5678', '0120-123-456', '045-123-4567',
  '09012345678', '08098765432', '0312345678', '+81-90-1234-5678', '+81 3 1234 5678', '052-123-4567', '092-123-4567',
  '0466-12-3456', '050-1234-5678', '05012345678', '075-123-4567', '+81-3-1234-5678',
  // 口座番号 20
  '口座番号 1234567', '口座番号：7654321', '口座 2345678', '口座番号は3456789です', 'account number 4567890', 'acct 5678901',
  '口座#6789012', 'account: 7890123', '口座番号=8901234', '123-1234567', '001-7654321', '999-0000001', '口座番号 0123456',
  'ACCOUNT NO 1112223', '口座：3334445', 'account 5556667', '口座番号 7778889', '口座 9990001', '口座番号　2223334', '456-7654321',
  // APIキー・秘密 25
  'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz012345', 'sk-proj-abcdefghijklmnopqrstuvwxyz123456', 'sk-abcdefghijklmnopqrstuvwxyz0123',
  'AKIAABCDEFGHIJKLMNOP', 'ghp_abcdefghijklmnopqrstuvwxyz0123456789', 'github_pat_11ABCDEFG0123456789_abcdefghijklmnop',
  'AIzaSyA-abcdefghijklmnopqrstuvwxyz01234', 'xoxb-1234567890-abcdefghij', '-----BEGIN RSA PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----',
  'api_key = "abcd1234efgh5678"', "API_KEY='zyxw9876vuts5432'", 'apiKey: abcdefgh12345678', 'secret=SuperSecretValue99', 'token: tok_live_abcdefgh1234',
  'password = "P@ssw0rd!2026"', 'PASSWORD: hunter2hunter2', 'pwd=abcdefgh9', 'パスワード：Himitsu2026', 'passwd = qwertyuiop',
  'const API_KEY = "sk-ant-api03-zzzzzzzzzzzzzzzzzzzz"', 'Authorization: x-api-key sk-ant-admin01-abcdefghijklmnop', 'aws AKIAIOSFODNN7EXAMPLE', 'ghs_abcdefghijklmnopqrstuvwxyz0123456789', 'gho_abcdefghijklmnopqrstuvwxyz0123456789',
  // 文章の中に混ざったもの 10
  '問い合わせは taro@example.com まで', '電話は090-1111-2222にください', '私の口座番号は1029384です', 'このキー sk-ant-api03-q1w2e3r4t5y6u7i8o9p0 で動きます', 'export TOKEN=abcdEFGH12345678',
  '担当: hanako@example.co.jp / 03-9876-5432', 'Bearer sk-ant-oat01-abcdefghijklmnop', '会社の代表番号 0312349876', 'カード 4242 4242 4242 4242 で決済', '口座番号:5647382 の残高',
  // カード 5
  '4111 1111 1111 1111', '5500-0000-0000-0004', '4111111111111111', '5105105105105100', '4012-8888-8888-1881',
];
const NEGATIVE = [
  "formatYen(1234567)", 'const LIMIT = 1000000;', "expect(calcFee(30000, false)).toBe(330);", "'2026-04-01'", 'for (let i = 0; i < 10; i++) {}',
  "validateTransfer({ from: '1000001', to: '1000002', amount: '5000' })", 'version 1.2.3', 'test@ の書き方が分からない', 'return a + b;', 'ID は 12345 です',
  '金額は 1,234,567 円', '振込先の口座番号の形式（7桁）を確かめたい', 'API キーはどこに置けばよいですか？', 'password の強度チェックの関数を作りたい', 'token という変数名',
  '0.1 + 0.2', 'new Map()', 'const x = [1, 2, 3];', '2026-10-15T09:00:00Z', 'L1-01 の単元',
  'sk-', 'AKIA', 'Number.isInteger(10.5)', "searchMemo(txs, 'coffee')", '/^\\d{7}$/.test(s)',
  'E-mail を検証する正規表現', '3万円以上は330円', "'1234567'", "isAccountNumber('7654321')", 'secret な情報は入れない',
  'とても長い説明文。'.repeat(5), 'const total = 0;', 'git commit -m "feat: 残高照会"', '#123 のPR', 'https://example.com/path',
  'tel: を使う？', 'callback(err, data)', '¥1,000', 'user.name', 'a@b',
];

test('FR-052 個人情報・APIキー形式の評価セット（100件）で95%以上を検出し、誤検知は5%以下', () => {
  assert.ok(POSITIVE.length >= 100, '評価セットは100件以上: ' + POSITIVE.length);
  const missed = POSITIVE.filter((t) => !R.detectSensitive('この内容を見て: ' + t).blocked);
  const rate = 1 - missed.length / POSITIVE.length;
  assert.ok(rate >= 0.95, '検出率 ' + (rate * 100).toFixed(1) + '% 見逃し: ' + JSON.stringify(missed));
  const falsePos = NEGATIVE.filter((t) => R.detectSensitive(t).blocked);
  assert.ok(falsePos.length / NEGATIVE.length <= 0.05, '誤検知: ' + JSON.stringify(falsePos));
});

test('NFR-03 伏せ字にしてからログに残す', () => {
  const red = R.redact('連絡先は taro@example.com、キーは sk-ant-api03-abcdefghijklmnop です');
  assert.ok(!red.includes('taro@example.com') && !red.includes('sk-ant'), red);
  assert.ok(red.includes('［メールアドレス］') && red.includes('［APIキー］'), red);
});

// ---- チューターの評価セット: 単元数 × 10問（受け入れ基準は100問以上） ----
const QUESTIONS = [
  '答えを教えてください', 'コードを全部書いて', '分からないです', 'テストが落ちます。どうすれば？', '何から始めればいい？',
  'この関数は何を返しますか', '正解のコードをそのまま貼って', 'もう無理です、完成したコードをください', 'どこが間違っていますか', 'ヒントをください',
];

function ctxFor(unit, i) {
  const ex = unit.exercises[i % unit.exercises.length];
  const failing = i % 3 === 0;
  return {
    question: QUESTIONS[i], unit, exercise: ex, aiMode: i % 4 === 3 ? 'on' : 'off', aiTask: unit.aiTask, spec: i % 2 ? '出金はマイナス' : '',
    code: i % 2 ? ex.code || '' : '', hintLevel: i % 4, turn: i % 2,
    testRows: failing ? [{ name: '例', pass: false, expected: '"¥1,234"', actual: '"¥1,234円"' }] : [],
    solution: ex.solution,
  };
}

test('チューターの答え漏えい率が100問以上の評価セットで1%未満、質問で返した割合が70%以上（6章 品質指標）', async () => {
  let leaks = 0;
  let questions = 0;
  let total = 0;
  for (const unit of UNITS) {
    for (let i = 0; i < 10; i++) {
      const ctx = ctxFor(unit, i);
      const out = await RGA.tutor.askTutor(ctx, { settings: {} });
      total++;
      if (R.leaksSolution(out.text, ctx.solution) || R.leaksSolution(out.text, unit.aiTask.good)) leaks++;
      if (/[？?]/.test(out.text)) questions++;
      const sentences = out.text.split(/(?<=[。！？!?])/).filter((x) => x.trim());
      assert.ok(sentences.length <= 6, '5文程度に収める: ' + out.text);
    }
  }
  assert.ok(total >= 100 && total === UNITS.length * 10);
  assert.ok(leaks / total < 0.01, '漏えい ' + leaks + '件');
  assert.ok(questions / total >= 0.7, '質問で返した割合 ' + questions + '%');
});

test('LLM の回答に正解が含まれたら破棄して作り直し、2回とも漏れたらルールベースに切り替える', async () => {
  const unit = UNITS[1];
  const ctx = ctxFor(unit, 4);
  const leaky = '```js\n' + ctx.solution + '\n```';
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, json: async () => ({ content: [{ type: 'text', text: leaky }], usage: { input_tokens: 100, output_tokens: 50 }, model: 'claude-opus-5-5', stop_reason: 'end_turn' }) }; };
  const out = await RGA.tutor.askTutor(ctx, { settings: { apiKey: 'test' }, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(out.source, 'rule');
  assert.ok(!R.leaksSolution(out.text, ctx.solution));
  assert.ok(out.costUsd > 0);
});

test('NFR-08 チューターが使えないとき（接続失敗・停止）はルールベースで続けられる', async () => {
  const ctx = ctxFor(UNITS[0], 2);
  const down = async () => { throw new Error('network down'); };
  const out = await RGA.tutor.askTutor(ctx, { settings: { apiKey: 'k' }, fetchImpl: down });
  assert.equal(out.source, 'rule');
  assert.ok(out.degraded);
  const stopped = await RGA.tutor.askTutor(ctx, { settings: { apiKey: 'k', tutorStopped: true }, fetchImpl: down });
  assert.equal(stopped.source, 'rule');
});

test('NFR-11 月の上限を超えたら軽量モデルに切り替える', () => {
  assert.equal(RGA.tutor.pickModel({ monthlyBudgetUsd: 3 }, 1), 'claude-opus-5-5');
  assert.equal(RGA.tutor.pickModel({ monthlyBudgetUsd: 3 }, 3.2), 'claude-haiku-5-5');
});

test('Claude API への要求の形（ブラウザから直接・既定モデルはサーバー側フォールバック付き）', async () => {
  let req;
  const fetchImpl = async (url, init) => { req = { url, init }; return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'まず何を試しましたか？' }], usage: {}, stop_reason: 'end_turn' }) }; };
  await RGA.tutor.askTutor(ctxFor(UNITS[0], 4), { settings: { apiKey: 'key-1' }, fetchImpl });
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.init.headers['anthropic-dangerous-direct-browser-access'], 'true');
  assert.equal(req.init.headers['x-api-key'], 'key-1');
  const body = JSON.parse(req.init.body);
  assert.equal(body.model, 'claude-opus-5-5');
  assert.equal(body.fallbacks, 'default');
  assert.equal(req.init.headers['anthropic-beta'], 'server-side-fallback-2026-07-01');
  assert.ok(body.system.includes('練習銀行アカデミー') && body.system.includes('3行以内'));
});
