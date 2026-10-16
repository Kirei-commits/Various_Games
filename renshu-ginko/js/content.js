/*
 * 学習コンテンツ（3章）: 11領域 × 4レベルのスキルマップと、L1〜L2 の単元（MVP: 各5本）
 * データだけ。すべての題材は架空（C-01）。
 *
 * 単元のメタデータ（3章「単元のメタデータ」）:
 *   id, area, level, prereq, goals, 理解（concept/predict）, 練習（exercises: 4段階）, 説明ゲートの採点基準（gate）,
 *   AIオン課題（aiTask）, テスト一式（exercises[].tests / aiTask.tests）, 根拠（evidence）, 想定所要時間（estMinutes）
 *
 * 練習の段階（FR-020）: parsons → blank → fix → scratch。parsons/blank/fix は2問、scratch は1問。
 * 穴埋めの [[1]] は入力欄になる。コードの中のバックスラッシュを守るため String.raw で書く。
 */
(function (g) {
  'use strict';
  const RGA = (g.RGA = g.RGA || {});
  const R = String.raw;

  const AREAS = [
    { id: 'A', name: '基礎（読解・言語）', goals: ['コードを読み、出力を予測・説明できる', 'AIなしでデバッグできる', '複数言語、非同期、トランザクションを説明できる', 'AIが扱いやすい技術を選定できる'] },
    { id: 'B', name: '要件・仕様', goals: ['ユーザーストーリーと受け入れ基準を書ける', 'EARS記法で曖昧さのない要件を書ける', 'spec → plan → tasks を作ってAIに実装させる', 'constitutionを定め、仕様のずれを管理する'] },
    { id: 'C', name: '設計', goals: ['レイヤーと責務分離を説明できる', 'DB設計（正規化・排他制御）ができる', '冪等性・リトライ・縮退を設計できる', '不変条件をリンターで強制できる'] },
    { id: 'D', name: 'テスト・レビュー', goals: ['単体テストを読み書きできる', 'AIが書いたPRの欠陥を指摘できる', '境界値・ミューテーションテストを使える', '人間とAIのレビュー分担を設計できる'] },
    { id: 'E', name: 'Git・CI/CD', goals: ['ブランチ、コミット、PR', '小さなPRとロールバック', 'CI（テスト・静的解析・SAST）を構築できる', 'DORA指標で改善できる'] },
    { id: 'F', name: 'セキュリティ', goals: ['秘密情報を渡さない。SQLi・XSSを理解する', 'AI生成コードの脆弱性を見つけられる', 'OWASP LLM Top 10を防御できる', 'エージェントの権限を最小化できる'] },
    { id: 'G', name: '可用性・運用', goals: ['ログを読める', '障害の原因を特定できる', 'SLOを設定し、ポストモーテムを書ける', 'エージェント向けの観測設計ができる'] },
    { id: 'H', name: 'AI協働開発', goals: ['答えを写さずに質問できる', 'タスクを分解し、差分を検証できる', 'コンテキスト設計（AGENTS.md）ができる', 'ハーネス構築を主導できる'] },
    { id: 'I', name: 'LLMアプリ開発', goals: ['LLMの特性を説明できる', 'API・ツール呼び出し・構造化出力', 'RAGとMCP接続', 'evalsとLLMOps、ML基礎'] },
    { id: 'J', name: 'ガバナンス（金融）', goals: ['情報区分とAI利用ルールを守れる', 'AI操作を監査ログに残せる', 'FISC・金融庁の論点で採用判断できる', 'AIガバナンスを設計できる'] },
    { id: 'K', name: '非技術スキル', goals: ['分からないことを言語化して質問できる', '問題を分解し、ドキュメントを書ける', '計測に基づいて判断できる', '後輩の育成を設計できる'] },
  ];

  const LEVELS = [
    { id: 1, name: 'L1 新卒入門', span: '0〜6か月', done: '小さな関数を読んで説明できる。AIに質問して説明を引き出せる' },
    { id: 2, name: 'L2 独り立ち', span: '新卒〜2年目', done: 'バグをAIなしで直せる。AIが書いたPRをレビューできる' },
    { id: 3, name: 'L3 チームの中核', span: '3〜4年目', done: '仕様駆動でAIに機能を実装させ、CIで品質を担保できる' },
    { id: 4, name: 'L4 中堅', span: '5年目〜', done: 'ハーネス、evals、AIガバナンスを設計・主導できる' },
  ];

  // 一貫プロジェクト「練習銀行」の成長段階（3章）
  const BANK_STAGES = [
    { level: 1, features: '残高照会、入出金明細の表示', areas: 'A, B, D, E' },
    { level: 2, features: '振込、二重送金の防止、入力検証', areas: 'A, C, D, F' },
    { level: 3, features: '監査ログ、障害時の縮退運転、規程を検索するFAQボット（RAG）', areas: 'C, E, G, I' },
    { level: 4, features: '開発エージェント用のハーネス、FAQボットのevals、AI利用の承認フロー', areas: 'H, I, J' },
  ];

  // 説明ゲート・取り込み時の説明で共通に使う「危ないところ」の言い回し
  const p = (label, any) => ({ label, any });

  const UNITS = [
    // =====================================================================
    {
      id: 'L1-01', area: 'A', level: 1, prereq: [], estMinutes: 25,
      title: '金額を円で表示する',
      story: '先輩の佐藤さんより：「練習銀行の残高画面、いま金額が 1234567 みたいに生の数字で出てるんだ。¥1,234,567 の形で出したい。まずは関数を読めるようになろう。」',
      goals: ['小さな関数を読んで、出力を予測できる', '金額の表示（符号・桁区切り・丸め）を説明できる'],
      evidence: 'Anthropic RCT 2026（AIの使い方で理解度に差）／スキルマップ A-L1',
      concept: [
        '関数は「受け取ったものから、返すものを作る」小さな部品です。まず入力と出力を1文で言えるようにしましょう。',
        { code: R`function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP');
}
formatYen(1500); // → '¥1,500'` },
        'toLocaleString(\'ja-JP\') は数値を3桁ごとのカンマ区切りの文字列にします。負の数は「-1,500」になるので、「-¥1,500」と出したいなら符号を先に取り出す必要があります。',
        '小数（1234.5）はそのままだと「1,234.5」になります。お金の表示では丸め方を決めておかないと、画面ごとに表示がずれる原因になります。',
      ],
      predict: [
        { q: 'このコードの出力は？', code: R`const n = 1500;
console.log('¥' + n);`, choices: ['¥1500', '¥1,500', '1500円', 'エラー'], answer: 0, why: '文字列と数値を + でつなぐと、数値はそのまま文字になります。カンマは付きません。' },
        { q: 'このコードの値は？', code: R`(1234567).toLocaleString('ja-JP')`, choices: ['"1,234,567"', '"1234567"', '"1.234.567"', '1234567（数値）'], answer: 0, why: 'ja-JP では3桁ごとにカンマが入った「文字列」になります。' },
        { q: 'このコードの値は？', code: R`Math.abs(-300)`, choices: ['300', '-300', '0', 'NaN'], answer: 0, why: 'Math.abs は絶対値（符号を取った値）を返します。' },
      ],
      exercises: [
        { id: 'L1-01-p1', stage: 'parsons', prompt: '行を正しい順に並べて、formatYen(n) が「¥1,234」形式の文字列を返すようにしてください。使わない行が1つあります。',
          lines: ['function formatYen(n) {', "  const s = n.toLocaleString('ja-JP');", "  return '¥' + s;", '}'],
          distractors: ["  return s + '円';"],
          tests: R`test('0円', () => { expect(formatYen(0)).toBe('¥0'); });
test('1234円', () => { expect(formatYen(1234)).toBe('¥1,234'); });`,
          hints: ['まず関数の入口（function の行）と出口（return の行）を探しましょう。', 'return は1つだけ使います。「¥」が前に付くのはどちらの return でしょう？', "  return '¥' + s; の行を使います。"] },
        { id: 'L1-01-p2', stage: 'parsons', prompt: '負の数を「-¥500」のように表示する formatYen(n) を組み立ててください。使わない行が1つあります。',
          lines: ['function formatYen(n) {', "  const sign = n < 0 ? '-' : '';", "  const s = Math.abs(n).toLocaleString('ja-JP');", "  return sign + '¥' + s;", '}'],
          distractors: ["  const s = n.toLocaleString('ja-JP');"],
          tests: R`test('-500円', () => { expect(formatYen(-500)).toBe('-¥500'); });
test('1000円', () => { expect(formatYen(1000)).toBe('¥1,000'); });`,
          hints: ['符号（-）と数字の部分を分けて考えます。', 's を作る行は2つありますが、片方は符号が二重になります。', 'Math.abs(n) を使う行を選びましょう。'] },
        { id: 'L1-01-b1', stage: 'blank', prompt: '空欄を埋めて、3桁区切りの金額を返すようにしてください。',
          template: R`function formatYen(n) {
  return '¥' + n.[[1]]('ja-JP');
}`, answers: ['toLocaleString'],
          tests: R`test('0円', () => { expect(formatYen(0)).toBe('¥0'); });
test('98765円', () => { expect(formatYen(98765)).toBe('¥98,765'); });`,
          hints: ['数値を地域の書き方の文字列にするメソッドです。', '「Locale（地域）」と「String（文字列）」を組み合わせた名前です。', 'toLocaleString'] },
        { id: 'L1-01-b2', stage: 'blank', prompt: '空欄を埋めて、負の数を「-¥500」と表示してください。',
          template: R`function formatYen(n) {
  const sign = n [[1]] 0 ? '-' : '';
  return sign + '¥' + Math.[[2]](n).toLocaleString('ja-JP');
}`, answers: ['<', 'abs'],
          tests: R`test('-500円', () => { expect(formatYen(-500)).toBe('-¥500'); });
test('500円', () => { expect(formatYen(500)).toBe('¥500'); });
test('0円', () => { expect(formatYen(0)).toBe('¥0'); });`,
          hints: ['1つ目は「0より小さいとき」に - を付ける比較です。', '2つ目は符号を取り除く Math のメソッドです。', '1つ目は < 、2つ目は abs です。'] },
        { id: 'L1-01-f1', stage: 'fix', prompt: 'このコードは「¥1,234円」のように表示してしまいます。直してください。',
          code: R`function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP') + '円';
}`,
          solution: R`function formatYen(n) {
  return '¥' + n.toLocaleString('ja-JP');
}`,
          tests: R`test('1234円', () => { expect(formatYen(1234)).toBe('¥1,234'); });`,
          hints: ['テストの期待値と、実際の値を1文字ずつ比べましょう。', '後ろに余計なものが付いています。', "+ '円' を消します。"] },
        { id: 'L1-01-f2', stage: 'fix', prompt: '正の数に「-」が付いてしまうバグがあります。直してください。',
          code: R`function formatYen(n) {
  const sign = n > 0 ? '-' : '';
  return sign + '¥' + Math.abs(n).toLocaleString('ja-JP');
}`,
          solution: R`function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '¥' + Math.abs(n).toLocaleString('ja-JP');
}`,
          tests: R`test('-500円', () => { expect(formatYen(-500)).toBe('-¥500'); });
test('500円', () => { expect(formatYen(500)).toBe('¥500'); });
test('0円', () => { expect(formatYen(0)).toBe('¥0'); });`,
          hints: ['符号を決めている行はどこでしょう？', '比較の向きを確かめましょう。「負のとき」に - を付けたいはずです。', 'n > 0 を n < 0 にします。'] },
        { id: 'L1-01-s1', stage: 'scratch', prompt: 'formatYen(n) をゼロから書いてください。負の数は「-¥2,500」、小数は四捨五入して整数円にします（例: 99.5 → ¥100）。',
          code: R`/** 金額を「¥1,234」形式にする */
function formatYen(n) {
  // ここに書く
}`,
          solution: R`function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
}`,
          tests: R`test('0円', () => { expect(formatYen(0)).toBe('¥0'); });
test('999円', () => { expect(formatYen(999)).toBe('¥999'); });
test('1000円は桁区切り', () => { expect(formatYen(1000)).toBe('¥1,000'); });
test('マイナス', () => { expect(formatYen(-2500)).toBe('-¥2,500'); });
test('小数は四捨五入（切り捨て側）', () => { expect(formatYen(1234.4)).toBe('¥1,234'); });
test('小数は四捨五入（切り上げ側）', () => { expect(formatYen(99.5)).toBe('¥100'); });`,
          hints: ['符号・丸め・桁区切りの3つに分けて、1つずつ片付けましょう。', 'Math.round で丸め、Math.abs で符号を取り、toLocaleString で区切ります。', "const sign = n < 0 ? '-' : '';"] },
      ],
      gate: {
        what: { min: 2, points: [p('円記号と3桁区切りで表示する', ['¥', '円', 'カンマ', '区切', '3桁', '桁', '表示', '文字列']), p('マイナスの金額の扱い', ['マイナス', '負', '符号', '-¥'])] },
        risk: { min: 1, points: [p('小数・丸めの扱い', ['小数', '丸め', '四捨五入', 'round', '端数']), p('数値以外が渡されたとき', ['文字列', 'undefined', 'null', 'nan', '数値以外', '型']), p('とても大きい金額', ['大きい', '桁あふれ', '上限', 'max_safe'])] },
      },
      aiTask: {
        file: 'src/format.js', testFile: 'tests/format.test.js',
        ticket: '明細画面の1行を「2026-04-01 入金 ¥5,000 給与」の形で出したい。formatYen と formatTxLine(tx) を src/format.js に実装してほしい。tx は { date, type: "in" | "out", amount, memo? }。',
        signature: 'formatYen(n) / formatTxLine(tx)',
        specGroups: [p('出金はマイナスで表示する', ['出金', 'マイナス', '負', '-¥', '符号']), p('メモが無いときの扱い', ['メモがない', 'メモが無い', 'メモなし', 'memoがない', 'memo が無い', '省略', '空', 'undefined'])],
        good: R`/** 金額を「¥1,234」形式にする。負の数は「-¥500」、小数は四捨五入 */
function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
}

/** 明細1行を作る。出金はマイナス、メモは無ければ付けない */
function formatTxLine(tx) {
  const label = tx.type === 'in' ? '入金' : '出金';
  const amount = tx.type === 'in' ? tx.amount : -tx.amount;
  const parts = [tx.date, label, formatYen(amount)];
  if (tx.memo) parts.push(tx.memo);
  return parts.join(' ');
}
`,
        buggy: R`/** 金額を「¥1,234」形式にする */
function formatYen(n) {
  const sign = n < 0 ? '-' : '';
  return sign + '¥' + Math.abs(Math.round(n)).toLocaleString('ja-JP');
}

/** 明細1行を作る */
function formatTxLine(tx) {
  const label = tx.type === 'in' ? '入金' : '出金';
  return tx.date + ' ' + label + ' ' + formatYen(tx.amount) + ' ' + tx.memo;
}
`,
        buggyNote: '出金の金額の符号と、メモが無いときの扱いは仕様に書かれていなかったので、いちばん単純な実装にしました。',
        tests: R`test('円表示', () => { expect(formatYen(1234)).toBe('¥1,234'); });
test('マイナスの円表示', () => { expect(formatYen(-500)).toBe('-¥500'); });
test('入金の行', () => { expect(formatTxLine({ date: '2026-04-01', type: 'in', amount: 5000, memo: '給与' })).toBe('2026-04-01 入金 ¥5,000 給与'); });
test('出金はマイナス', () => { expect(formatTxLine({ date: '2026-04-02', type: 'out', amount: 1200, memo: 'コンビニ' })).toBe('2026-04-02 出金 -¥1,200 コンビニ'); });
test('メモが無い行', () => { expect(formatTxLine({ date: '2026-04-03', type: 'in', amount: 300 })).toBe('2026-04-03 入金 ¥300'); });
`,
        review: { min: 1, points: [p('メモが無いと undefined と出る', ['undefined', 'メモ', 'memo']), p('出金の符号', ['出金', '符号', 'マイナス'])] },
      },
      demos: [{ label: '残高', expr: "formatYen(152340)" }, { label: '明細', expr: "formatTxLine({ date: '2026-04-25', type: 'in', amount: 250000, memo: '給与' })" }],
      tutorTips: [{ keys: ['tolocalestring', 'カンマ', '区切'], tip: 'toLocaleString(\'ja-JP\') が何を返すか、コンソールで1つ試すとしたら何を入れますか？' }, { keys: ['マイナス', '負', '符号'], tip: '符号と数字の部分を別々に作ると考えやすくなります。符号はどの条件で付きますか？' }],
    },
    // =====================================================================
    {
      id: 'L1-02', area: 'A', level: 1, prereq: ['L1-01'], estMinutes: 30,
      title: '残高を計算する',
      story: '先輩の佐藤さんより：「入出金の一覧から残高を出したい。ループと足し算だけど、お金の計算はどこで間違えるかを説明できるのが大事だよ。」',
      goals: ['配列をループして合計を出せる', '入金と出金で足し引きが変わる処理を説明できる'],
      evidence: 'スキルマップ A-L1／練習銀行 L1「残高照会」',
      concept: [
        '合計は「入れ物（total）を0で用意して、1件ずつ足していく」のが基本形です。',
        { code: R`let total = 0;
for (const n of [100, 200, 300]) {
  total += n;
}
total; // → 600` },
        'reduce を使うと同じことを1行で書けます。第2引数（最初の値）を省くと、空の配列でエラーになる点に注意しましょう。',
        { code: R`[100, 200].reduce((acc, n) => acc + n, 0); // → 300
[].reduce((acc, n) => acc + n, 0);         // → 0` },
      ],
      predict: [
        { q: 'このコードの最後の t は？', code: R`let t = 0;
for (const x of [1, 2, 3]) t += x;`, choices: ['6', '"123"', '3', '0'], answer: 0, why: '1+2+3 で 6 です。' },
        { q: 'このコードの値は？', code: R`[].reduce((a, b) => a + b, 0)`, choices: ['0', 'undefined', 'エラー', 'NaN'], answer: 0, why: '最初の値 0 を渡しているので、空の配列でも 0 が返ります。' },
        { q: 'このコードの値は？', code: R`[{ a: 1 }, { a: 2 }].map((o) => o.a)`, choices: ['[1, 2]', '[{a:1},{a:2}]', '3', '[]'], answer: 0, why: 'map はそれぞれの要素を変換した新しい配列を返します。' },
      ],
      exercises: [
        { id: 'L1-02-p1', stage: 'parsons', prompt: '金額の配列 list の合計を返す sumAmounts を組み立ててください。使わない行が1つあります。',
          lines: ['function sumAmounts(list) {', '  let total = 0;', '  for (const n of list) {', '    total += n;', '  }', '  return total;', '}'],
          distractors: ['  let total;'],
          tests: R`test('空なら0', () => { expect(sumAmounts([])).toBe(0); });
test('合計', () => { expect(sumAmounts([100, 200])).toBe(300); });`,
          hints: ['入れ物を用意 → 1件ずつ足す → 返す、の順です。', 'total の最初の値が無いと、足し算の結果はどうなるでしょう？', '  let total = 0; を使います。'] },
        { id: 'L1-02-p2', stage: 'parsons', prompt: '入金（in）は足し、出金（out）は引いて残高を返す balance を組み立ててください。使わない行が1つあります。',
          lines: ['function balance(txs) {', '  let total = 0;', '  for (const tx of txs) {', "    if (tx.type === 'in') total += tx.amount;", '    else total -= tx.amount;', '  }', '  return total;', '}'],
          distractors: ['    total += tx.amount;'],
          tests: R`test('空なら0', () => { expect(balance([])).toBe(0); });
test('入金1000・出金300', () => { expect(balance([{ type: 'in', amount: 1000 }, { type: 'out', amount: 300 }])).toBe(700); });`,
          hints: ['ループの中で、type によって足すか引くかを分けます。', 'if と else が1組になります。', "    if (tx.type === 'in') total += tx.amount; の次に else が来ます。"] },
        { id: 'L1-02-b1', stage: 'blank', prompt: '空欄を埋めて、reduce で合計を出してください。空の配列なら0です。',
          template: R`function sumAmounts(list) {
  return list.reduce((acc, n) => acc [[1]] n, [[2]]);
}`, answers: ['+', '0'],
          tests: R`test('空なら0', () => { expect(sumAmounts([])).toBe(0); });
test('合計', () => { expect(sumAmounts([1, 2, 3])).toBe(6); });`,
          hints: ['acc（ここまでの合計）と n をどうするかです。', '2つ目は最初の値です。空の配列のときに返ってほしい値は？', '+ と 0 です。'] },
        { id: 'L1-02-b2', stage: 'blank', prompt: '空欄を埋めて、入金は足し・出金は引くようにしてください。',
          template: R`function balance(txs) {
  let total = 0;
  for (const tx of txs) {
    total += tx.type === [[1]] ? tx.amount : [[2]]tx.amount;
  }
  return total;
}`, answers: ["'in'", '-'],
          tests: R`test('入金のみ', () => { expect(balance([{ type: 'in', amount: 500 }])).toBe(500); });
test('出金のみ', () => { expect(balance([{ type: 'out', amount: 500 }])).toBe(-500); });`,
          hints: ['1つ目は比べる相手の文字列です（引用符も必要）。', '2つ目は、出金のとき total += で引き算にするための記号です。', "'in' と - です。"] },
        { id: 'L1-02-f1', stage: 'fix', prompt: '最初の1件が合計に入らないバグがあります。直してください。',
          code: R`function sumAmounts(list) {
  let total = 0;
  for (let i = 1; i < list.length; i++) {
    total += list[i];
  }
  return total;
}`,
          solution: R`function sumAmounts(list) {
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    total += list[i];
  }
  return total;
}`,
          tests: R`test('1件', () => { expect(sumAmounts([5])).toBe(5); });
test('3件', () => { expect(sumAmounts([1, 2, 3])).toBe(6); });`,
          hints: ['1件だけの配列で、ループが何回まわるか数えてみましょう。', '配列の最初の要素の番号は？', 'let i = 1 を let i = 0 にします。'] },
        { id: 'L1-02-f2', stage: 'fix', prompt: '出金しても残高が増えてしまいます。直してください。',
          code: R`function balance(txs) {
  let total = 0;
  for (const tx of txs) {
    if (tx.type = 'in') total += tx.amount;
    else total -= tx.amount;
  }
  return total;
}`,
          solution: R`function balance(txs) {
  let total = 0;
  for (const tx of txs) {
    if (tx.type === 'in') total += tx.amount;
    else total -= tx.amount;
  }
  return total;
}`,
          tests: R`test('出金のみ', () => { expect(balance([{ type: 'out', amount: 500 }])).toBe(-500); });
test('入金1000・出金400', () => { expect(balance([{ type: 'in', amount: 1000 }, { type: 'out', amount: 400 }])).toBe(600); });`,
          hints: ['if の条件の中をよく見ましょう。', '= は「代入」、比べるのは別の記号です。', "tx.type = 'in' を tx.type === 'in' にします。"] },
        { id: 'L1-02-s1', stage: 'scratch', prompt: 'balance(txs, opening) を書いてください。opening（期首残高、省略時は0）から始めて入出金を反映します。type が in・out 以外の取引は無視します。',
          code: R`/** 期首残高 opening に入出金を反映した残高を返す */
function balance(txs, opening = 0) {
  // ここに書く
}`,
          solution: R`function balance(txs, opening = 0) {
  let total = opening;
  for (const tx of txs) {
    if (tx.type === 'in') total += tx.amount;
    else if (tx.type === 'out') total -= tx.amount;
  }
  return total;
}`,
          tests: R`test('空なら0', () => { expect(balance([])).toBe(0); });
test('期首残高だけ', () => { expect(balance([], 1000)).toBe(1000); });
test('入出金を反映', () => { expect(balance([{ type: 'in', amount: 500 }, { type: 'out', amount: 200 }], 1000)).toBe(1300); });
test('知らない種類は無視', () => { expect(balance([{ type: 'fee', amount: 100 }])).toBe(0); });`,
          hints: ['total の最初の値を何にするかがポイントです。', 'else だけだと in 以外がすべて引かれます。out のときだけ引くには？', "else if (tx.type === 'out') total -= tx.amount;"] },
      ],
      gate: {
        what: { min: 2, points: [p('入金は足し・出金は引く', ['入金', '出金', '足', '引', '加算', '減算', 'プラス']), p('期首残高から始める', ['期首', '初期', 'opening', '最初', 'から始', 'スタート'])] },
        risk: { min: 1, points: [p('想定外の type を黙って無視する', ['無視', 'その他', '想定外', '不明', 'type', '種類']), p('金額が負・数値でない', ['負の金額', 'マイナスの金額', '数値でない', '文字列', 'nan', 'undefined', '不正']), p('小数の誤差', ['小数', '浮動', '誤差'])] },
      },
      aiTask: {
        file: 'src/account.js', testFile: 'tests/account.test.js',
        ticket: '残高照会画面のために、balance(txs, opening) と、入金合計・出金合計・件数を返す summary(txs) を src/account.js に実装してほしい。',
        signature: 'balance(txs, opening) / summary(txs) → { in, out, count }',
        specGroups: [p('入金でも出金でもない取引の扱い', ['それ以外', '以外', '不明', '知らない', '無視', 'ほかの種類', '他の種類']), p('取引が0件のとき', ['空', '0件', 'ゼロ件', '1件もない', '一件もない'])],
        good: R`/** 期首残高 opening に入出金を反映する。in・out 以外は無視する */
function balance(txs, opening = 0) {
  let total = opening;
  for (const tx of txs) {
    if (tx.type === 'in') total += tx.amount;
    else if (tx.type === 'out') total -= tx.amount;
  }
  return total;
}

/** 入金合計・出金合計・件数。0件なら全部0 */
function summary(txs) {
  const sum = (type) => txs.filter((tx) => tx.type === type).reduce((acc, tx) => acc + tx.amount, 0);
  return { in: sum('in'), out: sum('out'), count: txs.length };
}
`,
        buggy: R`/** 残高を返す */
function balance(txs, opening = 0) {
  return txs.reduce((total, tx) => total + (tx.type === 'in' ? tx.amount : -tx.amount), opening);
}

/** 入金合計・出金合計・件数 */
function summary(txs) {
  const ins = txs.filter((tx) => tx.type === 'in').map((tx) => tx.amount).reduce((a, b) => a + b);
  const outs = txs.filter((tx) => tx.type === 'out').map((tx) => tx.amount).reduce((a, b) => a + b);
  return { in: ins, out: outs, count: txs.length };
}
`,
        buggyNote: '入金・出金以外の取引と、取引が0件のときの扱いが仕様に無かったので、入金以外はすべて出金として扱いました。',
        tests: R`test('期首残高だけ', () => { expect(balance([], 1000)).toBe(1000); });
test('入出金を反映', () => { expect(balance([{ type: 'in', amount: 500 }, { type: 'out', amount: 200 }], 1000)).toBe(1300); });
test('入金・出金以外は無視', () => { expect(balance([{ type: 'note', amount: 100 }])).toBe(0); });
test('0件の集計', () => { expect(summary([])).toEqual({ in: 0, out: 0, count: 0 }); });
test('集計', () => { expect(summary([{ type: 'in', amount: 100 }, { type: 'out', amount: 30 }, { type: 'in', amount: 50 }])).toEqual({ in: 150, out: 30, count: 3 }); });
`,
        review: { min: 1, points: [p('in 以外をすべて出金扱い', ['出金扱い', 'in以外', 'in 以外', 'それ以外', '種類']), p('空配列で reduce がエラー', ['空', 'reduce', '0件', '初期値'])] },
      },
      demos: [{ label: '残高照会', expr: "formatYen(balance([{ type: 'in', amount: 250000 }, { type: 'out', amount: 82000 }], 30000))" }],
      tutorTips: [{ keys: ['reduce'], tip: 'reduce の2つ目の引数を省いたとき、空の配列では何が起きると思いますか？' }, { keys: ['ループ', 'for'], tip: 'ループが1回まわるごとに total がどう変わるか、紙に表を書くとしたら最初の行は？' }],
    },
    // =====================================================================
    {
      id: 'L1-03', area: 'B', level: 1, prereq: ['L1-02'], estMinutes: 30,
      title: 'ユーザーストーリーと受け入れ基準',
      story: '企画の田中さんより：「月ごとの明細を見たい、というお客さまの声が多いの。“見やすく”じゃ伝わらないから、受け入れ基準まで書いてから作ってね。」',
      goals: ['ユーザーストーリーと受け入れ基準を書ける', '受け入れ基準をテストに置き換えられる'],
      evidence: 'スキルマップ B-L1／Spec Kit（spec → tasks）',
      concept: [
        'ユーザーストーリーは「〈誰〉として、〈何〉をしたい。なぜなら〈理由〉」の形で書きます。',
        '受け入れ基準は「〜のとき、〜になる」と、確かめられる形で書きます。「見やすく」「適切に」「なるべく」は確かめられないので使いません。',
        { code: R`ストーリー: 口座の持ち主として、月ごとの明細を見たい。家計簿をつけたいから。
受け入れ基準:
- 2026-04 を指定したとき、日付が 2026-04 の取引だけが返る
- 月の形式が YYYY-MM でないとき、エラーになる` },
        '受け入れ基準の1行は、そのままテスト1本になります。基準を書けないものは、作っても「できた」と言えません。',
      ],
      predict: [
        { q: '受け入れ基準として良いものは？', code: '', choices: ['2026-04 を指定したとき、日付が 2026-04 で始まる取引だけが返る', '明細が見やすいこと', 'なるべく速く表示する', '適切に絞り込む'], answer: 0, why: '入力と結果が決まっていて、テストで確かめられるものが受け入れ基準です。' },
        { q: 'このコードの値は？', code: R`'2026-04-15'.slice(0, 7)`, choices: ['"2026-04"', '"2026-04-"', '"2026-0"', '"04-15"'], answer: 0, why: 'slice(0, 7) は0文字目から7文字分を取り出します。' },
        { q: 'このコードの値は？', code: R`[1, 2, 3, 4].filter((n) => n % 2 === 0)`, choices: ['[2, 4]', '[1, 3]', '2', 'true'], answer: 0, why: 'filter は条件が true になった要素だけの新しい配列を返します。' },
      ],
      exercises: [
        { id: 'L1-03-p1', stage: 'parsons', prompt: '指定した月（"2026-04"）の取引だけを返す filterByMonth を組み立ててください。使わない行が1つあります。',
          lines: ['function filterByMonth(txs, month) {', '  return txs.filter((tx) => tx.date.slice(0, 7) === month);', '}'],
          distractors: ['  return txs.find((tx) => tx.date.slice(0, 7) === month);'],
          tests: R`test('空なら空', () => { expect(filterByMonth([], '2026-04')).toEqual([]); });
test('4月だけ', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-05-01' }, { date: '2026-04-30' }];
  expect(filterByMonth(txs, '2026-04')).toEqual([txs[0], txs[2]]);
});`,
          hints: ['返したいのは1件ですか？ 全部ですか？', 'find は最初の1件、filter は条件に合う全部です。', 'filter の行を使います。'] },
        { id: 'L1-03-p2', stage: 'parsons', prompt: '月の形式が YYYY-MM でなければエラーにする filterByMonth を組み立ててください。使わない行が1つあります。',
          lines: ['function filterByMonth(txs, month) {', R`  if (!/^\d{4}-\d{2}$/.test(month)) {`, "    throw new Error('月は YYYY-MM 形式で指定してください');", '  }', '  return txs.filter((tx) => tx.date.slice(0, 7) === month);', '}'],
          distractors: ['  return txs.filter((tx) => tx.date.startsWith(month));'],
          tests: R`test('形式が違うとエラー', () => { expect(() => filterByMonth([], '2026-4')).toThrow('YYYY-MM'); });
test('10月を指定', () => {
  const txs = [{ date: '2026-10-05' }, { date: '2026-01-05' }];
  expect(filterByMonth(txs, '2026-10')).toEqual([txs[0]]);
});`,
          hints: ['まず入力を確かめ、だめなら先にエラーにする（早期リターン）形です。', 'startsWith でも動きそうですが、"2026-1" のような入力で何が起きるか考えましょう。', 'slice(0, 7) === month の行を使います。'] },
        { id: 'L1-03-b1', stage: 'blank', prompt: '空欄を埋めて、指定した月の取引だけを返してください。',
          template: R`function filterByMonth(txs, month) {
  return txs.[[1]]((tx) => tx.date.slice(0, [[2]]) === month);
}`, answers: ['filter', '7'],
          tests: R`test('4月だけ', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-05-01' }];
  expect(filterByMonth(txs, '2026-04')).toEqual([txs[0]]);
});`,
          hints: ['条件に合う要素を全部集める配列のメソッドです。', '"2026-04" は何文字でしょう？', 'filter と 7 です。'] },
        { id: 'L1-03-b2', stage: 'blank', prompt: '空欄を埋めて、指定した月の取引の件数を返してください。',
          template: R`function countByMonth(txs, month) {
  return txs.filter((tx) => tx.date.slice(0, 7) === month).[[1]];
}`, answers: ['length'],
          tests: R`test('2件', () => { expect(countByMonth([{ date: '2026-04-01' }, { date: '2026-04-02' }, { date: '2026-05-01' }], '2026-04')).toBe(2); });
test('0件', () => { expect(countByMonth([], '2026-04')).toBe(0); });`,
          hints: ['配列の要素数を表すプロパティです。', '( ) は付きません。', 'length です。'] },
        { id: 'L1-03-f1', stage: 'fix', prompt: '受け入れ基準「月の形式が YYYY-MM でないとき、エラーになる」を満たしていません。直してください。',
          code: R`function filterByMonth(txs, month) {
  return txs.filter((tx) => tx.date.startsWith(month));
}`,
          solution: R`function filterByMonth(txs, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月は YYYY-MM 形式で指定してください');
  return txs.filter((tx) => tx.date.slice(0, 7) === month);
}`,
          tests: R`test('形式が違うとエラー', () => { expect(() => filterByMonth([], '2026-1')).toThrow(); });
test('4月だけ', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-05-01' }];
  expect(filterByMonth(txs, '2026-04')).toEqual([txs[0]]);
});`,
          hints: ['"2026-1" を渡すと、10月・11月・12月の取引まで返ってしまいます。', '入力を確かめる if を最初に足しましょう。', R`/^\d{4}-\d{2}$/ という正規表現で形式を確かめられます。`] },
        { id: 'L1-03-f2', stage: 'fix', prompt: '1件しか返ってこないバグがあります。直してください。',
          code: R`function filterByMonth(txs, month) {
  const result = [];
  for (const tx of txs) {
    if (tx.date.slice(0, 7) === month) result.push(tx);
    return result;
  }
  return result;
}`,
          solution: R`function filterByMonth(txs, month) {
  const result = [];
  for (const tx of txs) {
    if (tx.date.slice(0, 7) === month) result.push(tx);
  }
  return result;
}`,
          tests: R`test('2件とも返る', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }];
  expect(filterByMonth(txs, '2026-04')).toEqual(txs);
});`,
          hints: ['ループが何回まわっているか確かめましょう。', 'ループの中に return があると、そこで関数が終わります。', 'ループの中の return result; を消します。'] },
        { id: 'L1-03-s1', stage: 'scratch', prompt: 'filterByRange(txs, from, to) を書いてください。日付が from 以上 to 以下（両端を含む）の取引を返します。from が to より後ならエラーにします。日付は "YYYY-MM-DD" 形式です。',
          code: R`/** from〜to（両端を含む）の取引を返す */
function filterByRange(txs, from, to) {
  // ここに書く
}`,
          solution: R`function filterByRange(txs, from, to) {
  if (from > to) throw new Error('開始日が終了日より後です');
  return txs.filter((tx) => tx.date >= from && tx.date <= to);
}`,
          tests: R`const TXS = [{ date: '2026-03-31' }, { date: '2026-04-01' }, { date: '2026-04-15' }, { date: '2026-04-30' }, { date: '2026-05-01' }];
test('両端を含む', () => { expect(filterByRange(TXS, '2026-04-01', '2026-04-30')).toEqual([TXS[1], TXS[2], TXS[3]]); });
test('1日だけ', () => { expect(filterByRange(TXS, '2026-04-15', '2026-04-15')).toEqual([TXS[2]]); });
test('該当なし', () => { expect(filterByRange(TXS, '2027-01-01', '2027-01-31')).toEqual([]); });
test('開始が終了より後ならエラー', () => { expect(() => filterByRange(TXS, '2026-05-01', '2026-04-01')).toThrow(); });`,
          hints: ['"YYYY-MM-DD" の文字列は、そのまま >= や <= で比べられます。', '先にエラーの条件を確かめてから、filter で絞り込みます。', 'tx.date >= from && tx.date <= to'] },
      ],
      gate: {
        what: { min: 2, points: [p('期間の両端を含めて絞り込む', ['含', '以上', '以下', '範囲', '期間', '両端', 'from', 'to']), p('開始が終了より後ならエラー', ['エラー', '例外', 'throw', '逆'])] },
        risk: { min: 1, points: [p('日付の形式がそろっていないと文字列比較が壊れる', ['形式', 'フォーマット', '文字列比較', 'ゼロ埋め', 'yyyy', '書式']), p('時刻やタイムゾーン', ['時刻', 'タイムゾーン', '時差']), p('date が無い取引', ['undefined', '無い', 'ない', '欠け', 'null'])] },
      },
      aiTask: {
        file: 'src/statement.js', testFile: 'tests/statement.test.js',
        ticket: '月次明細の画面のために monthlyStatement(txs, month) を src/statement.js に実装してほしい。{ month, items, in, out } を返す。仕様にはユーザーストーリーと受け入れ基準を書くこと。',
        signature: 'monthlyStatement(txs, month) → { month, items, in, out }',
        specGroups: [p('明細を日付の古い順に並べる', ['古い順', '昇順', '日付順', '並べ', '並び', 'ソート']), p('月の形式が違うときはエラー', ['形式', 'yyyy-mm', 'エラー', '不正'])],
        good: R`/** 指定した月の明細。items は日付の古い順。月の形式が YYYY-MM でなければエラー */
function monthlyStatement(txs, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('月は YYYY-MM 形式で指定してください');
  const items = txs
    .filter((tx) => tx.date.slice(0, 7) === month)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const sum = (type) => items.filter((tx) => tx.type === type).reduce((acc, tx) => acc + tx.amount, 0);
  return { month, items, in: sum('in'), out: sum('out') };
}
`,
        buggy: R`/** 指定した月の明細 */
function monthlyStatement(txs, month) {
  const items = txs.filter((tx) => tx.date.startsWith(month));
  const sum = (type) => items.filter((tx) => tx.type === type).reduce((acc, tx) => acc + tx.amount, 0);
  return { month, items, in: sum('in'), out: sum('out') };
}
`,
        buggyNote: '並び順と、月の形式が違うときの扱いが仕様に無かったので、元の順番のまま返し、形式は確かめていません。',
        tests: R`const TXS = [
  { date: '2026-04-20', type: 'out', amount: 3000 },
  { date: '2026-04-01', type: 'in', amount: 5000 },
  { date: '2026-05-02', type: 'in', amount: 999 },
];
test('古い順に並ぶ', () => { expect(monthlyStatement(TXS, '2026-04').items.map((t) => t.date)).toEqual(['2026-04-01', '2026-04-20']); });
test('入出金の合計', () => {
  const s = monthlyStatement(TXS, '2026-04');
  expect([s.in, s.out]).toEqual([5000, 3000]);
});
test('取引の無い月', () => { expect(monthlyStatement(TXS, '2026-06')).toEqual({ month: '2026-06', items: [], in: 0, out: 0 }); });
test('形式が違うとエラー', () => { expect(() => monthlyStatement(TXS, '2026-4')).toThrow(); });
`,
        review: { min: 1, points: [p('並び順が保証されない', ['順', '並び', 'ソート']), p('startsWith だと "2026-1" で10〜12月も混ざる', ['startswith', '形式', '2026-1', '混ざ'])] },
      },
      demos: [{ label: '月次明細', expr: "monthlyStatement([{ date: '2026-04-20', type: 'out', amount: 3000, memo: '電気代' }, { date: '2026-04-01', type: 'in', amount: 5000, memo: 'おこづかい' }], '2026-04').items.map((t) => formatTxLine(t)).join(' / ')" }],
      tutorTips: [{ keys: ['受け入れ', '基準', 'ストーリー'], tip: 'その基準は、テストで「通った／落ちた」と判定できますか？ 入力と期待する結果を1つ書いてみましょう。' }, { keys: ['日付', '比較', '比べ'], tip: '"2026-04-09" と "2026-04-10" を文字列として比べると、どちらが大きいと思いますか？ それはなぜでしょう？' }],
    },
    // =====================================================================
    {
      id: 'L1-04', area: 'D', level: 1, prereq: ['L1-02'], estMinutes: 35,
      title: '単体テストを読み書きする',
      story: '先輩の佐藤さんより：「最新の取引を n 件出す latest って関数があるんだけど、テストが無いんだ。テストが“バグを見つけられるか”まで考えて書いてみよう。」',
      goals: ['単体テストを読み、何を確かめているか説明できる', '欠陥（変異体）を見つけられるテストを書ける'],
      evidence: 'スキルマップ D-L1／ITiCSE 2023（足場の段階的な除去）',
      concept: [
        'テストは「準備（Arrange）→ 実行（Act）→ 確認（Assert）」の3段で書きます。',
        { code: R`test('新しい順に並ぶ', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-03' }]; // 準備
  const result = latest(txs, 2);                                  // 実行
  expect(result[0].date).toBe('2026-04-03');                      // 確認
});` },
        'toBe は「同じもの」か（数値・文字列向け）、toEqual は「中身が同じ」か（配列・オブジェクト向け）を確かめます。[] と [] は toBe では別物です。',
        '良いテストは、わざと壊した実装（変異体）で落ちます。通るだけのテストでは、バグを見つけられません。',
      ],
      predict: [
        { q: 'このテストは通る？', code: R`expect([1, 2]).toBe([1, 2]);`, choices: ['落ちる（別の配列だから）', '通る', 'エラーで止まる', '環境による'], answer: 0, why: '配列は中身が同じでも別物です。中身を比べるなら toEqual を使います。' },
        { q: 'このテストが確かめていることは？', code: R`expect(latest(txs, 0)).toEqual([]);`, choices: ['0件を指定すると空の配列が返る', 'latest が速い', 'txs が空', 'エラーになる'], answer: 0, why: '入力（0件）と期待する結果（空の配列）の組が1つのテストです。' },
        { q: '「latest が古い順に返してしまう」バグを見つけられるテストは？', code: '', choices: ['いちばん新しい日付が先頭に来ることを確かめる', '返る件数だけを確かめる', '関数が存在することを確かめる', 'エラーにならないことを確かめる'], answer: 0, why: '件数だけでは、並び順のバグは見つかりません。' },
      ],
      exercises: [
        { id: 'L1-04-p1', stage: 'parsons', mode: 'tests', prompt: '「新しい順に並ぶ」ことを確かめるテストを組み立ててください。正しい latest では通り、「古い順に返す」変異体では落ちる必要があります。使わない行が1つあります。',
          lines: ["test('新しい順に並ぶ', () => {", "  const txs = [{ date: '2026-04-01' }, { date: '2026-04-03' }];", '  const result = latest(txs, 2);', "  expect(result[0].date).toBe('2026-04-03');", '});'],
          distractors: ["  expect(result[0].date).toBe('2026-04-01');"],
          hints: ['準備 → 実行 → 確認の順です。', '新しい順なら、先頭に来るのはどちらの日付ですか？', "  expect(result[0].date).toBe('2026-04-03'); を使います。"] },
        { id: 'L1-04-p2', stage: 'parsons', mode: 'tests', prompt: '「n件だけ返す」ことを確かめるテストを組み立ててください。「1件多く返す」変異体で落ちる必要があります。使わない行が1つあります。',
          lines: ["test('n件だけ返す', () => {", "  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }, { date: '2026-04-03' }];", '  expect(latest(txs, 2).length).toBe(2);', '});'],
          distractors: ['  expect(latest(txs, 2).length).toBe(3);'],
          hints: ['3件の中から2件を指定しています。', '期待する件数はいくつでしょう？', '  expect(latest(txs, 2).length).toBe(2); です。'] },
        { id: 'L1-04-b1', stage: 'blank', mode: 'tests', prompt: '空欄を埋めて、いちばん新しい1件を確かめるテストにしてください。',
          template: R`test('いちばん新しい1件', () => {
  const txs = [{ date: '2026-01-10' }, { date: '2026-03-01' }, { date: '2026-02-01' }];
  expect(latest(txs, 1)[0].date).[[1]]([[2]]);
});`, answers: ['toBe', "'2026-03-01'"],
          hints: ['1つ目は文字列が同じかを確かめるメソッドです。', '2つ目は期待する日付です（引用符も必要）。', "toBe と '2026-03-01' です。"] },
        { id: 'L1-04-b2', stage: 'blank', mode: 'tests', prompt: '空欄を埋めて、latest が元の配列を並べ替えてしまわないことを確かめてください。',
          template: R`test('元の配列を並べ替えない', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }];
  latest(txs, 2);
  expect(txs[0].date).toBe([[1]]);
});`, answers: ["'2026-04-01'"],
          hints: ['latest を呼んだあと、txs の先頭は何であるべきですか？', '呼ぶ前と同じ値のはずです。', "'2026-04-01' です。"] },
        { id: 'L1-04-f1', stage: 'fix', mode: 'tests', prompt: 'このテストは正しい latest でも落ちます。テストの方を直してください。',
          code: R`test('0件を指定すると空', () => {
  expect(latest([{ date: '2026-04-01' }], 0)).toBe([]);
});`,
          solution: R`test('0件を指定すると空', () => {
  expect(latest([{ date: '2026-04-01' }], 0)).toEqual([]);
});`,
          hints: ['配列どうしを比べています。', 'toBe と toEqual の違いを思い出しましょう。', 'toBe を toEqual にします。'] },
        { id: 'L1-04-f2', stage: 'fix', mode: 'tests', prompt: 'このテストは期待値が間違っています。直してください。',
          code: R`test('件数より多く指定しても全件', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }];
  expect(latest(txs, 5).length).toBe(5);
});`,
          solution: R`test('件数より多く指定しても全件', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }];
  expect(latest(txs, 5).length).toBe(2);
});`,
          hints: ['取引は何件ありますか？', '5件指定しても、無いものは返せません。', 'toBe(5) を toBe(2) にします。'] },
        { id: 'L1-04-s1', stage: 'scratch', mode: 'tests', prompt: 'latest(txs, n) のテストをゼロから書いてください。正しい実装では全部通り、3つの変異体（古い順に返す／1件多く返す／元の配列を並べ替える）をすべて見つける必要があります。',
          code: R`// latest(txs, n): 日付の新しい順に n 件返す（元の配列は変えない）
test('…', () => {
  // ここに書く
});`,
          solution: R`test('新しい順', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-03' }];
  expect(latest(txs, 2)[0].date).toBe('2026-04-03');
});
test('n件だけ', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }, { date: '2026-04-03' }];
  expect(latest(txs, 2).length).toBe(2);
});
test('元の配列はそのまま', () => {
  const txs = [{ date: '2026-04-01' }, { date: '2026-04-02' }];
  latest(txs, 2);
  expect(txs[0].date).toBe('2026-04-01');
});`,
          hints: ['変異体ごとに「それを見つけるテスト」を1本ずつ書くと考えやすいです。', '並び順・件数・元の配列、の3つを確かめます。', '練習で組み立てた3つのテストを思い出しましょう。'] },
      ],
      // テストを書く課題で使う、正しい実装と変異体
      reference: R`function latest(txs, n) {
  return txs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
}`,
      mutants: [
        { id: 'asc', name: '古い順に返す', code: R`function latest(txs, n) {
  return txs.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)).slice(0, n);
}` },
        { id: 'plus1', name: '1件多く返す', code: R`function latest(txs, n) {
  return txs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n + 1);
}` },
        { id: 'mutate', name: '元の配列を並べ替える', code: R`function latest(txs, n) {
  return txs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
}` },
      ],
      gate: {
        what: { min: 2, points: [p('並び順・件数・元の配列を確かめる', ['新しい', '順', '件数', 'n件', '元の配列', '並べ替え', '変更']), p('どの欠陥を捕まえるか', ['変異', '欠陥', 'バグ', '間違', '壊れ', '検出', '見つけ'])] },
        risk: { min: 1, points: [p('同じ日付の取引の順序が決まらない', ['同じ日', '同日', '同点', '安定', '順序が決まらない']), p('テストが通っても正しいとは限らない', ['限らない', '網羅', '足りない', 'カバー', '境界']), p('n が0・負', ['負', '0件', 'ゼロ', 'マイナス'])] },
      },
      aiTask: {
        file: 'src/search.js', testFile: 'tests/search.test.js',
        ticket: '明細の検索のために、latest(txs, n) と、メモの部分一致で探す searchMemo(txs, keyword) を src/search.js に実装してほしい。',
        signature: 'latest(txs, n) / searchMemo(txs, keyword)',
        specGroups: [p('英字の大文字・小文字を区別しない', ['大文字', '小文字', '区別']), p('メモが無い取引の扱い', ['メモがない', 'メモが無い', 'メモなし', 'memoがない', 'memo が無い', '未設定', 'undefined'])],
        good: R`/** 日付の新しい順に n 件。元の配列は変えない */
function latest(txs, n) {
  return txs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
}

/** メモの部分一致。大文字・小文字は区別しない。メモが無い取引は対象外。キーワードが空なら全件 */
function searchMemo(txs, keyword) {
  const key = keyword.toLowerCase();
  return txs.filter((tx) => (tx.memo || '').toLowerCase().includes(key));
}
`,
        buggy: R`/** 日付の新しい順に n 件 */
function latest(txs, n) {
  return txs.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
}

/** メモの部分一致 */
function searchMemo(txs, keyword) {
  return txs.filter((tx) => tx.memo.includes(keyword));
}
`,
        buggyNote: '大文字・小文字の扱いと、メモが無い取引の扱いが仕様に無かったので、そのまま includes で比べています。',
        tests: R`test('新しい順に n 件', () => { expect(latest([{ date: '2026-04-01' }, { date: '2026-04-03' }, { date: '2026-04-02' }], 2).map((t) => t.date)).toEqual(['2026-04-03', '2026-04-02']); });
test('大文字・小文字を区別しない', () => { expect(searchMemo([{ memo: 'Amazon' }, { memo: '給与' }], 'amazon').length).toBe(1); });
test('メモが無い取引があっても落ちない', () => { expect(searchMemo([{ date: '2026-04-01' }, { memo: 'カフェ' }], 'カフェ').length).toBe(1); });
test('キーワードが空なら全件（メモがある取引）', () => { expect(searchMemo([{ memo: 'a' }, { memo: 'b' }], '').length).toBe(2); });
`,
        review: { min: 1, points: [p('メモが無いとエラーになる', ['メモ', 'memo', 'undefined', 'エラー']), p('大文字・小文字', ['大文字', '小文字'])] },
      },
      demos: [{ label: 'メモ検索', expr: "searchMemo([{ memo: '給与' }, { memo: 'コンビニ' }, { memo: 'Coffee' }], 'coffee').length + '件ヒット（coffee）'" }],
      tutorTips: [{ keys: ['tobe', 'toequal'], tip: '比べているのは数値・文字列ですか？ それとも配列・オブジェクトですか？' }, { keys: ['変異', 'ミュータント'], tip: 'その変異体は、正しい実装と比べて「何が」違う結果を返しますか？ その違いを確かめるテストは？' }],
    },
    // =====================================================================
    {
      id: 'L1-05', area: 'E', level: 1, prereq: ['L1-01'], estMinutes: 30,
      title: '小さなコミットとPR',
      story: '先輩の佐藤さんより：「練習銀行では main に直接コミットしないルールなんだ。ブランチを切って、小さなPRにして、CIが緑になってからマージ。コミットメッセージの規約チェックも作ってみよう。」',
      goals: ['ブランチ・コミット・PRの流れを説明できる', 'レビューしやすい小さな変更に分けられる'],
      evidence: 'スキルマップ E-L1／DORA 2025（小さなバッチ）',
      concept: [
        'ブランチは「mainから分かれた作業場所」です。作業はブランチで行い、PR（プルリクエスト）でレビューとCIを通してから main に入れます。',
        'コミットは「1つの意図」ごとに分けます。メッセージの1行目は「種類: 何をしたか」を50文字以内で書きます。',
        { code: R`feat: 残高照会を追加
fix: 振込額が0円でも通ってしまうのを直す
test: formatYen の境界値テストを足す
docs: README に動かし方を書く` },
        'PRが大きいほどレビューの見落としが増えます。目安は300行以内。大きくなったら分けましょう。問題が見つかったら、マージを「リバート」して安全に戻せます。',
      ],
      predict: [
        { q: 'main に直接コミットせず、ブランチを切る主な理由は？', code: '', choices: ['レビューとCIを通してから main に入れるため', '処理が速くなるため', '容量を節約するため', 'Gitでは main に書き込めないため'], answer: 0, why: 'main は常に動く状態に保ちたいので、確かめてから入れます。' },
        { q: '良いコミットメッセージは？', code: '', choices: ['fix: 振込額が0円でも通ってしまうのを直す', 'いろいろ修正', 'WIP', 'update'], answer: 0, why: '種類と「何をしたか」が1行で分かります。' },
        { q: 'マージ後に不具合が見つかった。まずやる安全な手当ては？', code: '', choices: ['そのPRをリバートして元に戻す', 'main を消して作り直す', '黙って直す', '強制pushで履歴を書き換える'], answer: 0, why: 'リバートは「元に戻す」という新しいコミットを作るので、履歴を壊しません。' },
      ],
      exercises: [
        { id: 'L1-05-p1', stage: 'parsons', prompt: 'コミットメッセージの1行目が「種類: 内容」の形かを確かめる isValidCommitMessage を組み立ててください。使わない行が1つあります。',
          lines: ['function isValidCommitMessage(msg) {', R`  const summary = msg.split('\n')[0];`, R`  return /^(feat|fix|docs|test|refactor|chore): \S/.test(summary);`, '}'],
          distractors: ['  return msg.length > 0;'],
          tests: R`test('feat は OK', () => { expect(isValidCommitMessage('feat: 残高を表示')).toBe(true); });
test('種類が無いと NG', () => { expect(isValidCommitMessage('残高を表示')).toBe(false); });
test('コロンの後に空白が無いと NG', () => { expect(isValidCommitMessage('fix:直した')).toBe(false); });`,
          hints: ['1行目だけを取り出してから確かめます。', '空でないことを確かめるだけでは足りません。', '正規表現 .test(summary) の行を使います。'] },
        { id: 'L1-05-p2', stage: 'parsons', prompt: '1行目が50文字を超えたら NG にしてください（本文＝2行目以降は長くてもよい）。使わない行が1つあります。',
          lines: ['function isValidCommitMessage(msg) {', R`  const summary = msg.split('\n')[0];`, '  if (summary.length > 50) return false;', R`  return /^(feat|fix|docs|test|refactor|chore): \S/.test(summary);`, '}'],
          distractors: ['  if (msg.length > 50) return false;'],
          tests: R`test('1行目が長いと NG', () => { expect(isValidCommitMessage('feat: ' + 'あ'.repeat(50))).toBe(false); });
test('本文が長くても OK', () => { expect(isValidCommitMessage('feat: 残高を表示\n\n' + 'い'.repeat(200))).toBe(true); });`,
          hints: ['長さを確かめるのは、メッセージ全体ですか？ 1行目ですか？', '本文が長いと、msg.length は50を超えます。', '  if (summary.length > 50) return false; を使います。'] },
        { id: 'L1-05-b1', stage: 'blank', prompt: '空欄を埋めて、ブランチ名が「feature/」か「fix/」で始まり、英小文字・数字・ハイフンだけかを確かめてください。',
          template: R`function isValidBranchName(name) {
  return /^(feature|fix)\/[a-z0-9-]+$/.[[1]](name);
}`, answers: ['test'],
          tests: R`test('feature/balance', () => { expect(isValidBranchName('feature/balance')).toBe(true); });
test('大文字は NG', () => { expect(isValidBranchName('Feature/X')).toBe(false); });
test('main は NG', () => { expect(isValidBranchName('main')).toBe(false); });`,
          hints: ['正規表現が文字列に当てはまるか true/false で返すメソッドです。', '4文字の英単語です。', 'test です。'] },
        { id: 'L1-05-b2', stage: 'blank', prompt: '空欄を埋めて、チケット名からブランチ名を作ってください（例: "RG 12 Balance" → "feature/rg-12-balance"）。',
          template: R`function branchFor(ticket) {
  return 'feature/' + ticket.toLowerCase().replace(/[^a-z0-9]+/g, [[1]]);
}`, answers: ["'-'"],
          tests: R`test('空白はハイフンに', () => { expect(branchFor('RG 12 Balance')).toBe('feature/rg-12-balance'); });`,
          hints: ['英数字以外のかたまりを、何に置き換えたいですか？', '文字列なので引用符が必要です。', "'-' です。"] },
        { id: 'L1-05-f1', stage: 'fix', prompt: 'docs や test のコミットまで NG になってしまいます。直してください。',
          code: R`function isValidCommitMessage(msg) {
  const summary = msg.split('\n')[0];
  return /^(feat|fix): \S/.test(summary);
}`,
          solution: R`function isValidCommitMessage(msg) {
  const summary = msg.split('\n')[0];
  return /^(feat|fix|docs|test|refactor|chore): \S/.test(summary);
}`,
          tests: R`test('docs は OK', () => { expect(isValidCommitMessage('docs: README を更新')).toBe(true); });
test('test は OK', () => { expect(isValidCommitMessage('test: 境界値を追加')).toBe(true); });
test('種類が無いと NG', () => { expect(isValidCommitMessage('README を更新')).toBe(false); });`,
          hints: ['許される種類の一覧を見ましょう。', '正規表現の ( ) の中に、足りない種類があります。', 'feat|fix|docs|test|refactor|chore にします。'] },
        { id: 'L1-05-f2', stage: 'fix', prompt: '空白が2か所以上あると、最初の1か所しかハイフンになりません。直してください。',
          code: R`function branchFor(ticket) {
  return 'feature/' + ticket.toLowerCase().replace(/[^a-z0-9]+/, '-');
}`,
          solution: R`function branchFor(ticket) {
  return 'feature/' + ticket.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}`,
          tests: R`test('全部の空白をハイフンに', () => { expect(branchFor('RG 12 Balance')).toBe('feature/rg-12-balance'); });`,
          hints: ['replace は、そのままだと最初の1つだけ置き換えます。', '正規表現に「全部」を表すフラグを付けます。', '/[^a-z0-9]+/g にします。'] },
        { id: 'L1-05-s1', stage: 'scratch', prompt: 'prSizeWarning(files, limit) を書いてください。files は [{ path, added, removed }]。追加と削除の行数の合計が limit（省略時300）を超えたら「差分が{合計}行あります。{limit}行以下に分けましょう」を返し、超えなければ null を返します。',
          code: R`/** PRの差分が大きすぎたら警告文を返す（FR-043） */
function prSizeWarning(files, limit = 300) {
  // ここに書く
}`,
          solution: R`function prSizeWarning(files, limit = 300) {
  const total = files.reduce((sum, f) => sum + f.added + f.removed, 0);
  return total > limit ? '差分が' + total + '行あります。' + limit + '行以下に分けましょう' : null;
}`,
          tests: R`test('ちょうど300行は OK', () => { expect(prSizeWarning([{ path: 'a.js', added: 200, removed: 100 }])).toBeNull(); });
test('301行は警告', () => { expect(prSizeWarning([{ path: 'a.js', added: 201, removed: 100 }])).toBe('差分が301行あります。300行以下に分けましょう'); });
test('複数ファイルを合計', () => { expect(prSizeWarning([{ path: 'a.js', added: 10, removed: 0 }, { path: 'b.js', added: 5, removed: 5 }], 15)).toBe('差分が20行あります。15行以下に分けましょう'); });
test('ファイルが無ければ OK', () => { expect(prSizeWarning([])).toBeNull(); });`,
          hints: ['まず合計を出し、次に limit と比べます。', 'reduce で added と removed を足していきましょう。「超えたら」なので > です。', 'const total = files.reduce((sum, f) => sum + f.added + f.removed, 0);'] },
      ],
      gate: {
        what: { min: 2, points: [p('追加と削除の行数を合計する', ['合計', '足し', '追加', '削除', '行数', 'added', 'removed']), p('上限を超えたら警告文を返す', ['超', '警告', 'メッセージ', 'null', '300'])] },
        risk: { min: 1, points: [p('行数が数値でない・負', ['数値', '負', 'undefined', 'nan']), p('自動生成ファイルまで数えてしまう', ['自動生成', 'lock', 'ロック', '生成物', 'バイナリ']), p('ちょうど上限の境界', ['ちょうど', '境界', '以下', '未満', '以上'])] },
      },
      aiTask: {
        file: 'src/commit.js', testFile: 'tests/commit.test.js',
        ticket: 'CIでコミットメッセージとブランチ名を確かめたい。isValidCommitMessage(msg) と isValidBranchName(name) を src/commit.js に実装してほしい。',
        signature: 'isValidCommitMessage(msg) / isValidBranchName(name)',
        specGroups: [p('1行目は50文字以内', ['50', '文字数', '長さ']), p('長さを数えるのは1行目だけ（本文は対象外）', ['1行目', '一行目', '本文', '2行目', '改行'])],
        good: R`/** 1行目が「種類: 内容」で50文字以内なら true。本文（2行目以降）の長さは問わない */
function isValidCommitMessage(msg) {
  const summary = msg.split('\n')[0];
  if (summary.length > 50) return false;
  return /^(feat|fix|docs|test|refactor|chore): \S/.test(summary);
}

/** feature/ か fix/ で始まり、英小文字・数字・ハイフンだけなら true */
function isValidBranchName(name) {
  return /^(feature|fix)\/[a-z0-9-]+$/.test(name);
}
`,
        buggy: R`/** コミットメッセージが規約どおりなら true */
function isValidCommitMessage(msg) {
  return msg.length <= 50 && /^(feat|fix|docs|test|refactor|chore): \S/.test(msg);
}

/** ブランチ名が規約どおりなら true */
function isValidBranchName(name) {
  return /^(feature|fix)\/[a-z0-9-]+$/.test(name);
}
`,
        buggyNote: '長さを数える範囲が仕様に無かったので、メッセージ全体を50文字以内としました。',
        tests: R`test('規約どおり', () => { expect(isValidCommitMessage('feat: 残高照会を追加')).toBe(true); });
test('本文が長くても OK', () => { expect(isValidCommitMessage('fix: 0円振込を止める\n\n' + '詳しい説明。'.repeat(20))).toBe(true); });
test('1行目が長いと NG', () => { expect(isValidCommitMessage('feat: ' + 'あ'.repeat(60))).toBe(false); });
test('ブランチ名', () => { expect([isValidBranchName('feature/l1-05'), isValidBranchName('main')]).toEqual([true, false]); });
`,
        review: { min: 1, points: [p('本文まで長さに数えてしまう', ['本文', '全体', '2行目', '改行']), p('規約の種類が増えたとき', ['種類', '増え', '規約'])] },
      },
      demos: [{ label: 'コミット規約チェック', expr: "isValidCommitMessage('feat: 残高照会を追加') ? 'feat: 残高照会を追加 → OK' : 'NG'" }],
      tutorTips: [{ keys: ['ブランチ', 'branch'], tip: 'いまの変更は、main とは別の場所で作業していますか？ それを確かめるにはどの画面を見ますか？' }, { keys: ['正規表現', 'regex'], tip: 'その正規表現の ^ と $ を外すと、どんな文字列まで通ってしまうと思いますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-01', area: 'A', level: 2, prereq: ['L1-02', 'L1-04'], estMinutes: 35,
      title: 'AIなしでバグを直す',
      story: '先輩の佐藤さんより：「振込の関数でおかしな残高が出るって報告が来た。AIに聞く前に、再現 → 期待と実際の差 → 仮説 → 最小の修正、の順で自分で追ってみよう。」',
      goals: ['テストの期待値と実際の値の差から原因を絞り込める', 'オブジェクトの参照と書き換えを説明できる'],
      evidence: 'Anthropic RCT 2026（AI支援群はデバッグ力が落ちやすい）／スキルマップ A-L2',
      concept: [
        'デバッグは「①再現する ②期待と実際の差を読む ③仮説を1つ立てる ④最小の修正 ⑤テストで確かめる」の順で進めます。',
        'オブジェクトや配列を = で代入しても、コピーにはなりません。同じものを2つの名前で指しているだけです。',
        { code: R`const a = { x: 1 };
const b = a;      // コピーではない
b.x = 2;
a.x;              // → 2

const c = { ...a }; // 浅いコピー
c.x = 3;
a.x;              // → 2 のまま` },
        '存在しないキーを += すると undefined + 数値 = NaN になります。お金の計算で NaN が出たら、まず「無いキー」を疑いましょう。',
      ],
      predict: [
        { q: 'このコードの a.x は？', code: R`const a = { x: 1 };
const b = a;
b.x = 2;`, choices: ['2', '1', 'undefined', 'エラー'], answer: 0, why: 'b は a と同じオブジェクトを指しているので、a.x も 2 になります。' },
        { q: 'このコードの a.length は？', code: R`const a = [1, 2];
const b = [...a];
b.push(3);`, choices: ['2', '3', '1', 'エラー'], answer: 0, why: '[...a] は新しい配列なので、a は変わりません。' },
        { q: 'このコードの値は？', code: R`const acc = {};
acc.x += 100;
acc.x`, choices: ['NaN', '100', 'undefined', '0'], answer: 0, why: 'acc.x は undefined。undefined + 100 は NaN です。' },
      ],
      exercises: [
        { id: 'L2-01-p1', stage: 'parsons', prompt: '元の accounts を書き換えずに、振込後の新しい残高を返す applyTransfer を組み立ててください。使わない行が1つあります。',
          lines: ['function applyTransfer(accounts, t) {', '  const next = { ...accounts };', '  next[t.from] -= t.amount;', '  next[t.to] += t.amount;', '  return next;', '}'],
          distractors: ['  const next = accounts;'],
          tests: R`test('振込後の残高', () => { expect(applyTransfer({ a: 1000, b: 0 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 700, b: 300 }); });
test('元の残高は変えない', () => {
  const accounts = { a: 1000, b: 0 };
  applyTransfer(accounts, { from: 'a', to: 'b', amount: 300 });
  expect(accounts).toEqual({ a: 1000, b: 0 });
});`,
          hints: ['まずコピーを作り、コピーの方を変えます。', '= だけではコピーになりません。', '  const next = { ...accounts }; を使います。'] },
        { id: 'L2-01-p2', stage: 'parsons', prompt: '残高が足りなければエラーにする applyTransfer を組み立ててください。残高ちょうどの振込はできます。使わない行が1つあります。',
          lines: ['function applyTransfer(accounts, t) {', '  if (accounts[t.from] < t.amount) {', "    throw new Error('残高が足りません');", '  }', '  const next = { ...accounts };', '  next[t.from] -= t.amount;', '  next[t.to] += t.amount;', '  return next;', '}'],
          distractors: ['  if (accounts[t.from] <= t.amount) {'],
          tests: R`test('残高ちょうどは OK', () => { expect(applyTransfer({ a: 300, b: 0 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 0, b: 300 }); });
test('足りなければエラー', () => { expect(() => applyTransfer({ a: 100, b: 0 }, { from: 'a', to: 'b', amount: 300 })).toThrow('足りません'); });`,
          hints: ['まず確かめてから、残高を動かします。', '残高ちょうど（300円で300円の振込）は通したいはずです。', '< の方の if を使います。'] },
        { id: 'L2-01-b1', stage: 'blank', prompt: '空欄を埋めて、元の accounts を書き換えないようにしてください。',
          template: R`function applyTransfer(accounts, t) {
  const next = { [[1]]accounts };
  next[t.from] -= t.amount;
  next[t.to] += t.amount;
  return next;
}`, answers: ['...'],
          tests: R`test('元の残高は変えない', () => {
  const accounts = { a: 1000, b: 0 };
  const next = applyTransfer(accounts, { from: 'a', to: 'b', amount: 1 });
  expect([accounts.a, next.a]).toEqual([1000, 999]);
});`,
          hints: ['オブジェクトの中身を広げてコピーする書き方です。', '点が3つです。', '... です。'] },
        { id: 'L2-01-b2', stage: 'blank', prompt: '空欄を埋めて、同じ口座どうしの振込はできないようにしてください。',
          template: R`function canTransfer(accounts, t) {
  return t.from [[1]] t.to && accounts[t.from] >= t.amount;
}`, answers: ['!=='],
          tests: R`test('同じ口座は不可', () => { expect(canTransfer({ a: 1000 }, { from: 'a', to: 'a', amount: 1 })).toBe(false); });
test('別の口座で残高があれば可', () => { expect(canTransfer({ a: 1000, b: 0 }, { from: 'a', to: 'b', amount: 1 })).toBe(true); });`,
          hints: ['from と to が「違う」ことを確かめる比較です。', '厳密に違うかを比べる演算子です。', '!== です。'] },
        { id: 'L2-01-f1', stage: 'fix', prompt: '振り込むと、振込元の残高が増えてしまいます。直してください。',
          code: R`function applyTransfer(accounts, t) {
  const next = { ...accounts };
  next[t.from] += t.amount;
  next[t.to] -= t.amount;
  return next;
}`,
          solution: R`function applyTransfer(accounts, t) {
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] += t.amount;
  return next;
}`,
          tests: R`test('振込後の残高', () => { expect(applyTransfer({ a: 1000, b: 0 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 700, b: 300 }); });`,
          hints: ['期待値 { a: 700, b: 300 } と実際の値を比べましょう。', 'from と to、それぞれ増えるべきか減るべきかを確かめます。', '+= と -= が逆です。'] },
        { id: 'L2-01-f2', stage: 'fix', prompt: '初めて振り込む口座だと残高が NaN になります。直してください。',
          code: R`function applyTransfer(accounts, t) {
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] += t.amount;
  return next;
}`,
          solution: R`function applyTransfer(accounts, t) {
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] = (next[t.to] ?? 0) + t.amount;
  return next;
}`,
          tests: R`test('新しい口座への振込', () => { expect(applyTransfer({ a: 1000 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 700, b: 300 }); });
test('既存の口座への振込', () => { expect(applyTransfer({ a: 1000, b: 5 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 700, b: 305 }); });`,
          hints: ['next["b"] が存在しないとき、その値は何ですか？', 'undefined + 300 は NaN です。無いときは0として扱いましょう。', 'next[t.to] = (next[t.to] ?? 0) + t.amount;'] },
        { id: 'L2-01-s1', stage: 'scratch', prompt: 'applyTransfer(accounts, t) をゼロから書いてください。①金額が1以上の整数でなければ「金額が正しくありません」②from と to が同じなら「同じ口座には振り込めません」③残高が足りなければ「残高が足りません」のエラー。元の accounts は変えず、初めての振込先にも振り込めます。',
          code: R`/** 振込後の新しい残高を返す（元の accounts は変えない） */
function applyTransfer(accounts, t) {
  // ここに書く
}`,
          solution: R`function applyTransfer(accounts, t) {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
  if (t.from === t.to) throw new Error('同じ口座には振り込めません');
  if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] = (next[t.to] ?? 0) + t.amount;
  return next;
}`,
          tests: R`test('振込後の残高', () => { expect(applyTransfer({ a: 1000, b: 0 }, { from: 'a', to: 'b', amount: 300 })).toEqual({ a: 700, b: 300 }); });
test('元の残高は変えない', () => {
  const accounts = { a: 1000 };
  applyTransfer(accounts, { from: 'a', to: 'b', amount: 300 });
  expect(accounts).toEqual({ a: 1000 });
});
test('初めての振込先', () => { expect(applyTransfer({ a: 1000 }, { from: 'a', to: 'b', amount: 1000 })).toEqual({ a: 0, b: 1000 }); });
test('0円はエラー', () => { expect(() => applyTransfer({ a: 1000 }, { from: 'a', to: 'b', amount: 0 })).toThrow('金額'); });
test('小数はエラー', () => { expect(() => applyTransfer({ a: 1000 }, { from: 'a', to: 'b', amount: 1.5 })).toThrow('金額'); });
test('同じ口座はエラー', () => { expect(() => applyTransfer({ a: 1000 }, { from: 'a', to: 'a', amount: 1 })).toThrow('同じ口座'); });
test('残高不足はエラー', () => { expect(() => applyTransfer({ a: 100 }, { from: 'a', to: 'b', amount: 101 })).toThrow('残高'); });`,
          hints: ['エラーの確認を3つ先に並べ、最後に残高を動かします。', 'Number.isInteger で整数かどうかを確かめられます。', 'next[t.to] = (next[t.to] ?? 0) + t.amount;'] },
      ],
      gate: {
        what: { min: 2, points: [p('振込元から引き、振込先に足す', ['引', '足', '移', '振替', '振込', '減', '増']), p('元のオブジェクトを書き換えない', ['コピー', '書き換えない', '新しい', 'イミュータブル', '不変', '元の'])] },
        risk: { min: 1, points: [p('同時に2回実行されると二重に引かれる', ['同時', '二重', '2回', '並行', '排他', '競合']), p('存在しない振込元口座', ['存在しない', '無い口座', 'ない口座', 'undefined', '口座番号']), p('大きすぎる金額・上限', ['上限', '大きい', '限度'])] },
      },
      aiTask: {
        file: 'src/transfer.js', testFile: 'tests/transfer.test.js',
        ticket: 'まとめ振込のために、applyTransfer(accounts, t) と、複数の振込を順に適用する applyTransfers(accounts, list) を src/transfer.js に実装してほしい。結果は { ok: true, accounts } か { ok: false, failedIndex, reason, accounts }。',
        signature: 'applyTransfer(accounts, t) / applyTransfers(accounts, list)',
        specGroups: [p('途中で失敗したら全部取り消す（元の残高に戻す）', ['全部取り消', 'すべて取り消', '取り消', 'ロールバック', '元に戻', '元の残高', 'アトミック', '全部なかった']), p('同じ口座どうしの振込はエラー', ['同じ口座', '同一口座', '自分の口座', '自分自身'])],
        good: R`/** 振込後の新しい残高を返す（元の accounts は変えない） */
function applyTransfer(accounts, t) {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
  if (t.from === t.to) throw new Error('同じ口座には振り込めません');
  if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] = (next[t.to] ?? 0) + t.amount;
  return next;
}

/** 複数の振込を順に適用する。1件でも失敗したら全部取り消し、元の残高を返す */
function applyTransfers(accounts, list) {
  let current = accounts;
  for (let i = 0; i < list.length; i++) {
    try {
      current = applyTransfer(current, list[i]);
    } catch (e) {
      return { ok: false, failedIndex: i, reason: e.message, accounts };
    }
  }
  return { ok: true, accounts: current };
}
`,
        buggy: R`/** 振込後の新しい残高を返す */
function applyTransfer(accounts, t) {
  if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
  if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
  const next = { ...accounts };
  next[t.from] -= t.amount;
  next[t.to] = (next[t.to] ?? 0) + t.amount;
  return next;
}

/** 複数の振込を順に適用する */
function applyTransfers(accounts, list) {
  let current = accounts;
  for (let i = 0; i < list.length; i++) {
    try {
      current = applyTransfer(current, list[i]);
    } catch (e) {
      return { ok: false, failedIndex: i, reason: e.message, accounts: current };
    }
  }
  return { ok: true, accounts: current };
}
`,
        buggyNote: '途中で失敗したときの扱いと、同じ口座どうしの振込が仕様に無かったので、成功した分までの残高を返しています。',
        tests: R`test('まとめて成功', () => {
  const r = applyTransfers({ a: 1000, b: 0, c: 0 }, [{ from: 'a', to: 'b', amount: 300 }, { from: 'a', to: 'c', amount: 200 }]);
  expect(r).toEqual({ ok: true, accounts: { a: 500, b: 300, c: 200 } });
});
test('途中で失敗したら全部取り消す', () => {
  const r = applyTransfers({ a: 1000, b: 0 }, [{ from: 'a', to: 'b', amount: 300 }, { from: 'a', to: 'b', amount: 5000 }]);
  expect([r.ok, r.failedIndex, r.accounts]).toEqual([false, 1, { a: 1000, b: 0 }]);
});
test('同じ口座はエラー', () => { expect(() => applyTransfer({ a: 1000 }, { from: 'a', to: 'a', amount: 1 })).toThrow('同じ口座'); });
`,
        review: { min: 1, points: [p('失敗時に途中までの残高を返してしまう', ['途中', '取り消', '戻', 'current', '部分']), p('同じ口座への振込を止めていない', ['同じ口座', '同一'])] },
      },
      demos: [{ label: '振込', expr: "(() => { const r = applyTransfers({ '1000001': 50000, '1000002': 0 }, [{ from: '1000001', to: '1000002', amount: 12000 }]); return r.ok ? '12,000円を振込 → 残高 ' + formatYen(r.accounts['1000001']) : r.reason; })()" }],
      tutorTips: [{ keys: ['nan'], tip: 'NaN が出た行の直前で、足し算の左右それぞれの値は何でしたか？' }, { keys: ['コピー', '参照', '書き換'], tip: 'その変数は新しいオブジェクトですか？ それとも元のオブジェクトを指していますか？ どうやって確かめますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-02', area: 'F', level: 2, prereq: ['L2-01'], estMinutes: 35,
      title: '入力を検証する',
      story: 'セキュリティ担当の鈴木さんより：「振込フォームの入力は、画面からでも API からでも“信用しない”のが原則。全部の誤りをまとめて返して、利用者が一度で直せるようにしてね。」',
      goals: ['入力の型・形式・範囲を検証できる', 'すべての誤りをまとめて返す設計を説明できる'],
      evidence: 'スキルマップ F-L1〜L2／OWASP（入力検証）',
      concept: [
        '入力は「型 → 形式 → 範囲 → 業務ルール」の順に確かめます。画面での確認は親切のため、サーバー側の確認は安全のためで、両方が必要です。',
        { code: R`Number('12a');        // → NaN
Number('');           // → 0   （空なのに0になる！）
Number('1e3');        // → 1000（指数表記も通る）
/^\d+$/.test('1000'); // → true（数字だけか確かめる）` },
        '最初の誤りで止めると、利用者は1つ直すたびに送信し直すことになります。誤りは配列にまとめて返しましょう。',
        '「許すものを決める（許可リスト）」方が「だめなものを並べる（拒否リスト）」より安全です。',
      ],
      predict: [
        { q: 'このコードの値は？', code: R`Number('12a')`, choices: ['NaN', '12', '0', 'エラー'], answer: 0, why: '数字として読めない文字が混ざると NaN になります。' },
        { q: 'このコードの値は？', code: R`Number('')`, choices: ['0', 'NaN', 'undefined', '""'], answer: 0, why: '空文字は0になります。「入力なし」を0円と取り違える原因になります。' },
        { q: 'このコードの値は？', code: R`/^\d{7}$/.test('123456')`, choices: ['false', 'true', '6', 'エラー'], answer: 0, why: '\\d{7} はちょうど7桁の数字です。6桁なので false です。' },
      ],
      exercises: [
        { id: 'L2-02-p1', stage: 'parsons', prompt: '口座番号が「7桁の数字の文字列」かを確かめる isAccountNumber を組み立ててください。使わない行が1つあります。',
          lines: ['function isAccountNumber(s) {', R`  return typeof s === 'string' && /^\d{7}$/.test(s);`, '}'],
          distractors: ['  return s.length === 7;'],
          tests: R`test('7桁の数字', () => { expect(isAccountNumber('1234567')).toBe(true); });
test('英字が混ざると NG', () => { expect(isAccountNumber('123456a')).toBe(false); });
test('数値型は NG', () => { expect(isAccountNumber(1234567)).toBe(false); });`,
          hints: ['長さだけでなく、中身が数字かも確かめます。', '数値型の 1234567 には .length がありません。', '正規表現を使う行を選びましょう。'] },
        { id: 'L2-02-p2', stage: 'parsons', prompt: '入力された金額の文字列を数値にし、数字だけでなければ null を返す parseAmount を組み立ててください。使わない行が1つあります。',
          lines: ['function parseAmount(text) {', '  const trimmed = String(text).trim();', R`  if (!/^\d+$/.test(trimmed)) return null;`, '  return Number(trimmed);', '}'],
          distractors: ['  return parseInt(text);'],
          tests: R`test('1000', () => { expect(parseAmount('1000')).toBe(1000); });
test('前後の空白は許す', () => { expect(parseAmount(' 50 ')).toBe(50); });
test('英字が混ざると null', () => { expect(parseAmount('12a')).toBeNull(); });
test('マイナスは null', () => { expect(parseAmount('-5')).toBeNull(); });
test('小数は null', () => { expect(parseAmount('1.5')).toBeNull(); });`,
          hints: ['空白を取る → 形式を確かめる → 数値にする、の順です。', 'parseInt("12a") は 12 を返してしまいます。', 'parseInt の行は使いません。'] },
        { id: 'L2-02-b1', stage: 'blank', prompt: '空欄を埋めて、金額が1円以上100万円以下の整数かを確かめてください。',
          template: R`function isValidAmount(n) {
  return Number.[[1]](n) && n > 0 && n <= [[2]];
}`, answers: ['isInteger', '1000000'],
          tests: R`test('100万円は OK', () => { expect(isValidAmount(1000000)).toBe(true); });
test('100万1円は NG', () => { expect(isValidAmount(1000001)).toBe(false); });
test('0円は NG', () => { expect(isValidAmount(0)).toBe(false); });
test('小数は NG', () => { expect(isValidAmount(1.5)).toBe(false); });`,
          hints: ['1つ目は「整数か」を確かめる Number のメソッドです。', '2つ目は上限（100万）の数値です。', 'isInteger と 1000000 です。'] },
        { id: 'L2-02-b2', stage: 'blank', prompt: '空欄を埋めて、誤りを配列に集めてください。',
          template: R`function validateTransfer(input) {
  const errors = [];
  if (!isAccountNumber(input.from)) errors.push('from');
  if (!isAccountNumber(input.to)) errors.[[1]]('to');
  return errors;
}
function isAccountNumber(s) {
  return typeof s === 'string' && /^\d{7}$/.test(s);
}`, answers: ['push'],
          tests: R`test('両方だめ', () => { expect(validateTransfer({ from: 'x', to: 'y' })).toEqual(['from', 'to']); });
test('両方 OK', () => { expect(validateTransfer({ from: '1234567', to: '7654321' })).toEqual([]); });`,
          hints: ['配列の最後に要素を足すメソッドです。', '1行上で同じことをしています。', 'push です。'] },
        { id: 'L2-02-f1', stage: 'fix', prompt: '空の入力が0円として、"1e3" が1000円として通ってしまいます。直してください。',
          code: R`function parseAmount(text) {
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}`,
          solution: R`function parseAmount(text) {
  const trimmed = String(text).trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}`,
          tests: R`test('空は null', () => { expect(parseAmount('')).toBeNull(); });
test('指数表記は null', () => { expect(parseAmount('1e3')).toBeNull(); });
test('1000', () => { expect(parseAmount('1000')).toBe(1000); });`,
          hints: ['Number() は思ったより多くの文字列を数値にします。', '先に「数字だけか」を確かめましょう。', R`if (!/^\d+$/.test(trimmed)) return null;`] },
        { id: 'L2-02-f2', stage: 'fix', prompt: '誤りが2つあっても1つしか返ってきません。全部返すように直してください。',
          code: R`function validateTransfer(input) {
  if (!/^\d{7}$/.test(input.from)) return ['from'];
  if (!/^\d{7}$/.test(input.to)) return ['to'];
  return [];
}`,
          solution: R`function validateTransfer(input) {
  const errors = [];
  if (!/^\d{7}$/.test(input.from)) errors.push('from');
  if (!/^\d{7}$/.test(input.to)) errors.push('to');
  return errors;
}`,
          tests: R`test('両方だめ', () => { expect(validateTransfer({ from: 'x', to: 'y' })).toEqual(['from', 'to']); });
test('to だけだめ', () => { expect(validateTransfer({ from: '1234567', to: 'y' })).toEqual(['to']); });`,
          hints: ['最初の if で return すると、そこで終わります。', '配列を用意して、誤りを足していきましょう。', "const errors = []; を作り、errors.push('from') にします。"] },
        { id: 'L2-02-s1', stage: 'scratch', prompt: 'validateTransfer(input) を書いてください。input は { from, to, amount }（amount は文字列）。誤りのコードを次の順で配列にして返します: "from"（7桁の数字でない）、"to"（同）、"same"（from と to がどちらも正しく、同じ）、"amount"（前後の空白を除いて数字だけでない、または1〜1,000,000の範囲外）。',
          code: R`/** 振込の入力を検証し、誤りのコードの配列を返す（無ければ []） */
function validateTransfer(input) {
  // ここに書く
}`,
          solution: R`function validateTransfer(input) {
  const errors = [];
  const isAcc = (s) => typeof s === 'string' && /^\d{7}$/.test(s);
  if (!isAcc(input.from)) errors.push('from');
  if (!isAcc(input.to)) errors.push('to');
  if (isAcc(input.from) && input.from === input.to) errors.push('same');
  const text = String(input.amount ?? '').trim();
  const amount = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(amount >= 1 && amount <= 1000000)) errors.push('amount');
  return errors;
}`,
          tests: R`test('正しい入力', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: '5000' })).toEqual([]); });
test('前後の空白は許す', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: ' 5000 ' })).toEqual([]); });
test('全部だめ', () => { expect(validateTransfer({ from: '1', to: 'x', amount: 'abc' })).toEqual(['from', 'to', 'amount']); });
test('同じ口座', () => { expect(validateTransfer({ from: '1000001', to: '1000001', amount: '1' })).toEqual(['same']); });
test('上限ちょうどは OK', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: '1000000' })).toEqual([]); });
test('上限超えと0円', () => { expect([validateTransfer({ from: '1000001', to: '1000002', amount: '1000001' }), validateTransfer({ from: '1000001', to: '1000002', amount: '0' })]).toEqual([['amount'], ['amount']]); });
test('金額が無い', () => { expect(validateTransfer({ from: '1000001', to: '1000002' })).toEqual(['amount']); });`,
          hints: ['誤りを集める配列を用意し、確認を上から順に並べます。', 'same は「両方とも正しい口座番号」のときだけ確かめます。', R`const amount = /^\d+$/.test(text) ? Number(text) : NaN;`] },
      ],
      gate: {
        what: { min: 2, points: [p('すべての誤りをまとめて返す', ['すべて', '全部', 'まとめ', '配列', '一覧', '複数']), p('口座番号・金額・同一口座を確かめる', ['口座', '7桁', '金額', '同じ', '範囲', '上限'])] },
        risk: { min: 1, points: [p('画面だけでなくサーバー側でも検証が要る', ['サーバー', 'バックエンド', '改ざん', '画面だけ', 'クライアント', '信用']), p('全角数字・前後の空白', ['全角', '空白', 'スペース', 'trim']), p('上限は業務ルールで変わる', ['上限', '限度', '設定', '変わる', 'ルール'])] },
      },
      aiTask: {
        file: 'src/validate.js', testFile: 'tests/validate.test.js',
        ticket: '振込フォームの検証のために、validateTransfer(input) と、誤りのコードを日本語の文にする errorMessages(codes) を src/validate.js に実装してほしい。',
        signature: 'validateTransfer(input) → ["from" | "to" | "same" | "amount"] / errorMessages(codes)',
        specGroups: [p('全角数字・前後の空白を受け付ける', ['全角', '空白', '前後', 'スペース']), p('同じ口座どうしは誤り', ['同じ口座', '同一口座', '同一', '自分の口座'])],
        good: R`/** 全角の数字を半角にする */
function toHalfWidth(s) {
  return s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
}

/** 振込の入力を検証し、誤りのコードの配列を返す。金額の前後の空白・全角数字は受け付ける */
function validateTransfer(input) {
  const errors = [];
  const isAcc = (s) => typeof s === 'string' && /^\d{7}$/.test(s);
  if (!isAcc(input.from)) errors.push('from');
  if (!isAcc(input.to)) errors.push('to');
  if (isAcc(input.from) && input.from === input.to) errors.push('same');
  const text = toHalfWidth(String(input.amount ?? '').trim());
  const amount = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(amount >= 1 && amount <= 1000000)) errors.push('amount');
  return errors;
}

const ERROR_MESSAGES = {
  from: '振込元の口座番号は7桁の数字です',
  to: '振込先の口座番号は7桁の数字です',
  same: '同じ口座には振り込めません',
  amount: '金額は1円以上100万円以下の整数です',
};

/** 誤りのコードを日本語の文にする */
function errorMessages(codes) {
  return codes.map((c) => ERROR_MESSAGES[c] || '入力を確かめてください');
}
`,
        buggy: R`/** 振込の入力を検証し、誤りのコードの配列を返す */
function validateTransfer(input) {
  const errors = [];
  const isAcc = (s) => typeof s === 'string' && /^\d{7}$/.test(s);
  if (!isAcc(input.from)) errors.push('from');
  if (!isAcc(input.to)) errors.push('to');
  const text = String(input.amount ?? '');
  const amount = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(amount >= 1 && amount <= 1000000)) errors.push('amount');
  return errors;
}

const ERROR_MESSAGES = {
  from: '振込元の口座番号は7桁の数字です',
  to: '振込先の口座番号は7桁の数字です',
  same: '同じ口座には振り込めません',
  amount: '金額は1円以上100万円以下の整数です',
};

/** 誤りのコードを日本語の文にする */
function errorMessages(codes) {
  return codes.map((c) => ERROR_MESSAGES[c] || '入力を確かめてください');
}
`,
        buggyNote: '金額の空白・全角数字と、同じ口座どうしの扱いが仕様に無かったので、半角の数字だけを受け付け、同じ口座も通しています。',
        tests: R`test('正しい入力', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: '5000' })).toEqual([]); });
test('前後の空白は許す', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: ' 5000 ' })).toEqual([]); });
test('全角数字は許す', () => { expect(validateTransfer({ from: '1000001', to: '1000002', amount: '１０００' })).toEqual([]); });
test('同じ口座', () => { expect(validateTransfer({ from: '1000001', to: '1000001', amount: '1' })).toEqual(['same']); });
test('メッセージ', () => { expect(errorMessages(['same'])).toEqual(['同じ口座には振り込めません']); });
`,
        review: { min: 1, points: [p('同じ口座の確認が抜けている', ['同じ口座', '同一', 'same']), p('空白・全角で正しい入力が弾かれる', ['空白', '全角', 'trim'])] },
      },
      demos: [{ label: '入力検証', expr: "errorMessages(validateTransfer({ from: '1000001', to: '1000001', amount: '0' })).join(' / ')" }],
      tutorTips: [{ keys: ['number', 'parseint', '数値'], tip: 'Number() に "" や "1e3" を渡すと何が返ると思いますか？ 試すとしたらどこで？' }, { keys: ['全部', 'まとめ', '配列'], tip: '最初の誤りで return すると、利用者は何回送信し直すことになりますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-03', area: 'C', level: 2, prereq: ['L2-01'], estMinutes: 40,
      title: '二重送金を防ぐ',
      story: '先輩の佐藤さんより：「通信が切れてアプリが自動で再送したら、同じ振込が2回実行されちゃった、なんてことは銀行では絶対に起こせない。依頼IDで“一度だけ”を設計しよう。」',
      goals: ['二重送金が起きる原因（再送・二度押し）を説明できる', '依頼IDで同じ依頼を一度だけ処理する仕組みを作れる'],
      evidence: 'スキルマップ C-L2〜L3（排他制御・冪等性）／練習銀行 L2「二重送金の防止」',
      concept: [
        'ボタンの二度押しや、タイムアウト後の自動再送で、同じ振込依頼が2回届くことがあります。',
        '依頼ごとに一意な「依頼ID」を付け、サーバーは処理済みのIDと結果を覚えておきます。同じIDが来たら、実行せずに前回の結果を返します（冪等性）。',
        { code: R`const done = new Map();       // 依頼ID → 結果
if (done.has(req.id)) return done.get(req.id);
const result = execute(req);
done.set(req.id, result);
return result;` },
        '同じIDなのに内容が違う依頼は、取り違えの可能性が高いのでエラーにします。失敗した依頼は覚えず、再試行できるようにします。実際のシステムでは、メモリではなくDBの一意制約で守ります。',
      ],
      predict: [
        { q: 'タイムアウトしたので、アプリが同じ振込を自動で再送した。サーバーは何をすべき？', code: '', choices: ['同じ依頼IDなら前回の結果を返す', 'もう一度振り込む', 'エラーで落とす', '何もしない（応答しない）'], answer: 0, why: '最初の依頼が成功していた場合に二重に振り込まないためです。' },
        { q: 'このコードの値は？', code: R`const s = new Set();
s.add('a');
s.add('a');
s.size`, choices: ['1', '2', '0', 'エラー'], answer: 0, why: 'Set は同じ値を1つしか持ちません。' },
        { q: 'このコードの値は？', code: R`const m = new Map();
m.set('k', 1);
m.get('x')`, choices: ['undefined', '1', 'null', 'エラー'], answer: 0, why: '無いキーを get すると undefined です。' },
      ],
      exercises: [
        { id: 'L2-03-p1', stage: 'parsons', prompt: '初めてのIDなら記録して true、2回目以降なら false を返す markOnce を組み立ててください。使わない行が1つあります。',
          lines: ['function markOnce(seen, id) {', '  if (seen.has(id)) return false;', '  seen.add(id);', '  return true;', '}'],
          distractors: ['  return seen.size > 0;'],
          tests: R`test('1回目は true、2回目は false', () => {
  const seen = new Set();
  expect([markOnce(seen, 'r1'), markOnce(seen, 'r1')]).toEqual([true, false]);
});
test('別のIDは true', () => {
  const seen = new Set();
  markOnce(seen, 'r1');
  expect(markOnce(seen, 'r2')).toBe(true);
});`,
          hints: ['確かめる → 記録する → 返す、の順です。', 'size を見ても、そのIDを見たかどうかは分かりません。', '  return true; で終わります。'] },
        { id: 'L2-03-p2', stage: 'parsons', prompt: '同じIDの依頼は一度しか execute しない createProcessor を組み立ててください。使わない行が1つあります。',
          lines: ['function createProcessor(execute) {', '  const results = new Map();', '  return function process(req) {', '    if (results.has(req.id)) return results.get(req.id);', '    const result = execute(req);', '    results.set(req.id, result);', '    return result;', '  };', '}'],
          distractors: ['    return execute(req);'],
          tests: R`test('同じIDは1回だけ実行', () => {
  let count = 0;
  const process = createProcessor(() => { count += 1; return 'ok' + count; });
  const a = process({ id: 'r1' });
  const b = process({ id: 'r1' });
  expect([count, a, b]).toEqual([1, 'ok1', 'ok1']);
});`,
          hints: ['結果を覚える Map を、関数の外側（1回だけ作る場所）に置きます。', '覚えていれば返す、無ければ実行して覚える。', '    return execute(req); の行は使いません。'] },
        { id: 'L2-03-b1', stage: 'blank', prompt: '空欄を埋めて、同じIDの依頼を最初の1件だけ残してください。',
          template: R`function dedupe(requests) {
  const seen = new [[1]]();
  return requests.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}`, answers: ['Set'],
          tests: R`test('重複を除く', () => { expect(dedupe([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map((r) => r.id)).toEqual(['a', 'b']); });`,
          hints: ['同じ値を1つしか持たない入れ物です。', 'has と add が使えるものです。', 'Set です。'] },
        { id: 'L2-03-b2', stage: 'blank', prompt: '空欄を埋めて、処理済みなら前回の結果を返してください。',
          template: R`function createProcessor(execute) {
  const results = new Map();
  return (req) => {
    if (results.[[1]](req.id)) return results.get(req.id);
    const result = execute(req);
    results.set(req.id, result);
    return result;
  };
}`, answers: ['has'],
          tests: R`test('同じIDは1回だけ実行', () => {
  let count = 0;
  const process = createProcessor(() => ++count);
  process({ id: 'x' });
  process({ id: 'x' });
  expect(count).toBe(1);
});`,
          hints: ['Map にそのキーがあるかを true/false で返すメソッドです。', '3文字です。', 'has です。'] },
        { id: 'L2-03-f1', stage: 'fix', prompt: '別々の依頼なのに、金額が同じだと2件目が実行されません。直してください。',
          code: R`function createProcessor(execute) {
  const results = new Map();
  return (req) => {
    if (results.has(req.amount)) return results.get(req.amount);
    const result = execute(req);
    results.set(req.amount, result);
    return result;
  };
}`,
          solution: R`function createProcessor(execute) {
  const results = new Map();
  return (req) => {
    if (results.has(req.id)) return results.get(req.id);
    const result = execute(req);
    results.set(req.id, result);
    return result;
  };
}`,
          tests: R`test('同じ金額の別の依頼は両方実行', () => {
  let count = 0;
  const process = createProcessor(() => ++count);
  process({ id: 'r1', amount: 1000 });
  process({ id: 'r2', amount: 1000 });
  expect(count).toBe(2);
});
test('同じIDは1回だけ', () => {
  let count = 0;
  const process = createProcessor(() => ++count);
  process({ id: 'r1', amount: 1000 });
  process({ id: 'r1', amount: 1000 });
  expect(count).toBe(1);
});`,
          hints: ['「同じ依頼」を何で見分けていますか？', '金額が同じでも、別の依頼はありえます。', 'req.amount を req.id にします（3か所）。'] },
        { id: 'L2-03-f2', stage: 'fix', prompt: 'dedupe が空の配列を返してしまいます。直してください。',
          code: R`function dedupe(requests) {
  const seen = new Set();
  return requests.filter((r) => {
    seen.add(r.id);
    return !seen.has(r.id);
  });
}`,
          solution: R`function dedupe(requests) {
  const seen = new Set();
  return requests.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}`,
          tests: R`test('重複を除く', () => { expect(dedupe([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map((r) => r.id)).toEqual(['a', 'b']); });`,
          hints: ['add した直後に has を確かめると、いつも何が返りますか？', '確かめる → 記録する、の順番にします。', 'if (seen.has(r.id)) return false; を先に置きます。'] },
        { id: 'L2-03-s1', stage: 'scratch', prompt: 'createProcessor(execute) を書いてください。同じIDで内容（from, to, amount）も同じなら前回の結果を返し、同じIDで内容が違えば「同じ依頼IDで内容が違います」のエラーにします。execute がエラーを投げたときは覚えず、同じIDで再試行できるようにします。',
          code: R`/** 同じ依頼IDの依頼を一度だけ実行する */
function createProcessor(execute) {
  // ここに書く
}`,
          solution: R`function createProcessor(execute) {
  const done = new Map();
  return (req) => {
    const body = JSON.stringify([req.from, req.to, req.amount]);
    const prev = done.get(req.id);
    if (prev) {
      if (prev.body !== body) throw new Error('同じ依頼IDで内容が違います');
      return prev.result;
    }
    const result = execute(req);
    done.set(req.id, { body, result });
    return result;
  };
}`,
          tests: R`const REQ = { id: 'r1', from: '1000001', to: '1000002', amount: 1000 };
test('同じ依頼は1回だけ実行', () => {
  let count = 0;
  const process = createProcessor(() => ++count);
  const a = process(REQ);
  const b = process({ ...REQ });
  expect([count, a, b]).toEqual([1, 1, 1]);
});
test('同じIDで内容が違えばエラー', () => {
  const process = createProcessor(() => 'ok');
  process(REQ);
  expect(() => process({ ...REQ, amount: 9999 })).toThrow('内容が違います');
});
test('失敗した依頼は再試行できる', () => {
  let fail = true;
  const process = createProcessor(() => { if (fail) throw new Error('一時的な障害'); return 'ok'; });
  expect(() => process(REQ)).toThrow('一時的な障害');
  fail = false;
  expect(process(REQ)).toBe('ok');
});`,
          hints: ['依頼IDごとに「内容」と「結果」の両方を覚えます。', '内容は JSON.stringify([req.from, req.to, req.amount]) で文字列にすると比べやすいです。', 'execute(req) が成功した後でだけ done.set します。'] },
      ],
      gate: {
        what: { min: 2, points: [p('同じ依頼IDなら前回の結果を返す', ['同じ', 'id', '前回', '結果を返', '再利用', 'キャッシュ', '一度']), p('内容が違えばエラーにする', ['内容', '違', 'エラー', '不一致'])] },
        risk: { min: 1, points: [p('メモリに持つので再起動で消える・複数サーバーで共有されない', ['再起動', '消える', 'メモリ', '複数', 'サーバー', '永続', 'db', 'データベース']), p('同時に届いた2つの依頼（排他制御）', ['同時', '並行', '排他', 'ロック', '競合']), p('IDの使い回し・推測', ['使い回', '推測', '衝突', 'uuid', '一意'])] },
      },
      aiTask: {
        file: 'src/idempotency.js', testFile: 'tests/idempotency.test.js',
        ticket: '二重送金を防ぐ振込サービス createTransferService(accounts) を src/idempotency.js に実装してほしい。submit(req) / deposit(account, amount) / balances() を持つ。req は { id, from, to, amount }。',
        signature: 'createTransferService(accounts) → { submit(req), deposit(account, amount), balances() }',
        specGroups: [p('同じ依頼IDで内容が違えば拒否する', ['内容が違', '内容が異な', '中身が違', '別の内容', '不一致']), p('失敗した依頼は覚えず再試行できる', ['再試行', 'リトライ', 'やり直', '覚えない', '記録しない'])],
        good: R`/** 二重送金を防ぐ振込サービス。同じ依頼IDは一度だけ実行し、失敗した依頼は再試行できる */
function createTransferService(initial) {
  let accounts = { ...initial };
  const done = new Map();
  function move(t) {
    if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
    if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
    const next = { ...accounts };
    next[t.from] -= t.amount;
    next[t.to] = (next[t.to] ?? 0) + t.amount;
    accounts = next;
  }
  return {
    balances: () => ({ ...accounts }),
    deposit(account, amount) {
      accounts = { ...accounts, [account]: (accounts[account] ?? 0) + amount };
    },
    submit(req) {
      const body = JSON.stringify([req.from, req.to, req.amount]);
      const prev = done.get(req.id);
      if (prev) {
        if (prev.body !== body) return { ok: false, reason: '同じ依頼IDで内容が違います' };
        return prev.result;
      }
      try {
        move(req);
      } catch (e) {
        return { ok: false, reason: e.message };
      }
      const result = { ok: true, id: req.id };
      done.set(req.id, { body, result });
      return result;
    },
  };
}
`,
        buggy: R`/** 二重送金を防ぐ振込サービス */
function createTransferService(initial) {
  let accounts = { ...initial };
  const done = new Map();
  function move(t) {
    if (!Number.isInteger(t.amount) || t.amount <= 0) throw new Error('金額が正しくありません');
    if ((accounts[t.from] ?? 0) < t.amount) throw new Error('残高が足りません');
    const next = { ...accounts };
    next[t.from] -= t.amount;
    next[t.to] = (next[t.to] ?? 0) + t.amount;
    accounts = next;
  }
  return {
    balances: () => ({ ...accounts }),
    deposit(account, amount) {
      accounts = { ...accounts, [account]: (accounts[account] ?? 0) + amount };
    },
    submit(req) {
      if (done.has(req.id)) return done.get(req.id);
      let result;
      try {
        move(req);
        result = { ok: true, id: req.id };
      } catch (e) {
        result = { ok: false, reason: e.message };
      }
      done.set(req.id, result);
      return result;
    },
  };
}
`,
        buggyNote: '同じIDで内容が違う依頼と、失敗した依頼の再試行が仕様に無かったので、どんな結果も依頼IDで覚えています。',
        tests: R`test('同じ依頼を2回送っても1回だけ振り込む', () => {
  const s = createTransferService({ a: 30000, b: 0 });
  const req = { id: 'req-1', from: 'a', to: 'b', amount: 10000 };
  s.submit(req);
  s.submit({ ...req });
  expect(s.balances()).toEqual({ a: 20000, b: 10000 });
});
test('同じIDで内容が違えば拒否', () => {
  const s = createTransferService({ a: 30000, b: 0 });
  s.submit({ id: 'req-1', from: 'a', to: 'b', amount: 10000 });
  const r = s.submit({ id: 'req-1', from: 'a', to: 'b', amount: 20000 });
  expect([r.ok, s.balances().a]).toEqual([false, 20000]);
});
test('残高不足で失敗した依頼は、入金後に再試行できる', () => {
  const s = createTransferService({ a: 0, b: 0 });
  const req = { id: 'req-2', from: 'a', to: 'b', amount: 5000 };
  expect(s.submit(req).ok).toBe(false);
  s.deposit('a', 5000);
  expect(s.submit(req).ok).toBe(true);
});
`,
        review: { min: 1, points: [p('失敗まで覚えて再試行できない', ['失敗', '再試行', 'リトライ', '覚え']), p('同じIDで内容が違っても前回の結果を返す', ['内容', '違', '別の'])] },
      },
      demos: [{ label: '二重送金の防止', expr: "(() => { const s = createTransferService({ '1000001': 30000, '1000002': 0 }); const req = { id: 'req-1', from: '1000001', to: '1000002', amount: 10000 }; s.submit(req); s.submit(req); return '同じ振込を2回送信 → 残高 ' + formatYen(s.balances()['1000001']); })()" }],
      tutorTips: [{ keys: ['map', 'set'], tip: 'その Map は、依頼が来るたびに新しく作られていませんか？ どこで1回だけ作ればよいでしょう？' }, { keys: ['冪等', '二重', '再送'], tip: '1回目の依頼が成功していたのに、応答だけが届かなかった場合を想像してみてください。2回目はどう扱うべきですか？' }],
    },
    // =====================================================================
    {
      id: 'L2-04', area: 'D', level: 2, prereq: ['L1-04', 'L2-02'], estMinutes: 35,
      title: 'AIが書いたPRの欠陥を見つける',
      story: '先輩の佐藤さんより：「振込手数料のPRをAIが書いてくれた。テストも通ってる……ように見える。“ほぼ正しい”コードの欠陥は、境界値で見つかることが多いんだ。」',
      goals: ['境界値でテストする理由を説明できる', 'AIが書いたコードの欠陥を指摘できる'],
      evidence: 'Stack Overflow 2025（AIの正確性を信頼する開発者は29%）／スキルマップ D-L2',
      concept: [
        'AIのコードは「だいたい正しい」ことが多く、欠陥は端っこ（境界・空・エラーの道）に隠れます。',
        '「3万円以上は330円」なら、29,999円・30,000円・30,001円の3つを確かめます。> と >= の取り違えは、ちょうど30,000円でしか見つかりません。',
        { code: R`// レビューで最初に見るところ
// 1. 境界値（以上／超える、以下／未満）
// 2. 空・0件・null
// 3. エラーの道（失敗したら何が起きる？）
// 4. 数値の直書き（変わったらどこを直す？）` },
        'テストが通っていても、そのテストが境界を確かめていなければ安心できません。「どのテストが無いか」を探すのもレビューです。',
      ],
      predict: [
        { q: '「3万円以上は330円、未満は220円」。30,000円ちょうどの他行振込の手数料は？', code: '', choices: ['330円', '220円', '0円', '決められない'], answer: 0, why: '「以上」はその数を含みます。' },
        { q: 'このコードで 30000 を渡すと？', code: R`amount > 30000 ? 330 : 220`, choices: ['220', '330', 'エラー', 'NaN'], answer: 0, why: '> は「超える」なので 30000 は含みません。仕様とずれています。' },
        { q: 'AIが書いたPRで、まず確かめるべきなのは？', code: '', choices: ['境界値と異常系がテストされているか', '変数名が自分の好みか', 'コメントの量', 'ファイルの行数'], answer: 0, why: '欠陥が隠れやすい場所から見ます。' },
      ],
      exercises: [
        { id: 'L2-04-p1', stage: 'parsons', prompt: '同行なら0円、他行なら3万円以上で330円・未満で220円を返す calcFee を組み立ててください。使わない行が1つあります。',
          lines: ['function calcFee(amount, sameBank) {', '  if (sameBank) return 0;', '  return amount >= 30000 ? 330 : 220;', '}'],
          distractors: ['  return amount > 30000 ? 330 : 220;'],
          tests: R`test('ちょうど3万円は330円', () => { expect(calcFee(30000, false)).toBe(330); });
test('29999円は220円', () => { expect(calcFee(29999, false)).toBe(220); });
test('同行は0円', () => { expect(calcFee(50000, true)).toBe(0); });`,
          hints: ['「以上」を表す比較はどちらでしょう？', '30000 を入れたときを考えましょう。', '>= の行を使います。'] },
        { id: 'L2-04-p2', stage: 'parsons', prompt: '境界の前後3つの値を返す boundaryCases を組み立ててください。使わない行が1つあります。',
          lines: ['function boundaryCases(limit) {', '  return [limit - 1, limit, limit + 1];', '}'],
          distractors: ['  return [limit];'],
          tests: R`test('前後3つ', () => { expect(boundaryCases(30000)).toEqual([29999, 30000, 30001]); });`,
          hints: ['境界ちょうどだけでは足りません。', '1つ手前と1つ後も確かめます。', '[limit - 1, limit, limit + 1] です。'] },
        { id: 'L2-04-b1', stage: 'blank', prompt: '空欄を埋めて、手数料を計算してください。',
          template: R`function calcFee(amount, sameBank) {
  if (sameBank) return [[1]];
  return amount [[2]] 30000 ? 330 : 220;
}`, answers: ['0', '>='],
          tests: R`test('同行は0円', () => { expect(calcFee(1, true)).toBe(0); });
test('ちょうど3万円は330円', () => { expect(calcFee(30000, false)).toBe(330); });
test('29999円は220円', () => { expect(calcFee(29999, false)).toBe(220); });`,
          hints: ['1つ目は同行の手数料です。', '2つ目は「以上」を表す比較です。', '0 と >= です。'] },
        { id: 'L2-04-b2', stage: 'blank', prompt: '空欄を埋めて、振込額と手数料の合計を返してください。',
          template: R`function totalWithFee(amount, sameBank) {
  return amount [[1]] calcFee(amount, sameBank);
}
function calcFee(amount, sameBank) {
  if (sameBank) return 0;
  return amount >= 30000 ? 330 : 220;
}`, answers: ['+'],
          tests: R`test('他行1万円', () => { expect(totalWithFee(10000, false)).toBe(10220); });
test('同行1万円', () => { expect(totalWithFee(10000, true)).toBe(10000); });`,
          hints: ['合計なので…', '演算子1文字です。', '+ です。'] },
        { id: 'L2-04-f1', stage: 'fix', prompt: 'AIが書いたPRです。仕様は「3万円以上は330円」。どこが欠陥か見つけて直してください。',
          code: R`function calcFee(amount, sameBank) {
  if (sameBank) return 0;
  return amount > 30000 ? 330 : 220;
}`,
          solution: R`function calcFee(amount, sameBank) {
  if (sameBank) return 0;
  return amount >= 30000 ? 330 : 220;
}`,
          tests: R`test('ちょうど3万円は330円', () => { expect(calcFee(30000, false)).toBe(330); });
test('3万1円は330円', () => { expect(calcFee(30001, false)).toBe(330); });
test('29999円は220円', () => { expect(calcFee(29999, false)).toBe(220); });`,
          hints: ['30,000円ちょうどのときの結果を考えましょう。', '「以上」と「超える」の違いです。', '> を >= にします。'] },
        { id: 'L2-04-f2', stage: 'fix', prompt: '手数料の表を使った実装ですが、ちょうど3万円が220円になり、0円の振込ではエラーになります。直してください。',
          code: R`const FEE_TABLE = [{ min: 30000, fee: 330 }, { min: 0, fee: 220 }];
function calcFee(amount, sameBank) {
  if (sameBank) return 0;
  return FEE_TABLE.find((row) => amount > row.min).fee;
}`,
          solution: R`const FEE_TABLE = [{ min: 30000, fee: 330 }, { min: 0, fee: 220 }];
function calcFee(amount, sameBank) {
  if (sameBank) return 0;
  return FEE_TABLE.find((row) => amount >= row.min).fee;
}`,
          tests: R`test('ちょうど3万円は330円', () => { expect(calcFee(30000, false)).toBe(330); });
test('1円は220円', () => { expect(calcFee(1, false)).toBe(220); });
test('0円でもエラーにならない', () => { expect(calcFee(0, false)).toBe(220); });`,
          hints: ['amount が 0 のとき、find はどの行を見つけますか？', '比較が「超える」になっています。', '> を >= にします。'] },
        { id: 'L2-04-s1', stage: 'scratch', prompt: 'calcFee(amount, opts) を書いてください。opts は { sameBank, premium, usedFreeCount }。同行は0円。プレミアム会員は他行振込が月5回まで無料（usedFreeCount は今月すでに使った無料回数）。それ以外は3万円以上で330円、未満で220円。',
          code: R`/** 振込手数料を返す */
function calcFee(amount, opts) {
  // ここに書く
}`,
          solution: R`function calcFee(amount, opts) {
  if (opts.sameBank) return 0;
  if (opts.premium && opts.usedFreeCount < 5) return 0;
  return amount >= 30000 ? 330 : 220;
}`,
          tests: R`const OTHER = { sameBank: false, premium: false, usedFreeCount: 0 };
test('同行は0円', () => { expect(calcFee(50000, { ...OTHER, sameBank: true })).toBe(0); });
test('ちょうど3万円は330円', () => { expect(calcFee(30000, OTHER)).toBe(330); });
test('29999円は220円', () => { expect(calcFee(29999, OTHER)).toBe(220); });
test('プレミアム5回目（使用済み4回）は無料', () => { expect(calcFee(10000, { ...OTHER, premium: true, usedFreeCount: 4 })).toBe(0); });
test('プレミアム6回目（使用済み5回）は有料', () => { expect(calcFee(10000, { ...OTHER, premium: true, usedFreeCount: 5 })).toBe(220); });`,
          hints: ['無料になる条件を先に並べ、最後に金額で決めます。', '「5回まで無料」＝使用済みが0〜4回なら無料です。', 'if (opts.premium && opts.usedFreeCount < 5) return 0;'] },
      ],
      gate: {
        what: { min: 2, points: [p('同行は無料、他行は金額で手数料が変わる', ['同行', '他行', '無料', '0円', '手数料', '220', '330']), p('プレミアム会員の無料回数', ['プレミアム', '無料回数', '5回', '回数'])] },
        risk: { min: 1, points: [p('3万円ちょうど・5回目の境界', ['境界', 'ちょうど', '以上', '未満', '5回目', '30000', '3万']), p('手数料の額がコードに直書き', ['直書き', 'ハードコード', '定数', '設定', '改定', '変わる']), p('opts が欠けている', ['undefined', '欠け', '省略', 'ない場合', '無い場合'])] },
      },
      aiTask: {
        file: 'src/fee.js', testFile: 'tests/fee.test.js',
        ticket: '振込手数料の計算 calcFee(amount, opts) を src/fee.js に実装してほしい（同行0円、プレミアムは他行月5回まで無料、それ以外は3万円以上330円・未満220円）。AIのPRはレビューしてから取り込むこと。',
        signature: 'calcFee(amount, { sameBank, premium, usedFreeCount })',
        specGroups: [p('3万円ちょうどは330円（以上）', ['ちょうど', '以上', '境界', '30000円を含', '3万円を含']), p('無料は5回目まで（使用済み4回まで）', ['5回目', '5回まで', '4回', '回数'])],
        good: R`const FEE_OTHER_BANK_HIGH = 330; // 3万円以上
const FEE_OTHER_BANK_LOW = 220;  // 3万円未満
const FEE_THRESHOLD = 30000;
const FREE_TRANSFERS_PER_MONTH = 5;

/** 振込手数料。同行0円、プレミアムは他行月5回まで無料、それ以外は3万円以上330円・未満220円 */
function calcFee(amount, opts) {
  if (opts.sameBank) return 0;
  if (opts.premium && opts.usedFreeCount < FREE_TRANSFERS_PER_MONTH) return 0;
  return amount >= FEE_THRESHOLD ? FEE_OTHER_BANK_HIGH : FEE_OTHER_BANK_LOW;
}
`,
        buggy: R`/** 振込手数料を返す */
function calcFee(amount, opts) {
  if (opts.sameBank) return 0;
  if (opts.premium && opts.usedFreeCount <= 5) return 0;
  return amount > 30000 ? 330 : 220;
}
`,
        buggyNote: '境界（3万円ちょうど・5回目）の扱いが仕様に無かったので、「3万円を超えたら」「5回以下なら」と解釈しました。',
        tests: R`const OTHER = { sameBank: false, premium: false, usedFreeCount: 0 };
test('同行は0円', () => { expect(calcFee(50000, { ...OTHER, sameBank: true })).toBe(0); });
test('ちょうど3万円は330円', () => { expect(calcFee(30000, OTHER)).toBe(330); });
test('29999円は220円', () => { expect(calcFee(29999, OTHER)).toBe(220); });
test('プレミアム5回目は無料', () => { expect(calcFee(10000, { ...OTHER, premium: true, usedFreeCount: 4 })).toBe(0); });
test('プレミアム6回目は有料', () => { expect(calcFee(10000, { ...OTHER, premium: true, usedFreeCount: 5 })).toBe(220); });
`,
        review: { min: 1, points: [p('> と >= の取り違え（3万円ちょうど）', ['>=', '以上', 'ちょうど', '境界', '30000']), p('<= 5 で6回目まで無料になる', ['<=', '6回', '5回', '回数'])] },
      },
      demos: [{ label: '振込手数料', expr: "'他行へ3万円 → 手数料 ' + formatYen(calcFee(30000, { sameBank: false, premium: false, usedFreeCount: 0 }))" }],
      tutorTips: [{ keys: ['境界', 'ちょうど', '以上'], tip: '仕様の「以上」は、その数を含みますか？ コードの比較演算子はそれと一致していますか？' }, { keys: ['レビュー', 'pr'], tip: 'このPRのテストに、境界ちょうどの値はありますか？ 無いとしたら、どの値を足しますか？' }],
    },
    // =====================================================================
    {
      id: 'L2-05', area: 'F', level: 2, prereq: ['L2-02'], estMinutes: 35,
      title: 'SQLインジェクションとXSSを理解する',
      story: 'セキュリティ担当の鈴木さんより：「振込メモは利用者が自由に書ける欄。そこに <script> を書かれても安全に表示できるか、SQLに混ぜても大丈夫か、を自分で説明できるようになって。」',
      goals: ['XSS が起きる仕組みと、エスケープで防ぐ方法を説明できる', 'SQL インジェクションをプレースホルダで防げる'],
      evidence: 'スキルマップ F-L1／OWASP Top 10（インジェクション）',
      concept: [
        '利用者の入力を HTML にそのまま埋め込むと、<script> などが「命令」として動いてしまいます（XSS）。表示する前に、HTML で意味を持つ文字を置き換えます（エスケープ）。',
        { code: R`& → &amp;   < → &lt;   > → &gt;   " → &quot;   ' → &#39;
// & は最初に置き換える（後にすると &lt; の & まで置き換わる）` },
        'SQL も同じで、入力を文字列でつなぐと条件を書き換えられます（SQLインジェクション）。値は「?」の場所にあとから渡します（プレースホルダ）。',
        { code: R`// 危ない
"SELECT * FROM accounts WHERE name = '" + name + "'"
// 安全
{ sql: 'SELECT * FROM accounts WHERE name = ?', params: [name] }` },
      ],
      predict: [
        { q: '振込メモに <img src=x onerror=alert(1)> と入れた。innerHTML でそのまま表示すると？', code: '', choices: ['スクリプトが実行されうる', '文字として表示される', 'エラーで止まる', '何も表示されない'], answer: 0, why: 'HTML として解釈され、onerror の中身が動きます。' },
        { q: "SQL を文字列でつなぐとき、name に ' OR '1'='1 を入れると？", code: R`"SELECT * FROM accounts WHERE name = '" + name + "'"`, choices: ['全件が返りうる', '1件だけ返る', '必ずエラー', '0件'], answer: 0, why: "条件が name = '' OR '1'='1' になり、常に真になります。" },
        { q: 'このコードの値は？', code: R`'a&b'.replace(/&/g, '&amp;')`, choices: ['"a&amp;b"', '"a&b"', '"a b"', '"a&amp;amp;b"'], answer: 0, why: '& が &amp; に置き換わります。' },
      ],
      exercises: [
        { id: 'L2-05-p1', stage: 'parsons', prompt: 'HTML で意味を持つ5文字をエスケープする escapeHtml を組み立ててください。置き換えの順番に注意。使わない行が1つあります。',
          lines: ['function escapeHtml(s) {', '  return s', "    .replace(/&/g, '&amp;')", "    .replace(/</g, '&lt;')", "    .replace(/>/g, '&gt;')", "    .replace(/\"/g, '&quot;')", "    .replace(/'/g, '&#39;');", '}'],
          distractors: ["    .replace(/</g, '')"],
          tests: R`test('タグ', () => { expect(escapeHtml('<b>')).toBe('&lt;b&gt;'); });
test('&', () => { expect(escapeHtml('a&b')).toBe('a&amp;b'); });
test('二重にエスケープしない', () => { expect(escapeHtml('<')).toBe('&lt;'); });
test('引用符', () => { expect(escapeHtml('"' + "'")).toBe('&quot;&#39;'); });`,
          hints: ['5つの置き換えをすべて使います。消してしまう行は使いません。', '& を後にすると、&lt; の & まで置き換わってしまいます。', "    .replace(/&/g, '&amp;') を最初に置きます。最後の行だけ ; で終わります。"] },
        { id: 'L2-05-p2', stage: 'parsons', prompt: '名前で口座を探す SQL を、プレースホルダで組み立ててください。使わない行が1つあります。',
          lines: ['function findAccountQuery(name) {', '  return {', "    sql: 'SELECT * FROM accounts WHERE name = ?',", '    params: [name],', '  };', '}'],
          distractors: ["    sql: \"SELECT * FROM accounts WHERE name = '\" + name + \"'\","],
          tests: R`test('プレースホルダ', () => { expect(findAccountQuery("' OR '1'='1")).toEqual({ sql: 'SELECT * FROM accounts WHERE name = ?', params: ["' OR '1'='1"] }); });`,
          hints: ['SQL の文字列に、入力を直接つながない方を選びます。', '値は params で別に渡します。', '? を使う行を選びましょう。'] },
        { id: 'L2-05-b1', stage: 'blank', prompt: '空欄を埋めて、< をエスケープしてください。',
          template: R`function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, [[1]]).replace(/>/g, '&gt;');
}`, answers: ["'&lt;'"],
          tests: R`test('タグ', () => { expect(escapeHtml('<i>')).toBe('&lt;i&gt;'); });`,
          hints: ['< は「less than」の略で表します。', '文字列なので引用符が必要です。', "'&lt;' です。"] },
        { id: 'L2-05-b2', stage: 'blank', prompt: '空欄を埋めて、振込を記録する SQL の値を params で渡してください。',
          template: R`function transferQuery(t) {
  return { sql: 'INSERT INTO transfers (from_acc, to_acc, amount) VALUES (?, ?, ?)', params: [[1]] };
}`, answers: ['[t.from, t.to, t.amount]'],
          tests: R`test('値の順番', () => { expect(transferQuery({ from: '1000001', to: '1000002', amount: 500 }).params).toEqual(['1000001', '1000002', 500]); });`,
          hints: ['? の順番どおりに値を並べた配列です。', 'from_acc, to_acc, amount の順です。', '[t.from, t.to, t.amount] です。'] },
        { id: 'L2-05-f1', stage: 'fix', prompt: '< が「&amp;lt;」と二重にエスケープされてしまいます。直してください。',
          code: R`function escapeHtml(s) {
  return s
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;');
}`,
          solution: R`function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}`,
          tests: R`test('タグ', () => { expect(escapeHtml('<b>')).toBe('&lt;b&gt;'); });
test('&', () => { expect(escapeHtml('a&b')).toBe('a&amp;b'); });`,
          hints: ['&lt; に含まれる & は、最後の置き換えでどうなりますか？', '置き換えの順番を変えます。', '& の置き換えを最初にします。'] },
        { id: 'L2-05-f2', stage: 'fix', prompt: 'SQL インジェクションの危険があります。プレースホルダを使うように直してください。',
          code: R`function findAccountQuery(name) {
  return { sql: "SELECT * FROM accounts WHERE name = '" + name + "'", params: [] };
}`,
          solution: R`function findAccountQuery(name) {
  return { sql: 'SELECT * FROM accounts WHERE name = ?', params: [name] };
}`,
          tests: R`test('入力が SQL に混ざらない', () => { expect(findAccountQuery("x' OR '1'='1").sql).toBe('SELECT * FROM accounts WHERE name = ?'); });
test('値は params で渡す', () => { expect(findAccountQuery('佐藤').params).toEqual(['佐藤']); });`,
          hints: ['name が SQL の文字列に直接入っています。', 'SQL には ? を書き、値は params に入れます。', "sql: 'SELECT * FROM accounts WHERE name = ?', params: [name]"] },
        { id: 'L2-05-s1', stage: 'scratch', prompt: 'escapeHtml(s) と renderMemo(tx) を書いてください。renderMemo は \'<li class="tx"><time>日付</time> メモ</li>\' を返します。日付もメモもエスケープし、メモが無ければ空にします。escapeHtml は文字列以外が来ても文字列にしてから処理します。',
          code: R`/** HTML で意味を持つ文字をエスケープする */
function escapeHtml(s) {
  // ここに書く
}

/** 明細1行の HTML を返す */
function renderMemo(tx) {
  // ここに書く
}`,
          solution: R`function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function renderMemo(tx) {
  return '<li class="tx"><time>' + escapeHtml(tx.date) + '</time> ' + escapeHtml(tx.memo ?? '') + '</li>';
}`,
          tests: R`test('ふつうのメモ', () => { expect(renderMemo({ date: '2026-04-01', memo: '給与' })).toBe('<li class="tx"><time>2026-04-01</time> 給与</li>'); });
test('スクリプトは無害化', () => { expect(renderMemo({ date: '2026-04-01', memo: '<script>alert(1)</script>' })).toBe('<li class="tx"><time>2026-04-01</time> &lt;script&gt;alert(1)&lt;/script&gt;</li>'); });
test('引用符と&', () => { expect(escapeHtml('"a" & ' + "'b'")).toBe('&quot;a&quot; &amp; &#39;b&#39;'); });
test('メモが無い', () => { expect(renderMemo({ date: '2026-04-01' })).toBe('<li class="tx"><time>2026-04-01</time> </li>'); });
test('数値も扱える', () => { expect(escapeHtml(123)).toBe('123'); });`,
          hints: ['escapeHtml を先に作り、renderMemo ではそれを2回使います。', 'String(s) にしてから replace をつなげます。& が最初です。', "tx.memo ?? '' でメモが無いときに空にできます。"] },
      ],
      gate: {
        what: { min: 2, points: [p('HTML で意味を持つ文字を置き換える', ['エスケープ', '置き換', '&lt;', '特殊文字', '無害']), p('日付とメモを1行の HTML にする', ['li', 'html', '1行', '表示', 'メモ'])] },
        risk: { min: 1, points: [p('& を最初に置き換えないと二重エスケープ', ['順番', '最初', '二重', '&amp;']), p('属性や URL の中では別の対策が要る', ['属性', 'url', 'href', 'javascript:', '文脈']), p('innerHTML を使う場所が増えると漏れる', ['innerhtml', 'textcontent', '漏れ', '忘れ'])] },
      },
      aiTask: {
        file: 'src/render.js', testFile: 'tests/render.test.js',
        ticket: '明細を HTML で表示するために、escapeHtml(s) と renderStatementHtml(txs) を src/render.js に実装してほしい。renderStatementHtml は \'<ul class="statement"><li>日付 メモ</li>…</ul>\' を返す。',
        signature: 'escapeHtml(s) / renderStatementHtml(txs)',
        specGroups: [p('メモ・日付はエスケープする（XSS対策）', ['エスケープ', 'xss', 'タグ', '無害', 'サニタイズ']), p('引用符（" と \'）もエスケープする', ['引用符', 'クォート', 'quot', '"', "'", '属性'])],
        good: R`/** HTML で意味を持つ5文字をエスケープする（& を最初に） */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 明細の HTML。日付とメモはすべてエスケープする */
function renderStatementHtml(txs) {
  const items = txs.map((tx) => '<li>' + escapeHtml(tx.date) + ' ' + escapeHtml(tx.memo ?? '') + '</li>');
  return '<ul class="statement">' + items.join('') + '</ul>';
}
`,
        buggy: R`/** HTML のタグを無害にする */
function escapeHtml(s) {
  return String(s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 明細の HTML */
function renderStatementHtml(txs) {
  const items = txs.map((tx) => '<li>' + tx.date + ' ' + escapeHtml(tx.memo ?? '') + '</li>');
  return '<ul class="statement">' + items.join('') + '</ul>';
}
`,
        buggyNote: 'エスケープする文字の範囲が仕様に無かったので、< と > だけを置き換え、日付は信頼できる値として扱いました。',
        tests: R`test('スクリプトは無害化', () => { expect(renderStatementHtml([{ date: '2026-04-01', memo: '<script>x</script>' }])).toBe('<ul class="statement"><li>2026-04-01 &lt;script&gt;x&lt;/script&gt;</li></ul>'); });
test('& を最初に', () => { expect(escapeHtml('<&>')).toBe('&lt;&amp;&gt;'); });
test('引用符', () => { expect(escapeHtml('"' + "'")).toBe('&quot;&#39;'); });
test('日付もエスケープ', () => { expect(renderStatementHtml([{ date: '<b>', memo: '' }])).toBe('<ul class="statement"><li>&lt;b&gt; </li></ul>'); });
`,
        review: { min: 1, points: [p('& や引用符をエスケープしていない', ['&', '引用符', 'quot', '属性']), p('日付をエスケープしていない', ['日付', 'date'])] },
      },
      demos: [{ label: '安全な明細表示', expr: "renderStatementHtml([{ date: '2026-04-01', memo: '<b>給与</b>' }])" }],
      tutorTips: [{ keys: ['エスケープ', 'escape', '順番'], tip: "'&lt;' という文字列に & の置き換えをかけると、何になりますか？" }, { keys: ['sql', 'プレースホルダ'], tip: '入力が SQL の文字列の一部になると、入力した人は何を書き換えられますか？' }],
    },
  ];

  // 単元ごとに、正解コード（漏えい検査用）と練習問題の段階を補う
  for (const u of UNITS) {
    for (const ex of u.exercises) {
      ex.unitId = u.id;
      if (!ex.mode) ex.mode = 'code';
      if (ex.stage === 'parsons') ex.solution = ex.lines.join('\n');
      if (ex.stage === 'blank') ex.solution = fillBlanks(ex.template, ex.answers);
    }
  }

  function fillBlanks(template, values) {
    return template.replace(/\[\[(\d+)\]\]/g, (_, n) => (values[Number(n) - 1] ?? ''));
  }

  const STAGES = [
    { id: 'parsons', name: 'パーソンズ', desc: '行を並べ替える' },
    { id: 'blank', name: '穴埋め', desc: '空欄を埋める' },
    { id: 'fix', name: '修正', desc: 'バグを直す' },
    { id: 'scratch', name: 'ゼロから', desc: '自分で書く' },
  ];

  const STEPS = [
    { id: 'understand', name: '理解', ai: 'off' },
    { id: 'practice', name: '練習', ai: 'off' },
    { id: 'gate', name: '説明ゲート', ai: 'off' },
    { id: 'aion', name: '実践', ai: 'on' },
    { id: 'reflect', name: '振り返り', ai: 'on' },
  ];

  // 学習者のリポジトリの初期状態（FR-040）
  const REPO_TEMPLATE = {
    'AGENTS.md': `# AGENTS.md — 練習銀行

このリポジトリで AI エージェントと一緒に働くときの約束です（雛形。単元が進んだら自分で育てていきます）。

## このリポジトリについて
- 架空の銀行アプリ「練習銀行」。題材はすべて架空です
- 実在の顧客情報・社内コード・パスワードや API キーは、コードにもプロンプトにも書きません

## 守ること
- main に直接コミットしない。feature/* か fix/* のブランチから PR を出す
- 1つの PR は 300 行以下にする
- 機能を足したら tests/*.test.js にテストを足す
- eval / new Function / == / != は使わない（CI の静的解析で落ちます）
- AI が書いたコードは「何をするか」「どこが危ないか」を説明できるまで取り込まない

## 構成
- src/   機能のコード（ファイルをまたいで同じ名前の関数を作らない）
- tests/ テスト。test('名前', () => { expect(実際).toBe(期待); }) の形

## CI
- PR を作ると、tests/ のテストをすべて実行し、src/ に静的解析をかけます
`,
    'README.md': `# 練習銀行

練習銀行アカデミーで育てる、架空の銀行アプリです。

| レベル | 機能 |
|---|---|
| L1 | 残高照会、入出金明細の表示 |
| L2 | 振込、二重送金の防止、入力検証 |
`,
    'src/bank.js': `/** 銀行の名前（すべて架空） */
const BANK_NAME = '練習銀行';
`,
    'tests/bank.test.js': `test('銀行の名前', () => {
  expect(BANK_NAME).toBe('練習銀行');
});
`,
  };

  // 自己評価アンケート（FR-001、5問以内）
  const SURVEY = [
    { id: 'read', q: '短い関数を読んで、何を返すか説明できますか？' },
    { id: 'debug', q: 'テストが落ちたとき、AIなしで原因を探せますか？' },
    { id: 'git', q: 'ブランチを切ってPRを出したことがありますか？' },
    { id: 'security', q: '入力検証やSQLインジェクションを人に説明できますか？' },
    { id: 'review', q: 'AIが書いたコードの欠陥を指摘したことがありますか？' },
  ];
  const SURVEY_SCALE = ['まだ', '少し', 'だいたい', '自信あり'];

  RGA.content = { AREAS, LEVELS, BANK_STAGES, UNITS, STAGES, STEPS, REPO_TEMPLATE, SURVEY, SURVEY_SCALE, fillBlanks };
})(globalThis);
