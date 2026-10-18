/*
 * 追加の単元（L1-06〜10、L2-06〜10）。書き方は content.js と同じ（データだけ・題材はすべて架空）。
 * AI の下書き（aiTask.good）は CI で src/ を全部まとめて読み込むので、トップレベルの名前を既存の単元とぶつけないこと。
 */
(function (g) {
  'use strict';
  const RGA = g.RGA;
  const R = String.raw;
  const { p } = RGA.content;

  RGA.content.addUnits([
    // =====================================================================
    {
      id: 'L1-06', area: 'C', level: 1, prereq: ['L1-02'], estMinutes: 30,
      title: '計算と表示を分ける',
      story: '先輩の佐藤さんより：「残高画面の関数が、計算も“¥”を付ける表示も1つでやってて、表示を変えるたびに計算まで壊れるんだ。計算と表示を分けよう。」',
      goals: ['計算の責務と表示の責務を分けて説明できる', '数値を返す関数と、文字列を作る関数を分けて書ける'],
      evidence: 'スキルマップ C-L1（レイヤーと責務分離）',
      concept: [
        '1つの関数に「計算」と「表示」を詰め込むと、表示を変えたいだけなのに計算まで触ることになり、壊しやすくなります。',
        '計算する関数は数値を返し、表示する関数はその数値を受け取って文字列にする、と分けると、それぞれを別々にテストできます。',
        { code: R`// 計算（数値を返す）
function computeNet(txs) { /* ... */ return 700; }
// 表示（文字列を作る）
function renderNet(net) { return '+¥' + net.toLocaleString('ja-JP'); }
renderNet(computeNet(txs)); // → '+¥700'` },
        '表示の関数は、受け取ったオブジェクトを書き換えず、新しいオブジェクトを返すのが安全です。',
      ],
      predict: [
        { q: '「表示を ¥1,234 から 1,234円 に変えたい」。直すべきなのは？', code: '', choices: ['表示する関数だけ', '計算する関数だけ', '両方', 'テストだけ'], answer: 0, why: '責務を分けていれば、表示の変更は表示の関数だけで済みます。' },
        { q: 'このコードの値は？', code: R`[1, 2].map((n) => n * 2)`, choices: ['[2, 4]', '[1, 2]', '6', '[1, 2, 1, 2]'], answer: 0, why: 'map はそれぞれを2倍にした新しい配列を返します。' },
        { q: 'このコードの最後の t.in は？', code: R`const t = { in: 1000 };
const v = { ...t, in: '¥1,000' };`, choices: ['1000（数値のまま）', "'¥1,000'", 'undefined', 'エラー'], answer: 0, why: '{ ...t } は新しいオブジェクトなので、元の t は変わりません。' },
      ],
      exercises: [
        { id: 'L1-06-p1', stage: 'parsons', prompt: '入金を足し・出金を引いた純額（数値）を返す computeNet を組み立ててください。表示用の文字列は返しません。使わない行が1つあります。',
          lines: ['function computeNet(txs) {', '  let net = 0;', "  for (const tx of txs) net += tx.type === 'in' ? tx.amount : -tx.amount;", '  return net;', '}'],
          distractors: ["  return '¥' + net;"],
          tests: R`test('純額は数値', () => { expect(computeNet([{ type: 'in', amount: 1000 }, { type: 'out', amount: 300 }])).toBe(700); });
test('空なら0', () => { expect(computeNet([])).toBe(0); });`,
          hints: ['計算の関数は、数値を返します。', '¥ を付けるのは誰の仕事でしょう？', '  return net; を使います。'] },
        { id: 'L1-06-p2', stage: 'parsons', prompt: '純額を「+¥1,500」「-¥200」の形にする renderNet を組み立ててください。使わない行が1つあります。',
          lines: ['function renderNet(net) {', "  const sign = net < 0 ? '-' : '+';", "  return sign + '¥' + Math.abs(net).toLocaleString('ja-JP');", '}'],
          distractors: ['  net = net - 100;'],
          tests: R`test('プラス', () => { expect(renderNet(1500)).toBe('+¥1,500'); });
test('マイナス', () => { expect(renderNet(-200)).toBe('-¥200'); });`,
          hints: ['表示の関数は、受け取った値を変えずに文字列を作ります。', '符号を決める行と、文字列を作る行が要ります。', 'net を書き換える行は使いません。'] },
        { id: 'L1-06-b1', stage: 'blank', prompt: '空欄を埋めて、口座の表示用データを作ってください。金額の表示は yen 関数に任せます。',
          template: R`function accountView(account) {
  return { name: account.name, balanceText: [[1]](account.balance) };
}
function yen(n) {
  return '¥' + n.toLocaleString('ja-JP');
}`, answers: ['yen'],
          tests: R`test('表示用データ', () => { expect(accountView({ name: '練習 太郎', balance: 52000 })).toEqual({ name: '練習 太郎', balanceText: '¥52,000' }); });`,
          hints: ['金額を文字列にする関数は、下に用意されています。', 'その関数の名前は？', 'yen です。'] },
        { id: 'L1-06-b2', stage: 'blank', prompt: '空欄を埋めて、入金合計と出金合計を数値で返してください。',
          template: R`function computeTotals(txs) {
  const sum = (type) => txs.filter((tx) => tx.type === type).reduce((a, tx) => a + tx.amount, [[1]]);
  return { in: sum('in'), out: sum([[2]]) };
}`, answers: ['0', "'out'"],
          tests: R`test('合計', () => { expect(computeTotals([{ type: 'in', amount: 500 }, { type: 'out', amount: 200 }, { type: 'out', amount: 100 }])).toEqual({ in: 500, out: 300 }); });
test('空', () => { expect(computeTotals([])).toEqual({ in: 0, out: 0 }); });`,
          hints: ['1つ目は reduce の最初の値です。', '2つ目は出金の種類の文字列です（引用符も）。', "0 と 'out' です。"] },
        { id: 'L1-06-f1', stage: 'fix', prompt: '計算の関数が表示用の文字列を返してしまっています。数値を返すように直してください。',
          code: R`function computeNet(txs) {
  let net = 0;
  for (const tx of txs) net += tx.type === 'in' ? tx.amount : -tx.amount;
  return '¥' + net;
}`,
          solution: R`function computeNet(txs) {
  let net = 0;
  for (const tx of txs) net += tx.type === 'in' ? tx.amount : -tx.amount;
  return net;
}`,
          tests: R`test('純額は数値', () => { expect(computeNet([{ type: 'in', amount: 1000 }, { type: 'out', amount: 300 }])).toBe(700); });`,
          hints: ['期待は数値の 700、実際は文字列です。', 'return の行を見ましょう。', "'¥' + を消します。"] },
        { id: 'L1-06-f2', stage: 'fix', prompt: '表示の関数が、受け取った合計のオブジェクトを書き換えてしまいます。新しいオブジェクトを返すように直してください。',
          code: R`function renderTotals(t) {
  t.in = '¥' + t.in.toLocaleString('ja-JP');
  t.out = '¥' + t.out.toLocaleString('ja-JP');
  return t;
}`,
          solution: R`function renderTotals(t) {
  return { in: '¥' + t.in.toLocaleString('ja-JP'), out: '¥' + t.out.toLocaleString('ja-JP') };
}`,
          tests: R`test('表示', () => { expect(renderTotals({ in: 1000, out: 300 })).toEqual({ in: '¥1,000', out: '¥300' }); });
test('元の数値はそのまま', () => {
  const t = { in: 1000, out: 300 };
  renderTotals(t);
  expect(t).toEqual({ in: 1000, out: 300 });
});`,
          hints: ['t.in = … で、元のオブジェクトを書き換えています。', '新しいオブジェクトを作って返しましょう。', "return { in: '¥' + …, out: '¥' + … };"] },
        { id: 'L1-06-s1', stage: 'scratch', prompt: 'computeTotals(txs) と renderTotals(t) を書いてください。computeTotals は { in, out, net }（すべて数値、net = in − out）を返します。renderTotals は { in: "¥1,000", out: "¥300", net: "+¥700" } を返し、net は正なら +、負なら -、0 なら符号なし（"¥0"）です。',
          code: R`/** 計算: 入金合計・出金合計・純額（数値） */
function computeTotals(txs) {
  // ここに書く
}

/** 表示: 文字列にする（t は書き換えない） */
function renderTotals(t) {
  // ここに書く
}`,
          solution: R`function computeTotals(txs) {
  const sum = (type) => txs.filter((tx) => tx.type === type).reduce((a, tx) => a + tx.amount, 0);
  const totalIn = sum('in');
  const totalOut = sum('out');
  return { in: totalIn, out: totalOut, net: totalIn - totalOut };
}
function renderTotals(t) {
  const yen = (n) => '¥' + Math.abs(n).toLocaleString('ja-JP');
  const sign = t.net > 0 ? '+' : t.net < 0 ? '-' : '';
  return { in: yen(t.in), out: yen(t.out), net: sign + yen(t.net) };
}`,
          tests: R`test('空', () => { expect(computeTotals([])).toEqual({ in: 0, out: 0, net: 0 }); });
test('計算', () => { expect(computeTotals([{ type: 'in', amount: 1000 }, { type: 'out', amount: 300 }])).toEqual({ in: 1000, out: 300, net: 700 }); });
test('表示（プラス）', () => { expect(renderTotals({ in: 1000, out: 300, net: 700 })).toEqual({ in: '¥1,000', out: '¥300', net: '+¥700' }); });
test('表示（マイナス）', () => { expect(renderTotals({ in: 0, out: 200, net: -200 }).net).toBe('-¥200'); });
test('表示（0）', () => { expect(renderTotals({ in: 0, out: 0, net: 0 }).net).toBe('¥0'); });
test('表示は元を書き換えない', () => {
  const t = { in: 1, out: 2, net: -1 };
  renderTotals(t);
  expect(t).toEqual({ in: 1, out: 2, net: -1 });
});`,
          hints: ['まず computeTotals を作り、テストの「計算」を通してから表示に進みましょう。', '符号は3通り（+・-・なし）です。三項演算子を2段にすると書けます。', "const sign = t.net > 0 ? '+' : t.net < 0 ? '-' : '';"] },
      ],
      gate: {
        what: { min: 2, points: [p('計算（数値）と表示（文字列）を分けている', ['計算', '表示', '分け', '責務', '文字列', '数値']), p('純額に符号を付ける', ['符号', '+', 'プラス', 'マイナス', '純額', 'net'])] },
        risk: { min: 1, points: [p('表示側で計算し直すとずれる', ['ずれ', '二重', '重複', '計算し直']), p('小数・大きな金額', ['小数', '大きい', '丸め']), p('知らない type の取引', ['type', '種類', '不明', 'その他'])] },
      },
      aiTask: {
        file: 'src/view.js', testFile: 'tests/view.test.js',
        ticket: '残高画面のまとめ表示のために、accountSummaryView(txs, opening) を src/view.js に実装してほしい。{ balance, in, out, count }（金額は表示用の文字列）を返す。計算を先に済ませ、最後に文字列にすること。',
        signature: 'accountSummaryView(txs, opening) → { balance, in, out, count }',
        specGroups: [p('期首残高を含める', ['期首', 'opening', '初期残高', 'はじめの残高']), p('マイナスの残高は「-¥500」と表示する', ['マイナス', '負', '-¥', '赤字'])],
        good: R`/** 残高画面に出す値。計算を先に済ませ、最後に表示用の文字列にする */
function accountSummaryView(txs, opening = 0) {
  const sum = (type) => txs.filter((tx) => tx.type === type).reduce((acc, tx) => acc + tx.amount, 0);
  const totalIn = sum('in');
  const totalOut = sum('out');
  const balanceValue = opening + totalIn - totalOut;
  const yen = (n) => (n < 0 ? '-' : '') + '¥' + Math.abs(n).toLocaleString('ja-JP');
  return { balance: yen(balanceValue), in: yen(totalIn), out: yen(totalOut), count: txs.length };
}
`,
        buggy: R`/** 残高画面に出す値 */
function accountSummaryView(txs, opening = 0) {
  const sum = (type) => txs.filter((tx) => tx.type === type).reduce((acc, tx) => acc + tx.amount, 0);
  const yen = (n) => '¥' + n.toLocaleString('ja-JP');
  return { balance: yen(sum('in') - sum('out')), in: yen(sum('in')), out: yen(sum('out')), count: txs.length };
}
`,
        buggyNote: '期首残高の扱いとマイナスの表示が仕様に無かったので、入出金だけで残高を出し、符号はそのまま表示しています。',
        tests: R`test('期首残高を含める', () => { expect(accountSummaryView([{ type: 'in', amount: 500 }, { type: 'out', amount: 200 }], 1000).balance).toBe('¥1,300'); });
test('マイナスの残高', () => { expect(accountSummaryView([{ type: 'out', amount: 500 }]).balance).toBe('-¥500'); });
test('空', () => { expect(accountSummaryView([])).toEqual({ balance: '¥0', in: '¥0', out: '¥0', count: 0 }); });
test('件数と合計', () => { expect(accountSummaryView([{ type: 'in', amount: 1200 }, { type: 'out', amount: 200 }], 0)).toEqual({ balance: '¥1,000', in: '¥1,200', out: '¥200', count: 2 }); });
`,
        review: { min: 1, points: [p('期首残高を無視している', ['期首', 'opening']), p('マイナスが「¥-500」になる', ['マイナス', '符号', '-'])] },
      },
      demos: [{ label: '残高画面のまとめ', expr: "(() => { const v = accountSummaryView([{ type: 'in', amount: 250000 }, { type: 'out', amount: 82000 }], 30000); return '残高 ' + v.balance + '（入金 ' + v.in + ' / 出金 ' + v.out + '）'; })()" }],
      tutorTips: [{ keys: ['責務', '分け', '表示'], tip: 'その関数が返しているのは、数値ですか？ 文字列ですか？ 呼ぶ側はどちらを期待していますか？' }],
    },
    // =====================================================================
    {
      id: 'L1-07', area: 'F', level: 1, prereq: ['L1-01'], estMinutes: 30,
      title: '秘密情報を画面やログに出さない',
      story: 'セキュリティ担当の鈴木さんより：「ログに口座番号がそのまま出てたよ。ログは多くの人が見るし、外部のツールにも送られる。必要な部分以外は伏せて出す習慣をつけて。」',
      goals: ['口座番号・メールアドレスを伏せて表示する理由を説明できる', '伏せ字（マスク）の関数を書ける'],
      evidence: 'スキルマップ F-L1（秘密情報を渡さない）／FISC（機密情報の取り扱い）',
      concept: [
        '口座番号やメールアドレスは、画面やログに出すときに一部を伏せます（例: 1234567 → ***4567）。本人確認に必要な分だけを見せます。',
        { code: R`'1234567'.slice(-4);  // → '4567'（末尾4文字）
'*'.repeat(3);        // → '***'` },
        'ログは開発者・運用者・外部の監視ツールなど多くの人の目に触れます。伏せる前の値をログに出してしまうと、画面で伏せても意味がありません。',
        'API キーやパスワードは、コードにも、ログにも、AI へのプロンプトにも書きません。うっかり公開してしまったら、まずそのキーを無効化（ローテーション）します。',
      ],
      predict: [
        { q: 'このコードの値は？', code: R`'1234567'.slice(-4)`, choices: ["'4567'", "'1234'", "'123'", "'7654'"], answer: 0, why: '負の数を渡すと、末尾から数えます。' },
        { q: 'このコードの値は？', code: R`'*'.repeat(3)`, choices: ["'***'", "'*3'", "'*'", 'エラー'], answer: 0, why: 'repeat は文字列を指定した回数くり返します。' },
        { q: 'API キーをコードに直書きして公開リポジトリに push してしまった。まずやることは？', code: '', choices: ['そのキーを無効化（ローテーション）する', 'コミットを消せば十分', '何もしない', 'リポジトリ名を変える'], answer: 0, why: '一度公開されたキーは、履歴を消しても誰かが控えているかもしれません。' },
      ],
      exercises: [
        { id: 'L1-07-p1', stage: 'parsons', prompt: '口座番号の末尾4桁だけを見せる maskAccount を組み立ててください（1234567 → ***4567）。使わない行が1つあります。',
          lines: ['function maskAccount(no) {', '  const last = no.slice(-4);', "  return '*'.repeat(no.length - 4) + last;", '}'],
          distractors: ['  return no;'],
          tests: R`test('7桁', () => { expect(maskAccount('1234567')).toBe('***4567'); });
test('10桁', () => { expect(maskAccount('0011223344')).toBe('******3344'); });`,
          hints: ['末尾4文字を取り出し、残りの長さの分だけ * を並べます。', 'そのまま返す行は使いません。', "  return '*'.repeat(no.length - 4) + last;"] },
        { id: 'L1-07-p2', stage: 'parsons', prompt: 'メールアドレスの名前部分を先頭1文字だけ見せる maskEmail を組み立ててください（taro@example.com → t***@example.com）。使わない行が1つあります。',
          lines: ['function maskEmail(email) {', "  const [name, domain] = email.split('@');", "  return name[0] + '***@' + domain;", '}'],
          distractors: ["  return email.replace('@', '***');"],
          tests: R`test('伏せる', () => { expect(maskEmail('taro@example.com')).toBe('t***@example.com'); });`,
          hints: ['@ の前と後に分けてから組み立てます。', 'split の結果を分割代入で受け取ります。', "  return name[0] + '***@' + domain;"] },
        { id: 'L1-07-b1', stage: 'blank', prompt: '空欄を埋めて、末尾4桁だけを見せてください。',
          template: R`function maskAccount(no) {
  return '*'.[[1]](no.length - 4) + no.slice([[2]]);
}`, answers: ['repeat', '-4'],
          tests: R`test('7桁', () => { expect(maskAccount('7654321')).toBe('***4321'); });`,
          hints: ['1つ目は文字列をくり返すメソッドです。', '2つ目は末尾から4文字を取る引数です。', 'repeat と -4 です。'] },
        { id: 'L1-07-b2', stage: 'blank', prompt: '空欄を埋めて、ログの1行に含まれる「sk-」で始まるキーを「[秘密]」に置き換えてください。',
          template: R`function redactKey(line) {
  return line.replace(/sk-[A-Za-z0-9_-]+/g, [[1]]);
}`, answers: ["'[秘密]'"],
          tests: R`test('置き換える', () => { expect(redactKey('key=sk-abc123 user=a')).toBe('key=[秘密] user=a'); });
test('無ければそのまま', () => { expect(redactKey('user=a')).toBe('user=a'); });`,
          hints: ['置き換え後の文字列を渡します。', '引用符が必要です。', "'[秘密]' です。"] },
        { id: 'L1-07-f1', stage: 'fix', prompt: '先頭4桁が見えてしまっています。末尾4桁を見せるように直してください。',
          code: R`function maskAccount(no) {
  return no.slice(0, 4) + '*'.repeat(no.length - 4);
}`,
          solution: R`function maskAccount(no) {
  return '*'.repeat(no.length - 4) + no.slice(-4);
}`,
          tests: R`test('末尾4桁', () => { expect(maskAccount('1234567')).toBe('***4567'); });`,
          hints: ['期待と実際を見比べると、見えている場所が逆です。', '* を前に、数字を後ろに置きます。', "'*'.repeat(no.length - 4) + no.slice(-4)"] },
        { id: 'L1-07-f2', stage: 'fix', prompt: '振込のログに口座番号がそのまま出ています。末尾4桁だけ見せるように直してください。',
          code: R`function transferLog(t) {
  return 'transfer from=' + t.from + ' to=' + t.to + ' amount=' + t.amount;
}`,
          solution: R`function transferLog(t) {
  const mask = (no) => '*'.repeat(no.length - 4) + no.slice(-4);
  return 'transfer from=' + mask(t.from) + ' to=' + mask(t.to) + ' amount=' + t.amount;
}`,
          tests: R`test('伏せたログ', () => { expect(transferLog({ from: '1000001', to: '1000002', amount: 5000 })).toBe('transfer from=***0001 to=***0002 amount=5000'); });`,
          hints: ['伏せる処理を、from と to の両方にかけます。', '関数の中に小さな mask 関数を作ると2回使えます。', "const mask = (no) => '*'.repeat(no.length - 4) + no.slice(-4);"] },
        { id: 'L1-07-s1', stage: 'scratch', prompt: 'maskAccount(no) を書いてください。文字列でなければ "****"、4文字以下ならすべて "*"、それ以外は末尾4文字だけを見せます。',
          code: R`/** 口座番号を伏せ字にする */
function maskAccount(no) {
  // ここに書く
}`,
          solution: R`function maskAccount(no) {
  if (typeof no !== 'string') return '****';
  if (no.length <= 4) return '*'.repeat(no.length);
  return '*'.repeat(no.length - 4) + no.slice(-4);
}`,
          tests: R`test('7桁', () => { expect(maskAccount('1234567')).toBe('***4567'); });
test('ちょうど4文字', () => { expect(maskAccount('1234')).toBe('****'); });
test('2文字', () => { expect(maskAccount('12')).toBe('**'); });
test('空文字', () => { expect(maskAccount('')).toBe(''); });
test('数値は伏せる', () => { expect(maskAccount(1234567)).toBe('****'); });
test('undefined も伏せる', () => { expect(maskAccount(undefined)).toBe('****'); });`,
          hints: ['特別な場合（文字列でない・短い）を先に返し、最後にふつうの場合を書きます。', "typeof no !== 'string' で文字列かどうかを確かめられます。", "if (no.length <= 4) return '*'.repeat(no.length);"] },
      ],
      gate: {
        what: { min: 2, points: [p('末尾4桁だけを見せる', ['末尾', '下4桁', '4桁', '最後', '隠', 'マスク', '*']), p('短い・文字列でないときの扱い', ['短い', '4文字以下', '文字列でない', '数値', '全部'])] },
        risk: { min: 1, points: [p('末尾4桁でも他の情報と組み合わせると特定されうる', ['特定', '組み合わせ', '推測', '名前']), p('伏せる前の値をログに出すと意味がない', ['ログ', '元の値', '出力', '保存']), p('null・空白などの想定外の値', ['null', '空白', 'スペース'])] },
      },
      aiTask: {
        file: 'src/mask.js', testFile: 'tests/mask.test.js',
        ticket: '画面とログで個人情報を伏せるために、maskAccount(no) と maskEmail(email) を src/mask.js に実装してほしい。',
        signature: 'maskAccount(no) / maskEmail(email)',
        specGroups: [p('4文字以下の口座番号は全部伏せる', ['4文字以下', '4桁以下', '短い', '全部伏せ', '全て伏せ']), p('@ が無いメールアドレスの扱い', ['@がない', '@が無い', '@ が無い', '@ がない', '不正なメール', '形式が違う'])],
        good: R`/** 口座番号を伏せる。文字列でなければ ****、4文字以下は全部 *、それ以外は末尾4文字だけ見せる */
function maskAccount(no) {
  if (typeof no !== 'string') return '****';
  if (no.length <= 4) return '*'.repeat(no.length);
  return '*'.repeat(no.length - 4) + no.slice(-4);
}

/** メールアドレスを伏せる（名前の先頭1文字だけ見せる）。@ が無い・名前が空なら *** */
function maskEmail(email) {
  const s = String(email);
  const at = s.indexOf('@');
  if (at < 1) return '***';
  return s[0] + '***' + s.slice(at);
}
`,
        buggy: R`/** 口座番号を伏せる */
function maskAccount(no) {
  return '*'.repeat(no.length - 4) + no.slice(-4);
}

/** メールアドレスを伏せる */
function maskEmail(email) {
  const [name, domain] = email.split('@');
  return name[0] + '***@' + domain;
}
`,
        buggyNote: '短い口座番号と、@ が無いメールアドレスの扱いが仕様に無かったので、いつも7桁・正しい形式が来るものとして書きました。',
        tests: R`test('口座番号', () => { expect(maskAccount('1234567')).toBe('***4567'); });
test('短い口座番号は全部伏せる', () => { expect(maskAccount('12')).toBe('**'); });
test('メールアドレス', () => { expect(maskEmail('taro@example.com')).toBe('t***@example.com'); });
test('@ が無いメールアドレス', () => { expect(maskEmail('example')).toBe('***'); });
`,
        review: { min: 1, points: [p('短い番号で repeat が負になってエラー', ['短い', 'repeat', '負', 'エラー']), p('@ が無いと undefined が出る', ['@', 'undefined', '形式'])] },
      },
      demos: [{ label: '個人情報の伏せ字', expr: "'口座 ' + maskAccount('1000001') + ' / ' + maskEmail('renshu@example.com')" }],
      tutorTips: [{ keys: ['slice', '末尾'], tip: "slice に負の数を渡すと、どこから数えますか？ '1234567'.slice(-4) で試すとしたら、結果はどうなりそうですか？" }],
    },
    // =====================================================================
    {
      id: 'L1-08', area: 'G', level: 1, prereq: ['L1-03'], estMinutes: 30,
      title: 'ログを読む',
      story: '運用担当の高橋さんより：「“振込できない”って問い合わせが来た。ログはこんな形で出てるから、まずは1行を読めるようになって、最初のエラーを探せるようにしよう。」',
      goals: ['ログの1行（時刻・レベル・メッセージ）を読み取れる', '最初のエラーを探し、件数を数えられる'],
      evidence: 'スキルマップ G-L1（ログを読める）',
      concept: [
        '練習銀行のログは「時刻 レベル メッセージ key=value…」の形です。レベルは INFO（情報）・WARN（注意）・ERROR（エラー）。',
        { code: R`2026-04-01T09:00:00Z INFO 起動しました
2026-04-01T09:05:12Z ERROR 振込に失敗 id=req-7 code=E42` },
        '障害を調べるときは、最初に出た ERROR とその直前を読みます。後のエラーは、最初のエラーの巻き添えであることが多いからです。',
        'メッセージの中に「ERROR」という文字が入っていることもあるので、レベルは「2つ目の欄」で判断します。',
      ],
      predict: [
        { q: 'このコードの値は？', code: R`'a b c'.split(' ')`, choices: ["['a', 'b', 'c']", "'abc'", "['a b c']", '3'], answer: 0, why: 'split は区切り文字で分けた配列を返します。' },
        { q: 'このコードの値は？', code: R`'id=req-1'.split('=')`, choices: ["['id', 'req-1']", "['id=req-1']", "'req-1'", "['id', '=', 'req-1']"], answer: 0, why: '= で2つに分かれます。' },
        { q: '障害を調べるとき、ログのどこから読むのがよい？', code: '', choices: ['最初に出た ERROR とその直前', '最後の行', 'INFO の行だけ', 'ランダムに数行'], answer: 0, why: '後のエラーは最初のエラーの巻き添えであることが多いためです。' },
      ],
      exercises: [
        { id: 'L1-08-p1', stage: 'parsons', prompt: 'ログの1行からレベル（2つ目の欄）を返す levelOf を組み立ててください。使わない行が1つあります。',
          lines: ['function levelOf(line) {', "  const parts = line.split(' ');", '  return parts[1];', '}'],
          distractors: ['  return parts[0];'],
          tests: R`test('ERROR', () => { expect(levelOf('2026-04-01T09:00:00Z ERROR 振込に失敗')).toBe('ERROR'); });
test('INFO', () => { expect(levelOf('2026-04-01T09:00:00Z INFO 起動')).toBe('INFO'); });`,
          hints: ['空白で分けると、0番目は時刻です。', 'レベルは何番目でしょう？', '  return parts[1]; を使います。'] },
        { id: 'L1-08-p2', stage: 'parsons', prompt: 'ERROR の行を数える countErrors を組み立ててください。メッセージに「ERROR」という文字が入っていても数えません。使わない行が1つあります。',
          lines: ['function countErrors(lines) {', '  let count = 0;', '  for (const line of lines) {', "    if (line.split(' ')[1] === 'ERROR') count += 1;", '  }', '  return count;', '}'],
          distractors: ["    if (line.includes('ERROR')) count += 1;"],
          tests: R`test('レベルで数える', () => {
  const lines = ['2026-04-01T09:00:00Z ERROR 失敗', '2026-04-01T09:01:00Z INFO ERRORページを表示', '2026-04-01T09:02:00Z ERROR 失敗'];
  expect(countErrors(lines)).toBe(2);
});`,
          hints: ['includes だと、メッセージの中の文字まで拾ってしまいます。', 'レベルの欄だけを比べます。', "    if (line.split(' ')[1] === 'ERROR') count += 1;"] },
        { id: 'L1-08-b1', stage: 'blank', prompt: '空欄を埋めて、ログの1行を { time, level, message } にしてください。メッセージには空白が入ることがあります。',
          template: R`function parseLogLine(line) {
  const [time, level, ...rest] = line.[[1]](' ');
  return { time, level, message: rest.join([[2]]) };
}`, answers: ['split', "' '"],
          tests: R`test('読む', () => { expect(parseLogLine('2026-04-01T09:00:00Z WARN 残高が 少ない')).toEqual({ time: '2026-04-01T09:00:00Z', level: 'WARN', message: '残高が 少ない' }); });`,
          hints: ['1つ目は文字列を区切って配列にするメソッドです。', '2つ目は、分けたものを元どおりにつなぐ区切り文字です。', "split と ' ' です。"] },
        { id: 'L1-08-b2', stage: 'blank', prompt: '空欄を埋めて、メッセージの中の key=value を取り出してください。',
          template: R`function fieldsOf(message) {
  const out = {};
  for (const part of message.split(' ')) {
    const [k, v] = part.split('=');
    if (v !== [[1]]) out[k] = v;
  }
  return out;
}`, answers: ['undefined'],
          tests: R`test('取り出す', () => { expect(fieldsOf('振込に失敗 id=req-1 code=E42')).toEqual({ id: 'req-1', code: 'E42' }); });`,
          hints: ['= が無い部分を split すると、v はどうなりますか？', '「値が無い」を表す特別な値です。', 'undefined です。'] },
        { id: 'L1-08-f1', stage: 'fix', prompt: 'メッセージの最初の単語しか取れていません。直してください。',
          code: R`function parseLogLine(line) {
  const [time, level, message] = line.split(' ');
  return { time, level, message };
}`,
          solution: R`function parseLogLine(line) {
  const [time, level, ...rest] = line.split(' ');
  return { time, level, message: rest.join(' ') };
}`,
          tests: R`test('空白を含むメッセージ', () => { expect(parseLogLine('2026-04-01T09:00:00Z ERROR 振込に 失敗 id=1').message).toBe('振込に 失敗 id=1'); });`,
          hints: ['3つ目以降の欄が捨てられています。', '残り全部を受け取る ... を使います。', "const [time, level, ...rest] = …; message: rest.join(' ')"] },
        { id: 'L1-08-f2', stage: 'fix', prompt: '「最初の」エラーを返すはずが、最後のエラーを返しています。直してください。',
          code: R`function firstError(lines) {
  let found = null;
  for (const line of lines) {
    if (line.split(' ')[1] === 'ERROR') found = line;
  }
  return found;
}`,
          solution: R`function firstError(lines) {
  for (const line of lines) {
    if (line.split(' ')[1] === 'ERROR') return line;
  }
  return null;
}`,
          tests: R`test('最初のエラー', () => {
  const lines = ['t1 INFO 起動', 't2 ERROR 一つ目', 't3 ERROR 二つ目'];
  expect(firstError(lines)).toBe('t2 ERROR 一つ目');
});
test('エラーが無ければ null', () => { expect(firstError(['t1 INFO 起動'])).toBeNull(); });`,
          hints: ['found は見つかるたびに上書きされています。', '見つけた時点で返せば、それが最初です。', "if (…) return line; にして、最後に return null;"] },
        { id: 'L1-08-s1', stage: 'scratch', prompt: 'summarizeLog(lines) を書いてください。{ INFO, WARN, ERROR, firstError } を返します。各レベルの件数と、最初の ERROR の行（無ければ null）です。空行や DEBUG など他のレベルの行は無視します。',
          code: R`/** ログをレベルごとに数え、最初の ERROR を覚える */
function summarizeLog(lines) {
  // ここに書く
}`,
          solution: R`function summarizeLog(lines) {
  const out = { INFO: 0, WARN: 0, ERROR: 0, firstError: null };
  for (const line of lines) {
    const level = line.split(' ')[1];
    if (level !== 'INFO' && level !== 'WARN' && level !== 'ERROR') continue;
    out[level] += 1;
    if (level === 'ERROR' && out.firstError === null) out.firstError = line;
  }
  return out;
}`,
          tests: R`test('空', () => { expect(summarizeLog([])).toEqual({ INFO: 0, WARN: 0, ERROR: 0, firstError: null }); });
test('数える', () => {
  const lines = ['t1 INFO 起動', 't2 WARN 遅い', 't3 ERROR 失敗A', 't4 ERROR 失敗B', '', 't5 DEBUG 詳細'];
  expect(summarizeLog(lines)).toEqual({ INFO: 1, WARN: 1, ERROR: 2, firstError: 't3 ERROR 失敗A' });
});`,
          hints: ['結果のオブジェクトを先に作り、1行ずつ数を足します。', '知らないレベルは continue で飛ばしましょう。', "if (level === 'ERROR' && out.firstError === null) out.firstError = line;"] },
      ],
      gate: {
        what: { min: 2, points: [p('レベルごとに数える', ['数', 'レベル', 'info', 'warn', 'error', '集計']), p('最初のエラーを覚える', ['最初', 'firsterror', '一番目', '初めて'])] },
        risk: { min: 1, points: [p('形式が違う行（空白の数・欠け）', ['形式', '空白', '欠け', '崩れ', 'フォーマット']), p('ログに秘密情報が混ざる', ['秘密', '個人情報', 'マスク']), p('時刻の順に並んでいないと「最初」が正しくない', ['時刻', '順', '並び'])] },
      },
      aiTask: {
        file: 'src/logs.js', testFile: 'tests/logs.test.js',
        ticket: '障害調査のために、ログの1行を読む parseLogLine(line) と、指定時刻以降の ERROR を集める errorsSince(lines, time) を src/logs.js に実装してほしい。',
        signature: 'parseLogLine(line) → { time, level, message, fields } | null / errorsSince(lines, time)',
        specGroups: [p('形式が違う行は null', ['形式が違', '不正な行', 'null', '空行', '崩れ']), p('指定した時刻ちょうどの行も含める', ['ちょうど', '以降', '含む', '以上'])],
        good: R`/** "時刻 レベル メッセージ key=value…" を読む。形式が違う行は null */
function parseLogLine(line) {
  const m = /^(\S+) (INFO|WARN|ERROR) (.*)$/.exec(String(line));
  if (!m) return null;
  const fields = {};
  for (const part of m[3].split(' ')) {
    const eq = part.indexOf('=');
    if (eq > 0) fields[part.slice(0, eq)] = part.slice(eq + 1);
  }
  return { time: m[1], level: m[2], message: m[3], fields };
}

/** time 以降（ちょうどを含む）の ERROR 行を、読んだ形で返す */
function errorsSince(lines, time) {
  return lines.map(parseLogLine).filter((e) => e && e.level === 'ERROR' && e.time >= time);
}
`,
        buggy: R`/** ログの1行を読む */
function parseLogLine(line) {
  const [time, level, ...rest] = String(line).split(' ');
  const fields = {};
  for (const part of rest) {
    const [k, v] = part.split('=');
    if (v !== undefined) fields[k] = v;
  }
  return { time, level, message: rest.join(' '), fields };
}

/** time より後の ERROR 行 */
function errorsSince(lines, time) {
  return lines.map(parseLogLine).filter((e) => e.level === 'ERROR' && e.time > time);
}
`,
        buggyNote: '形式が違う行と、指定時刻ちょうどの扱いが仕様に無かったので、すべての行を同じ形とみなし、「より後」で絞っています。',
        tests: R`test('1行を読む', () => { expect(parseLogLine('2026-04-01T09:05:00Z ERROR 振込に失敗 id=req-7')).toEqual({ time: '2026-04-01T09:05:00Z', level: 'ERROR', message: '振込に失敗 id=req-7', fields: { id: 'req-7' } }); });
test('形式が違う行は null', () => { expect(parseLogLine('壊れた行')).toBeNull(); });
test('ちょうどの時刻も含める', () => {
  const lines = ['2026-04-01T09:00:00Z ERROR A', '2026-04-01T09:05:00Z ERROR B', '2026-04-01T09:06:00Z INFO C', '2026-04-01T09:07:00Z ERROR D'];
  expect(errorsSince(lines, '2026-04-01T09:05:00Z').map((e) => e.message)).toEqual(['B', 'D']);
});
test('壊れた行が混ざっても落ちない', () => { expect(errorsSince(['', '2026-04-01T09:05:00Z ERROR B'], '2026-04-01T00:00:00Z').length).toBe(1); });
`,
        review: { min: 1, points: [p('壊れた行でも形だけのオブジェクトを返す', ['壊れ', '形式', 'null']), p('> と >= の取り違え（ちょうどの時刻）', ['>=', 'ちょうど', '以降'])] },
      },
      demos: [{ label: '障害ログの絞り込み', expr: "errorsSince(['2026-04-01T09:00:00Z INFO 起動', '2026-04-01T09:05:00Z ERROR 振込に失敗 id=req-7', '2026-04-01T09:06:00Z ERROR 振込に失敗 id=req-8'], '2026-04-01T09:05:00Z').map((e) => e.fields.id).join(', ') + ' が失敗'" }],
      tutorTips: [{ keys: ['split', '欄'], tip: "その行を空白で分けると、0番目・1番目・2番目には何が入りますか？" }],
    },
    // =====================================================================
    {
      id: 'L1-09', area: 'J', level: 1, prereq: ['L1-07'], estMinutes: 30,
      title: '情報区分とAI利用ルール',
      story: 'コンプライアンス担当の伊藤さんより：「生成AIに何を送ってよいかは、情報の区分で決まるの。練習銀行のルールは“公開はOK、社内は承認済みツールだけ、機密はNG”。コードで判定できるようにしてね。」',
      goals: ['情報区分（公開・社内・機密）とAIに送ってよい範囲を説明できる', '送信前に項目を検査する関数を書ける'],
      evidence: 'スキルマップ J-L1／金融庁AIディスカッションペーパー・FISC（機密情報の扱い）',
      concept: [
        '練習銀行の情報区分は3つです（架空のルール）。公開: 誰に見られてもよい（銀行名・支店名など）。社内: 社員なら見てよい（取引ID・分類など）。機密: 顧客を特定できる情報（口座番号・氏名・メールアドレス・電話番号など）。',
        '生成AIに送ってよいのは「公開」と、承認済みのツールに限って「社内」まで。「機密」はどのツールにも送りません。',
        { code: R`canSendToAi('公開', false); // → true
canSendToAi('社内', true);  // → true（承認済みツール）
canSendToAi('機密', true);  // → false` },
        'ルールに載っていない新しい項目が出てきたら、安全側（機密）に倒して扱うのが基本です。',
      ],
      predict: [
        { q: '顧客の口座番号は、どの区分？', code: '', choices: ['機密', '公開', '社内', '区分なし'], answer: 0, why: '顧客を特定できる情報なので機密です。' },
        { q: '社内の設計メモを、生成AIに貼ってよい？', code: '', choices: ['承認済みツールなら貼ってよい', 'どのツールでも貼ってよい', '絶対に貼ってはいけない', '上司に聞かずに判断してよい'], answer: 0, why: '社内の情報は、承認済みのツールに限って送れます。' },
        { q: 'このコードの値は？', code: R`['公開', '社内'].includes('機密')`, choices: ['false', 'true', "'機密'", 'エラー'], answer: 0, why: '配列に「機密」は入っていないので false です。' },
      ],
      exercises: [
        { id: 'L1-09-p1', stage: 'parsons', prompt: '「公開」の情報だけ true を返す canSendToAi を組み立ててください。使わない行が1つあります。',
          lines: ['function canSendToAi(level) {', "  return level === '公開';", '}'],
          distractors: ['  return true;'],
          tests: R`test('公開は OK', () => { expect(canSendToAi('公開')).toBe(true); });
test('機密は NG', () => { expect(canSendToAi('機密')).toBe(false); });`,
          hints: ['何でも true にしてしまう行は使いません。', '区分を比べます。', "  return level === '公開';"] },
        { id: 'L1-09-p2', stage: 'parsons', prompt: '公開は常に OK、社内は承認済みツールなら OK、それ以外は NG の canSendToAi を組み立ててください。使わない行が1つあります。',
          lines: ['function canSendToAi(level, approvedTool) {', "  if (level === '公開') return true;", "  if (level === '社内') return approvedTool;", '  return false;', '}'],
          distractors: ["  if (level === '機密') return approvedTool;"],
          tests: R`test('社内・承認済み', () => { expect(canSendToAi('社内', true)).toBe(true); });
test('社内・未承認', () => { expect(canSendToAi('社内', false)).toBe(false); });
test('機密・承認済みでも NG', () => { expect(canSendToAi('機密', true)).toBe(false); });`,
          hints: ['区分ごとに上から順に判定します。', '機密は承認済みでも送れません。', '機密について approvedTool を返す行は使いません。'] },
        { id: 'L1-09-b1', stage: 'blank', prompt: '空欄を埋めて、機密の項目かどうかを判定してください。',
          template: R`const CONFIDENTIAL = ['accountNo', 'name', 'email', 'phone'];
function classifyField(field) {
  return CONFIDENTIAL.[[1]](field) ? '機密' : '社内';
}`, answers: ['includes'],
          tests: R`test('口座番号は機密', () => { expect(classifyField('accountNo')).toBe('機密'); });
test('取引IDは社内', () => { expect(classifyField('txId')).toBe('社内'); });`,
          hints: ['配列にその値が入っているかを true/false で返すメソッドです。', '「含む」という意味の英単語です。', 'includes です。'] },
        { id: 'L1-09-b2', stage: 'blank', prompt: '空欄を埋めて、いくつかの区分のうち最も厳しい区分を返してください（公開 < 社内 < 機密）。',
          template: R`function strictest(levels) {
  const order = ['公開', '社内', '機密'];
  return levels.reduce((a, b) => (order.indexOf(b) [[1]] order.indexOf(a) ? b : a), '公開');
}`, answers: ['>'],
          tests: R`test('機密が最も厳しい', () => { expect(strictest(['公開', '機密', '社内'])).toBe('機密'); });
test('空なら公開', () => { expect(strictest([])).toBe('公開'); });`,
          hints: ['order の中で後ろにあるほど厳しい区分です。', 'b の方が厳しければ b を選びます。', '> です。'] },
        { id: 'L1-09-f1', stage: 'fix', prompt: '承認済みのツールなら機密まで送れてしまいます。直してください。',
          code: R`function canSendToAi(level, approvedTool) {
  if (level === '公開') return true;
  return approvedTool;
}`,
          solution: R`function canSendToAi(level, approvedTool) {
  if (level === '公開') return true;
  if (level === '社内') return approvedTool;
  return false;
}`,
          tests: R`test('機密は NG', () => { expect(canSendToAi('機密', true)).toBe(false); });
test('社内・承認済みは OK', () => { expect(canSendToAi('社内', true)).toBe(true); });`,
          hints: ['公開以外が全部 approvedTool になっています。', '社内のときだけ approvedTool を返しましょう。', "if (level === '社内') return approvedTool; return false;"] },
        { id: 'L1-09-f2', stage: 'fix', prompt: 'いちばんゆるい区分を返してしまっています。いちばん厳しい区分を返すように直してください。',
          code: R`function strictest(levels) {
  const order = ['公開', '社内', '機密'];
  return levels.reduce((a, b) => (order.indexOf(b) < order.indexOf(a) ? b : a), '公開');
}`,
          solution: R`function strictest(levels) {
  const order = ['公開', '社内', '機密'];
  return levels.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a), '公開');
}`,
          tests: R`test('機密が最も厳しい', () => { expect(strictest(['社内', '機密'])).toBe('機密'); });`,
          hints: ['比較の向きを確かめましょう。', 'order の後ろほど厳しい区分です。', '< を > にします。'] },
        { id: 'L1-09-s1', stage: 'scratch', prompt: 'checkPayload(record, approvedTool) を書いてください。record の項目名で区分を決めます（accountNo・name・email・phone は機密、bankName・branchName は公開、それ以外は社内）。送れない項目名を項目の順に blocked に入れ、{ ok, blocked } を返します。',
          code: R`/** AIに送る前に項目を検査する */
function checkPayload(record, approvedTool) {
  // ここに書く
}`,
          solution: R`function checkPayload(record, approvedTool) {
  const CONFIDENTIAL_FIELDS = ['accountNo', 'name', 'email', 'phone'];
  const PUBLIC_FIELDS = ['bankName', 'branchName'];
  const level = (k) => (CONFIDENTIAL_FIELDS.includes(k) ? '機密' : PUBLIC_FIELDS.includes(k) ? '公開' : '社内');
  const blocked = Object.keys(record).filter((k) => {
    const lv = level(k);
    return !(lv === '公開' || (lv === '社内' && approvedTool));
  });
  return { ok: blocked.length === 0, blocked };
}`,
          tests: R`test('公開だけなら OK', () => { expect(checkPayload({ bankName: '練習銀行' }, false)).toEqual({ ok: true, blocked: [] }); });
test('社内は承認済みなら OK', () => { expect(checkPayload({ txId: 't1', bankName: '練習銀行' }, true)).toEqual({ ok: true, blocked: [] }); });
test('社内は未承認なら NG', () => { expect(checkPayload({ txId: 't1' }, false)).toEqual({ ok: false, blocked: ['txId'] }); });
test('機密は承認済みでも NG', () => { expect(checkPayload({ name: '練習 太郎', txId: 't1', accountNo: '1000001' }, true)).toEqual({ ok: false, blocked: ['name', 'accountNo'] }); });`,
          hints: ['項目名から区分を返す小さな関数を作ると見通しがよくなります。', 'Object.keys(record) で項目名の配列が取れます。', "送れる条件: lv === '公開' || (lv === '社内' && approvedTool)"] },
      ],
      gate: {
        what: { min: 2, points: [p('項目ごとに区分を決める', ['区分', '分類', '機密', '社内', '公開']), p('承認済みツールなら社内まで送れる', ['承認', 'ツール', '社内'])] },
        risk: { min: 1, points: [p('リストに無い項目が社内扱いになる（漏れ）', ['リストに無い', '漏れ', '新しい項目', '既定', 'デフォルト', '安全側']), p('値の中身に個人情報が混ざる', ['中身', '値', '自由記述', 'メモ']), p('区分の判断は規程の改定で変わる', ['規程', 'ルール', '変わる', '更新', '改定'])] },
      },
      aiTask: {
        file: 'src/policy.js', testFile: 'tests/policy.test.js',
        ticket: 'AI チャットに取引情報を渡す前の検査として、classifyKey(key) と aiSendCheck(record, approvedTool) を src/policy.js に実装してほしい。',
        signature: 'classifyKey(key) → 公開 | 社内 | 機密 / aiSendCheck(record, approvedTool) → { ok, blocked }',
        specGroups: [p('ルールに無い項目は機密として扱う（安全側）', ['安全側', '知らない項目', '未知', '機密として扱', 'リストに無い', 'ルールに無い']), p('メモ（自由記述）は中身も検査する', ['メモ', '中身', '自由記述', 'memo'])],
        good: R`const PUBLIC_KEYS = ['bankName', 'branchName', 'amount', 'date'];
const INTERNAL_KEYS = ['txId', 'category'];

/** 項目名の区分。ルールに無い項目は安全側に倒して「機密」 */
function classifyKey(key) {
  if (PUBLIC_KEYS.includes(key)) return '公開';
  if (INTERNAL_KEYS.includes(key)) return '社内';
  return '機密';
}

/** AI に送ってよいか。承認済みツールなら社内まで。memo は社内扱いで、中身に連絡先らしきものがあれば止める */
function aiSendCheck(record, approvedTool) {
  const blocked = Object.keys(record).filter((k) => {
    if (k === 'memo') return !approvedTool || /@|\d{10,}/.test(String(record[k]));
    const level = classifyKey(k);
    return !(level === '公開' || (level === '社内' && approvedTool));
  });
  return { ok: blocked.length === 0, blocked };
}
`,
        buggy: R`const PUBLIC_KEYS = ['bankName', 'branchName', 'amount', 'date'];
const CONFIDENTIAL_KEYS = ['accountNo', 'name', 'email', 'phone'];

/** 項目名の区分 */
function classifyKey(key) {
  if (PUBLIC_KEYS.includes(key)) return '公開';
  if (CONFIDENTIAL_KEYS.includes(key)) return '機密';
  return '社内';
}

/** AI に送ってよいか */
function aiSendCheck(record, approvedTool) {
  const blocked = Object.keys(record).filter((k) => {
    const level = classifyKey(k);
    return !(level === '公開' || (level === '社内' && approvedTool));
  });
  return { ok: blocked.length === 0, blocked };
}
`,
        buggyNote: 'ルールに無い項目とメモの中身の扱いが仕様に無かったので、機密の一覧に無いものはすべて社内として扱っています。',
        tests: R`test('公開だけなら未承認でも OK', () => { expect(aiSendCheck({ amount: 1000, date: '2026-04-01' }, false)).toEqual({ ok: true, blocked: [] }); });
test('機密は止める', () => { expect(aiSendCheck({ amount: 1, accountNo: '1000001' }, true).blocked).toEqual(['accountNo']); });
test('ルールに無い項目は安全側（機密）', () => { expect(aiSendCheck({ amount: 1, nickname: 'たろう' }, true).blocked).toEqual(['nickname']); });
test('メモに連絡先があれば止める', () => { expect(aiSendCheck({ memo: '連絡は x@example.com へ' }, true).blocked).toEqual(['memo']); });
test('ふつうのメモと社内項目は承認済みなら OK', () => { expect(aiSendCheck({ txId: 't1', memo: '電気代' }, true)).toEqual({ ok: true, blocked: [] }); });
test('区分', () => { expect([classifyKey('bankName'), classifyKey('txId'), classifyKey('email')]).toEqual(['公開', '社内', '機密']); });
`,
        review: { min: 1, points: [p('ルールに無い項目が社内扱いで送れてしまう', ['ルールに無い', '知らない', '社内扱い', '安全側']), p('メモの中身を見ていない', ['メモ', '中身', 'memo'])] },
      },
      demos: [{ label: 'AI送信前の検査', expr: "(() => { const r = aiSendCheck({ amount: 5000, accountNo: '1000001', memo: '家賃' }, true); return r.ok ? '送信OK' : '送信を止める項目: ' + r.blocked.join(', '); })()" }],
      tutorTips: [{ keys: ['区分', '機密', '社内'], tip: 'その項目が漏れたとき、誰が・どのくらい困りますか？ それで区分を考えてみましょう。' }],
    },
    // =====================================================================
    {
      id: 'L1-10', area: 'H', level: 1, prereq: ['L1-04'], estMinutes: 25,
      title: '答えを写さずに質問する',
      story: '先輩の佐藤さんより：「“動きません、答えを教えてください”だと、人もAIも助けにくいんだ。目的・試したこと・期待・実際をそろえて聞けると、自分で気づけることも多いよ。」',
      goals: ['目的・試したこと・期待・実際をそろえた質問を書ける', '答えを写すのではなく、考える材料を引き出す質問ができる'],
      evidence: 'スキルマップ H-L1（答えを写さずに質問できる）・K-L1／CS50 Duck の設計',
      concept: [
        '良い質問には4つの部品があります。目的（何をしたいか）・試したこと・期待（こうなるはず）・実際（こうなった）。',
        { code: R`目的: 月の明細を出したい
試したこと: filter で 2026-04 を指定した
期待: 4月の2件
実際: 0件` },
        '期待と実際を並べると、その差から原因の当たりが付きます。書いているうちに自分で気づくことも少なくありません。',
        'AIに質問するときも同じです。「答えを書いて」ではなく「どこを見ればよいか」を聞くと、理解が残ります。コードは問題が再現する最小限に絞りましょう。',
      ],
      predict: [
        { q: 'いちばん助けてもらいやすい質問は？', code: '', choices: ['目的・試したこと・期待・実際を書いた質問', '「動きません」だけの質問', 'コード全部を貼った質問', '「答えを教えて」だけの質問'], answer: 0, why: '読む人が状況をすぐ再現できます。' },
        { q: '質問に「期待」と「実際」を書く一番の理由は？', code: '', choices: ['その差から原因の当たりが付くから', '文章が長くなるから', '決まりだから', '相手が喜ぶから'], answer: 0, why: '差がどこで生まれたかを追えば原因に近づけます。' },
        { q: 'このコードの値は？', code: R`Object.keys({ a: 1, b: 2 }).length`, choices: ['2', '3', '1', 'undefined'], answer: 0, why: 'キーは a と b の2つです。' },
      ],
      exercises: [
        { id: 'L1-10-p1', stage: 'parsons', prompt: '質問に足りない部品（goal・tried・expected・actual のうち空のもの）を返す missingParts を組み立ててください。使わない行が1つあります。',
          lines: ['function missingParts(q) {', "  const keys = ['goal', 'tried', 'expected', 'actual'];", '  return keys.filter((k) => !q[k]);', '}'],
          distractors: ['  return keys.filter((k) => q[k]);'],
          tests: R`test('足りないもの', () => { expect(missingParts({ goal: '残高を出す', tried: 'reduce' })).toEqual(['expected', 'actual']); });
test('全部ある', () => { expect(missingParts({ goal: 'a', tried: 'b', expected: 'c', actual: 'd' })).toEqual([]); });`,
          hints: ['返したいのは「無い」ものです。', '! の付いている方を選びます。', '  return keys.filter((k) => !q[k]); を使います。'] },
        { id: 'L1-10-p2', stage: 'parsons', prompt: '質問文を組み立てる buildQuestion を作ってください。3行（目的／試したこと／期待と実際）を改行でつなぎます。使わない行が1つあります。',
          lines: ['function buildQuestion(q) {', '  return [', "    '目的: ' + q.goal,", "    '試したこと: ' + q.tried,", "    '期待: ' + q.expected + ' / 実際: ' + q.actual,", R`  ].join('\n');`, '}'],
          distractors: ["    '答えを教えてください',"],
          tests: R`test('質問文', () => { expect(buildQuestion({ goal: '残高を出す', tried: 'reduce を使った', expected: '0', actual: 'エラー' })).toBe('目的: 残高を出す\n試したこと: reduce を使った\n期待: 0 / 実際: エラー'); });`,
          hints: ['配列に3行を並べて、最後に join します。', '「答えを教えて」は良い質問の部品ではありません。', "'期待: ' + q.expected + ' / 実際: ' + q.actual の行が3行目です。"] },
        { id: 'L1-10-b1', stage: 'blank', prompt: '空欄を埋めて、空白だけの欄も「足りない」とみなしてください。',
          template: R`function missingParts(q) {
  return ['goal', 'tried', 'expected', 'actual'].filter((k) => ![[1]] || !String(q[k]).trim());
}`, answers: ['q[k]'],
          tests: R`test('空白だけは足りない', () => { expect(missingParts({ goal: '  ', tried: 'a', expected: 'b', actual: 'c' })).toEqual(['goal']); });
test('無いものも足りない', () => { expect(missingParts({ goal: 'g', tried: 'a', expected: 'b' })).toEqual(['actual']); });`,
          hints: ['まず、その欄があるかどうかを確かめます。', 'q の k 番目の値です。', 'q[k] です。'] },
        { id: 'L1-10-b2', stage: 'blank', prompt: '空欄を埋めて、「答え」や「コードを書いて」を求める質問かどうかを判定してください。',
          template: R`function isAnswerRequest(text) {
  return /答え|コードを(全部)?書いて/.[[1]](text);
}`, answers: ['test'],
          tests: R`test('答えを求める', () => { expect(isAnswerRequest('答えを教えて')).toBe(true); });
test('コードを書いて', () => { expect(isAnswerRequest('コードを全部書いて')).toBe(true); });
test('ふつうの質問', () => { expect(isAnswerRequest('どこを見ればいい？')).toBe(false); });`,
          hints: ['正規表現が当てはまるかを true/false で返すメソッドです。', '4文字です。', 'test です。'] },
        { id: 'L1-10-f1', stage: 'fix', prompt: '空白だけの欄を「書いてある」とみなしてしまいます。直してください。',
          code: R`function missingParts(q) {
  return ['goal', 'tried', 'expected', 'actual'].filter((k) => !q[k]);
}`,
          solution: R`function missingParts(q) {
  return ['goal', 'tried', 'expected', 'actual'].filter((k) => !q[k] || !String(q[k]).trim());
}`,
          tests: R`test('空白だけは足りない', () => { expect(missingParts({ goal: ' ', tried: 'a', expected: 'b', actual: 'c' })).toEqual(['goal']); });`,
          hints: ["' ' は空ではないので、!q[k] は false になります。", '前後の空白を取ってから確かめましょう。', '|| !String(q[k]).trim() を足します。'] },
        { id: 'L1-10-f2', stage: 'fix', prompt: '期待と実際が入れ替わっています。直してください。',
          code: R`function buildQuestion(q) {
  return ['目的: ' + q.goal, '試したこと: ' + q.tried, '期待: ' + q.actual + ' / 実際: ' + q.expected].join('\n');
}`,
          solution: R`function buildQuestion(q) {
  return ['目的: ' + q.goal, '試したこと: ' + q.tried, '期待: ' + q.expected + ' / 実際: ' + q.actual].join('\n');
}`,
          tests: R`test('期待と実際', () => { expect(buildQuestion({ goal: 'g', tried: 't', expected: '2件', actual: '0件' }).split('\n')[2]).toBe('期待: 2件 / 実際: 0件'); });`,
          hints: ['3行目を、テストの期待値と見比べましょう。', 'q.actual と q.expected の場所が逆です。', "'期待: ' + q.expected + ' / 実際: ' + q.actual"] },
        { id: 'L1-10-s1', stage: 'scratch', prompt: 'questionScore(q) を書いてください。goal（目的）・tried（試したこと）・expected（期待）・actual（実際）のうち、書いてある（空白だけでない）数を score に、足りないキーを missing に入れます。tip は、足りなければ「まず「目的」を書きましょう」のように最初に足りない部品の日本語名、そろっていれば「質問の準備ができました」です。',
          code: R`/** 質問の準備ができているかを採点する */
function questionScore(q) {
  // ここに書く
}`,
          solution: R`function questionScore(q) {
  const LABELS = { goal: '目的', tried: '試したこと', expected: '期待', actual: '実際' };
  const missing = Object.keys(LABELS).filter((k) => !q[k] || !String(q[k]).trim());
  return { score: 4 - missing.length, missing, tip: missing.length ? 'まず「' + LABELS[missing[0]] + '」を書きましょう' : '質問の準備ができました' };
}`,
          tests: R`test('空', () => { expect(questionScore({})).toEqual({ score: 0, missing: ['goal', 'tried', 'expected', 'actual'], tip: 'まず「目的」を書きましょう' }); });
test('一部', () => { expect(questionScore({ goal: '残高', tried: ' ', expected: '0' })).toEqual({ score: 2, missing: ['tried', 'actual'], tip: 'まず「試したこと」を書きましょう' }); });
test('そろった', () => { expect(questionScore({ goal: 'a', tried: 'b', expected: 'c', actual: 'd' }).tip).toBe('質問の準備ができました'); });`,
          hints: ['キーと日本語名の対応表を、オブジェクトで作ると楽です。', 'missing を先に求めると、score は 4 − missing.length です。', "Object.keys(LABELS).filter((k) => !q[k] || !String(q[k]).trim())"] },
      ],
      gate: {
        what: { min: 2, points: [p('目的・試したこと・期待・実際がそろっているか数える', ['目的', '試した', '期待', '実際', 'そろ', '数']), p('足りないものを教える', ['足りない', 'missing', '次に', '最初', 'tip'])] },
        risk: { min: 1, points: [p('形だけ埋めても中身が薄いことがある', ['中身', '形だけ', '薄い', '意味']), p('空白だけの入力', ['空白', 'スペース', 'trim']), p('質問に秘密情報を貼ってしまう', ['秘密', '個人情報', '貼'])] },
      },
      aiTask: {
        file: 'src/question.js', testFile: 'tests/question.test.js',
        ticket: 'AIチューターに送る前の「質問の下書き」機能として、questionReady(q) と formatQuestion(q) を src/question.js に実装してほしい。q は { goal, tried, expected, actual, code? }。',
        signature: 'questionReady(q) → boolean / formatQuestion(q) → string',
        specGroups: [p('空白だけの欄は未記入として扱う（前後の空白も取る）', ['空白', 'スペース', 'trim', '未記入']), p('コードは最初の3行まで（最小の再現に絞る）', ['3行', '切り詰', '最小', '短く'])],
        good: R`const QUESTION_LABELS = { goal: '目的', tried: '試したこと', expected: '期待', actual: '実際' };

/** 質問の準備ができているか。空白だけの欄は未記入として扱う */
function questionReady(q) {
  return Object.keys(QUESTION_LABELS).every((k) => q[k] && String(q[k]).trim());
}

/** 質問文を作る。値の前後の空白は取り、コードは最初の3行まで（最小の再現に絞る） */
function formatQuestion(q) {
  const lines = Object.keys(QUESTION_LABELS).map((k) => QUESTION_LABELS[k] + ': ' + String(q[k] || '').trim());
  if (q.code) {
    const code = String(q.code).split('\n');
    lines.push('コード:', ...code.slice(0, 3), ...(code.length > 3 ? ['…（省略）'] : []));
  }
  return lines.join('\n');
}
`,
        buggy: R`const QUESTION_LABELS = { goal: '目的', tried: '試したこと', expected: '期待', actual: '実際' };

/** 質問の準備ができているか */
function questionReady(q) {
  return Object.keys(QUESTION_LABELS).every((k) => q[k]);
}

/** 質問文を作る */
function formatQuestion(q) {
  const lines = Object.keys(QUESTION_LABELS).map((k) => QUESTION_LABELS[k] + ': ' + q[k]);
  if (q.code) lines.push('コード:', q.code);
  return lines.join('\n');
}
`,
        buggyNote: '空白だけの欄と、コードの長さの扱いが仕様に無かったので、入力をそのまま使っています。',
        tests: R`test('空白だけの欄は未記入', () => { expect(questionReady({ goal: 'a', tried: '  ', expected: 'b', actual: 'c' })).toBe(false); });
test('そろっていれば準備OK', () => { expect(questionReady({ goal: 'a', tried: 'b', expected: 'c', actual: 'd' })).toBe(true); });
test('前後の空白を取る', () => { expect(formatQuestion({ goal: ' 残高を出す ', tried: 'reduce', expected: '0', actual: 'エラー' })).toBe('目的: 残高を出す\n試したこと: reduce\n期待: 0\n実際: エラー'); });
test('コードは3行まで', () => {
  const text = formatQuestion({ goal: 'a', tried: 'b', expected: 'c', actual: 'd', code: '1\n2\n3\n4\n5' });
  expect(text.split('\n').slice(4)).toEqual(['コード:', '1', '2', '3', '…（省略）']);
});
`,
        review: { min: 1, points: [p('空白だけでも準備OKになる', ['空白', 'trim']), p('長いコードをそのまま送ってしまう', ['コード', '長い', '3行', '全部'])] },
      },
      demos: [{ label: '質問の下書き', expr: "formatQuestion({ goal: '残高を出したい', tried: 'reduce を使った', expected: '0', actual: 'TypeError' }).split('\\n').join(' / ')" }],
      tutorTips: [{ keys: ['質問', '聞き方'], tip: 'いまの質問に、目的・試したこと・期待・実際のうち、どれが入っていますか？ 足りないものを1つ足すとしたら？' }],
    },
    // =====================================================================
    {
      id: 'L2-06', area: 'C', level: 2, prereq: ['L1-06'], estMinutes: 35,
      title: 'データを正規化する',
      story: '先輩の佐藤さんより：「古い口座一覧は、顧客の名前が口座の数だけ重複して入ってるんだ。名前を変えるたびに直し忘れが出る。顧客と口座に分けて持とう。」',
      goals: ['重複したデータが更新の食い違いを生む理由を説明できる', '1枚の表を、顧客と口座に分けて持てる'],
      evidence: 'スキルマップ C-L2（DB設計：正規化・排他制御）',
      concept: [
        '同じ情報を何か所にも持つと、1か所だけ直し忘れたときにデータが食い違います（更新時の異常）。',
        { code: R`// 正規化する前（顧客の名前が重複）
[{ customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001' },
 { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000002' }]
// 正規化した後
customers: { c1: { name: '練習 太郎' } }
accounts:  [{ accountNo: '1000001', customerId: 'c1' }, { accountNo: '1000002', customerId: 'c1' }]` },
        '分けたデータは、ID でつないで（結合して）表示します。名前を変えるときは customers の1か所だけを直せば済みます。',
        '口座番号のように一意であるべき値が重複していないかも、取り込むときに確かめます（DB なら主キー・一意制約）。',
      ],
      predict: [
        { q: '同じ顧客の名前が3行に重複している。名前の変更で1行だけ直し忘れると？', code: '', choices: ['行によって名前が食い違う', '自動で全部直る', 'エラーで止まる', '何も起きない'], answer: 0, why: '重複したデータは、すべてを直さないと食い違います。' },
        { q: 'このコードの値は？', code: R`new Set(['c1', 'c1', 'c2']).size`, choices: ['2', '3', '1', 'エラー'], answer: 0, why: 'Set は重複を1つにまとめます。' },
        { q: 'このコードの値は？', code: R`const db = { c1: { name: 'A' } };
db['c1'].name`, choices: ["'A'", 'undefined', "'c1'", 'エラー'], answer: 0, why: 'キー c1 のオブジェクトの name です。' },
      ],
      exercises: [
        { id: 'L2-06-p1', stage: 'parsons', prompt: '行の配列から、顧客ID をキーにした顧客の一覧を作る customersOf を組み立ててください。使わない行が1つあります。',
          lines: ['function customersOf(rows) {', '  const out = {};', '  for (const r of rows) out[r.customerId] = { name: r.customerName };', '  return out;', '}'],
          distractors: ['  for (const r of rows) out[r.customerName] = { id: r.customerId };'],
          tests: R`test('顧客ID がキー', () => {
  const rows = [{ customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001' }, { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000002' }];
  expect(customersOf(rows)).toEqual({ c1: { name: '練習 太郎' } });
});`,
          hints: ['キーにするのは、変わらない ID です。', '名前をキーにすると、同姓同名で困ります。', '  for (const r of rows) out[r.customerId] = { name: r.customerName };'] },
        { id: 'L2-06-p2', stage: 'parsons', prompt: '行の配列から、顧客の名前を含まない口座の一覧を作る accountsOf を組み立ててください。使わない行が1つあります。',
          lines: ['function accountsOf(rows) {', '  return rows.map((r) => ({', '    accountNo: r.accountNo,', '    customerId: r.customerId,', '    balance: r.balance,', '  }));', '}'],
          distractors: ['    customerName: r.customerName,'],
          tests: R`test('口座の一覧', () => {
  const rows = [{ customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001', balance: 500 }];
  expect(accountsOf(rows)).toEqual([{ accountNo: '1000001', customerId: 'c1', balance: 500 }]);
});`,
          hints: ['口座には、顧客をたどるための ID だけを持たせます。', '名前は customers 側にあります。', 'customerName の行は使いません。'] },
        { id: 'L2-06-b1', stage: 'blank', prompt: '空欄を埋めて、口座番号から顧客の名前を引いてください。',
          template: R`function customerNameOf(db, accountNo) {
  const acc = db.accounts.find((a) => a.accountNo === accountNo);
  return acc ? db.customers[acc.[[1]]].name : null;
}`, answers: ['customerId'],
          tests: R`test('名前を引く', () => {
  const db = { customers: { c1: { name: '練習 太郎' } }, accounts: [{ accountNo: '1000001', customerId: 'c1', balance: 0 }] };
  expect([customerNameOf(db, '1000001'), customerNameOf(db, '9999999')]).toEqual(['練習 太郎', null]);
});`,
          hints: ['口座から顧客へたどるための項目です。', 'accounts に入っている ID の名前です。', 'customerId です。'] },
        { id: 'L2-06-b2', stage: 'blank', prompt: '空欄を埋めて、顧客ごとの残高の合計を出してください。',
          template: R`function totalByCustomer(accounts) {
  const out = {};
  for (const a of accounts) out[a.customerId] = (out[a.customerId] [[1]] 0) + a.balance;
  return out;
}`, answers: ['??'],
          tests: R`test('合計', () => { expect(totalByCustomer([{ customerId: 'c1', balance: 100 }, { customerId: 'c2', balance: 5 }, { customerId: 'c1', balance: 50 }])).toEqual({ c1: 150, c2: 5 }); });`,
          hints: ['まだ無いキーのときは 0 から始めたい。', '「左が null か undefined なら右」を表す演算子です。', '?? です（|| でも動きます）。'] },
        { id: 'L2-06-f1', stage: 'fix', prompt: '名前をキーにしているので、同姓同名の別の顧客がまとめられてしまいます。顧客ID をキーにしてください。',
          code: R`function customersOf(rows) {
  const out = {};
  for (const r of rows) out[r.customerName] = { id: r.customerId };
  return out;
}`,
          solution: R`function customersOf(rows) {
  const out = {};
  for (const r of rows) out[r.customerId] = { name: r.customerName };
  return out;
}`,
          tests: R`test('同姓同名の別人', () => {
  const rows = [{ customerId: 'c1', customerName: '練習 太郎' }, { customerId: 'c2', customerName: '練習 太郎' }];
  expect(customersOf(rows)).toEqual({ c1: { name: '練習 太郎' }, c2: { name: '練習 太郎' } });
});`,
          hints: ['キーと値が逆になっています。', 'キーは customerId、値は { name } です。', 'out[r.customerId] = { name: r.customerName };'] },
        { id: 'L2-06-f2', stage: 'fix', prompt: '名前の変更が、最初の1行にしか反映されません（更新時の異常）。同じ顧客のすべての行を直してください。',
          code: R`function renameCustomer(rows, id, name) {
  const i = rows.findIndex((r) => r.customerId === id);
  const next = rows.slice();
  next[i] = { ...next[i], customerName: name };
  return next;
}`,
          solution: R`function renameCustomer(rows, id, name) {
  return rows.map((r) => (r.customerId === id ? { ...r, customerName: name } : r));
}`,
          tests: R`test('全部の行を直す', () => {
  const rows = [{ customerId: 'c1', customerName: 'A' }, { customerId: 'c2', customerName: 'B' }, { customerId: 'c1', customerName: 'A' }];
  expect(renameCustomer(rows, 'c1', 'Z').map((r) => r.customerName)).toEqual(['Z', 'B', 'Z']);
});`,
          hints: ['findIndex は最初の1件しか見つけません。', 'すべての行を見て、対象なら書き換えた新しい行にします。', "rows.map((r) => (r.customerId === id ? { ...r, customerName: name } : r))"] },
        { id: 'L2-06-s1', stage: 'scratch', prompt: 'normalize(rows) を書いてください。{ customers: { 顧客ID: { name } }, accounts: [{ accountNo, customerId, balance }] } を返します。同じ顧客ID なのに名前が行によって違えば「顧客 c1 の名前が行によって違います」のエラーにします。',
          code: R`/** 1枚の表を、顧客と口座に分ける */
function normalize(rows) {
  // ここに書く
}`,
          solution: R`function normalize(rows) {
  const customers = {};
  const accounts = [];
  for (const r of rows) {
    const prev = customers[r.customerId];
    if (prev && prev.name !== r.customerName) throw new Error('顧客 ' + r.customerId + ' の名前が行によって違います');
    customers[r.customerId] = { name: r.customerName };
    accounts.push({ accountNo: r.accountNo, customerId: r.customerId, balance: r.balance });
  }
  return { customers, accounts };
}`,
          tests: R`const ROWS = [
  { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001', balance: 500 },
  { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000002', balance: 30 },
  { customerId: 'c2', customerName: '練習 花子', accountNo: '1000003', balance: 0 },
];
test('分ける', () => {
  expect(normalize(ROWS)).toEqual({
    customers: { c1: { name: '練習 太郎' }, c2: { name: '練習 花子' } },
    accounts: [{ accountNo: '1000001', customerId: 'c1', balance: 500 }, { accountNo: '1000002', customerId: 'c1', balance: 30 }, { accountNo: '1000003', customerId: 'c2', balance: 0 }],
  });
});
test('空', () => { expect(normalize([])).toEqual({ customers: {}, accounts: [] }); });
test('名前の食い違いはエラー', () => { expect(() => normalize([...ROWS, { customerId: 'c1', customerName: '練習 次郎', accountNo: '1000009', balance: 0 }])).toThrow('c1'); });`,
          hints: ['customers と accounts を用意して、1行ずつ振り分けます。', 'すでに登録した顧客なら、名前が同じかを確かめます。', "if (prev && prev.name !== r.customerName) throw new Error(…);"] },
      ],
      gate: {
        what: { min: 2, points: [p('顧客と口座を分けて持つ', ['顧客', '口座', '分け', '正規化', '重複']), p('名前の食い違いを見つける', ['食い違', '違う', '矛盾', 'エラー'])] },
        risk: { min: 1, points: [p('同じ口座番号が重複している', ['口座番号が重複', '同じ口座', '一意', '主キー']), p('大量データでの性能', ['性能', '大量', '件数']), p('途中でエラーになると全部止まる', ['途中', '止まる', '一部'])] },
      },
      aiTask: {
        file: 'src/db.js', testFile: 'tests/db.test.js',
        ticket: '古い口座一覧（1枚の表）を取り込むために、buildDb(rows) と、口座番号から表示用の情報を引く lookupAccount(db, accountNo) を src/db.js に実装してほしい。',
        signature: 'buildDb(rows) → { customers, accounts } / lookupAccount(db, accountNo) → { accountNo, name, balance } | null',
        specGroups: [p('同じ口座番号が2回出たらエラー（一意）', ['口座番号が重複', '同じ口座番号', '重複', '一意']), p('存在しない口座は null', ['存在しない', '見つからない', 'null', '無い口座'])],
        good: R`/** 1枚の表（行の配列）を、顧客と口座に分ける。同じ口座番号が2回出たらエラー */
function buildDb(rows) {
  const customers = {};
  const accounts = {};
  for (const r of rows) {
    if (accounts[r.accountNo]) throw new Error('口座番号 ' + r.accountNo + ' が重複しています');
    customers[r.customerId] = { name: r.customerName };
    accounts[r.accountNo] = { customerId: r.customerId, balance: r.balance };
  }
  return { customers, accounts };
}

/** 口座番号から表示用の情報を引く。無ければ null */
function lookupAccount(db, accountNo) {
  const acc = db.accounts[accountNo];
  if (!acc) return null;
  return { accountNo, name: db.customers[acc.customerId].name, balance: acc.balance };
}
`,
        buggy: R`/** 1枚の表（行の配列）を、顧客と口座に分ける */
function buildDb(rows) {
  const customers = {};
  const accounts = {};
  for (const r of rows) {
    customers[r.customerId] = { name: r.customerName };
    accounts[r.accountNo] = { customerId: r.customerId, balance: r.balance };
  }
  return { customers, accounts };
}

/** 口座番号から表示用の情報を引く */
function lookupAccount(db, accountNo) {
  const acc = db.accounts[accountNo];
  return { accountNo, name: db.customers[acc.customerId].name, balance: acc.balance };
}
`,
        buggyNote: '口座番号の重複と、存在しない口座の扱いが仕様に無かったので、後の行で上書きし、口座は必ずあるものとして引いています。',
        tests: R`const ROWS = [
  { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001', balance: 500 },
  { customerId: 'c1', customerName: '練習 太郎', accountNo: '1000002', balance: 30 },
];
test('引ける', () => { expect(lookupAccount(buildDb(ROWS), '1000002')).toEqual({ accountNo: '1000002', name: '練習 太郎', balance: 30 }); });
test('顧客は1人', () => { expect(Object.keys(buildDb(ROWS).customers)).toEqual(['c1']); });
test('口座番号の重複はエラー', () => { expect(() => buildDb([...ROWS, { customerId: 'c2', customerName: '練習 花子', accountNo: '1000001', balance: 1 }])).toThrow('重複'); });
test('無い口座は null', () => { expect(lookupAccount(buildDb(ROWS), '9999999')).toBeNull(); });
`,
        review: { min: 1, points: [p('口座番号が重複すると黙って上書きされる', ['重複', '上書き', '一意']), p('無い口座でエラーになる', ['無い', 'null', 'undefined', 'エラー'])] },
      },
      demos: [{ label: '口座の照会（正規化済み）', expr: "lookupAccount(buildDb([{ customerId: 'c1', customerName: '練習 太郎', accountNo: '1000001', balance: 52000 }]), '1000001').name + ' さんの口座'" }],
      tutorTips: [{ keys: ['正規化', '重複'], tip: 'その情報は、いま何か所に書かれていますか？ 変更が入ったら何か所を直すことになりますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-07', area: 'E', level: 2, prereq: ['L1-05'], estMinutes: 35,
      title: '小さなPRに分けて、戻せるようにする',
      story: '先輩の佐藤さんより：「800行のPRはレビューしきれないし、本番で何かあっても、どこが悪いか分からない。小さく分けて出し、まずいときは直前の正常なバージョンにすぐ戻せるようにしよう。」',
      goals: ['小さなバッチで変更を出す理由を説明できる', '変更をPRに分け、戻し先（ロールバック）を決められる'],
      evidence: 'DORA 2025（小さなバッチ・変更失敗率）／スキルマップ E-L2',
      concept: [
        '変更が大きいほど、レビューの見落としと、本番での原因の切り分けにかかる時間が増えます。PRは300行程度を目安に分けます。',
        '分けるときは「順番を保ったまま、上限を超えそうになったら次のPRへ」が基本です。1ファイルだけで上限を超えるときは、それだけで1つのPRにします。',
        'デプロイの履歴から「最後に正常だったバージョン」を探し、そこへ戻すのがロールバックです。戻せないとき（正常なバージョンが無い・DBの変更が戻せない）は、止めて人が判断します。',
        { code: R`deploys = [{ version: 'v40', ok: true }, { version: 'v41', ok: true }, { version: 'v42', ok: false }]
// → v41 に戻す（v42 を飛ばす）` },
      ],
      predict: [
        { q: '800行のPRが1つと、200行のPRが4つ。レビューで見落としが少ないのは？', code: '', choices: ['200行のPRを4つ', '800行のPRを1つ', 'どちらも同じ', 'レビューしない'], answer: 0, why: '1回に読む量が少ないほど、見落としが減ります。' },
        { q: 'このコードの値は？', code: R`[3, 4, 5].reduce((a, b) => a + b, 0) > 10`, choices: ['true', 'false', '12', 'エラー'], answer: 0, why: '合計は12で、10より大きいので true です。' },
        { q: '本番に出した直後に不具合が出た。まずやることは？', code: '', choices: ['直前の正常なバージョンに戻す', '本番で直接コードを直す', '様子を見る', '全部作り直す'], answer: 0, why: 'まず影響を止めてから、落ち着いて原因を調べます。' },
      ],
      exercises: [
        { id: 'L2-07-p1', stage: 'parsons', prompt: 'デプロイの履歴（古い順）から、最後に正常だったバージョンを返す lastGood を組み立ててください。無ければ null。使わない行が1つあります。',
          lines: ['function lastGood(versions) {', '  for (let i = versions.length - 1; i >= 0; i--) {', '    if (versions[i].ok) return versions[i].id;', '  }', '  return null;', '}'],
          distractors: ['    if (!versions[i].ok) return versions[i].id;'],
          tests: R`test('最後の正常', () => { expect(lastGood([{ id: 'v1', ok: true }, { id: 'v2', ok: true }, { id: 'v3', ok: false }])).toBe('v2'); });
test('無ければ null', () => { expect(lastGood([{ id: 'v1', ok: false }])).toBeNull(); });`,
          hints: ['新しい方（配列の後ろ）から見ていきます。', '探しているのは「正常」なものです。', '    if (versions[i].ok) return versions[i].id;'] },
        { id: 'L2-07-p2', stage: 'parsons', prompt: 'ファイルを順番どおり、行数の合計が limit 以下になるようにPRに分ける batchFiles を組み立ててください。1ファイルで上限を超えるときは、それだけで1つのPRです。使わない行が1つあります。',
          lines: ['function batchFiles(files, limit) {', '  const batches = [[]];', '  let size = 0;', '  for (const f of files) {', '    if (size + f.lines > limit && batches[batches.length - 1].length) {', '      batches.push([]);', '      size = 0;', '    }', '    batches[batches.length - 1].push(f.path);', '    size += f.lines;', '  }', '  return batches;', '}'],
          distractors: ['    if (size + f.lines < limit) {'],
          tests: R`test('分ける', () => { expect(batchFiles([{ path: 'a', lines: 100 }, { path: 'b', lines: 150 }, { path: 'c', lines: 100 }], 250)).toEqual([['a', 'b'], ['c']]); });
test('大きい1ファイル', () => { expect(batchFiles([{ path: 'big', lines: 400 }, { path: 'a', lines: 10 }], 300)).toEqual([['big'], ['a']]); });`,
          hints: ['「足すと上限を超える」ときに、新しいPRを始めます。', 'ただし、今のPRが空なら新しく始めません（空のPRができてしまう）。', "    if (size + f.lines > limit && batches[batches.length - 1].length) {"] },
        { id: 'L2-07-b1', stage: 'blank', prompt: '空欄を埋めて、最後に正常だったバージョンを返してください。',
          template: R`function lastGood(versions) {
  const good = versions.filter((v) => v.[[1]]);
  return good.length ? good[good.length - 1].id : [[2]];
}`, answers: ['ok', 'null'],
          tests: R`test('最後の正常', () => { expect(lastGood([{ id: 'v1', ok: true }, { id: 'v2', ok: false }])).toBe('v1'); });
test('無ければ null', () => { expect(lastGood([])).toBeNull(); });`,
          hints: ['1つ目は「正常か」を表す項目です。', '2つ目は「無い」を表す値です。', 'ok と null です。'] },
        { id: 'L2-07-b2', stage: 'blank', prompt: '空欄を埋めて、合計の行数が上限を超えたら true を返してください。',
          template: R`function needsSplit(files, limit) {
  return files.reduce((sum, f) => sum + f.lines, 0) [[1]] limit;
}`, answers: ['>'],
          tests: R`test('ちょうどは分けない', () => { expect(needsSplit([{ lines: 200 }, { lines: 100 }], 300)).toBe(false); });
test('超えたら分ける', () => { expect(needsSplit([{ lines: 301 }], 300)).toBe(true); });`,
          hints: ['「超える」を表す比較です。', 'ちょうど上限なら false です。', '> です。'] },
        { id: 'L2-07-f1', stage: 'fix', prompt: '最後ではなく、最初の正常なバージョンを返してしまいます。直してください。',
          code: R`function lastGood(versions) {
  const v = versions.find((x) => x.ok);
  return v ? v.id : null;
}`,
          solution: R`function lastGood(versions) {
  const good = versions.filter((x) => x.ok);
  return good.length ? good[good.length - 1].id : null;
}`,
          tests: R`test('最後の正常', () => { expect(lastGood([{ id: 'v1', ok: true }, { id: 'v2', ok: true }, { id: 'v3', ok: false }])).toBe('v2'); });`,
          hints: ['find は前から最初の1件です。', '正常なものを全部集めて、最後を取りましょう。', 'filter で集めて good[good.length - 1] を返します。'] },
        { id: 'L2-07-f2', stage: 'fix', prompt: '最初のファイルが上限を超えていると、空のPRができてしまいます。直してください。',
          code: R`function batchFiles(files, limit) {
  const batches = [[]];
  let size = 0;
  for (const f of files) {
    if (size + f.lines > limit) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(f.path);
    size += f.lines;
  }
  return batches;
}`,
          solution: R`function batchFiles(files, limit) {
  const batches = [[]];
  let size = 0;
  for (const f of files) {
    if (size + f.lines > limit && batches[batches.length - 1].length) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(f.path);
    size += f.lines;
  }
  return batches;
}`,
          tests: R`test('大きい1ファイル', () => { expect(batchFiles([{ path: 'big', lines: 400 }, { path: 'a', lines: 10 }], 300)).toEqual([['big'], ['a']]); });`,
          hints: ['いまのPRが空のときに、新しいPRを始めてしまっています。', '条件に「いまのPRが空でない」を足します。', '&& batches[batches.length - 1].length を足します。'] },
        { id: 'L2-07-s1', stage: 'scratch', prompt: 'rollbackPlan(deploys) を書いてください。deploys は古い順の [{ version, ok }]。最後が正常（または空）なら { action: "none" }。最後が異常なら、最後に正常だったバージョンへ { action: "rollback", to, skip }（skip はその後の異常なバージョンの配列）。正常なバージョンが1つも無ければ { action: "stop", reason: "戻せる正常なバージョンがありません" }。',
          code: R`/** ロールバックの計画を立てる */
function rollbackPlan(deploys) {
  // ここに書く
}`,
          solution: R`function rollbackPlan(deploys) {
  if (!deploys.length || deploys[deploys.length - 1].ok) return { action: 'none' };
  let i = deploys.length - 1;
  while (i >= 0 && !deploys[i].ok) i--;
  if (i < 0) return { action: 'stop', reason: '戻せる正常なバージョンがありません' };
  return { action: 'rollback', to: deploys[i].version, skip: deploys.slice(i + 1).map((d) => d.version) };
}`,
          tests: R`test('正常なら何もしない', () => { expect(rollbackPlan([{ version: 'v1', ok: true }])).toEqual({ action: 'none' }); });
test('空なら何もしない', () => { expect(rollbackPlan([])).toEqual({ action: 'none' }); });
test('戻す', () => { expect(rollbackPlan([{ version: 'v40', ok: true }, { version: 'v41', ok: false }, { version: 'v42', ok: false }])).toEqual({ action: 'rollback', to: 'v40', skip: ['v41', 'v42'] }); });
test('戻せない', () => { expect(rollbackPlan([{ version: 'v1', ok: false }])).toEqual({ action: 'stop', reason: '戻せる正常なバージョンがありません' }); });`,
          hints: ['まず「何もしない」場合を先に返します。', '後ろから、正常なものが見つかるまでさかのぼります。', 'deploys.slice(i + 1) が飛ばすバージョンです。'] },
      ],
      gate: {
        what: { min: 2, points: [p('最後の正常なバージョンを探して戻す', ['正常', '最後', '戻', 'ロールバック']), p('戻せないときは止める', ['止', '戻せない', 'stop'])] },
        risk: { min: 1, points: [p('DBの変更は戻せないことがある', ['db', 'データベース', 'マイグレーション', 'スキーマ', 'データ']), p('ok の判定が遅れて分かる', ['判定', '監視', '遅れ', '気づ']), p('並び順が時系列でない', ['順', '時系列', '並び'])] },
      },
      aiTask: {
        file: 'src/release.js', testFile: 'tests/release.test.js',
        ticket: 'リリース作業を小さくするために、ファイルをPRに分ける planReleases(files, limit) と、戻し先を返す rollbackTarget(deploys) を src/release.js に実装してほしい。',
        signature: 'planReleases(files, limit) → string[][] / rollbackTarget(deploys) → version | null',
        specGroups: [p('1ファイルで上限を超えるときも空のPRを作らない', ['空のpr', '空の', '大きいファイル', '1ファイル', '上限を超えるファイル']), p('正常なバージョンが無いときは null', ['正常なバージョンが無', '無い場合', 'ない場合', 'null', '戻せない'])],
        good: R`/** ファイルを上限の行数以内の PR に分ける（順番は保つ。1ファイルで上限を超えるときはそれだけで1つ） */
function planReleases(files, limit) {
  const batches = [];
  let size = 0;
  for (const f of files) {
    if (!batches.length || (size + f.lines > limit && batches[batches.length - 1].length)) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(f.path);
    size += f.lines;
  }
  return batches;
}

/** 戻し先（最後に正常だったバージョン）。無ければ null */
function rollbackTarget(deploys) {
  for (let i = deploys.length - 1; i >= 0; i--) if (deploys[i].ok) return deploys[i].version;
  return null;
}
`,
        buggy: R`/** ファイルを PR に分ける */
function planReleases(files, limit) {
  const batches = [[]];
  let size = 0;
  for (const f of files) {
    if (size + f.lines > limit) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push(f.path);
    size += f.lines;
  }
  return batches;
}

/** 戻し先 */
function rollbackTarget(deploys) {
  const good = deploys.filter((d) => d.ok);
  return good[good.length - 1].version;
}
`,
        buggyNote: '大きいファイルと、正常なバージョンが無いときの扱いが仕様に無かったので、いつも上限内のファイルが来て、正常なバージョンが必ずあるものとしています。',
        tests: R`test('分ける', () => { expect(planReleases([{ path: 'a', lines: 100 }, { path: 'b', lines: 150 }, { path: 'c', lines: 100 }], 250)).toEqual([['a', 'b'], ['c']]); });
test('大きい1ファイルでも空のPRを作らない', () => { expect(planReleases([{ path: 'big', lines: 400 }, { path: 'a', lines: 10 }], 300)).toEqual([['big'], ['a']]); });
test('ファイルが無ければPRも無い', () => { expect(planReleases([], 300)).toEqual([]); });
test('戻し先', () => { expect(rollbackTarget([{ version: 'v40', ok: true }, { version: 'v41', ok: false }])).toBe('v40'); });
test('戻せないときは null', () => { expect(rollbackTarget([{ version: 'v1', ok: false }])).toBeNull(); });
`,
        review: { min: 1, points: [p('空のPRができる', ['空', '大きい']), p('正常なバージョンが無いとエラー', ['無い', 'null', 'undefined', 'エラー'])] },
      },
      demos: [{ label: 'PRの分割', expr: "planReleases([{ path: 'src/a.js', lines: 180 }, { path: 'src/b.js', lines: 150 }, { path: 'tests/a.test.js', lines: 60 }], 300).map((b) => b.length + 'ファイル').join(' + ') + ' のPRに分割（戻し先: ' + rollbackTarget([{ version: 'v40', ok: true }, { version: 'v41', ok: false }]) + '）'" }],
      tutorTips: [{ keys: ['ロールバック', '戻'], tip: '戻したいバージョンは、どんな条件を満たしている必要がありますか？ それが1つも無いときはどうしますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-08', area: 'G', level: 2, prereq: ['L1-08', 'L2-01'], estMinutes: 40,
      title: '障害の原因を特定する',
      story: '運用担当の高橋さんより：「10時すぎから振込のエラーが増えてる。分ごとのエラー率を出して、いつから増えたか、その直前に何がデプロイされたかを特定しよう。」',
      goals: ['分ごとのエラー率で、障害の始まりを特定できる', '始まりとデプロイの時刻を突き合わせて、疑わしい変更を絞り込める'],
      evidence: 'スキルマップ G-L2（障害の原因を特定できる）／DORA（復旧時間）',
      concept: [
        '「エラーが多い」ではなく「何分から、エラー率が何%になったか」で捉えます。エラー率 = エラー件数 ÷ 全件数。',
        { code: R`'2026-04-01T10:05:30Z'.slice(0, 16); // → '2026-04-01T10:05'（分の単位）` },
        'エラー率が急に上がった分と、その分までの最後のデプロイを突き合わせると、疑わしい変更が分かります。ただし、時刻が近いことは原因の証拠ではありません（相関と因果は別）。',
        '件数がとても少ない分は、1件のエラーで率が大きくぶれるので、判断から外します。',
      ],
      predict: [
        { q: 'エラーが 10:05 から急増。10:04 にデプロイがあった。まず疑うのは？', code: '', choices: ['10:04 のデプロイ', 'ネットワークの機器', '利用者の操作', '何も疑わない'], answer: 0, why: '直前の変更が最も疑わしい候補です（確かめるまでは仮説）。' },
        { q: 'このコードの値は？', code: R`'2026-04-01T10:05:30Z'.slice(0, 16)`, choices: ["'2026-04-01T10:05'", "'2026-04-01T10'", "'10:05:30'", "'2026-04-01'"], answer: 0, why: '先頭から16文字で、分までが取れます。' },
        { q: 'ある1分に、リクエストが1件だけあり、それがエラーだった。この分のエラー率をどう扱う？', code: '', choices: ['件数が少ないので判断から外す', '100%なので大障害とする', '0%とする', '平均に入れる'], answer: 0, why: '母数が少ない率は、1件でぶれるからです。' },
      ],
      exercises: [
        { id: 'L2-08-p1', stage: 'parsons', prompt: 'イベントの配列から、エラー率（status が500以上の割合）を返す errorRate を組み立ててください。空なら0。使わない行が1つあります。',
          lines: ['function errorRate(events) {', '  if (!events.length) return 0;', '  const errors = events.filter((e) => e.status >= 500).length;', '  return errors / events.length;', '}'],
          distractors: ['  return errors;'],
          tests: R`test('エラー率', () => { expect(errorRate([{ status: 200 }, { status: 500 }, { status: 503 }, { status: 200 }])).toBe(0.5); });
test('空なら0', () => { expect(errorRate([])).toBe(0); });`,
          hints: ['件数ではなく割合を返します。', 'エラー件数を全件数で割ります。', '  return errors / events.length;'] },
        { id: 'L2-08-p2', stage: 'parsons', prompt: 'イベントを分ごとに数える byMinute を組み立ててください。使わない行が1つあります。',
          lines: ['function byMinute(events) {', '  const out = {};', '  for (const e of events) {', '    const m = e.time.slice(0, 16);', '    out[m] = (out[m] || 0) + 1;', '  }', '  return out;', '}'],
          distractors: ['    out[m] = 1;'],
          tests: R`test('分ごと', () => { expect(byMinute([{ time: '2026-04-01T10:05:01Z' }, { time: '2026-04-01T10:05:59Z' }, { time: '2026-04-01T10:06:00Z' }])).toEqual({ '2026-04-01T10:05': 2, '2026-04-01T10:06': 1 }); });`,
          hints: ['同じ分が来たら数を足します。', '= 1 だと、いつも1に戻ってしまいます。', '    out[m] = (out[m] || 0) + 1;'] },
        { id: 'L2-08-b1', stage: 'blank', prompt: '空欄を埋めて、エラー率を返してください。',
          template: R`function errorRate(events) {
  if (!events.length) return [[1]];
  return events.filter((e) => e.status [[2]] 500).length / events.length;
}`, answers: ['0', '>='],
          tests: R`test('エラー率', () => { expect(errorRate([{ status: 500 }, { status: 200 }])).toBe(0.5); });
test('空', () => { expect(errorRate([])).toBe(0); });`,
          hints: ['1つ目は空のときの値です。', '2つ目は「500以上」を表す比較です。', '0 と >= です。'] },
        { id: 'L2-08-b2', stage: 'blank', prompt: '空欄を埋めて、最初にエラーが出た時刻を返してください（無ければ null）。',
          template: R`function firstErrorTime(events) {
  const e = events.[[1]]((x) => x.status >= 500);
  return e ? e.time : null;
}`, answers: ['find'],
          tests: R`test('最初のエラー', () => { expect(firstErrorTime([{ time: 't1', status: 200 }, { time: 't2', status: 500 }, { time: 't3', status: 500 }])).toBe('t2'); });
test('無ければ null', () => { expect(firstErrorTime([{ time: 't1', status: 200 }])).toBeNull(); });`,
          hints: ['条件に合う最初の1件を返す配列のメソッドです。', '4文字です。', 'find です。'] },
        { id: 'L2-08-f1', stage: 'fix', prompt: '利用者の入力ミス（4xx）までエラーとして数えています。サーバー側のエラー（5xx）だけを数えてください。',
          code: R`function errorRate(events) {
  if (!events.length) return 0;
  return events.filter((e) => e.status >= 400).length / events.length;
}`,
          solution: R`function errorRate(events) {
  if (!events.length) return 0;
  return events.filter((e) => e.status >= 500).length / events.length;
}`,
          tests: R`test('4xx は数えない', () => { expect(errorRate([{ status: 404 }, { status: 500 }, { status: 200 }, { status: 400 }])).toBe(0.25); });`,
          hints: ['404 や 400 は、利用者の入力ミスなどで起きます。', 'サーバー側のエラーは 500 番台です。', '>= 400 を >= 500 にします。'] },
        { id: 'L2-08-f2', stage: 'fix', prompt: '分ごとのはずが、時間（時）ごとにまとめてしまっています。直してください。',
          code: R`function byMinute(events) {
  const out = {};
  for (const e of events) {
    const m = e.time.slice(0, 13);
    out[m] = (out[m] || 0) + 1;
  }
  return out;
}`,
          solution: R`function byMinute(events) {
  const out = {};
  for (const e of events) {
    const m = e.time.slice(0, 16);
    out[m] = (out[m] || 0) + 1;
  }
  return out;
}`,
          tests: R`test('分ごと', () => { expect(byMinute([{ time: '2026-04-01T10:05:01Z' }, { time: '2026-04-01T10:06:00Z' }])).toEqual({ '2026-04-01T10:05': 1, '2026-04-01T10:06': 1 }); });`,
          hints: ["'2026-04-01T10' は何文字ですか？", '分まで含めるには16文字です。', 'slice(0, 13) を slice(0, 16) にします。'] },
        { id: 'L2-08-s1', stage: 'scratch', prompt: 'suspectDeploy(events, deploys, threshold) を書いてください。分ごとのエラー率（5xx の割合）を出し、threshold 以上になった最初の分を minute に、その分まで（同じ分を含む）の最後のデプロイの version を deploy に入れて返します（デプロイが無ければ null）。threshold を超える分が無ければ null を返します。deploys は古い順です。',
          code: R`/** 障害の始まりの分と、疑わしいデプロイ */
function suspectDeploy(events, deploys, threshold) {
  // ここに書く
}`,
          solution: R`function suspectDeploy(events, deploys, threshold) {
  const stats = {};
  for (const e of events) {
    const m = e.time.slice(0, 16);
    stats[m] = stats[m] || { total: 0, errors: 0 };
    stats[m].total += 1;
    if (e.status >= 500) stats[m].errors += 1;
  }
  const minute = Object.keys(stats).sort().find((m) => stats[m].errors / stats[m].total >= threshold);
  if (!minute) return null;
  const before = deploys.filter((d) => d.time.slice(0, 16) <= minute);
  return { minute, deploy: before.length ? before[before.length - 1].version : null };
}`,
          tests: R`const EV = [
  { time: '2026-04-01T10:04:10Z', status: 200 }, { time: '2026-04-01T10:04:20Z', status: 200 },
  { time: '2026-04-01T10:05:10Z', status: 500 }, { time: '2026-04-01T10:05:20Z', status: 200 }, { time: '2026-04-01T10:05:30Z', status: 503 },
];
const DEP = [{ version: 'v41', time: '2026-04-01T09:00:00Z' }, { version: 'v42', time: '2026-04-01T10:05:00Z' }, { version: 'v43', time: '2026-04-01T11:00:00Z' }];
test('始まりと疑わしいデプロイ', () => { expect(suspectDeploy(EV, DEP, 0.5)).toEqual({ minute: '2026-04-01T10:05', deploy: 'v42' }); });
test('しきい値を超えなければ null', () => { expect(suspectDeploy(EV, DEP, 0.9)).toBeNull(); });
test('デプロイが無い', () => { expect(suspectDeploy(EV, [], 0.5)).toEqual({ minute: '2026-04-01T10:05', deploy: null }); });`,
          hints: ['まず分ごとに { total, errors } を数えます。', '分のキーを sort してから、しきい値以上の最初の分を find します。', "deploys.filter((d) => d.time.slice(0, 16) <= minute) の最後が疑わしいデプロイです。"] },
      ],
      gate: {
        what: { min: 2, points: [p('分ごとのエラー率を出す', ['分', 'エラー率', '集計', '割合']), p('始まりの直前のデプロイを疑う', ['デプロイ', '直前', 'リリース', '疑'])] },
        risk: { min: 1, points: [p('時刻が近いだけで原因とは限らない（相関と因果）', ['相関', '因果', '偶然', '別の原因', '限らない']), p('件数が少ない分は率がぶれる', ['件数が少', 'ぶれ', '母数', '少ない']), p('時刻のずれ・タイムゾーン', ['時刻', 'タイムゾーン', 'ずれ', '時計'])] },
      },
      aiTask: {
        file: 'src/incident.js', testFile: 'tests/incident.test.js',
        ticket: '障害の一次調査を自動化するために、分ごとの集計 minuteStats(events) と、incidentReport(events, deploys, threshold) を src/incident.js に実装してほしい。{ start, peakRate, suspect } か、障害が無ければ null を返す。',
        signature: 'minuteStats(events) / incidentReport(events, deploys, threshold) → { start, peakRate, suspect } | null',
        specGroups: [p('件数が少ない分（5件未満）は判断に使わない', ['5件未満', '件数が少', '母数', '少ない分']), p('デプロイと同じ分も含めて疑う', ['同じ分', 'ちょうど', '以前', '含む', '含め'])],
        good: R`/** 分ごとの件数とエラー件数（5xx） */
function minuteStats(events) {
  const stats = {};
  for (const e of events) {
    const m = e.time.slice(0, 16);
    stats[m] = stats[m] || { total: 0, errors: 0 };
    stats[m].total += 1;
    if (e.status >= 500) stats[m].errors += 1;
  }
  return stats;
}

/** エラー率が threshold 以上になった最初の分と、その分まで（同じ分を含む）の最後のデプロイ。5件未満の分は使わない */
function incidentReport(events, deploys, threshold) {
  const stats = minuteStats(events);
  const minutes = Object.keys(stats).sort().filter((m) => stats[m].total >= 5);
  const start = minutes.find((m) => stats[m].errors / stats[m].total >= threshold);
  if (!start) return null;
  const peakRate = Math.max(...minutes.map((m) => stats[m].errors / stats[m].total));
  const before = deploys.filter((d) => d.time.slice(0, 16) <= start);
  return { start, peakRate, suspect: before.length ? before[before.length - 1].version : null };
}
`,
        buggy: R`/** 分ごとの件数とエラー件数 */
function minuteStats(events) {
  const stats = {};
  for (const e of events) {
    const m = e.time.slice(0, 16);
    stats[m] = stats[m] || { total: 0, errors: 0 };
    stats[m].total += 1;
    if (e.status >= 500) stats[m].errors += 1;
  }
  return stats;
}

/** 障害の始まりと疑わしいデプロイ */
function incidentReport(events, deploys, threshold) {
  const stats = minuteStats(events);
  const minutes = Object.keys(stats).sort();
  const start = minutes.find((m) => stats[m].errors / stats[m].total >= threshold);
  if (!start) return null;
  const peakRate = Math.max(...minutes.map((m) => stats[m].errors / stats[m].total));
  const before = deploys.filter((d) => d.time.slice(0, 16) < start);
  return { start, peakRate, suspect: before.length ? before[before.length - 1].version : null };
}
`,
        buggyNote: '件数の少ない分と、デプロイと同じ分の扱いが仕様に無かったので、すべての分を使い、デプロイは始まりより前の分だけを見ています。',
        tests: R`const ev = (minute, n, errs) => Array.from({ length: n }, (_, i) => ({ time: '2026-04-01T' + minute + ':' + String(i).padStart(2, '0') + 'Z', status: i < errs ? 500 : 200 }));
const EVENTS = [...ev('10:00', 1, 1), ...ev('10:04', 10, 0), ...ev('10:05', 10, 6)];
const DEPLOYS = [{ version: 'v41', time: '2026-04-01T10:00:10Z' }, { version: 'v42', time: '2026-04-01T10:05:00Z' }];
test('件数の少ない分は使わず、同じ分のデプロイを疑う', () => { expect(incidentReport(EVENTS, DEPLOYS, 0.5)).toEqual({ start: '2026-04-01T10:05', peakRate: 0.6, suspect: 'v42' }); });
test('障害が無ければ null', () => { expect(incidentReport(ev('10:04', 10, 1), DEPLOYS, 0.5)).toBeNull(); });
test('分ごとの集計', () => { expect(minuteStats(ev('10:05', 3, 1))).toEqual({ '2026-04-01T10:05': { total: 3, errors: 1 } }); });
`,
        review: { min: 1, points: [p('件数1件の分でも障害と判定する', ['件数', '少ない', '1件', '母数']), p('同じ分のデプロイを見逃す（< と <=）', ['同じ分', '<=', 'ちょうど'])] },
      },
      demos: [{ label: '障害の一次調査', expr: "(() => { const ev = []; for (let i = 0; i < 10; i++) ev.push({ time: '2026-04-01T10:05:' + String(i).padStart(2, '0') + 'Z', status: i < 6 ? 500 : 200 }); const r = incidentReport(ev, [{ version: 'v42', time: '2026-04-01T10:05:00Z' }], 0.5); return r.start + ' からエラー率 ' + Math.round(r.peakRate * 100) + '%、疑わしいのは ' + r.suspect; })()" }],
      tutorTips: [{ keys: ['エラー率', '割合'], tip: 'その分は全部で何件ありましたか？ 件数が少ないと、率はどうなりやすいですか？' }],
    },
    // =====================================================================
    {
      id: 'L2-09', area: 'H', level: 2, prereq: ['L1-10', 'L2-04'], estMinutes: 35,
      title: 'タスクを分解し、AIの差分を検証する',
      story: '先輩の佐藤さんより：「AIに“手数料を直して”と頼んだら、関係ないファイルまで書き換えて、テストも消してた。タスクを小さく分けて、差分がタスクの範囲に収まっているかを毎回確かめよう。」',
      goals: ['タスクを、完了を確かめられる小さな単位に分けられる', 'AIの差分が、タスクの範囲に収まっているかを検証できる'],
      evidence: 'スキルマップ H-L2（タスクを分解し、差分を検証できる）／Spec Kit の tasks',
      concept: [
        'AIに頼むタスクは「どのファイルを・何のために・どうなったら完了か」が決まる大きさに分けます。',
        'AIの差分を見たら、まず「頼んでいないファイルが変わっていないか」「テストが足されているか」「テストが消されたり弱められたりしていないか」を確かめます。',
        { code: R`タスク: src/fee.js の境界値を直す（テスト: tests/fee.test.js）
差分:   src/fee.js +8 −2 / src/bank.js +1 −1 / tests/fee.test.js +0 −3
→ src/bank.js は範囲外。テストは減っている（弱められた？）` },
        'テストを消して「全部通った」にするのは、AIがやりがちな近道です。テストの削除が追加より多い差分は、特に注意して読みます。',
      ],
      predict: [
        { q: '「手数料の計算を直して」と頼んだ。AIの差分に README の変更も入っていた。どうする？', code: '', choices: ['範囲外なので理由を確かめ、必要なければ外す', 'ついでなのでそのまま取り込む', '全部捨てる', '気にしない'], answer: 0, why: '範囲外の変更はレビューの対象を増やし、思わぬ不具合を持ち込みます。' },
        { q: 'このコードの値は？', code: R`[].every((t) => t.done)`, choices: ['true', 'false', 'undefined', 'エラー'], answer: 0, why: '空の配列の every は true です。「タスクが無い＝完了」とみなさないよう注意が要ります。' },
        { q: 'AIの差分で、テストファイルが「+0 −3」だった。考えられることは？', code: '', choices: ['テストを消して通るようにしたかもしれない', 'テストが増えた', '何も変わっていない', 'テストが速くなった'], answer: 0, why: 'テストの削除は、検証を弱めている可能性があります。' },
      ],
      exercises: [
        { id: 'L2-09-p1', stage: 'parsons', prompt: '変更されたファイルのうち、許可されていないものを返す outOfScope を組み立ててください。使わない行が1つあります。',
          lines: ['function outOfScope(changed, allowed) {', '  return changed.filter((f) => !allowed.includes(f));', '}'],
          distractors: ['  return changed.filter((f) => allowed.includes(f));'],
          tests: R`test('範囲外', () => { expect(outOfScope(['src/fee.js', 'src/bank.js'], ['src/fee.js', 'tests/fee.test.js'])).toEqual(['src/bank.js']); });`,
          hints: ['返したいのは「許可されていない」ものです。', '! の付いている方です。', '  return changed.filter((f) => !allowed.includes(f));'] },
        { id: 'L2-09-p2', stage: 'parsons', prompt: '変更後の文章で、変更前に無かった行を返す addedLines を組み立ててください。使わない行が1つあります。',
          lines: ['function addedLines(before, after) {', R`  const old = new Set(before.split('\n'));`, R`  return after.split('\n').filter((l) => !old.has(l));`, '}'],
          distractors: [R`  const old = before.split('\n');`],
          tests: R`test('足された行', () => { expect(addedLines('a\nb', 'a\nb\nc\nd')).toEqual(['c', 'd']); });
test('同じなら空', () => { expect(addedLines('a', 'a')).toEqual([]); });`,
          hints: ['has を使うには Set が必要です。', '配列には has がありません。', R`  const old = new Set(before.split('\n')); を使います。`] },
        { id: 'L2-09-b1', stage: 'blank', prompt: '空欄を埋めて、すべてのタスクが完了しているかを返してください。',
          template: R`function tasksDone(tasks) {
  return tasks.[[1]]((t) => t.done);
}`, answers: ['every'],
          tests: R`test('全部完了', () => { expect(tasksDone([{ done: true }, { done: true }])).toBe(true); });
test('1つ未完了', () => { expect(tasksDone([{ done: true }, { done: false }])).toBe(false); });`,
          hints: ['全部が条件を満たすかを確かめる配列のメソッドです。', '「すべての」という意味の英単語です。', 'every です。'] },
        { id: 'L2-09-b2', stage: 'blank', prompt: '空欄を埋めて、次にやるタスク（最初の未完了のもの）を返してください。',
          template: R`function nextTask(tasks) {
  return tasks.find((t) => ![[1]]) || null;
}`, answers: ['t.done'],
          tests: R`test('次のタスク', () => { expect(nextTask([{ id: 1, done: true }, { id: 2, done: false }]).id).toBe(2); });
test('全部完了なら null', () => { expect(nextTask([{ id: 1, done: true }])).toBeNull(); });`,
          hints: ['「完了していない」を表す条件です。', 't の完了フラグです。', 't.done です。'] },
        { id: 'L2-09-f1', stage: 'fix', prompt: '範囲外のファイルではなく、変更されなかった許可ファイルを返してしまっています。直してください。',
          code: R`function outOfScope(changed, allowed) {
  return allowed.filter((f) => !changed.includes(f));
}`,
          solution: R`function outOfScope(changed, allowed) {
  return changed.filter((f) => !allowed.includes(f));
}`,
          tests: R`test('範囲外', () => { expect(outOfScope(['src/fee.js', 'README.md'], ['src/fee.js', 'tests/fee.test.js'])).toEqual(['README.md']); });`,
          hints: ['どちらの配列を絞り込むべきでしょう？', '調べたいのは「変更されたファイル」の方です。', 'changed と allowed を入れ替えます。'] },
        { id: 'L2-09-f2', stage: 'fix', prompt: 'タスクが1つも無いのに「完了」になってしまいます。タスクが無いときは false にしてください。',
          code: R`function tasksDone(tasks) {
  return tasks.every((t) => t.done);
}`,
          solution: R`function tasksDone(tasks) {
  return tasks.length > 0 && tasks.every((t) => t.done);
}`,
          tests: R`test('タスクが無いのは完了ではない', () => { expect(tasksDone([])).toBe(false); });
test('全部完了', () => { expect(tasksDone([{ done: true }])).toBe(true); });`,
          hints: ['[].every(...) は true になります。', '件数が1つ以上あることも確かめます。', 'tasks.length > 0 && を足します。'] },
        { id: 'L2-09-s1', stage: 'scratch', prompt: 'reviewDiff(task, diff) を書いてください。task は { files, testFile }、diff は [{ path, added, removed }]。outOfScope は task.files にも testFile にも無いパスの配列、untested は testFile の変更が無ければ true。ok は範囲外が無く untested でもないときに true。{ ok, outOfScope, untested } を返します。',
          code: R`/** AI の差分がタスクの範囲に収まっているかを確かめる */
function reviewDiff(task, diff) {
  // ここに書く
}`,
          solution: R`function reviewDiff(task, diff) {
  const paths = diff.map((d) => d.path);
  const outOfScope = paths.filter((p) => !task.files.includes(p) && p !== task.testFile);
  const untested = !paths.includes(task.testFile);
  return { ok: outOfScope.length === 0 && !untested, outOfScope, untested };
}`,
          tests: R`const TASK = { files: ['src/fee.js'], testFile: 'tests/fee.test.js' };
test('範囲内でテストもある', () => { expect(reviewDiff(TASK, [{ path: 'src/fee.js', added: 3, removed: 1 }, { path: 'tests/fee.test.js', added: 2, removed: 0 }])).toEqual({ ok: true, outOfScope: [], untested: false }); });
test('範囲外', () => { expect(reviewDiff(TASK, [{ path: 'src/fee.js', added: 1, removed: 0 }, { path: 'src/bank.js', added: 1, removed: 1 }, { path: 'tests/fee.test.js', added: 1, removed: 0 }])).toEqual({ ok: false, outOfScope: ['src/bank.js'], untested: false }); });
test('テストが無い', () => { expect(reviewDiff(TASK, [{ path: 'src/fee.js', added: 1, removed: 0 }])).toEqual({ ok: false, outOfScope: [], untested: true }); });`,
          hints: ['まず diff からパスの配列を作ります。', '範囲外は「task.files に無く、testFile でもない」パスです。', 'untested は !paths.includes(task.testFile) です。'] },
      ],
      gate: {
        what: { min: 2, points: [p('タスクの範囲外の変更を見つける', ['範囲外', '関係ない', 'スコープ', '頼んでいない']), p('テストの変更が無いことを見つける', ['テスト', 'untested', '無い'])] },
        risk: { min: 1, points: [p('範囲内でも中身が正しいとは限らない', ['中身', '正しいとは限', '内容']), p('テストを弱めて通しているかもしれない', ['テストを変え', '弱め', '期待値を変', '消し']), p('ファイル名だけで判断している', ['ファイル名', '名前だけ', 'パス'])] },
      },
      aiTask: {
        file: 'src/review.js', testFile: 'tests/review.test.js',
        ticket: 'AI の差分を取り込む前のチェックとして、scopeCheck(task, diff) を src/review.js に実装してほしい。{ ok, outOfScope, untested, testsWeakened } を返す。',
        signature: 'scopeCheck(task, diff) → { ok, outOfScope, untested, testsWeakened }',
        specGroups: [p('テストの削除が追加より多ければ弱体化として警告', ['弱め', '弱体化', '削除が多', '減っ', 'テストの削除']), p('テストの変更が無ければ警告', ['テストの変更が無', 'テストが無', 'untested', 'テストを足さない', 'テストを足していない'])],
        good: R`/** AI の差分がタスクの範囲に収まっているか。範囲外のファイル・テストの不足・テストの弱体化を見る */
function scopeCheck(task, diff) {
  const paths = diff.map((d) => d.path);
  const outOfScope = paths.filter((p) => !task.files.includes(p) && p !== task.testFile);
  const testDiff = diff.find((d) => d.path === task.testFile);
  const untested = !testDiff;
  const testsWeakened = !!testDiff && testDiff.removed > testDiff.added;
  return { ok: !outOfScope.length && !untested && !testsWeakened, outOfScope, untested, testsWeakened };
}
`,
        buggy: R`/** AI の差分がタスクの範囲に収まっているか */
function scopeCheck(task, diff) {
  const outOfScope = diff.map((d) => d.path).filter((p) => !task.files.includes(p) && p !== task.testFile);
  return { ok: !outOfScope.length, outOfScope, untested: false, testsWeakened: false };
}
`,
        buggyNote: 'テストの扱いが仕様に無かったので、範囲外のファイルだけを確かめています。',
        tests: R`const TASK = { files: ['src/fee.js'], testFile: 'tests/fee.test.js' };
test('問題なし', () => { expect(scopeCheck(TASK, [{ path: 'src/fee.js', added: 5, removed: 2 }, { path: 'tests/fee.test.js', added: 3, removed: 0 }]).ok).toBe(true); });
test('範囲外', () => { expect(scopeCheck(TASK, [{ path: 'src/bank.js', added: 1, removed: 1 }, { path: 'tests/fee.test.js', added: 1, removed: 0 }]).outOfScope).toEqual(['src/bank.js']); });
test('テストが無い', () => { expect(scopeCheck(TASK, [{ path: 'src/fee.js', added: 5, removed: 2 }])).toEqual({ ok: false, outOfScope: [], untested: true, testsWeakened: false }); });
test('テストの弱体化', () => { expect(scopeCheck(TASK, [{ path: 'src/fee.js', added: 1, removed: 0 }, { path: 'tests/fee.test.js', added: 0, removed: 3 }])).toEqual({ ok: false, outOfScope: [], untested: false, testsWeakened: true }); });
`,
        review: { min: 1, points: [p('テストが無くても OK になる', ['テスト', 'untested']), p('テストを消しても OK になる', ['消', '弱め', '削除'])] },
      },
      demos: [{ label: 'AIの差分チェック', expr: "(() => { const r = scopeCheck({ files: ['src/fee.js'], testFile: 'tests/fee.test.js' }, [{ path: 'src/fee.js', added: 8, removed: 2 }, { path: 'src/bank.js', added: 1, removed: 1 }, { path: 'tests/fee.test.js', added: 0, removed: 3 }]); return '範囲外: ' + r.outOfScope.join(', ') + ' / テストの弱体化: ' + (r.testsWeakened ? 'あり' : 'なし'); })()" }],
      tutorTips: [{ keys: ['範囲', 'スコープ', '差分'], tip: 'そのタスクで変わってよいファイルはどれですか？ 差分の中に、それ以外はありますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-10', area: 'I', level: 2, prereq: ['L2-02'], estMinutes: 40,
      title: 'LLMの出力を構造化して受け取る',
      story: '企画の田中さんより：「チャットで“5000円振り込んで”と言ったら振込画面を開く、FAQボットの試作をしたいの。LLM の返事は JSON で受け取るけど、壊れていたり、余計な文章が付いていたりするから、検証してから使ってね。」',
      goals: ['LLM の出力をそのまま信用せず、検証してから使う理由を説明できる', 'JSON を取り出し、許可された値か確かめるコードを書ける'],
      evidence: 'スキルマップ I-L2（API・ツール呼び出し・構造化出力）／OWASP LLM Top 10（出力の扱い）',
      concept: [
        'LLM の出力は「文字列」です。JSON で答えるよう頼んでも、前後に文章が付いたり、形が崩れたり、想定外の値が入ったりします。',
        { code: R`'承知しました。{"intent":"transfer","amount":5000}'
// → 最初の { から最後の } までを取り出して JSON.parse する
// → intent が許可された値か、amount が正しい範囲かを確かめる` },
        '検証に通らなければ「unknown（分からない）」として扱い、勝手に処理を進めません。振込のような取り消しにくい操作は、検証に通っても必ず人の確認を挟みます。',
        '利用者の入力に「前の指示を無視して…」と書かれていると、LLM の出力が書き換えられることがあります（プロンプトインジェクション）。だからこそ、出力側で検証します。',
      ],
      predict: [
        { q: 'このコードの値は？', code: R`JSON.parse('{"a":1}').a`, choices: ['1', "'1'", 'undefined', 'エラー'], answer: 0, why: 'JSON の数値は数値として読まれます。' },
        { q: 'このコードを実行すると？', code: R`JSON.parse('こんにちは')`, choices: ['エラーになる', "'こんにちは' が返る", 'null が返る', '{} が返る'], answer: 0, why: 'JSON として読めない文字列は SyntaxError になります。' },
        { q: 'LLM が {"intent":"transfer","amount":5000} を返した。すぐに振込を実行してよい？', code: '', choices: ['検証したうえで、人の確認を挟んでから', 'すぐに実行してよい', '金額だけ確かめれば実行してよい', 'LLM が言うなら正しい'], answer: 0, why: '取り消しにくい操作は、検証と人の確認の両方が必要です。' },
      ],
      exercises: [
        { id: 'L2-10-p1', stage: 'parsons', prompt: 'JSON として読めなければ null を返す safeParse を組み立ててください。使わない行が1つあります。',
          lines: ['function safeParse(text) {', '  try {', '    return JSON.parse(text);', '  } catch (e) {', '    return null;', '  }', '}'],
          distractors: ['  return eval(text);'],
          tests: R`test('読める', () => { expect(safeParse('{"a":1}')).toEqual({ a: 1 }); });
test('読めなければ null', () => { expect(safeParse('こんにちは')).toBeNull(); });`,
          hints: ['エラーになるかもしれない処理は try で囲みます。', 'eval は任意のコードを動かしてしまうので使いません。', 'catch の中で null を返します。'] },
        { id: 'L2-10-p2', stage: 'parsons', prompt: '文章の中から、最初の { から最後の } までを取り出す extractJson を組み立ててください。無ければ null。使わない行が1つあります。',
          lines: ['function extractJson(text) {', "  const start = text.indexOf('{');", "  const end = text.lastIndexOf('}');", '  if (start < 0 || end < start) return null;', '  return text.slice(start, end + 1);', '}'],
          distractors: ['  return text.slice(start, end);'],
          tests: R`test('取り出す', () => { expect(extractJson('了解です。{"intent":"faq"} 以上です')).toBe('{"intent":"faq"}'); });
test('無ければ null', () => { expect(extractJson('JSON はありません')).toBeNull(); });`,
          hints: ['slice の2つ目の引数は「その手前まで」です。', '} も含めるには +1 が要ります。', '  return text.slice(start, end + 1);'] },
        { id: 'L2-10-b1', stage: 'blank', prompt: '空欄を埋めて、許可された意図（balance・transfer・faq）かどうかを返してください。',
          template: R`function isIntent(x) {
  return ['balance', 'transfer', 'faq'].[[1]](x);
}`, answers: ['includes'],
          tests: R`test('許可された意図', () => { expect(isIntent('transfer')).toBe(true); });
test('許可されていない意図', () => { expect(isIntent('delete_all')).toBe(false); });`,
          hints: ['配列にその値が入っているかを返すメソッドです。', '「含む」という意味です。', 'includes です。'] },
        { id: 'L2-10-b2', stage: 'blank', prompt: '空欄を埋めて、金額が正の整数ならその値を、そうでなければ null を返してください。',
          template: R`function amountOf(obj) {
  return Number.isInteger(obj.amount) && obj.amount > 0 ? obj.amount : [[1]];
}`, answers: ['null'],
          tests: R`test('正しい金額', () => { expect(amountOf({ amount: 5000 })).toBe(5000); });
test('文字列は null', () => { expect(amountOf({ amount: '5000' })).toBeNull(); });
test('無ければ null', () => { expect(amountOf({})).toBeNull(); });`,
          hints: ['「無い」を表す値を返します。', '4文字です。', 'null です。'] },
        { id: 'L2-10-f1', stage: 'fix', prompt: '入れ子の JSON（{"a":{"b":1}}）だと、途中で切れてしまいます。直してください。',
          code: R`function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.indexOf('}');
  if (start < 0 || end < start) return null;
  return text.slice(start, end + 1);
}`,
          solution: R`function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  return text.slice(start, end + 1);
}`,
          tests: R`test('入れ子', () => { expect(extractJson('結果: {"a":{"b":1}}')).toBe('{"a":{"b":1}}'); });`,
          hints: ['最初の } は、内側の閉じかっこです。', '最後の } を探します。', 'indexOf を lastIndexOf にします。'] },
        { id: 'L2-10-f2', stage: 'fix', prompt: 'LLM の出力をそのまま信用しています。意図が許可されたものでなければ "unknown"、金額が正の整数でなければ null にしてください。',
          code: R`function parseIntent(obj) {
  return { intent: obj.intent, amount: obj.amount };
}`,
          solution: R`function parseIntent(obj) {
  const intent = ['balance', 'transfer', 'faq'].includes(obj.intent) ? obj.intent : 'unknown';
  const amount = Number.isInteger(obj.amount) && obj.amount > 0 ? obj.amount : null;
  return { intent, amount };
}`,
          tests: R`test('正しい出力', () => { expect(parseIntent({ intent: 'transfer', amount: 5000 })).toEqual({ intent: 'transfer', amount: 5000 }); });
test('許可されていない意図', () => { expect(parseIntent({ intent: 'delete_all' })).toEqual({ intent: 'unknown', amount: null }); });
test('文字列の金額', () => { expect(parseIntent({ intent: 'transfer', amount: '5000' }).amount).toBeNull(); });`,
          hints: ['意図と金額を、それぞれ検証してから返します。', '意図は許可リストに入っているか、金額は Number.isInteger で確かめます。', "const intent = ['balance', 'transfer', 'faq'].includes(obj.intent) ? obj.intent : 'unknown';"] },
        { id: 'L2-10-s1', stage: 'scratch', prompt: 'readIntent(text) を書いてください。text（LLM の出力）から最初の { 〜最後の } を取り出して JSON として読み、intent が balance・transfer・faq のどれかで、amount が1〜1,000,000の整数ならその値（それ以外は null）とします。transfer なのに amount が null のとき、または読めない・許可されない意図のときは { intent: "unknown", amount: null } を返します。',
          code: R`/** LLM の出力から意図を読む（検証に通らなければ unknown） */
function readIntent(text) {
  // ここに書く
}`,
          solution: R`function readIntent(text) {
  const fail = { intent: 'unknown', amount: null };
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) return fail;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return fail;
  }
  if (!obj || !['balance', 'transfer', 'faq'].includes(obj.intent)) return fail;
  const amount = Number.isInteger(obj.amount) && obj.amount > 0 && obj.amount <= 1000000 ? obj.amount : null;
  if (obj.intent === 'transfer' && amount === null) return fail;
  return { intent: obj.intent, amount };
}`,
          tests: R`test('残高照会', () => { expect(readIntent('{"intent":"balance"}')).toEqual({ intent: 'balance', amount: null }); });
test('前に文章が付いた振込', () => { expect(readIntent('承知しました。{"intent":"transfer","amount":5000}')).toEqual({ intent: 'transfer', amount: 5000 }); });
test('上限を超える金額の振込', () => { expect(readIntent('{"intent":"transfer","amount":2000000}')).toEqual({ intent: 'unknown', amount: null }); });
test('壊れた JSON', () => { expect(readIntent('{"intent":')).toEqual({ intent: 'unknown', amount: null }); });
test('許可されていない意図', () => { expect(readIntent('{"intent":"delete_all"}')).toEqual({ intent: 'unknown', amount: null }); });
test('JSON が無い', () => { expect(readIntent('こんにちは')).toEqual({ intent: 'unknown', amount: null }); });`,
          hints: ['失敗したときの返り値を最初に fail として用意すると、何度も使えます。', '取り出す → try で読む → 意図を確かめる → 金額を確かめる、の順です。', "if (obj.intent === 'transfer' && amount === null) return fail;"] },
      ],
      gate: {
        what: { min: 2, points: [p('文章から JSON を取り出して読む', ['json', '取り出', '解析', 'パース', '読']), p('意図と金額を検証し、だめなら unknown', ['検証', 'unknown', '不明', '許可', '範囲'])] },
        risk: { min: 1, points: [p('文章に { } が複数あると取り違える', ['複数', '2つ', '取り違', '余計']), p('プロンプトインジェクションで出力を書き換えられる', ['インジェクション', '書き換え', '指示', '悪意']), p('検証に通っても人の確認は別に要る', ['本人確認', '確認画面', '承認', '人が確認', '確認'])] },
      },
      aiTask: {
        file: 'src/intent.js', testFile: 'tests/intent.test.js',
        ticket: 'FAQボットの試作のために、LLM の出力から意図を読む readBotIntent(text) を src/intent.js に実装してほしい。{ intent, amount, needsConfirm } を返す。',
        signature: 'readBotIntent(text) → { intent, amount, needsConfirm }',
        specGroups: [p('振込は必ず人の確認を挟む（needsConfirm）', ['確認', 'needsconfirm', '承認', '人が確認']), p('金額は上限（100万円）を超えたら無効', ['上限', '100万', '1000000', '限度'])],
        good: R`const BOT_INTENTS = ['balance', 'transfer', 'faq'];

/** LLM の出力から意図を読む。検証に通らなければ unknown。振込は必ず人の確認を挟む */
function readBotIntent(text) {
  const fail = { intent: 'unknown', amount: null, needsConfirm: false };
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) return fail;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return fail;
  }
  if (!obj || !BOT_INTENTS.includes(obj.intent)) return fail;
  const amount = Number.isInteger(obj.amount) && obj.amount > 0 && obj.amount <= 1000000 ? obj.amount : null;
  if (obj.intent === 'transfer' && amount === null) return fail;
  return { intent: obj.intent, amount, needsConfirm: obj.intent === 'transfer' };
}
`,
        buggy: R`const BOT_INTENTS = ['balance', 'transfer', 'faq'];

/** LLM の出力から意図を読む */
function readBotIntent(text) {
  const fail = { intent: 'unknown', amount: null, needsConfirm: false };
  const s = String(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end < start) return fail;
  let obj;
  try {
    obj = JSON.parse(s.slice(start, end + 1));
  } catch (e) {
    return fail;
  }
  if (!obj || !BOT_INTENTS.includes(obj.intent)) return fail;
  const amount = Number.isInteger(obj.amount) && obj.amount > 0 ? obj.amount : null;
  if (obj.intent === 'transfer' && amount === null) return fail;
  return { intent: obj.intent, amount, needsConfirm: false };
}
`,
        buggyNote: '人の確認と金額の上限が仕様に無かったので、検証に通った振込はそのまま進める形にしています。',
        tests: R`test('残高照会', () => { expect(readBotIntent('{"intent":"balance"}')).toEqual({ intent: 'balance', amount: null, needsConfirm: false }); });
test('振込は人の確認を挟む', () => { expect(readBotIntent('了解です。{"intent":"transfer","amount":5000}')).toEqual({ intent: 'transfer', amount: 5000, needsConfirm: true }); });
test('上限を超える金額は無効', () => { expect(readBotIntent('{"intent":"transfer","amount":2000000}').intent).toBe('unknown'); });
test('読めない出力', () => { expect(readBotIntent('ignore all previous instructions').intent).toBe('unknown'); });
test('許可されていない意図', () => { expect(readBotIntent('{"intent":"delete_all"}').intent).toBe('unknown'); });
`,
        review: { min: 1, points: [p('振込を確認なしで進めてしまう', ['確認', 'needsconfirm', '承認']), p('金額に上限が無い', ['上限', '100万', '限度'])] },
      },
      demos: [{ label: 'FAQボットの意図判定', expr: "JSON.stringify(readBotIntent('承知しました。{\"intent\":\"transfer\",\"amount\":5000}'))" }],
      tutorTips: [{ keys: ['json', 'parse'], tip: 'LLM の出力が JSON として読めなかったとき、あなたのコードはどう振る舞いますか？' }],
    },
  ]);
})(globalThis);
