/*
 * 言語テキスト: JavaScript（先生役は早乙女 ことは）。形は js/texts.js の先頭の説明を参照。コードは String.raw で書く。
 * テンプレート文字列を含むコードは R で書く（ˋ → バッククォート、＄{ → ドル記号と波かっこ。String.raw の中に直接書けないため）。
 */
(function (g) {
  'use strict';
  const T = g.RGA.texts;
  const R = (s, ...v) => String.raw(s, ...v).replace(/ˋ/g, '\x60').replace(/＄\{/g, '$\x7b');

  T.addCourse({
    id: 'js',
    name: 'JavaScript',
    icon: '🟨',
    teacher: 'saotome',
    intro: 'AIお金相談チャットの画面まわりは JavaScript でできている。値と型、関数、配列、非同期、クラス、エラー処理……「書けなくても読める」ようになれば、ハッカソンのレビューで迷子にならない。早乙女先輩と、のんびり一緒に読んでいこう。',
    chapters: [
      // ================================================================ 第1章
      {
        id: 'js-1',
        title: '値・型・演算子',
        badge: { icon: '🔢', name: '型の目利き' },
        handout: {
          units: ['ハッカソン スプリント1「キックオフ: チャット画面の骨組み」', 'ハッカソン スプリント9「1円もずらさない: お金の計算」'],
          knowledge: ['変数ってなに？（値に名前を付けて取っておく箱）', '四則演算（+ − × ÷）'],
          talk: [
            ['saotome', '{player}くん、JavaScript の章へようこそ〜。ふふ、まずは「値」と「型」から一緒に見ていこうね。'],
            ['saotome', 'この章で必要なのは、変数と四則演算だけ。院でやったことばかりだと思うけど、JavaScript には独特のクセがあるの。そこを楽しもう？'],
            ['player', '先輩に教わるなら何章でもいけます。'],
          ],
        },
        sections: [
          {
            id: 'js-1-1',
            title: 'const と let: 変えない箱と変える箱',
            talk: [
              ['saotome', '変数を作るときは const か let を使うよ。const は「もう入れ替えない箱」、let は「あとで入れ替える箱」。'],
              ['saotome', '金利みたいに途中で変わらない値は const、残高みたいに増えたり減ったりする値は let。コードを読むときも「let なら、この先どこかで変わるんだな」って身構えられるの。'],
              ['player', '古いコードで var ってのも見ますけど……。'],
              ['saotome', 'var は昔の書き方。見かけたら「古いコードだな〜」くらいでいいよ。新しく書くなら const が基本で、どうしても変えるときだけ let。えらいえらい、よく見てるね。'],
            ],
            figure: {
              title: 'const と let',
              text: String.raw`  const rate = 0.02;
  ┌─ rate ─────┐
  │    0.02    │ ← 入れ替え禁止（鍵つき）
  └────────────┘
  rate = 0.03;  → TypeError ✘

  let balance = 10000;
  ┌─ balance ──┐
  │   10000    │ → 10500 に入れ替えOK
  └────────────┘`,
            },
            code: {
              lang: 'js',
              text: String.raw`const RATE = 0.02;      // 金利は変えない
let balance = 10000;    // 残高は変わる
balance = balance + 500;`,
            },
            points: ['const は再代入できない。let は再代入できる', '読むときは「let の変数は、この先どこかで変わる」と身構える'],
            quiz: [
              {
                id: 'js-1-1-q1', type: 'predict', title: '金利を書き換えたい', lang: 'js',
                code: String.raw`const rate = 0.02;
let balance = 10000;
balance = balance + 500;
rate = 0.03;
console.log(balance, rate);`,
                q: '実行すると、どうなる？',
                choices: ['10500 0.03 と表示される', '10500 0.02 と表示される', '4行目でエラー（TypeError）になり、何も表示されない', '10000 0.02 と表示される'],
                answer: 2,
                hints: [
                  'rate と balance は、それぞれ何で作られていますか？',
                  'let の balance を入れ替えるのは問題ありません。',
                  'const で作った箱に、別の値を入れようとしている行があります。',
                  'エラーが起きると、その行より下は実行されません。',
                ],
                why: 'rate は const なので、4行目の rate = 0.03 で TypeError（定数への代入）になる。エラーで止まるので5行目の console.log まで届かず、何も表示されない。',
              },
              {
                id: 'js-1-1-q2', type: 'fix', title: '未読の数を数えたい', lang: 'js',
                story: '{daichi}くんの PR。「未読メッセージを数える関数を書いたら、呼んだ瞬間にエラーになっちゃう……」',
                file: 'src/unread.js',
                code: String.raw`export function countUnread(messages) {
  const count = 0;
  for (const m of messages) {
    if (!m.read) {
      count += 1;
    }
  }
  return count;
}`,
                bugLine: 2,
                fixes: ['let count = 0;', 'const count = 1;', 'var count;', 'count = 0;'],
                answer: 0,
                hints: [
                  'エラーが出るのは、未読のメッセージがあって数を増やそうとしたときです。',
                  'count += 1 は「count に count + 1 を入れ直す」という意味です。',
                  '入れ直す予定のある箱は、const と let のどちらで作るべきでしょう？',
                  '3行目の for (const m of ...) は、くり返しのたびに新しい m ができるので大丈夫です。直すのは count を作る行です。',
                ],
                why: 'count は5行目で増やす（再代入する）ので、2行目は let count = 0; にする。const のままだと count += 1 で TypeError になる。3行目の const m は、くり返しのたびに新しく作られるので問題ない。',
              },
            ],
          },
          {
            id: 'js-1-2',
            title: 'number と string: + はくっつける',
            talk: [
              ['saotome', 'JavaScript の値には型があって、よく出るのは number（数）と string（文字列）。typeof で調べられるよ。'],
              ['saotome', '気をつけたいのは +。片方が文字列だと、足し算じゃなくて「くっつける」になっちゃうの。入力欄から来た値は、数字に見えても文字列なんだよ〜。'],
              ['player', 'つまり 1000 円に入力欄の 500 を足すと……1000500 円。急にお金持ちだ。'],
              ['saotome', 'ふふ、銀行としては一番起きちゃいけないやつだね。文字を埋め込みたいときは、バッククォート（｀）で囲むテンプレート文字列が便利。ドル記号と波かっこで式を埋め込めるの。'],
            ],
            figure: {
              title: '+ の気持ち',
              text: String.raw`  1000  +  500   → 1500   （数＋数＝足す）
  1000  + '500'  → '1000500'（文字が混ざる
                             ＝くっつける）
  1000  - '500'  → 500    （− は数に直す）

  Number('500')  → 500    （文字列→数）`,
            },
            code: {
              lang: 'js',
              text: R`const name = '春野';
const amount = 3000;
const msg = ˋ＄{name}さん、＄{amount}円の入金ですˋ;
// → 春野さん、3000円の入金です`,
            },
            points: ['+ は片方が文字列だとくっつける。入力欄の値は文字列', 'Number(...) で数に直してから計算する', 'テンプレート文字列はバッククォートで囲み、ドル記号と波かっこで式を埋め込む'],
            quiz: [
              {
                id: 'js-1-2-q1', type: 'predict', title: '入力欄から来た金額', lang: 'js',
                code: String.raw`const balance = 1000;
const input = '500';     // 入力欄から来た値
console.log(balance + input);
console.log(balance - input);`,
                q: '表示されるのは（上の行 と 下の行）？',
                choices: ['1500 と 500', '1000500 と 500', '1000500 と NaN', '1500 と 1500'],
                answer: 1,
                hints: [
                  'input の値は、引用符で囲まれています。型は何でしょう？',
                  '+ は、片方が文字列のときに特別なふるまいをします。',
                  '− には「くっつける」という意味がありません。JavaScript は文字列を数に直して計算します。',
                  '上の行は文字列どうしをつなげた結果、下の行はふつうの引き算です。',
                ],
                why: 'input は文字列 \'500\'。+ は片方が文字列だと連結になるので 1000500。− には連結の意味がないので文字列が数に直され、1000 − 500 = 500。お金の計算の前には Number(...) で数に直しておく。',
              },
              {
                id: 'js-1-2-q2', type: 'fix', title: '名前が出ない入金通知', lang: 'js',
                story: '{hikari}ちゃんの PR。「入金のお知らせを作ったら、名前と金額のところに、ドル記号と波かっこがそのまま出ちゃうの〜😢」',
                file: 'src/notice.js',
                code: R`// 入金のお知らせの文を作る
export function depositMessage(name, amount) {
  const yen = amount.toLocaleString();
  return '＄{name}さん、＄{yen}円を入金しました';
}`,
                bugLine: 4,
                fixes: [
                  R`  return ˋ＄{name}さん、＄{yen}円を入金しましたˋ;`,
                  R`  return "＄{name}さん、＄{yen}円を入金しました";`,
                  R`  return '＄{name}' + 'さん、' + '＄{yen}' + '円を入金しました';`,
                  R`  return ＄{name} + 'さん、' + ＄{yen} + '円を入金しました';`,
                ],
                answer: 0,
                hints: [
                  'うまく表示されないのは、文を組み立てている行です。',
                  '式を埋め込めるのは、どの記号で囲んだ文字列でしたか？',
                  'シングルクォートとダブルクォートの中では、ドル記号と波かっこはただの文字です。',
                  'バッククォートで囲んだテンプレート文字列に直しましょう。',
                ],
                why: '4行目はシングルクォートで囲んでいるので、ドル記号と波かっこがただの文字として出てしまう。式を埋め込めるのはバッククォートで囲んだテンプレート文字列だけ。ダブルクォートに変えても同じ結果になる。',
              },
            ],
          },
          {
            id: 'js-1-3',
            title: '=== と ==、そして 0.1 + 0.2 の罠',
            talk: [
              ['saotome', '比べるときは === を使うのがお約束。== は型が違うと勝手に変換してから比べちゃうの。'],
              ['kasuga', 'えっ、\'100\' == 100 って true なんですか？ ゆるい……私の頭みたい……。'],
              ['saotome', 'ふふ、ゆずちゃんは == よりずっとしっかりしてるよ〜。それと、もう1つ有名な罠。0.1 + 0.2 は 0.3 にならないの。小数は2進数でぴったり表せないから、ほんの少しずれるんだ。'],
              ['player', 'だからお金は小数で持たずに「円の整数」で持つ、と。スプリント9でやるやつですね。'],
              ['saotome', 'そうそう、えらいえらい。'],
            ],
            figure: {
              title: '=== と ==',
              text: String.raw`  '100' === 100  → false
     └ 型が違う → その時点で別物

  '100' ==  100  → true
     └ 型をそろえてから比べる（ゆるい）

  0.1 + 0.2      → 0.30000000000000004
  0.1 + 0.2 === 0.3 → false`,
            },
            points: ['比べるときは ===（型までいっしょか）を使う', '0.1 + 0.2 は 0.3 にならない。お金は円の整数で扱う'],
            quiz: [
              {
                id: 'js-1-3-q1', type: 'predict', title: '3つの比較', lang: 'js',
                code: String.raw`console.log(0.1 + 0.2 === 0.3);
console.log('100' == 100);
console.log('100' === 100);`,
                q: '上から順に表示されるのは？',
                choices: ['true true false', 'false true false', 'false false false', 'true true true'],
                answer: 1,
                hints: [
                  '1行目: 小数はコンピュータの中でぴったり表せないことがあります。',
                  '0.1 + 0.2 は 0.30000000000000004 になります。',
                  '2行目の == は、型をそろえてから比べます。',
                  '3行目の === は、型が違えばその時点で false です。',
                ],
                why: '0.1 + 0.2 は 0.30000000000000004 なので false。== は文字列 \'100\' を数に直してから比べるので true。=== は型が違うので false。',
              },
              {
                id: 'js-1-3-q2', type: 'review', title: '送金の上限チェック', lang: 'js',
                story: '{daichi}くんの PR をレビューしよう。仕様: 金額は入力欄の文字列で届く。「今日の合計＋今回の金額」が10万円を超えたら止める。',
                file: 'src/transferLimit.js',
                code: String.raw`// 送金の上限チェック（金額はすべて円の整数）
const LIMIT = 100000;

export function checkTransfer(amountText, todayTotal) {
  const amount = amountText;
  if (amount == 0) {
    return '金額を入力してください';
  }
  if (todayTotal + amount > LIMIT) {
    return '1日の上限を超えています';
  }
  return 'OK';
}`,
                defects: [
                  { line: 5, kind: 'bug', why: '入力欄の文字列をそのまま使っている。9行目の todayTotal + amount が足し算ではなく連結になり（50000 と \'30000\' で \'5000030000\'）、上限内でも止められてしまう。Number(amountText) で数に直す。' },
                  { line: 6, kind: 'readability', why: '== は型を変換して比べるので、空文字や空白だけでも 0 と等しくなり、何を判定したいのか読み取りにくい。数に直したうえで === 0 で比べる。' },
                ],
                hints: [
                  'amountText はどんな型で届くと仕様に書いてありますか？',
                  '5行目で、その値を数に直していますか？',
                  '9行目の + は、片方が文字列だとどうなるでしょう？',
                  '6行目の比べ方は、=== と == のどちらでしょう？',
                  '欠陥は2つ。文字列のままにしている行（バグ）と、ゆるい比較の行（読みやすさ）です。',
                ],
                why: '5行目で文字列のまま使っているので、9行目の + が連結になって上限の判定が壊れる（バグ）。6行目の == は暗黙の型変換に頼っていて意図が読みにくい（読みやすさ）。Number で数に直し、=== で比べる。',
              },
            ],
          },
        ],
      },

      // ================================================================ 第2章
      {
        id: 'js-2',
        title: '関数・スコープ・クロージャ',
        badge: { icon: '🎁', name: 'クロージャの宝箱' },
        handout: {
          units: ['ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント20「費用を守る: トークン予算」'],
          knowledge: ['第1章: const と let', '関数を呼ぶと値が返ってくること'],
          talk: [
            ['saotome', '第2章は関数だよ〜。関数の書き方は何種類かあるけど、読めればこわくないからね。'],
            ['saotome', '最後に出てくるクロージャは、二重送信の防止やトークン予算の管理でも使われてるの。ハッカソンのコードがぐっと読みやすくなるよ。'],
          ],
        },
        sections: [
          {
            id: 'js-2-1',
            title: '関数宣言とアロー関数',
            talk: [
              ['saotome', '関数の書き方は大きく2つ。function で始める「関数宣言」と、=> を使う「アロー関数」。'],
              ['saotome', 'アロー関数は、=> の右が式1つなら、その値がそのまま返るの。でも波かっこで囲んだら、return を書かないと何も返らない。ここがよく引っかかるところ。'],
              ['player', '波かっこを付けた瞬間に、return が必要になる……。'],
              ['saotome', 'そう。「波かっこは、中で自分で return してね」の合図だと思うといいよ。ふふ、レビューで見つけたら、ちょっと得意になれるやつ。'],
            ],
            figure: {
              title: 'アロー関数の2つの形',
              text: String.raw`  (a) => a + 110
         └─ 式1つ → その値が返る ✔

  (a) => { a + 110; }
         └─ 波かっこ → return が要る
            書かないと undefined ✘

  (a) => { return a + 110; }  ✔`,
            },
            code: {
              lang: 'js',
              text: String.raw`function addFee(amount) {        // 関数宣言
  return amount + 110;
}
const addFee2 = (amount) => amount + 110;   // アロー関数`,
            },
            points: ['関数宣言（function）とアロー関数（=>）がある', 'アロー関数を波かっこで囲んだら return が必要。ないと undefined'],
            quiz: [
              {
                id: 'js-2-1-q1', type: 'predict', title: '手数料と税', lang: 'js',
                code: String.raw`const addFee = (amount) => amount + 110;
const addTax = (amount) => { amount * 1.1; };
console.log(addFee(1000), addTax(1000));`,
                q: '表示されるのは？',
                choices: ['1110 1100', '1110 undefined', 'undefined undefined', 'エラーになる'],
                answer: 1,
                hints: [
                  '2つの関数の違いは、=> の右側の形です。',
                  'addFee は => の右が式1つです。',
                  'addTax は波かっこで囲まれています。中に return はありますか？',
                  'return のない関数が返すのは何でしたか？',
                ],
                why: 'addFee は式1つなので 1110 が返る。addTax は波かっこで囲んでいるのに return がないので、計算はしても結果を返さず undefined になる。',
              },
            ],
          },
          {
            id: 'js-2-2',
            title: '引数のデフォルト値とスコープ',
            talk: [
              ['saotome', '引数には rate = 0.01 みたいに「渡されなかったときの値」を書けるよ。デフォルト値っていうの。'],
              ['saotome', 'ポイントは、デフォルト値が使われるのは undefined のときだけってこと。0 や空文字を渡したら、その値がそのまま使われるよ。'],
              ['saotome', 'それからスコープ。let と const は、いちばん近い波かっこの中でだけ見える箱なの。同じ名前でも、内側の箱は外側とは別物だよ。'],
              ['player', '入れ子の部屋みたいなものか。内側の部屋から外は見えるけど、外から内側は見えない。'],
              ['saotome', 'わぁ、そのたとえ上手〜。研修資料に使ってもいい？'],
            ],
            figure: {
              title: 'スコープは入れ子の部屋',
              text: String.raw`  ┌ ファイル ─────────────────────┐
  │ let label = '外'              │
  │ ┌ function show() ──────────┐ │
  │ │ let label = '中'          │ │
  │ │ ┌ if { } ───────────────┐ │ │
  │ │ │ let label = 'ブロック'│ │ │
  │ │ └───────────────────────┘ │ │
  │ │ return label  → '中'      │ │
  │ └───────────────────────────┘ │
  └───────────────────────────────┘`,
            },
            points: ['デフォルト値は引数が undefined のときだけ使われる（0 は 0 のまま）', 'let・const はいちばん近い波かっこの中だけで見える。内側の同じ名前は別の箱'],
            quiz: [
              {
                id: 'js-2-2-q1', type: 'predict', title: '手数料率のデフォルト値', lang: 'js',
                code: String.raw`function fee(amount, rate = 0.01) {
  return amount * rate;
}
console.log(fee(1000));
console.log(fee(1000, 0));
console.log(fee(1000, undefined));`,
                q: '上から順に表示されるのは？',
                choices: ['10 / 0 / 10', '10 / 10 / 10', '10 / 0 / NaN', '10 / 10 / NaN'],
                answer: 0,
                hints: [
                  '4行目は rate を渡していません。',
                  '5行目は rate に 0 を渡しています。0 は「渡していない」と同じでしょうか？',
                  'デフォルト値が使われるのは、引数が undefined のときだけです。',
                  '6行目は、わざわざ undefined を渡しています。',
                ],
                why: 'デフォルト値は undefined のときだけ使われる。4行目と6行目は rate が undefined なので 0.01 になり 10。5行目は 0 が渡されているので 1000 × 0 = 0。',
              },
              {
                id: 'js-2-2-q2', type: 'predict', title: 'どの label？', lang: 'js',
                code: String.raw`let label = '普通預金';
function show() {
  let label = '定期預金';
  if (true) {
    let label = '外貨預金';
  }
  return label;
}
console.log(show(), label);`,
                q: '表示されるのは？',
                choices: ['定期預金 普通預金', '外貨預金 普通預金', '外貨預金 外貨預金', '定期預金 定期預金'],
                answer: 0,
                hints: [
                  'label という名前の箱は、全部でいくつありますか？',
                  '5行目の let label は、if の波かっこの中でだけ見える箱です。',
                  '7行目の return label から見えるのは、どの箱でしょう？',
                  '9行目の label は、関数の外にある箱です。',
                ],
                why: 'let は、いちばん近い波かっこの中でだけ有効な別の箱を作る。7行目から見えるのは3行目の「定期預金」。5行目の箱は if の中で消える。9行目の label は1行目の「普通預金」。',
              },
            ],
          },
          {
            id: 'js-2-3',
            title: 'クロージャ: 関数が持ち歩く箱',
            talk: [
              ['saotome', '関数の中で作った関数は、外側の変数を覚えたまま持ち歩けるの。これがクロージャ。'],
              ['saotome', 'たとえばトークン予算。makeBudget(1000) を呼ぶたびに「used の箱」が1つでき、返した関数だけがその箱を触れる。外から勝手に書き換えられないから安心なんだ。'],
              ['player', '予算ごとに専用の財布を持たせる感じですね。'],
              ['saotome', 'そうそう。でも、箱を作る場所を間違えると、呼ぶたびに新しい財布になっちゃうの。どこで let しているかを見るのがコツだよ〜。'],
            ],
            figure: {
              title: 'クロージャは財布を持ち歩く',
              text: String.raw`  const a = makeBudget(1000)
  const b = makeBudget(1000)

  ┌─ a の財布 ─┐   ┌─ b の財布 ─┐
  │ used = 0   │   │ used = 0   │
  └─────▲──────┘   └─────▲──────┘
        │                │
     a(300)           b(100)
   a だけが触れる   b だけが触れる`,
            },
            code: {
              lang: 'js',
              text: String.raw`function makeBudget(limit) {
  let used = 0;              // この箱を…
  return (tokens) => {
    used += tokens;          // …返した関数が持ち歩く
    return limit - used;
  };
}`,
            },
            points: ['内側の関数は、外側の変数を覚えたまま持ち歩ける（クロージャ）', '外側の関数を呼ぶたびに新しい箱ができる。箱を作る位置（let の場所）を見る'],
            quiz: [
              {
                id: 'js-2-3-q1', type: 'predict', title: '2つのトークン予算', lang: 'js',
                code: String.raw`function makeBudget(limit) {
  let used = 0;
  return (tokens) => {
    used += tokens;
    return limit - used;
  };
}
const a = makeBudget(1000);
const b = makeBudget(1000);
a(300);
a(200);
console.log(a(100), b(100));`,
                q: '表示されるのは？',
                choices: ['400 900', '400 400', '900 900', '700 900'],
                answer: 0,
                hints: [
                  'makeBudget を2回呼んでいます。used の箱はいくつできますか？',
                  'a と b は、それぞれ自分の used を持っています。',
                  'a は 300 → 200 → 100 と3回使われています。',
                  'b は1回だけ、100 使われています。',
                ],
                why: 'makeBudget を呼ぶたびに別の used ができる。a の used は 300 + 200 + 100 = 600 なので 1000 − 600 = 400。b の used は 100 なので 900。',
              },
              {
                id: 'js-2-3-q2', type: 'predict', title: '連打ガード', lang: 'js',
                code: String.raw`function makeGuard() {
  return (text) => {
    let sent = false;
    if (sent) return '無視';
    sent = true;
    return '送信: ' + text;
  };
}
const guard = makeGuard();
console.log(guard('A'), guard('A'));`,
                q: '表示されるのは？（2回目は「無視」になってほしい）',
                choices: ['送信: A 無視', '送信: A 送信: A', '無視 無視', '無視 送信: A'],
                answer: 1,
                hints: [
                  'sent の箱は、どの関数の中で作られていますか？',
                  '3行目は、返した関数（guard）の中にあります。',
                  'guard を呼ぶたびに、3行目も実行されます。',
                  '毎回 sent = false から始まるとしたら、4行目の if は通るでしょうか？',
                ],
                why: 'let sent = false が返した関数の中にあるので、guard を呼ぶたびに新しい sent が false で作られる。2回とも「送信: A」になる。2回目を無視したいなら、3行目を makeGuard の中（return の前）に移して、クロージャで持ち歩かせる。',
              },
            ],
          },
        ],
      },

      // ================================================================ 第3章
      {
        id: 'js-3',
        title: '配列とオブジェクト',
        badge: { icon: '🧺', name: 'コピー職人' },
        handout: {
          units: ['ハッカソン スプリント1「キックオフ: チャット画面の骨組み」', 'ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント17「速さの壁: 一覧の再描画とN+1」'],
          knowledge: ['第2章: アロー関数（式1つなら値が返る）', '配列は [ ] 、オブジェクトは「キー: 値」の組'],
          talk: [
            ['saotome', '第3章は配列とオブジェクト。チャットのメッセージ一覧も、取引履歴も、ぜんぶ配列とオブジェクトでできてるの。'],
            ['saotome', 'スプリント1の「push したのに画面が変わらない」の理由も、この章の「参照とコピー」で分かるよ〜。'],
          ],
        },
        sections: [
          {
            id: 'js-3-1',
            title: 'map・filter・reduce',
            talk: [
              ['saotome', '配列を加工する三姉妹がいるの。filter は「条件に合うものだけ残す」、map は「1つずつ変換する」、reduce は「全部をまとめて1つにする」。'],
              ['saotome', 'つなげて書くと、上から下へ流れ作業みたいに読めるよ。取引履歴 → 出金だけ → 金額だけ → 合計、って感じ。'],
              ['player', 'for 文で書くより、何をしたいかが名前で分かりますね。'],
              ['saotome', 'そうなの。ただし map の中を波かっこで囲んだら、return を忘れずにね。第2章のあの罠、また出てくるよ〜。'],
            ],
            figure: {
              title: '流れ作業で読む',
              text: String.raw`  history  [入5000, 出1200, 入3000, 出800]
     │ .filter(出金だけ)
     ▼
           [出1200, 出800]
     │ .map(金額だけ)
     ▼
           [1200, 800]
     │ .reduce(合計, 0)
     ▼
           2000`,
            },
            points: ['filter は残す、map は変換する、reduce はまとめる', 'map のアロー関数を波かっこで囲んだら return が要る'],
            quiz: [
              {
                id: 'js-3-1-q1', type: 'predict', title: '出金の合計', lang: 'js',
                code: String.raw`const history = [
  { type: 'in', amount: 5000 },
  { type: 'out', amount: 1200 },
  { type: 'in', amount: 3000 },
  { type: 'out', amount: 800 },
];
const total = history
  .filter((h) => h.type === 'out')
  .map((h) => h.amount)
  .reduce((sum, a) => sum + a, 0);
console.log(total);`,
                q: '表示されるのは？',
                choices: ['2000', '8000', '10000', '[1200, 800]'],
                answer: 0,
                hints: [
                  'まず filter で、どの取引が残りますか？',
                  'type が \'out\' のものは2つです。',
                  'map で、残った取引が金額だけの配列になります。',
                  'reduce は 0 から始めて、金額を足していきます。',
                ],
                why: 'filter で出金（1200 と 800）だけが残り、map で [1200, 800] になり、reduce で 0 + 1200 + 800 = 2000。',
              },
              {
                id: 'js-3-1-q2', type: 'fix', title: 'undefined だらけの一覧', lang: 'js',
                story: '{hikari}ちゃんの PR。「会話履歴を『役割: 本文』の一覧にしたら、全部 undefined になっちゃった〜」',
                file: 'src/labels.js',
                code: String.raw`export function toLabels(messages) {
  return messages.map((m) => {
    m.role + ': ' + m.text;
  });
}`,
                bugLine: 3,
                fixes: ["    return m.role + ': ' + m.text;", "    m.role + ': ' + m.text,", "    messages.push(m.role + ': ' + m.text);", "    console.log(m.role + ': ' + m.text);"],
                answer: 0,
                hints: [
                  'map は、渡した関数が「返した値」で新しい配列を作ります。',
                  '2行目のアロー関数は、=> の右が波かっこで囲まれています。',
                  '波かっこで囲んだアロー関数は、何を書かないと値を返しませんか？',
                  '文字列を作っている3行目に、ある一語を足しましょう。',
                ],
                why: 'アロー関数を波かっこで囲んでいるので、3行目で文字列を作っても返していない。map は undefined を集めた配列を返してしまう。return を付ける（または波かっこを外して式1つにする）。',
              },
            ],
          },
          {
            id: 'js-3-2',
            title: '分割代入とスプレッド',
            talk: [
              ['saotome', 'const { name, plan } = user と書くと、オブジェクトから name と plan を取り出して、同じ名前の変数にできるの。分割代入っていうよ。'],
              ['saotome', '点3つの ... はスプレッド。中身を広げて、新しいオブジェクトや配列に詰め直すの。残りを全部まとめて受け取るのにも使えるよ。'],
              ['player', '同じキーが2回出てきたら？'],
              ['saotome', '後に書いた方が勝ち。だから「デフォルト設定を先に、上書きしたいものを後に」が定番の並びなんだ。逆にしちゃうと、せっかくの上書きが消えちゃうの。'],
            ],
            figure: {
              title: 'スプレッドは後勝ち',
              text: String.raw`  { ...defaults, ...input }
     │              │
     ▼              ▼
  model: 'small'  maxTokens: 2000
  maxTokens: 500 ──┘ 後から上書き

  結果 { model: 'small', maxTokens: 2000 }`,
            },
            code: {
              lang: 'js',
              text: String.raw`const user = { name: '夏目', plan: 'basic' };
const { name, plan } = user;       // 取り出す
const next = { ...user, plan: 'premium' };  // 一部だけ変えた新しいオブジェクト`,
            },
            points: ['分割代入でオブジェクトから値を取り出せる。...rest で残りをまとめて受け取れる', 'スプレッドは同じキーなら後に書いた方が勝つ'],
            quiz: [
              {
                id: 'js-3-2-q1', type: 'predict', title: 'プランの変更', lang: 'js',
                code: String.raw`const user = { name: '夏目', plan: 'basic', balance: 2000 };
const { name, ...rest } = user;
const upgraded = { ...user, plan: 'premium' };
console.log(rest.plan, upgraded.plan, user.plan);`,
                q: '表示されるのは？',
                choices: ['basic premium basic', 'premium premium premium', 'basic premium premium', 'undefined premium basic'],
                answer: 0,
                hints: [
                  '2行目の ...rest には、name 以外の何が入りますか？',
                  '3行目は、user の中身を広げた「新しい」オブジェクトを作っています。',
                  'upgraded の plan は、後から書いた \'premium\' が勝ちます。',
                  'user そのものは書き換えられていません。',
                ],
                why: 'rest は name 以外（plan と balance）を持つので rest.plan は basic。upgraded は新しいオブジェクトで、後に書いた plan が勝って premium。元の user は変わらず basic。',
              },
              {
                id: 'js-3-2-q2', type: 'predict', title: 'AI の設定を上書き', lang: 'js',
                code: String.raw`const defaults = { model: 'small', maxTokens: 500 };
const input = { maxTokens: 2000 };
const a = { ...defaults, ...input };
const b = { ...input, ...defaults };
console.log(a.maxTokens, b.maxTokens);`,
                q: '表示されるのは？',
                choices: ['2000 500', '2000 2000', '500 500', '500 2000'],
                answer: 0,
                hints: [
                  'a と b の違いは、広げる順番だけです。',
                  'スプレッドで同じキーが出てきたら、後に書いた方が勝ちます。',
                  'a では input が後、b では defaults が後です。',
                ],
                why: 'a は defaults の後に input を広げるので maxTokens は 2000。b は defaults が後なので 500 に戻ってしまう。デフォルトを先、上書きを後に書くのが定番。',
              },
            ],
          },
          {
            id: 'js-3-3',
            title: '参照とコピー',
            talk: [
              ['saotome', 'オブジェクトや配列を別の変数に入れても、中身はコピーされないの。同じ実物を指す「矢印」が増えるだけ。これを参照っていうよ。'],
              ['himuro', '{ ...obj } でコピーしても、浅いコピーだよ。中の配列は同じものを指したまま。別に難しい話じゃなくて、普通のことだけど。'],
              ['player', '氷室……相変わらずストレートだな。でも助かる。'],
              ['saotome', 'ふふ、蓮くんの言うとおり。それから push や reverse は、元の配列そのものを書き換えるの。渡された配列を書き換えると、呼び出した側までびっくりしちゃうからね〜。'],
            ],
            figure: {
              title: '浅いコピー',
              text: String.raw`  const copy = { ...original }

  original ─┐       copy ─┐
            ▼             ▼
  ┌──────────────┐ ┌──────────────┐
  │ owner '秋山' │ │ owner '秋山' │
  │ tags ───┐    │ │ tags ───┐    │
  └─────────│────┘ └─────────│────┘
            └──────┬─────────┘
                   ▼
            ['給与'] ← 同じ配列！`,
            },
            points: ['代入しても中身はコピーされない。同じ実物を指す（参照）', '{ ...obj } は浅いコピー。中の配列やオブジェクトは共有', 'push・reverse・sort は元の配列を書き換える'],
            quiz: [
              {
                id: 'js-3-3-q1', type: 'predict', title: 'コピーした口座', lang: 'js',
                code: String.raw`const original = { owner: '秋山', tags: ['給与'] };
const copy = { ...original };
copy.owner = '冬木';
copy.tags.push('定期');
console.log(original.owner, original.tags.length);`,
                q: '表示されるのは？',
                choices: ['秋山 1', '秋山 2', '冬木 2', '冬木 1'],
                answer: 1,
                hints: [
                  '2行目で、新しいオブジェクトは作られています。',
                  'copy.owner を変えても、original の owner は変わりません。',
                  'でも tags の中身（配列）はコピーされたでしょうか？',
                  'original.tags と copy.tags は、同じ配列を指しています。',
                ],
                why: 'スプレッドは浅いコピー。owner は別々なので original は秋山のまま。tags は同じ配列を共有しているので、copy から push すると original から見ても2件になる。',
              },
              {
                id: 'js-3-3-q2', type: 'review', title: '会話履歴のヘルパー', lang: 'js',
                story: '{rio}の PR をレビューしよう。ファイルの先頭に、守るべき決まりが書いてある。',
                file: 'src/history.js',
                code: String.raw`// 会話履歴のヘルパー
// 決まり: 渡された配列は変えないこと（画面の再描画が、配列が新しいかどうかで決まるため）
export function addMessage(history, role, text) {
  history.push({ role, text });
  return history;
}

export function lastUserMessage(history) {
  const reversed = history.reverse();
  return reversed.find((m) => m.role === 'user');
}

export function countByRole(history, role) {
  return history.filter((m) => m.role === role).length;
}`,
                defects: [
                  { line: 4, kind: 'bug', why: 'push は渡された配列そのものを書き換える。同じ配列を返すので再描画もされない。return [...history, { role, text }] のように新しい配列を作る。' },
                  { line: 9, kind: 'bug', why: 'reverse は元の配列を逆順に書き換えてしまう。呼ぶたびに会話履歴が逆さまになる。[...history].reverse() のようにコピーしてから並べ替える。' },
                ],
                hints: [
                  '決まりは「渡された配列は変えないこと」です。',
                  '配列そのものを書き換えるメソッドはどれでしょう？ push・reverse・filter を見比べましょう。',
                  'filter は新しい配列を返すので、元の配列は変わりません。',
                  'push と reverse は、どちらも元の配列を書き換えます。',
                ],
                why: '4行目の push と9行目の reverse は、どちらも渡された配列そのものを書き換える（バグ）。14行目の filter は新しい配列を作るので問題ない。スプレッドでコピーしてから扱う。',
              },
            ],
          },
        ],
      },

      // ================================================================ 第4章
      {
        id: 'js-4',
        title: '非同期',
        badge: { icon: '⏳', name: '待てる人' },
        handout: {
          units: ['ハッカソン スプリント3「AIにつなぐ: 返答の届け方」', 'ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント14「429に備える: リトライとバックオフ」'],
          knowledge: ['第2章: 関数を値として渡せること', '第3章: 配列の forEach・map'],
          talk: [
            ['saotome', '第4章は非同期。AI の返答も、残高の取得も、「待つ」処理だらけなの。'],
            ['saotome', 'コードは上から順に書いてあるのに、上から順には終わらない……ここがいちばん楽しいところ。ふふ、ゆっくりいこうね。'],
          ],
        },
        sections: [
          {
            id: 'js-4-1',
            title: 'コールバック → Promise → async/await',
            talk: [
              ['saotome', '昔は「終わったらこの関数を呼んでね」とコールバックを渡してたの。入れ子が深くなりすぎて、ピラミッドみたいになっちゃった。'],
              ['saotome', 'そこで Promise（あとで値が届く約束）ができて、さらに async/await で、上から順に読める書き方になったんだ。'],
              ['player', 'じゃあ実行の順番は？'],
              ['saotome', 'ふつうの処理を全部やってから、Promise の続き、そのあとタイマーの続き、の順。0ミリ秒のタイマーでも、Promise より後なんだよ〜。await に出会うと、その関数はいったん休んで、呼んだ側が先に進むの。'],
            ],
            figure: {
              title: '実行の順番',
              text: String.raw`  ① ふつうの処理（上から全部）
       │
       ▼
  ② Promise の続き（then・await の後）
       │
       ▼
  ③ タイマーの続き（0ミリ秒でもここ）`,
            },
            code: {
              lang: 'js',
              text: String.raw`// コールバック
getBalance(id, (b) => show(b));
// Promise
getBalance(id).then((b) => show(b));
// async/await
const b = await getBalance(id);
show(b);`,
            },
            points: ['コールバック → Promise → async/await の順に読みやすくなった', 'ふつうの処理 → Promise の続き → タイマーの続き の順に動く', 'await で関数は一時停止し、呼んだ側が先に進む'],
            quiz: [
              {
                id: 'js-4-1-q1', type: 'predict', title: '4つのログ', lang: 'js',
                code: String.raw`console.log('1: 送信');
setTimeout(() => console.log('2: タイマー'), 0);
Promise.resolve().then(() => console.log('3: Promise'));
console.log('4: 画面更新');`,
                q: '表示される順番は？',
                choices: ['1 → 2 → 3 → 4', '1 → 4 → 3 → 2', '1 → 4 → 2 → 3', '1 → 3 → 2 → 4'],
                answer: 1,
                hints: [
                  'まず、ふつうの処理（その場で終わるもの）が全部動きます。',
                  '1 と 4 は、ふつうの console.log です。',
                  '2 と 3 は「あとで」動く予約です。どちらが先でしょう？',
                  'Promise の続きは、タイマーの続きより先に動きます。0ミリ秒でもです。',
                ],
                why: 'ふつうの処理の 1 と 4 が先に動く。そのあと Promise の続き（3）、最後にタイマーの続き（2）。0ミリ秒のタイマーでも Promise より後になる。',
              },
              {
                id: 'js-4-1-q2', type: 'predict', title: 'AI に聞いている間', lang: 'js',
                code: String.raw`async function ask() {
  console.log('B');
  const reply = await getReply();   // AI の返答を待つ（Promise を返す）
  console.log('D');
  return reply;
}
console.log('A');
ask();
console.log('C');`,
                q: '表示される順番は？',
                choices: ['A B C D', 'A B D C', 'A C B D', 'B A C D'],
                answer: 0,
                hints: [
                  '関数 ask が呼ばれるのは、A を表示した後です。',
                  'ask の中は、await に出会うまではふつうに進みます。',
                  'await に出会うと ask はいったん休み、呼んだ側が先に進みます。',
                  '返答が届いてから、ask の続きが動きます。',
                ],
                why: 'A → ask が始まって B → await で ask が休み、呼んだ側に戻って C → 返答が届いて ask の続きの D。await は関数の中だけを止め、全体は止めない。',
              },
            ],
          },
          {
            id: 'js-4-2',
            title: 'await 忘れ',
            talk: [
              ['saotome', 'いちばん多い事故が await の付け忘れ。Promise を返す関数に await を付けないと、届いた値じゃなくて「約束の紙」そのものを受け取っちゃうの。'],
              ['onizuka', 'はぁ……これ、うちのチームでも今週3回見た。残高が「undefined円」って出たら、まず await 忘れを疑え。以上。'],
              ['player', '鬼塚、なんだかんだ見に来てくれるんだな。'],
              ['saotome', 'ふふ、迅くんやさしいね〜。それと async 関数は、return した値を必ず Promise に包んで返すってことも覚えておいてね。'],
            ],
            figure: {
              title: '約束の紙と、中身',
              text: String.raw`  api.getBalance(id)
     └→ Promise（約束の紙）📄
          .amount → undefined ✘

  await api.getBalance(id)
     └→ { amount: 12000 }（中身）💴
          .amount → 12000 ✔`,
            },
            points: ['Promise を返す関数には await を付けて中身を受け取る', 'async 関数の戻り値は、いつも Promise に包まれる'],
            quiz: [
              {
                id: 'js-4-2-q1', type: 'fix', title: '残高が undefined円', lang: 'js',
                story: '{daichi}くんの PR。「残高を表示したら『残高: undefined円』になっちゃった……api.getBalance は Promise を返すって書いてあったけど……」',
                file: 'src/balance.js',
                code: String.raw`export async function showBalance(api, accountId) {
  const res = api.getBalance(accountId);   // Promise を返す
  return '残高: ' + res.amount + '円';
}`,
                bugLine: 2,
                fixes: ['  const res = await api.getBalance(accountId);   // Promise を返す', '  const res = api.getBalance(await accountId);   // Promise を返す', '  const res = api.getBalance(accountId).amount;   // Promise を返す', '  await const res = api.getBalance(accountId);   // Promise を返す'],
                answer: 0,
                hints: [
                  'res に入っているのは、残高のデータでしょうか？ それとも約束（Promise）でしょうか？',
                  'Promise には amount という項目はありません。',
                  '中身が届くまで待つには、何を付けますか？',
                  'await は、Promise を返す呼び出しの前に付けます。',
                ],
                why: 'await がないので res は Promise そのもの。Promise に amount はないので undefined になる。const res = await api.getBalance(accountId); と書けば、届いた中身を受け取れる。',
              },
              {
                id: 'js-4-2-q2', type: 'predict', title: 'async 関数が返すもの', lang: 'js',
                code: String.raw`async function getRate() {
  return 0.02;
}
const r = getRate();
console.log(typeof r, r === 0.02);`,
                q: '表示されるのは？',
                choices: ['number true', 'object false', 'number false', 'undefined false'],
                answer: 1,
                hints: [
                  'getRate には async が付いています。',
                  'async 関数は、return した値をそのまま返すでしょうか？',
                  'async 関数の戻り値は、いつも Promise に包まれます。',
                  'Promise の typeof は何でしょう？',
                ],
                why: 'async 関数は 0.02 を Promise に包んで返す。r は Promise（オブジェクト）なので typeof は object、0.02 とは等しくないので false。中身がほしければ await getRate() と書く。',
              },
            ],
          },
          {
            id: 'js-4-3',
            title: 'Promise.all とエラー',
            talk: [
              ['saotome', 'おたがい関係ない待ちが2つあるなら、Promise.all でいっしょに待てるの。1秒の待ちを2つ順番に待つと2秒、いっしょなら1秒。'],
              ['saotome', 'それから forEach に async 関数を渡しても、forEach は待ってくれないの。終わる前に次へ進んじゃう。待ちたいなら for...of で await するか、map と Promise.all。'],
              ['player', 'エラーはどうなります？'],
              ['saotome', 'await した Promise が失敗すると、その場でエラーが投げられるよ。catch で握りつぶして 0 や空を返すと、「残高0円」みたいな嘘を見せちゃうから、銀行では特に気をつけようね。'],
            ],
            figure: {
              title: '順番に待つ と いっしょに待つ',
              text: String.raw`  順番に（await を2回）
  ├─ 口座 ──┤
            ├─ 履歴 ──┤      → 約2秒

  いっしょに（Promise.all）
  ├─ 口座 ──┤
  ├─ 履歴 ──┤                → 約1秒`,
            },
            points: ['関係のない待ちは Promise.all でいっしょに待つ', 'forEach は async 関数の終わりを待たない', '失敗を握りつぶして 0 や空を返すと、嘘の表示になる'],
            quiz: [
              {
                id: 'js-4-3-q1', type: 'predict', title: '何秒かかる？', lang: 'js',
                code: String.raw`// wait(ms) は ms ミリ秒後に解決する Promise を返す
async function sequential() {
  await wait(1000);   // 口座情報
  await wait(1000);   // 取引履歴
}
async function parallel() {
  await Promise.all([wait(1000), wait(1000)]);
}`,
                q: 'sequential と parallel は、それぞれだいたい何秒で終わる？',
                choices: ['どちらも約1秒', 'どちらも約2秒', 'sequential 約2秒 / parallel 約1秒', 'sequential 約1秒 / parallel 約2秒'],
                answer: 2,
                hints: [
                  'sequential は、await を2回、順番にしています。',
                  '1つ目の待ちが終わるまで、2つ目の wait は始まりません。',
                  'parallel は、2つの wait を同時に始めてから、まとめて待っています。',
                ],
                why: 'sequential は1秒待ってから次の1秒を始めるので約2秒。parallel は2つを同時に始めて両方の終わりを待つので約1秒。おたがい関係ない待ちなら Promise.all が速い。',
              },
              {
                id: 'js-4-3-q2', type: 'review', title: '口座まとめ API', lang: 'js',
                story: '{osamu}さんに頼まれて、{hikari}ちゃんの PR を一緒にレビューすることに。ファイル先頭の決まりを確認しよう。',
                file: 'src/accounts.js',
                code: String.raw`// 決まり: 1つでも取れなかったら、エラーを呼び出し元に伝える（0円や空に見せない）
// 口座はおたがい関係ないので、まとめて取ってよい
export async function totalBalance(api, ids) {
  let total = 0;
  ids.forEach(async (id) => {
    const b = await api.getBalance(id);
    total += b.amount;
  });
  return total;
}

export async function loadHistories(api, ids) {
  try {
    const list = [];
    for (const id of ids) {
      list.push(await api.getHistory(id));
    }
    return list;
  } catch (e) {
    return [];
  }
}`,
                defects: [
                  { line: 5, kind: 'bug', why: 'forEach は async 関数の終わりを待たない。残高が届く前に9行目の return total が動き、いつも 0 が返る。for...of で await するか、Promise.all を使う。' },
                  { line: 16, kind: 'perf', why: '口座はおたがい関係ないのに、1件ずつ順番に待っている。件数ぶん時間がかかる。Promise.all(ids.map(...)) でまとめて待てる。' },
                  { line: 20, kind: 'spec', why: '失敗を握りつぶして空の配列を返している。決まりでは呼び出し元にエラーを伝える。「取引なし」と「取れなかった」の区別がつかなくなる。' },
                ],
                hints: [
                  '決まりは2つ。「エラーを伝える」と「まとめて取ってよい」です。',
                  'forEach は、渡した async 関数が終わるのを待つでしょうか？',
                  'for...of の中で1件ずつ await すると、時間はどうなりますか？',
                  'catch の中で何を返しているかを見ましょう。決まりと合っていますか？',
                  '欠陥は3つ。forEach の行（バグ）、1件ずつ await する行（性能）、catch で空を返す行（仕様とずれ）です。',
                ],
                why: '5行目の forEach は await を待たず、いつも 0 を返す（バグ）。16行目は関係ない取得を1件ずつ待っていて遅い（性能）。20行目は失敗を空の配列で隠していて、決まりに反する（仕様とずれ）。',
              },
            ],
          },
        ],
      },

      // ================================================================ 第5章
      {
        id: 'js-5',
        title: 'クラスと this',
        badge: { icon: '🪞', name: 'this 探偵' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント10「勘定系API（Java）とつなぐ」'],
          knowledge: ['第2章: 関数宣言とアロー関数', '第3章: オブジェクトのプロパティ', 'Java コース第1章「クラスとコンストラクタ」（読んでいると楽）'],
          talk: [
            ['saotome', '第5章はクラス。Java の章を読んだなら、だいたい同じだから安心してね。'],
            ['saotome', 'ただ、JavaScript の this はちょっと気まぐれなの。「誰が呼んだか」で中身が変わるんだ。そこを探偵みたいに追いかけようね〜。'],
          ],
        },
        sections: [
          {
            id: 'js-5-1',
            title: 'class・constructor・メソッド',
            talk: [
              ['saotome', 'class は設計図。new すると constructor が1回動いて、実物（インスタンス）ができるよ。'],
              ['saotome', 'constructor の中で this.balance = ... と書くと、その実物に値を持たせられるの。this. を付け忘れると、ただの変数への代入になってエラーになっちゃう。'],
              ['player', 'メソッドが return this してると？'],
              ['saotome', '自分自身を返すから、acc.deposit(1000).deposit(500) みたいに、点でつなげて呼べるの。メソッドチェーンっていうよ。えらいえらい、いいところに気づいたね。'],
            ],
            figure: {
              title: 'new すると',
              text: String.raw`  new Account('桜井')
        │
        ▼ constructor が1回動く
  ┌─ acc ───────────────┐
  │ owner   = '桜井'    │ ← this.owner
  │ balance = 0         │ ← this.balance
  └─────────────────────┘
  acc.deposit(1000) → this は acc`,
            },
            code: {
              lang: 'js',
              text: String.raw`class Account {
  constructor(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
  }
  deposit(amount) {
    this.balance += amount;
    return this;
  }
}`,
            },
            points: ['new で constructor が1回動き、this に値を持たせる', 'メソッドの中の this は、そのメソッドを呼んだ実物', 'return this でメソッドをつなげて呼べる'],
            quiz: [
              {
                id: 'js-5-1-q1', type: 'predict', title: '2回の入金', lang: 'js',
                code: String.raw`class Account {
  constructor(owner, balance = 0) {
    this.owner = owner;
    this.balance = balance;
  }
  deposit(amount) {
    this.balance += amount;
    return this;
  }
}
const acc = new Account('桜井');
acc.deposit(1000).deposit(500);
console.log(acc.balance);`,
                q: '表示されるのは？',
                choices: ['1500', '500', '1000', 'エラーになる'],
                answer: 0,
                hints: [
                  'new Account(\'桜井\') では、balance を渡していません。最初の残高は？',
                  'deposit は最後に return this をしています。',
                  'acc.deposit(1000) の結果は acc 自身です。',
                  'そこにもう一度 deposit(500) が呼ばれます。',
                ],
                why: 'balance はデフォルト値の 0 から始まる。deposit は自分自身を返すので、acc.deposit(1000).deposit(500) は同じ acc に2回入金する。0 + 1000 + 500 = 1500。',
              },
              {
                id: 'js-5-1-q2', type: 'fix', title: 'new した瞬間のエラー', lang: 'js',
                story: '{daichi}くんの PR。「チャットのセッションを new したら、いきなり ReferenceError って出ちゃった……」',
                file: 'src/session.js',
                code: String.raw`export class ChatSession {
  constructor(userId) {
    this.userId = userId;
    messages = [];
  }

  add(text) {
    this.messages.push(text);
  }
}`,
                bugLine: 4,
                fixes: ['    this.messages = [];', '    let messages = [];', '    const messages = [];', '    this.messages;'],
                answer: 0,
                hints: [
                  'constructor の中で、実物に値を持たせている行を見比べましょう。',
                  '3行目と4行目の違いは何でしょう？',
                  'this. のない messages は、どこにも作られていない変数です。',
                  'let messages にすると、constructor の中だけの変数になり、8行目から見えません。',
                ],
                why: '4行目は this. がないので、存在しない変数 messages への代入になり ReferenceError（クラスの中は厳格モード）。this.messages = []; にすれば、8行目の this.messages.push が動く。let や const では constructor の中だけの変数になってしまう。',
              },
            ],
          },
          {
            id: 'js-5-2',
            title: '継承: extends と super',
            talk: [
              ['saotome', 'extends で、別のクラスを土台にした新しいクラスを作れるよ。親のメソッドをそのまま使えて、同じ名前で書けば上書きもできるの。'],
              ['saotome', '親のメソッドの中の this.fee() は、「実物」のクラスのメソッドを探しに行くの。だから子が fee を上書きしてたら、子のほうが呼ばれるんだ。'],
              ['player', '子クラスで constructor を書くときは？'],
              ['saotome', 'this を使う前に、必ず super(...) で親の constructor を呼ぶこと。順番を守らないとエラーになるよ〜。'],
            ],
            figure: {
              title: 'メソッドは実物のクラスから探す',
              text: String.raw`  new PremiumAccount('柏木').describe()
       │
       ▼ describe は？
  PremiumAccount ─ fee() → 0   ← ①ここから
       │ extends
       ▼
  Account ─ describe() ← ②あった
          └ fee() → 220（上書き済み）

  describe の中の this.fee() → ① の 0`,
            },
            points: ['extends で親を土台にしたクラスを作る。同じ名前のメソッドで上書きできる', 'this.メソッド() は実物のクラスから探す', '子の constructor では this より先に super(...)'],
            quiz: [
              {
                id: 'js-5-2-q1', type: 'predict', title: 'プレミアム口座の手数料', lang: 'js',
                code: String.raw`class Account {
  constructor(owner) {
    this.owner = owner;
  }
  fee() { return 220; }
  describe() { return this.owner + '：手数料' + this.fee() + '円'; }
}
class PremiumAccount extends Account {
  fee() { return 0; }
}
console.log(new PremiumAccount('柏木').describe());`,
                q: '表示されるのは？',
                choices: ['柏木：手数料0円', '柏木：手数料220円', 'undefined：手数料0円', 'エラーになる'],
                answer: 0,
                hints: [
                  'PremiumAccount は constructor を書いていません。親の constructor がそのまま使われます。',
                  'describe は親の Account にしかありません。',
                  'describe の中の this は、どのクラスの実物でしょう？',
                  'this.fee() は、実物のクラス（PremiumAccount）から探します。',
                ],
                why: 'constructor は親のものが使われ、owner は柏木。describe は親のメソッドだが、this は PremiumAccount の実物なので、this.fee() は上書きした 0 を返す。',
              },
              {
                id: 'js-5-2-q2', type: 'fix', title: '積立口座が作れない', lang: 'js',
                story: '{rio}の PR。「積立口座のクラスを作ったら、new した瞬間に『super を先に呼べ』って怒られた。俺としたことが（笑）」',
                file: 'src/savings.js',
                code: String.raw`class Account {
  constructor(owner) {
    this.owner = owner;
  }
}

export class SavingsAccount extends Account {
  constructor(owner, rate) {
    this.owner = owner;
    this.rate = rate;
  }
}`,
                bugLine: 9,
                fixes: ['    super(owner);', '    Account(owner);', '    this.super(owner);', '    new Account(owner);'],
                answer: 0,
                hints: [
                  'SavingsAccount は Account を extends しています。',
                  '子クラスの constructor で、this を使う前にしなければならないことは？',
                  '親の constructor は、owner を受け取って this.owner に入れてくれます。',
                  '親の constructor を呼ぶキーワードは super です。',
                ],
                why: '子クラスの constructor では、this を使う前に super(...) で親の constructor を呼ぶ必要がある。9行目を super(owner); にすれば、親が this.owner を入れてくれ、そのあと this.rate も使える。',
              },
            ],
          },
          {
            id: 'js-5-3',
            title: 'this の落とし穴',
            talk: [
              ['saotome', 'this は「点の左側にいる人」なの。n.hello() なら n。でも const fn = n.hello と取り出して fn() と呼ぶと、点の左に誰もいないから this は undefined になっちゃう。'],
              ['saotome', 'ボタンのクリックやタイマーにメソッドを渡すときも同じ。渡した瞬間に点の左が消えるんだ。'],
              ['player', '置き去りにされたメソッド……なんか切ない。'],
              ['saotome', 'ふふ、だからアロー関数で包んであげるの。() => this.refresh() って書くと、アロー関数は外側の this をそのまま使うから迷子にならないよ。function で包むと、また迷子になるから気をつけてね〜。'],
            ],
            figure: {
              title: 'this は点の左',
              text: String.raw`  n.hello()         this → n       ✔
  └┬┘
   点の左

  const fn = n.hello
  fn()              this → undefined ✘

  btn.on(this.refresh)        ✘ 迷子
  btn.on(() => this.refresh()) ✔`,
            },
            points: ['this は呼んだときの「点の左」で決まる', 'メソッドを取り出して渡すと this が消える。アロー関数で包む', 'function で包むと this は外側と別になる'],
            quiz: [
              {
                id: 'js-5-3-q1', type: 'predict', title: '取り出したメソッド', lang: 'js',
                code: String.raw`class Notifier {
  constructor(name) {
    this.name = name;
  }
  hello() {
    return this.name + 'さん、ようこそ';
  }
}
const n = new Notifier('楓');
const fn = n.hello;
console.log(fn());`,
                q: 'どうなる？',
                choices: ['楓さん、ようこそ と表示される', 'undefinedさん、ようこそ と表示される', 'エラーになる（this が undefined）', 'Notifierさん、ようこそ と表示される'],
                answer: 2,
                hints: [
                  '10行目で、メソッドだけを取り出しています。',
                  '11行目の fn() の「点の左」には誰がいますか？',
                  'クラスの中は厳格モードなので、点の左がいないと this は undefined です。',
                  'undefined の name を読もうとすると、どうなるでしょう？',
                ],
                why: 'fn() は点の左に誰もいないので、this は undefined（クラスの中は厳格モード）。this.name で undefined のプロパティを読もうとして TypeError になる。n.hello() と呼ぶか、bind やアロー関数で this を固定する。',
              },
              {
                id: 'js-5-3-q2', type: 'review', title: '残高表示のクラス', lang: 'js',
                story: '{hikari}ちゃんの PR をレビューしよう。「ボタンで更新」と「1分ごとの自動更新」をつけたけど、どちらも動かないらしい。',
                file: 'src/BalanceView.js',
                code: String.raw`// 残高の表示を受け持つクラス
export class BalanceView {
  constructor(api, el) {
    this.api = api;
    this.el = el;
    this.amount = 0;
  }

  start(button) {
    button.addEventListener('click', this.refresh);
  }

  async refresh() {
    this.amount = await this.api.getBalance();
    this.el.textContent = '残高: ' + this.amount + '円';
  }

  startAuto(timer) {
    timer.every(60000, function () { this.refresh(); });
  }
}`,
                defects: [
                  { line: 10, kind: 'bug', why: 'this.refresh をそのまま渡しているので、クリックで呼ばれたとき this が BalanceView にならない。() => this.refresh() で包むか、this.refresh.bind(this) を渡す。' },
                  { line: 19, kind: 'bug', why: 'function で包むと、その中の this は外側の BalanceView ではなくなる。アロー関数 () => this.refresh() にする。' },
                ],
                hints: [
                  'refresh の中では this.api と this.el を使っています。this が BalanceView でないと動きません。',
                  'メソッドを取り出して渡すと、this はどうなりましたか？',
                  '10行目は、this.refresh を取り出して渡しています。',
                  '19行目は function で包んでいます。アロー関数とは this の扱いが違います。',
                ],
                why: '10行目はメソッドを取り出して渡しているので、呼ばれたときに this が消える（バグ）。19行目は function で包んでいるので、その中の this は BalanceView ではない（バグ）。どちらもアロー関数で包めば、外側の this がそのまま使える。',
              },
            ],
          },
        ],
      },

      // ================================================================ 第6章
      {
        id: 'js-6',
        title: 'エラー処理とモジュール',
        badge: { icon: '🛟', name: '例外の救命ボート' },
        handout: {
          units: ['ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント15「誰でも使える画面: アクセシビリティとエラー表示」', 'ハッカソン スプリント16「ログに個人情報を残さない」'],
          knowledge: ['第4章: async/await とエラー', '第5章: クラス（new Error も実はクラス）'],
          talk: [
            ['saotome', '最終章だよ〜。ここまで来たの、ほんとにえらいえらい。'],
            ['saotome', 'エラーをどう受け止めるか、ファイルどうしをどうつなぐか、それから「値がないかもしれない」をどう書くか。読めるようになったら、ハッカソンのコードはほとんど怖くなくなるよ。'],
            ['player', '先輩、最後までよろしくお願いします。'],
          ],
        },
        sections: [
          {
            id: 'js-6-1',
            title: 'try / catch / finally と throw',
            talk: [
              ['saotome', 'throw でエラーを投げると、その場で処理が止まって、いちばん近い catch まで飛んでいくの。途中の行は飛ばされるよ。'],
              ['saotome', 'finally は、成功しても失敗しても必ず動く場所。「送信中」のフラグを戻すみたいな後片付けは、ここに書くのがお約束なんだ。'],
              ['player', 'try の最後に後片付けを書くと？'],
              ['saotome', 'エラーのときはそこまで届かないから、ボタンが「送信中」のまま押せなくなっちゃうの。スプリント8の細谷さんが連打して見つけそうなやつだね、ふふ。'],
            ],
            figure: {
              title: 'エラーの飛び方',
              text: String.raw`  try {
    A ──────────── 動く
    throw! ──┐
    B        │     飛ばされる
  }          │
  catch { ◀──┘     C が動く
    C
  }
  finally {        成功でも失敗でも
    D              必ず動く
  }`,
            },
            points: ['throw すると、いちばん近い catch まで飛ぶ。途中の行は動かない', 'finally は成功でも失敗でも必ず動く。後片付けはここに書く'],
            quiz: [
              {
                id: 'js-6-1-q1', type: 'predict', title: '残高不足', lang: 'js',
                code: String.raw`function withdraw(balance, amount) {
  if (amount > balance) {
    throw new Error('残高不足');
  }
  return balance - amount;
}
function run() {
  try {
    console.log('A');
    withdraw(1000, 5000);
    console.log('B');
  } catch (e) {
    console.log('C: ' + e.message);
  } finally {
    console.log('D');
  }
}
run();`,
                q: '表示される順番は？',
                choices: ['A → C: 残高不足 → D', 'A → B → C: 残高不足 → D', 'A → B → D', 'A → C: 残高不足'],
                answer: 0,
                hints: [
                  '10行目で 1000 円から 5000 円を引き出そうとしています。',
                  'withdraw の中で throw が起きます。',
                  'throw のあと、try の残り（11行目）は動くでしょうか？',
                  'finally は、エラーがあってもなくても動きます。',
                ],
                why: 'A を表示 → withdraw で throw → 11行目の B は飛ばされて catch へ → C: 残高不足 → 最後に finally の D。',
              },
              {
                id: 'js-6-1-q2', type: 'predict', title: '送信に失敗したあと', lang: 'js',
                code: String.raw`async function sendWithLock(state, send, text) {
  state.sending = true;
  try {
    await send(text);
    state.sending = false;
  } catch (e) {
    state.error = '送信できませんでした';
  }
}
// failingSend は通信エラーで失敗する（reject される）
// （async 関数の中で）
const state = { sending: false, error: null };
await sendWithLock(state, failingSend, 'こんにちは');
console.log(state.sending, state.error);`,
                q: '表示されるのは？',
                choices: ['true 送信できませんでした', 'false 送信できませんでした', 'false null', 'true null'],
                answer: 0,
                hints: [
                  '2行目で sending は true になります。',
                  '4行目の await send(text) で失敗すると、どこへ飛びますか？',
                  '5行目の state.sending = false は、失敗したときに動くでしょうか？',
                  'catch の中では、sending を戻していません。',
                ],
                why: '4行目で失敗すると5行目は飛ばされ、catch で error だけが入る。sending は true のまま残り、ボタンが押せなくなる。sending = false は finally に書けば、失敗しても必ず戻る。',
              },
            ],
          },
          {
            id: 'js-6-2',
            title: 'import と export',
            talk: [
              ['saotome', 'ファイルどうしは export と import でつなぐの。export には2種類あるよ。名前つき export と、ファイルに1つだけの export default。'],
              ['saotome', '名前つきは、import するときに波かっこで囲んで、同じ名前で受け取る。default は波かっこなしで、好きな名前で受け取れるの。'],
              ['player', '波かっこがあるかないかで、受け取るものが違うんですね。'],
              ['saotome', 'そう、ここを読み間違えると「そんな export はありません」って怒られちゃう。えらいえらい、もうレビューできるね。'],
            ],
            figure: {
              title: '名前つき と default',
              text: String.raw`  money.js
  ┌─────────────────────────────┐
  │ export function yen()  ─────┼─┐ 名前つき
  │ export default format ──────┼┐│ ファイルに1つ
  └─────────────────────────────┘││
  app.js                         ││
  import show, { yen } ◀─────────┘│
         ▲       └────────────────┘
     好きな名前   同じ名前＋波かっこ`,
            },
            points: ['名前つき export は、波かっこで同じ名前を指定して import する', 'export default はファイルに1つ。波かっこなしで好きな名前で import できる'],
            quiz: [
              {
                id: 'js-6-2-q1', type: 'predict', title: 'お金の表示', lang: 'js',
                code: String.raw`// money.js
export const TAX = 0.1;
export function yen(n) { return n + '円'; }
export default function format(n) { return '¥' + n; }

// app.js
import show, { yen } from './money.js';
console.log(show(500), yen(500));`,
                q: '表示されるのは？',
                choices: ['¥500 500円', '500円 500円', 'エラーになる（show という export はない）', '¥500 ¥500'],
                answer: 0,
                hints: [
                  '7行目の show は、波かっこの外にあります。',
                  '波かっこなしで受け取るのは、名前つき export でしょうか？ default でしょうか？',
                  'default は好きな名前で受け取れます。show の正体は format です。',
                  'yen は波かっこの中にあるので、名前つき export の yen です。',
                ],
                why: 'show は default export（format）を好きな名前で受け取ったもの。show(500) は ¥500。yen は名前つき export なので 500円。',
              },
              {
                id: 'js-6-2-q2', type: 'fix', title: '口座番号のマスク', lang: 'js',
                story: '{daichi}くんの PR。「口座番号を下4桁だけ見せる関数を import したら、『default という export はありません』って言われた……」',
                file: 'src/view.js',
                code: String.raw`// format.js
export function maskAccount(no) {
  return '****' + no.slice(-4);
}

// view.js
import maskAccount from './format.js';
console.log(maskAccount('1234567890'));`,
                bugLine: 7,
                fixes: ["import { maskAccount } from './format.js';", "import maskAccount from 'format.js';", "import * from './format.js';", "export maskAccount from './format.js';"],
                answer: 0,
                hints: [
                  'format.js では、maskAccount をどんな形で export していますか？',
                  'export default はどこにもありません。',
                  '名前つき export を受け取るには、何で囲みますか？',
                ],
                why: 'maskAccount は名前つき export なので、波かっこで囲んで import { maskAccount } と書く。波かっこなしだと default export を探しに行き、無いのでエラーになる。',
              },
            ],
          },
          {
            id: 'js-6-3',
            title: 'null と undefined、?. と ??',
            talk: [
              ['saotome', 'undefined は「まだ何も入ってない」、null は「わざと空にしてある」。どっちも「値がない」の仲間だよ。'],
              ['saotome', 'a?.b は、a が null か undefined なら、エラーにせず undefined を返してくれるの。a ?? b は、a が null か undefined のときだけ b を使う。'],
              ['player', '|| とは何が違うんです？'],
              ['saotome', '|| は 0 や空文字でも右に行っちゃうの。上限 0 円を「上限なし」と読み間違えたら大変でしょ？ お金の 0 はちゃんと 0 として扱える ?? が安心なんだ。ふふ、これで全部の章、おしまい。{player}くん、ほんとにえらかったね。'],
            ],
            figure: {
              title: '|| と ??',
              text: String.raw`  左の値      │ 左 || 右 │ 左 ?? 右
  ───────────┼──────────┼─────────
  0          │ 右       │ 0
  ''         │ 右       │ ''
  null       │ 右       │ 右
  undefined  │ 右       │ 右
  5000       │ 5000     │ 5000`,
            },
            points: ['?. は途中が null・undefined でもエラーにせず undefined を返す', '?? は null・undefined のときだけ右を使う。|| は 0 や空文字でも右に行く', 'x == null は null と undefined の両方を見分ける定番の書き方'],
            quiz: [
              {
                id: 'js-6-3-q1', type: 'predict', title: '上限とニックネーム', lang: 'js',
                code: String.raw`const user = { name: '若葉', settings: { limit: 0 } };
console.log(user.settings.limit || 5000);
console.log(user.settings.limit ?? 5000);
console.log(user.profile?.nickname ?? '名無し');`,
                q: '上から順に表示されるのは？',
                choices: ['5000 / 0 / 名無し', '0 / 0 / 名無し', '5000 / 5000 / undefined', '0 / 5000 / エラーになる'],
                answer: 0,
                hints: [
                  'limit は 0 です。|| は 0 をどう扱いますか？',
                  '?? が右を使うのは、左が null か undefined のときだけです。',
                  'user に profile はありません。?. の左が undefined だとどうなりますか？',
                  'undefined ?? \'名無し\' は何になるでしょう？',
                ],
                why: '|| は 0 でも右に行くので 5000。?? は 0 を値として扱うので 0。profile がないので ?. が undefined を返し、?? で名無しになる。',
              },
              {
                id: 'js-6-3-q2', type: 'review', title: 'AI の返答と上限', lang: 'js',
                story: '{rio}の PR をレビューしよう。ファイルの先頭に、守るべき決まりが書いてある。',
                file: 'src/replyUtil.js',
                code: String.raw`// 決まり1: 返答が空（choices が空の配列やない）なら「もう一度お試しください」
// 決まり2: 上限 0 は「上限なし」ではなく「使えない」。上限が未設定なら 10000
export function replyText(res) {
  const text = res.choices[0].message.text;
  return text || 'もう一度お試しください';
}

export function dailyLimit(user) {
  return user.plan?.limit || 10000;
}

export function nickname(user) {
  if (user.nickname == null) return 'ゲスト';
  return user.nickname;
}`,
                defects: [
                  { line: 4, kind: 'bug', why: 'choices が空の配列やないときは res.choices[0] が undefined になり、.message でエラーになる。res.choices?.[0]?.message?.text のように ?. でたどる。' },
                  { line: 9, kind: 'spec', why: '|| は 0 でも右に行くので、上限 0（使えない）が 10000 になってしまう。決まり2どおり ?? を使う。' },
                ],
                hints: [
                  '決まり1: choices が空の配列なら、res.choices[0] は何になりますか？',
                  'undefined の .message を読もうとすると、どうなるでしょう？',
                  '決まり2: 上限が 0 のとき、|| の右と左のどちらが使われますか？',
                  '13行目の == null は、null と undefined の両方をまとめて見る定番の書き方です。',
                  '欠陥は2つ。返答をたどる行（バグ）と、|| を使っている行（仕様とずれ）です。',
                ],
                why: '4行目は choices が空やないときにエラーになる（バグ）。?. でたどれば undefined になり、5行目の || で案内文が出る。9行目の || は上限 0 を 10000 にしてしまい、決まり2に反する（仕様とずれ）。13行目の == null は意図どおりの定番の書き方。',
              },
            ],
          },
        ],
      },
    ],
  });
})(globalThis);
