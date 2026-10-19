/*
 * 言語テキスト: React（先生役は氷室 蓮）。形は js/texts.js の先頭の説明を参照。コードは String.raw で書く。
 * せりふ・ヒント・解説の中では JSX の波かっこを書かない（{名前} は登場人物の置き換えになるため、言葉で言い換える）。
 */
(function (g) {
  'use strict';
  const T = g.RGA.texts;

  T.addCourse({
    id: 'react',
    name: 'React',
    icon: '⚛️',
    teacher: 'himuro',
    intro: 'AIお金相談チャットの画面は React で書かれている。コンポーネント・props・state・イベント・useEffect・リスト……「画面のコードが何をしているか」を読めるようになれば、ハッカソンの PR レビューで迷わなくなる。',
    chapters: [
      // ================================================================ 1章
      {
        id: 'react-1',
        title: 'コンポーネントと JSX',
        badge: { icon: '🧩', name: '部品職人' },
        handout: {
          units: ['ハッカソン スプリント1「キックオフ: チャット画面の骨組み」', 'ハッカソン スプリント15「誰でも使える画面: アクセシビリティとエラー表示」'],
          knowledge: ['JavaScript の関数とアロー関数', 'JavaScript の三項演算子（条件 ? A : B）'],
          talk: [
            ['himuro', '{player}、React を読みたいんだっけ。最初はコンポーネントと JSX。チャット画面の骨組みは全部これでできてる。'],
            ['himuro', '要るのは「関数」と「三項演算子」くらい。院卒なら知ってるだろ。……いや、忘れててもすぐ思い出せるから大丈夫。'],
          ],
        },
        sections: [
          {
            id: 'react-1-1',
            title: 'コンポーネントは「画面の部品を返す関数」',
            talk: [
              ['himuro', 'React のコンポーネントは、ただの関数。呼ばれたら「画面のこの部分はこう見える」を返す。それだけ。'],
              ['himuro', 'チャット画面なら、ヘッダー・メッセージ一覧・送信ボックスを部品にして、App がそれを並べる。部品は何回でも使い回せる。'],
              ['player', '名前が大文字で始まってるのは決まり？'],
              ['himuro', '決まり。小文字で書くと React は「div や p みたいな HTML のタグ」だと思う。自分で作った部品は必ず大文字。普通のことだよ。'],
            ],
            figure: {
              title: 'チャット画面の部品の木',
              text: String.raw`        ┌──────── App ────────┐
        │  画面全体を並べる   │
        └──┬───────┬───────┬──┘
           ▼       ▼       ▼
  ┌──────────┐┌─────────┐┌─────────┐
  │ChatHeader││ Message ││ SendBox │
  │ タイトル ││  List   ││ 入力欄  │
  └──────────┘└────┬────┘└─────────┘
                   ▼  1件ずつ
              ┌─────────┐
              │ Message │ × 件数
              └─────────┘`,
            },
            code: {
              lang: 'react',
              text: String.raw`function ChatHeader() {
  return <h1>AIお金相談</h1>;
}

export function App() {
  return (
    <div>
      <ChatHeader />
      <MessageList />
      <SendBox />
    </div>
  );
}`,
            },
            points: ['コンポーネント = 画面の部品（JSX）を返す関数', '自分で作った部品の名前は大文字で始める（小文字は HTML のタグ扱い）', '部品は何回でも使い回せる'],
            quiz: [
              {
                id: 'react-1-1-q1', type: 'predict', title: '部品を2回使う', lang: 'react',
                code: String.raw`function Notice() {
  return <p>本日の振込は15時までです</p>;
}

export function App() {
  return (
    <div>
      <Notice />
      <h2>お知らせ</h2>
      <Notice />
    </div>
  );
}`,
                q: '画面に p 要素（「本日の振込は15時までです」）はいくつ表示される？',
                choices: ['2つ', '1つ', '0（同じ部品は1回しか使えずエラー）', '3つ'],
                answer: 0,
                hints: [
                  'Notice は「p を1つ返す関数」です。',
                  'App の中で、Notice は何回書かれていますか？',
                  '部品は使った回数だけ、その場所に表示されます。',
                ],
                why: 'コンポーネントは使った場所ごとに呼ばれて表示される。Notice を2回書いたので p は2つ（h2 をはさんで上下に1つずつ）。',
              },
              {
                id: 'react-1-1-q2', type: 'predict', title: '小文字の部品', lang: 'react',
                code: String.raw`function balanceCard() {
  return <p>残高: 12,000円</p>;
}

export function App() {
  return (
    <div>
      <balanceCard />
    </div>
  );
}`,
                q: 'この App を表示すると、どうなる？',
                choices: [
                  '「残高: 12,000円」は表示されない（balancecard という知らない HTML タグとして扱われる）',
                  '「残高: 12,000円」が表示される',
                  '「balanceCard」という文字がそのまま表示される',
                  '残高の部分だけ太字で表示される',
                ],
                answer: 0,
                hints: [
                  '関数の名前の1文字目に注目しましょう。',
                  'React は、タグ名が小文字で始まると何だと思うのでしたか？',
                  'div や p と同じ「HTML のタグ」として扱われると、関数 balanceCard は呼ばれません。',
                ],
                why: 'タグ名が小文字で始まると、React は HTML のタグだと解釈する。balanceCard 関数は呼ばれず、中身のない謎のタグが置かれるだけ（開発中は警告が出る）。自作の部品は BalanceCard のように大文字で始める。',
              },
            ],
          },
          {
            id: 'react-1-2',
            title: 'JSX は式。波かっこで値を埋め込む',
            talk: [
              ['kasuga', 'ねえ、JavaScript の中に HTML が書いてあるの、なんで動くの？ 私なんかが聞いていい質問かな……'],
              ['himuro', 'JSX っていう書き方。見た目は HTML だけど、中身は「部品を作る関数呼び出し」に変換される。だから JSX は値で、変数に入れたり return したりできる。……っていうか、それ公式ドキュメントの最初に書いてあるけど。'],
              ['player', '春日、いい質問だよ。俺も最初そこで止まった。氷室は「読めば分かる」って言いたいだけで、怒ってないから。'],
              ['himuro', '……うん、怒ってない。で、JSX の中で波かっこを書くと、その中は JavaScript の式になる。変数・計算・三項演算子は入れられる。if 文や for 文は「式じゃない」から入れられない。'],
            ],
            figure: {
              title: 'JSX の中の波かっこ',
              text: String.raw`  <p>こんにちは、〔name〕さん</p>
                  │
     波かっこの中 = JavaScript の式
                  ▼
   const name = 'ぎんこ太郎';
                  │
                  ▼
  画面: こんにちは、ぎんこ太郎さん

  入れてよい: 変数 / 計算 / a ? b : c
  入れられない: if 文 / for 文`,
            },
            code: {
              lang: 'react',
              text: String.raw`function Welcome() {
  const name = 'ぎんこ太郎';
  const balance = 12000;
  const isVip = true;
  return (
    <div>
      <p>こんにちは、{name}さん</p>
      <p>残高: {balance.toLocaleString()}円</p>
      <p>{isVip ? 'VIP会員' : '一般会員'}</p>
    </div>
  );
}`,
            },
            points: ['JSX は値（式）。変数に入れたり return したりできる', 'JSX の中の波かっこには JavaScript の「式」を書ける', 'if 文や for 文は式ではないので波かっこに入れられない（三項演算子や map を使う）'],
            quiz: [
              {
                id: 'react-1-2-q1', type: 'predict', title: '手数料の表示', lang: 'react',
                code: String.raw`function FeeLine() {
  const fee = 110;
  const times = 2;
  return <p>手数料: {fee * times}円（fee * times）</p>;
}`,
                q: '画面に表示される文字は？',
                choices: ['手数料: 220円（fee * times）', '手数料: 220円（220）', '手数料: fee * times円（fee * times）', '手数料: 1102円（fee * times）'],
                answer: 0,
                hints: [
                  '波かっこの中と外で、扱いが違います。',
                  '波かっこの中は JavaScript の式として計算されます。',
                  '波かっこの外にある文字は、ただの文字としてそのまま表示されます。',
                ],
                why: '波かっこの中の fee * times は計算されて 220 になる。かっこ書きの「（fee * times）」は波かっこの外なので、ただの文字としてそのまま出る。',
              },
              {
                id: 'react-1-2-q2', type: 'predict', title: '書けない JSX はどれ？', lang: 'react',
                code: String.raw`// A
<p>{count > 0 ? '未読あり' : '未読なし'}</p>

// B
<p>{if (count > 0) { '未読あり' }}</p>

// C
<p>{'未読 ' + count + ' 件'}</p>

// D
<p>{messages.length}</p>`,
                q: 'この中で、エラーになる（JSX として書けない）のはどれ？',
                choices: ['B', 'A', 'C', 'D'],
                answer: 0,
                hints: [
                  '波かっこの中に書けるのは「式」だけです。',
                  '式とは「値になるもの」。三項演算子・文字列の足し算・プロパティの参照は値になります。',
                  'if は値を返さない「文」です。',
                ],
                why: 'B は波かっこの中に if 文を書いているのでエラー。条件で出し分けたいときは A のように三項演算子を使うか、return の前に if で変数を用意しておく。',
              },
            ],
          },
          {
            id: 'react-1-3',
            title: 'className と style、return は1つの要素',
            talk: [
              ['himuro', 'JSX は HTML に似てるけど、細かいところが違う。class は JavaScript の予約語だから、JSX では className と書く。'],
              ['himuro', 'style は文字列じゃなくて、オブジェクトを渡す。だから波かっこが二重になって見える。外側が「式を書くよ」、内側が「オブジェクト」。'],
              ['player', 'return で要素を2つ並べたいときは？'],
              ['himuro', 'return できるのは1つの要素だけ。並べたいなら div で包むか、何も出力しない包み紙のフラグメント（空のタグ）で包む。関数は値を1つしか返せないんだから、当たり前だろ。……あ、当たり前は言い過ぎた。'],
            ],
            figure: {
              title: 'return は1つにまとめて返す',
              text: String.raw`  ✘ 2つ並べて返す
    return (
      <h1>…</h1>
      <p>…</p>      ← エラー
    );

  ✔ 包んで1つにする
    return (
      <>            ← フラグメント
        <h1>…</h1>
        <p>…</p>
      </>
    );`,
            },
            code: {
              lang: 'react',
              text: String.raw`function ErrorText({ message }) {
  return (
    <p className="error" style={{ color: 'crimson', fontWeight: 'bold' }}>
      {message}
    </p>
  );
}`,
            },
            points: ['class ではなく className と書く', 'style には文字列ではなくオブジェクトを渡す（プロパティ名は fontWeight のようなキャメルケース）', 'return できるのは1つの要素。並べたいときは div かフラグメントで包む'],
            quiz: [
              {
                id: 'react-1-3-q1', type: 'fix', title: 'エラー表示が出ない', lang: 'react',
                story: '{player}が初めて書いた部品。画面を開くと「style プロパティには文字列ではなくオブジェクトを渡してください」というエラーで止まる。',
                code: String.raw`export function ErrorText({ message }) {
  if (!message) return null;
  return (
    <p className="error" style="color: crimson">
      {message}
    </p>
  );
}`,
                bugLine: 4,
                fixes: [
                  `<p className="error" style={{ color: 'crimson' }}>`,
                  `<p class="error" style="color: crimson">`,
                  `<p className="error" style="{color: crimson}">`,
                  `<p className="error" style={color: 'crimson'}>`,
                ],
                answer: 0,
                hints: [
                  'エラーメッセージは style について言っています。',
                  'style に渡しているのは文字列ですか、オブジェクトですか？',
                  'JSX で値を渡すには波かっこが要り、その中にオブジェクトを書きます。',
                  'つまり「式の波かっこ」と「オブジェクトの波かっこ」の二重になります。',
                ],
                why: 'JSX の style にはオブジェクトを渡す。外側の波かっこで「式を書く」と伝え、内側の波かっこでオブジェクトを作るので二重になる。文字列を引用符で囲んで渡すのは HTML の書き方で、React ではエラーになる。波かっこが1つだけの選択肢は、中身がオブジェクトとして読めないのでこれも構文エラー。',
              },
              {
                id: 'react-1-3-q2', type: 'predict', title: '正しく返せるのは？', lang: 'react',
                code: String.raw`// A
return (
  <h1>残高照会</h1>
  <p>12,000円</p>
);

// B
return (
  <>
    <h1>残高照会</h1>
    <p>12,000円</p>
  </>
);

// C
return <h1>残高照会</h1>, <p>12,000円</p>;`,
                q: 'エラーにならず、h1 と p の両方を表示できるのはどれ？',
                choices: ['B だけ', 'A だけ', 'A と B', 'A・B・C すべて'],
                answer: 0,
                hints: [
                  'return で返せる JSX の要素はいくつでしたか？',
                  'A は要素を2つ並べているだけです。',
                  'C はカンマ演算子で、最後の値（p）しか返りません。',
                  '空のタグ（フラグメント）は、何も出力せずに中身をまとめる包み紙です。',
                ],
                why: 'return できるのは1つの要素。A は2つ並べているのでエラー。C はカンマ演算子で最後の p だけが返る（h1 は消える）。B はフラグメントで包んで1つにしているので、h1 と p の両方が表示される。',
              },
            ],
          },
        ],
      },
      // ================================================================ 2章
      {
        id: 'react-2',
        title: 'props: 親から子へ渡す',
        badge: { icon: '📦', name: '受け渡し名人' },
        handout: {
          units: ['ハッカソン スプリント1「キックオフ: チャット画面の骨組み」', 'ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント16「ログに個人情報を残さない」'],
          knowledge: ['React テキスト 1章「コンポーネントと JSX」', 'JavaScript のオブジェクトと分割代入'],
          talk: [
            ['himuro', '部品を作れても、毎回同じものしか出せなかったら使えない。部品に値を渡すのが props。'],
            ['himuro', '1章の JSX と、オブジェクトの分割代入を使う。分割代入があやしかったら先に見ておいて。'],
          ],
        },
        sections: [
          {
            id: 'react-2-1',
            title: '親から子へ props を渡す',
            talk: [
              ['himuro', '親が子の部品を使うとき、HTML の属性みたいに名前と値を書く。子はそれを props という1つのオブジェクトで受け取る。'],
              ['himuro', '文字列は引用符で、数値や変数は波かっこで渡す。ここ、よく間違える。引用符で 1000 を渡したら、それは数値じゃなくて文字列の "1000" だ。'],
              ['player', '文字列の "1000" に 1 を足したら…… "10001" か。お金の画面でそれは笑えないな。'],
              ['himuro', '笑えない。実際、研修のときに誰かやってた。'],
            ],
            figure: {
              title: 'props は上から下へ流れる',
              text: String.raw`  ┌──────────── App（親）────────────┐
  │ <AccountCard                     │
  │    owner="ぎんこ太郎"            │
  │    balance=〔12000〕 />          │
  └────────────────┬─────────────────┘
                   │ props
                   ▼
  ┌──────── AccountCard（子）────────┐
  │ props = {                        │
  │   owner: 'ぎんこ太郎',           │
  │   balance: 12000                 │
  │ }                                │
  └──────────────────────────────────┘
   〔 〕は JSX では波かっこ`,
            },
            code: {
              lang: 'react',
              text: String.raw`function AccountCard(props) {
  return (
    <div className="card">
      <p>{props.owner} 様</p>
      <p>残高: {props.balance}円</p>
    </div>
  );
}

// 親の側
<AccountCard owner="ぎんこ太郎" balance={12000} />`,
            },
            points: ['親は属性の形で値を渡し、子は props という1つのオブジェクトで受け取る', '文字列は引用符、数値・真偽値・変数・関数は波かっこで渡す', '引用符で渡した数字は文字列になる'],
            quiz: [
              {
                id: 'react-2-1-q1', type: 'predict', title: '利息を足した表示', lang: 'react',
                code: String.raw`function Total(props) {
  return <p>合計: {props.amount + props.interest}円</p>;
}

export function App() {
  return (
    <div>
      <Total amount={1000} interest={5} />
      <Total amount="1000" interest={5} />
    </div>
  );
}`,
                q: '上から順に、表示される2行は？',
                choices: ['合計: 1005円 / 合計: 10005円', '合計: 1005円 / 合計: 1005円', '合計: 10005円 / 合計: 10005円', '合計: 1005円 / エラーで表示されない'],
                answer: 0,
                hints: [
                  '2つの Total の違いは、amount の渡し方だけです。',
                  '波かっこで渡した 1000 は数値、引用符で渡した "1000" は文字列です。',
                  'JavaScript で「文字列 + 数値」をするとどうなりますか？',
                ],
                why: '1つ目は数値どうしの足し算で 1005。2つ目は amount が文字列の "1000" なので、+ は文字列の連結になり "10005" になる。数値は波かっこで渡す。',
              },
            ],
          },
          {
            id: 'react-2-2',
            title: '分割代入・初期値・children',
            talk: [
              ['himuro', '実際のコードでは props.owner みたいに毎回書かずに、引数のところで分割代入して受け取ることが多い。関数の引数のかっこの中に、波かっこで名前を並べるやつ。'],
              ['himuro', '分割代入なら初期値も書ける。label = \'送信\' と書いておけば、親が label を渡さなかったときだけ「送信」になる。'],
              ['player', 'タグで挟んだ中身はどうやって受け取るんだ？'],
              ['himuro', 'children っていう決まった名前の props に入る。カードの枠だけ作って、中身は親が決める、みたいな部品で使う。'],
            ],
            code: {
              lang: 'react',
              text: String.raw`function Card({ title, children }) {
  return (
    <section className="card">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SendButton({ label = '送信', onClick }) {
  return <button onClick={onClick}>{label}</button>;
}

// 親の側
<Card title="今月の支出">
  <p>食費 32,000円</p>
</Card>`,
            },
            points: ['引数で分割代入すると props.〇〇 と書かずに済む', '分割代入の初期値は「渡されなかった（undefined の）とき」だけ使われる', 'タグで挟んだ中身は children で受け取る'],
            quiz: [
              {
                id: 'react-2-2-q1', type: 'predict', title: 'ボタンのラベル', lang: 'react',
                code: String.raw`function SendButton({ label = '送信' }) {
  return <button>{label}</button>;
}

export function App() {
  return (
    <div>
      <SendButton />
      <SendButton label="振り込む" />
      <SendButton label="" />
    </div>
  );
}`,
                q: '3つのボタンに表示される文字は、左から順に？',
                choices: ['「送信」「振り込む」「（空）」', '「送信」「振り込む」「送信」', '「（空）」「振り込む」「（空）」', '「送信」「送信」「送信」'],
                answer: 0,
                hints: [
                  '初期値の「送信」が使われるのは、どんなときでしたか？',
                  '1つ目は label を渡していません。',
                  '3つ目は空の文字列を渡しています。空文字は undefined ですか？',
                  '分割代入の初期値は、値が undefined のときだけ使われます。',
                ],
                why: '初期値は値が undefined のときだけ使われる。1つ目は渡していないので「送信」、2つ目は「振り込む」。3つ目は空文字を「渡している」ので初期値は使われず、空のボタンになる。',
              },
              {
                id: 'react-2-2-q2', type: 'predict', title: '挟んだ中身', lang: 'react',
                code: String.raw`function Bubble({ from, children }) {
  return (
    <div className={from === 'ai' ? 'bubble ai' : 'bubble me'}>
      {children}
    </div>
  );
}

export function App() {
  return (
    <Bubble from="ai">
      <p>今月は食費が多めです。</p>
    </Bubble>
  );
}`,
                q: '表示される div の className と、その中身は？',
                choices: [
                  'className は "bubble ai"、中身は「今月は食費が多めです。」の p',
                  'className は "bubble me"、中身は「今月は食費が多めです。」の p',
                  'className は "bubble ai"、中身は空（children は自分で渡さないと入らない）',
                  'className は "bubble ai"、中身は「children」という文字',
                ],
                answer: 0,
                hints: [
                  'from には何が渡されていますか？',
                  '三項演算子は、from が \'ai\' のときに左側を選びます。',
                  'Bubble のタグで挟んだ p は、どの props に入るのでしたか？',
                ],
                why: 'from="ai" なので三項演算子は "bubble ai" を選ぶ。Bubble のタグで挟んだ p は children に入るので、div の中にそのまま表示される。',
              },
            ],
          },
          {
            id: 'react-2-3',
            title: 'props は読み取り専用。子から親へは関数で伝える',
            talk: [
              ['himuro', 'props は子にとって読み取り専用。受け取ったオブジェクトを子が書き換えるのは禁止。親が持ってる元のデータまで変わって、どこで値が変わったのか誰にも追えなくなる。'],
              ['player', 'じゃあ子から親に「押されたよ」と伝えたいときは？'],
              ['himuro', '親が関数を props で渡して、子はそれを呼ぶだけ。onSend とか onDelete とか、on で始まる名前が多い。データは上から下、知らせは関数で下から上。'],
              ['hikari', 'バケツリレーみたいだね〜！ 上から水（データ）が来て、下から「ありがと〜」って声が返る感じ？✨'],
              ['himuro', '……まあ、だいたい合ってる。'],
            ],
            figure: {
              title: 'データは下へ、知らせは上へ',
              text: String.raw`  ┌──────── ChatWindow（親）────────┐
  │ messages を持っている            │
  │ function handleSend(text) …      │
  └──────┬──────────────────▲────────┘
  データ │ messages          │ onSend(text)
         ▼                   │ を呼ぶ
  ┌─ MessageList ─┐   ┌──── SendBox ───┐
  │ 表示するだけ  │   │ 押されたら     │
  │ 書き換えない  │   │ onSend を呼ぶ  │
  └───────────────┘   └────────────────┘`,
            },
            points: ['props は読み取り専用。子が書き換えてはいけない', '子から親へは、親から渡された関数（onSend など）を呼んで知らせる'],
            quiz: [
              {
                id: 'react-2-3-q1', type: 'review', title: '大地くんの PR: 残高カード', lang: 'react',
                story: '{daichi}「残高カードを作ったよ！ 手数料の引き落とし予定も反映させてみた！」 仕様: 残高は3桁区切り（12,000円）で表示する。口座番号は下4桁だけを表示する。',
                code: String.raw`export function BalanceCard({ account }) {
  account.balance = account.balance - account.pendingFee;
  const warn = account.balance < 0 ? '残高不足です' : '';

  return (
    <div className="card">
      <p>{account.ownerName} 様</p>
      <p>残高: {account.balance}円</p>
      <p>口座番号: {account.number}</p>
      <p className="warn">{warn}</p>
    </div>
  );
}`,
                defects: [
                  { line: 2, kind: 'bug', why: '受け取った props（account）を直接書き換えている。親の持つ元データまで変わり、再描画のたびに手数料が何度も引かれる。const shown = account.balance - account.pendingFee のように別の変数で計算する。' },
                  { line: 8, kind: 'spec', why: '仕様は3桁区切り。数値をそのまま出すと 12000円 になる。toLocaleString() などで 12,000円 にする。' },
                  { line: 9, kind: 'security', why: '口座番号を全桁表示している。仕様どおり下4桁だけにする（例: number.slice(-4) の前に＊を付ける）。画面ののぞき見やスクリーンショットで漏れる。' },
                ],
                hints: [
                  '欠陥は3つあります。仕様の2つの条件と、props の決まりを思い出しましょう。',
                  'props は子にとって読み取り専用でした。代入している行はありませんか？',
                  '残高の表示は、仕様の「3桁区切り」になっていますか？',
                  '口座番号は「下4桁だけ」のはずです。',
                ],
                why: '2行目は props の書き換え（バグ）。親のデータが変わり、描画のたびに手数料が引かれていく。8行目は3桁区切りになっていない（仕様とずれ）。9行目は口座番号の全桁表示（セキュリティ）。',
              },
              {
                id: 'react-2-3-q2', type: 'predict', title: '子から親へ知らせる', lang: 'react',
                code: String.raw`function SendBox({ onSend }) {
  return <button onClick={() => onSend('こんにちは')}>送信</button>;
}

export function ChatWindow() {
  function handleSend(text) {
    console.log('親が受け取った: ' + text);
  }
  return <SendBox onSend={handleSend} />;
}`,
                q: '送信ボタンを1回押すと、コンソールに何が出る？',
                choices: ['親が受け取った: こんにちは', '親が受け取った: undefined', '何も出ない（子は親の関数を呼べない）', '親が受け取った: onSend'],
                answer: 0,
                hints: [
                  'ChatWindow は SendBox に、onSend という名前で何を渡していますか？',
                  'SendBox の中の onSend は、親の handleSend そのものです。',
                  'ボタンが押されると、onSend に何が渡されて呼ばれますか？',
                ],
                why: '親は handleSend を onSend という名前で子に渡している。子はボタンが押されたら onSend(\'こんにちは\') を呼ぶので、実際には親の handleSend が \'こんにちは\' を受け取って動く。',
              },
            ],
          },
        ],
      },
      // ================================================================ 3章
      {
        id: 'react-3',
        title: 'state と useState',
        badge: { icon: '🧠', name: '画面の記憶係' },
        handout: {
          units: ['ハッカソン スプリント1「キックオフ: チャット画面の骨組み」', 'ハッカソン スプリント13「仕様ひっくり返し: ポーリングからストリーミングへ」'],
          knowledge: ['React テキスト 2章「props: 親から子へ渡す」', 'JavaScript の配列・オブジェクトのスプレッド構文（...）'],
          talk: [
            ['himuro', 'props は「もらう値」。この章の state は「部品が自分で覚えておく値」。チャットのメッセージ一覧も入力中の文字も state だ。'],
            ['himuro', 'スプレッド構文（点3つ）を山ほど使う。ここが読めないと state のコードは全部読めない。'],
          ],
        },
        sections: [
          {
            id: 'react-3-1',
            title: 'state は画面の記憶',
            talk: [
              ['himuro', 'コンポーネントは関数だから、描画のたびに最初から実行される。ふつうの変数は毎回まっさらに戻る。だから覚えておきたい値は useState に預ける。'],
              ['himuro', 'useState は「今の値」と「値を変える set 関数」の2つを返す。set 関数を呼ぶと React が値を覚え直して、関数をもう一度実行して画面を描き直す。'],
              ['player', 'つまり、let の変数に足し算しても画面は変わらないってことか。'],
              ['himuro', 'そう。変数は変わっても React は気づかないし、次の描画でまた 0 に戻る。院卒なら1回で分かると思ってた。……いや、分かってるならいい。'],
            ],
            figure: {
              title: 'set 関数を呼ぶと描き直される',
              text: String.raw`  ┌─ 1回目の描画 ──────────────┐
  │ const [count, setCount]    │
  │   = useState(0)  → count=0 │
  └─────────────┬──────────────┘
                │ ボタン → setCount(1)
                ▼
     React が 1 を覚えて、関数を
     もう一度最初から実行する
                │
                ▼
  ┌─ 2回目の描画 ──────────────┐
  │ useState(0) → count=1      │
  │ （0 は最初の1回だけ使う）  │
  └────────────────────────────┘`,
            },
            code: {
              lang: 'react',
              text: String.raw`import { useState } from 'react';

function UnreadBadge() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount(count + 1)}>
      未読 {count} 件
    </button>
  );
}`,
            },
            points: ['コンポーネントは描画のたびに最初から実行される。ふつうの変数は毎回リセット', 'useState は「今の値」と「set 関数」を返す。set を呼ぶと描き直される', 'useState の引数（初期値）は最初の1回だけ使われる'],
            quiz: [
              {
                id: 'react-3-1-q1', type: 'predict', title: 'ふつうの変数で数える', lang: 'react',
                code: String.raw`function LikeButton() {
  let likes = 0;
  function handleClick() {
    likes = likes + 1;
    console.log(likes);
  }
  return <button onClick={handleClick}>いいね {likes}</button>;
}`,
                q: 'ボタンを3回押した。コンソールの出力と、ボタンの表示は？',
                choices: [
                  'コンソールは 1, 2, 3、ボタンは「いいね 0」のまま',
                  'コンソールは 1, 2, 3、ボタンは「いいね 3」',
                  'コンソールは毎回 1、ボタンは「いいね 0」のまま',
                  'コンソールは毎回 1、ボタンは「いいね 1」',
                ],
                answer: 0,
                hints: [
                  'likes は useState ではなく、ふつうの変数です。',
                  'ふつうの変数を変えても、React は気づかず描き直しません。ボタンの表示はどうなりますか？',
                  '描き直されないので、handleClick は最初の描画で作られたものがずっと使われます。',
                  'その handleClick が足しているのは、毎回同じ変数 likes です。',
                ],
                why: '引っかけに注意。描き直されないので handleClick は最初の描画で作られたまま、同じ変数 likes を 1, 2, 3 と増やしていく。だからコンソールは 1, 2, 3。でも React は変化に気づかないので、ボタンは「いいね 0」のまま。画面に反映したい値は useState に入れる。',
              },
            ],
          },
          {
            id: 'react-3-2',
            title: 'state は直接書き換えない',
            talk: [
              ['himuro', 'state の配列やオブジェクトを push や代入で直接いじるのは禁止。React は「前と同じ入れ物か」で変化を見てる。中身をいじっても入れ物が同じなら、変わってないと判断される。'],
              ['himuro', 'だから毎回、新しい配列や新しいオブジェクトを作って set する。スプレッド構文で中身をコピーして、変えたいところだけ足すか上書きする。'],
              ['saotome', 'ふふ、研修でもここはみんなつまずいてたよ。「同じお財布の中身を入れ替える」じゃなくて「新しいお財布に詰め替えて渡す」って覚えるといいかも。'],
              ['player', '早乙女さんのたとえ、すごく分かりやすいです……！'],
              ['himuro', '……（同じこと言ったつもりなんだけどな）。'],
            ],
            figure: {
              title: '同じ入れ物か、新しい入れ物か',
              text: String.raw`  ✘ ids.push(3); setIds(ids);
     ┌─────────┐        ┌───────────┐
     │ [1, 2]  │ ─────▶ │ [1, 2, 3] │
     └─────────┘ 同じ物 └───────────┘
     React「前と同じ入れ物だ。描き直さない」

  ✔ setIds([...ids, 3]);
     ┌─────────┐        ┌───────────┐
     │ [1, 2]  │        │ [1, 2, 3] │
     └─────────┘ 別の物 └───────────┘
     React「新しい入れ物だ。描き直す」`,
            },
            code: {
              lang: 'react',
              text: String.raw`// 配列に足す
setMessages([...messages, newMessage]);

// 配列から消す
setMessages(messages.filter((m) => m.id !== id));

// オブジェクトの一部だけ変える
setProfile({ ...profile, nickname: 'ぎんこ' });`,
            },
            points: ['state の配列・オブジェクトを push や代入で直接変えない', 'スプレッド構文や filter / map で「新しい」配列・オブジェクトを作って set する'],
            quiz: [
              {
                id: 'react-3-2-q1', type: 'fix', title: 'お気に入りが増えない', lang: 'react',
                story: '{daichi}「よく使う振込先をお気に入りに追加するボタンを作ったんだけど、押しても一覧が増えないんだ……。console.log で見ると配列には入ってるのに！」',
                code: String.raw`import { useState } from 'react';

export function Favorites() {
  const [ids, setIds] = useState([]);

  function add(id) {
    const next = ids;
    next.push(id);
    setIds(next);
  }

  return <FavoriteList ids={ids} onAdd={add} />;
}`,
                bugLine: 7,
                fixes: ['const next = [...ids];', 'let next = ids;', 'const next = ids.push;', 'const next = { ids };'],
                answer: 0,
                hints: [
                  'console.log では配列に入っている。なのに画面が変わらない。React は何を見て変化を判断するのでしたか？',
                  'next と ids は、別の配列ですか、同じ配列ですか？',
                  'const next = ids; は配列をコピーしません。同じ配列に別の名前を付けるだけです。',
                  '新しい配列を作るには、スプレッド構文で中身をコピーします。',
                ],
                why: '7行目の const next = ids; は同じ配列に別名を付けただけ。push で元の state を直接書き換え、同じ配列を set しているので React は変化に気づかない。const next = [...ids]; で新しい配列を作れば、push しても元の state は変わらず、新しい配列として描き直される。',
              },
              {
                id: 'react-3-2-q2', type: 'predict', title: 'オブジェクトの一部を変える', lang: 'react',
                code: String.raw`const [profile, setProfile] = useState({
  name: 'ぎんこ太郎',
  plan: 'basic',
  notify: true,
});

function upgrade() {
  setProfile({ plan: 'premium' });
}

// upgrade() を呼んだあとの profile は？`,
                q: 'upgrade() を呼んで描き直されたあと、profile の中身は？',
                choices: [
                  "{ plan: 'premium' }（name と notify は消える）",
                  "{ name: 'ぎんこ太郎', plan: 'premium', notify: true }",
                  "{ name: 'ぎんこ太郎', plan: 'basic', notify: true }（変わらない）",
                  "{ name: 'ぎんこ太郎', plan: ['basic', 'premium'], notify: true }",
                ],
                answer: 0,
                hints: [
                  'set 関数は、渡した値で state を「まるごと置き換え」ます。',
                  '足りない項目を、元の値と自動で混ぜてくれるでしょうか？',
                  '元の項目を残したいなら、スプレッド構文で profile をコピーしてから plan を上書きする必要があります。',
                ],
                why: 'useState の set 関数は値をまるごと置き換える（自動で混ぜない）。plan だけのオブジェクトを渡したので name と notify は消える。setProfile にスプレッド構文で profile を展開してから plan を書く形にすれば、ほかの項目が残る。',
              },
            ],
          },
          {
            id: 'react-3-3',
            title: '前の値から更新する関数形式と、まとめられる更新',
            talk: [
              ['himuro', 'set 関数を呼んでも、その場で count が変わるわけじゃない。React は更新を貯めておいて、イベントの処理が終わってからまとめて描き直す。'],
              ['himuro', 'だから同じイベントの中で setCount(count + 1) を3回書いても、3回とも「今の描画の count」に 1 を足すだけ。0 なら3回とも「1 にして」と頼んでる。'],
              ['player', '前の値に積み上げたいときは？'],
              ['himuro', 'setCount(prev => prev + 1) みたいに関数を渡す。React は貯めた更新を順番に、直前の結果を prev に入れて実行してくれる。前の値から計算するときは、こっちを使うのが普通。'],
            ],
            figure: {
              title: '値を渡す / 関数を渡す（count=0）',
              text: String.raw`  setCount(count + 1)  → 「1 にして」
  setCount(count + 1)  → 「1 にして」
  setCount(count + 1)  → 「1 にして」
                  結果: 1

  setCount(p => p + 1) → 0 → 1
  setCount(p => p + 1) → 1 → 2
  setCount(p => p + 1) → 2 → 3
                  結果: 3`,
            },
            points: ['set を呼んでも、その場では値は変わらない。更新はまとめて処理される', '前の値から計算するときは setX(prev => …) の関数形式を使う'],
            quiz: [
              {
                id: 'react-3-3-q1', type: 'predict', title: '3回足したはず', lang: 'react',
                code: String.raw`function PointCard() {
  const [points, setPoints] = useState(0);

  function handleBonus() {
    setPoints(points + 1);
    setPoints(points + 1);
    setPoints(points + 1);
    console.log(points);
  }

  return <button onClick={handleBonus}>{points} pt</button>;
}`,
                q: '最初の状態でボタンを1回押した。コンソールの出力と、描き直されたボタンの表示は？',
                choices: ['コンソール 0、ボタン「1 pt」', 'コンソール 3、ボタン「3 pt」', 'コンソール 0、ボタン「3 pt」', 'コンソール 1、ボタン「1 pt」'],
                answer: 0,
                hints: [
                  'この描画の中で、points はいくつですか？',
                  'set を呼んでも、その場では points は変わりません。',
                  '3回とも points + 1、つまり同じ値を頼んでいます。',
                  'console.log の時点では、まだ描き直されていません。',
                ],
                why: 'この描画の points は 0。3回とも「0 + 1 にして」と同じ値を頼んでいるので、描き直したあとは 1 pt。console.log はまだ描き直す前なので、今の描画の 0 が出る。',
              },
              {
                id: 'react-3-3-q2', type: 'predict', title: '値と関数を混ぜる', lang: 'react',
                code: String.raw`const [balance, setBalance] = useState(1000);

function handleClick() {
  setBalance(balance + 500);
  setBalance((prev) => prev - 200);
  setBalance((prev) => prev * 2);
}`,
                q: 'balance が 1000 のときに handleClick を1回動かした。描き直したあとの balance は？',
                choices: ['2600', '1600', '1300', '1800'],
                answer: 0,
                hints: [
                  '更新は貯められて、書いた順に処理されます。',
                  '1つ目は値を渡しています。1000 + 500 で「1500 にして」です。',
                  '2つ目と3つ目は関数なので、直前の結果を prev として受け取ります。',
                  '1500 → 1300 → ？',
                ],
                why: '1つ目で 1500 になり、2つ目の関数が 1500 を受け取って 1300、3つ目が 1300 を受け取って 2600。関数形式は「直前の結果」から計算できる。',
              },
            ],
          },
        ],
      },
      // ================================================================ 4章
      {
        id: 'react-4',
        title: 'イベントとフォーム',
        badge: { icon: '🖱️', name: '連打ブロッカー' },
        handout: {
          units: ['ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント15「誰でも使える画面: アクセシビリティとエラー表示」'],
          knowledge: ['React テキスト 3章「state と useState」', 'JavaScript の async / await と try / finally'],
          talk: [
            ['himuro', 'ユーザー代表の細谷さん、ボタン連打するだろ。この章はクリックと入力欄、それから二重送信の防ぎ方。'],
            ['himuro', '3章の state と、async / await・try / finally を使う。finally を知らないなら先に調べて。必ず出る。'],
          ],
        },
        sections: [
          {
            id: 'react-4-1',
            title: 'onClick には「関数そのもの」を渡す',
            talk: [
              ['himuro', 'onClick に渡すのは「押されたときに呼んでほしい関数」。関数名だけ書けば渡せる。関数名のあとにかっこを付けると、その場で呼んだ結果を渡すことになる。'],
              ['himuro', '引数を付けて呼びたいときは、アロー関数で包む。「押されたら、この id で消して」という新しい関数を渡すわけ。'],
              ['onizuka', '横から失礼。それ、描画のたびに全メッセージの削除が走るやつな。うちのチームでやらかして、開いた瞬間に履歴が全部消えた。'],
              ['player', '鬼塚のチーム、何やってんだよ……。でも一発で覚えたわ。'],
            ],
            figure: {
              title: 'かっこの有無で意味が変わる',
              text: String.raw`  onClick = handleSend
    → 押されたら handleSend を呼ぶ  ✔

  onClick = handleSend()
    → 描画中に今すぐ呼ぶ。
      戻り値（undefined）を渡す     ✘

  onClick = () => remove(m.id)
    → 押されたら remove(m.id)      ✔`,
            },
            code: {
              lang: 'react',
              text: String.raw`<button onClick={handleSend}>送信</button>

{messages.map((m) => (
  <button key={m.id} onClick={() => remove(m.id)}>削除</button>
))}`,
            },
            points: ['onClick には関数そのものを渡す（関数名だけ）', 'かっこを付けると描画中にその場で呼ばれてしまう', '引数を渡したいときはアロー関数で包む'],
            quiz: [
              {
                id: 'react-4-1-q1', type: 'fix', title: '開いただけで履歴が消える', lang: 'react',
                story: '会話履歴の画面を開いた瞬間、削除ボタンを押していないのに履歴がすべて消えた。',
                code: String.raw`export function HistoryList({ items, onDelete }) {
  return (
    <ul>
      {items.map((m) => (
        <li key={m.id}>
          {m.title}
          <button onClick={onDelete(m.id)}>削除</button>
        </li>
      ))}
    </ul>
  );
}`,
                bugLine: 7,
                fixes: [
                  '<button onClick={() => onDelete(m.id)}>削除</button>',
                  '<button onClick={onDelete}>削除</button>',
                  '<button onClick="onDelete(m.id)">削除</button>',
                  '<button onClick={onDelete(m.id)()}>削除</button>',
                ],
                answer: 0,
                hints: [
                  '押していないのに削除が動いています。削除はいつ呼ばれているのでしょう？',
                  'onClick に渡しているのは「関数」ですか、「関数を呼んだ結果」ですか？',
                  'onDelete(m.id) と書くと、描画中にその場で呼ばれます。',
                  '「押されたら呼ぶ」にするには、何で包めばよいでしたか？',
                ],
                why: '7行目は onDelete(m.id) をその場で呼んでいるので、描画のたびに全件の削除が走る。アロー関数で包めば「押されたら onDelete(m.id) を呼ぶ関数」を渡せる。onDelete だけだと id ではなくクリックのイベントが渡ってしまう。',
              },
            ],
          },
          {
            id: 'react-4-2',
            title: '制御されたコンポーネント（入力欄と state）',
            talk: [
              ['himuro', 'React の入力欄は、ふつう value に state を、onChange に set 関数を呼ぶ処理をつなぐ。これを「制御されたコンポーネント」っていう。'],
              ['himuro', '入力欄に表示されるのは常に state の値。キーを打つ → onChange → set → 描き直し → value に新しい値、の一周で文字が増える。'],
              ['player', 'じゃあ onChange を書き忘れると……'],
              ['himuro', '何を打っても state が変わらないから、入力欄は固まったまま。value だけ書いて「入力できません」って聞いてくる人、多いよ。……別に責めてない。'],
            ],
            figure: {
              title: '1文字打つたびの一周',
              text: String.raw`  キーを打つ「あ」
        │
        ▼
  onChange(e) → setText(e.target.value)
        │
        ▼
  React が描き直す（text = 'あ'）
        │
        ▼
  <input value=〔text〕 /> に「あ」
   〔 〕は JSX では波かっこ`,
            },
            code: {
              lang: 'react',
              text: String.raw`const [text, setText] = useState('');

<input
  value={text}
  onChange={(e) => setText(e.target.value)}
/>`,
            },
            points: ['value に state、onChange で set 関数を呼ぶ = 制御されたコンポーネント', '入力欄に見えるのは常に state の値', 'onChange の中で値を加工すれば、入力をその場で整えられる'],
            quiz: [
              {
                id: 'react-4-2-q1', type: 'predict', title: '暗証番号の入力欄', lang: 'react',
                code: String.raw`function PinInput() {
  const [pin, setPin] = useState('');
  return (
    <input
      value={pin}
      onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
    />
  );
}`,
                q: '空の入力欄に「12a345」と1文字ずつ打った。最後に入力欄に表示されているのは？',
                choices: ['1234', '12a3', '12345', '12a345'],
                answer: 0,
                hints: [
                  '入力欄に見えるのは、いつも state（pin）の値です。',
                  'replace(/\\D/g, \'\') は数字以外を取り除きます。',
                  'slice(0, 4) は先頭の4文字だけを残します。',
                  'a は取り除かれ、5文字目以降は残りません。',
                ],
                why: '打つたびに onChange で「数字だけ・先頭4文字まで」に整えた値を pin に入れている。a は消え、5 を打った時点で 12345 が 1234 に切られるので、表示は 1234。',
              },
              {
                id: 'react-4-2-q2', type: 'predict', title: 'onChange がない', lang: 'react',
                code: String.raw`function MemoInput() {
  const [memo, setMemo] = useState('家賃');
  return <input value={memo} />;
}`,
                q: 'この入力欄にキーボードで「の振込」と打とうとすると？',
                choices: [
                  '「家賃」のまま変わらない（入力できない）',
                  '「家賃の振込」になる',
                  '「の振込」に置き換わる',
                  '一瞬「家賃の振込」になり、保存される',
                ],
                answer: 0,
                hints: [
                  '入力欄に表示されるのは何の値でしたか？',
                  'キーを打ったとき、memo を変える処理はどこかにありますか？',
                  'state が変わらなければ、描き直しても value は同じです。',
                ],
                why: 'value に memo を渡しているのに、onChange で setMemo を呼んでいない。state が「家賃」のまま変わらないので、何を打っても入力欄は「家賃」に戻る（開発中は警告も出る）。',
              },
            ],
          },
          {
            id: 'react-4-3',
            title: '送信中は押せなくする（二重送信を防ぐ）',
            talk: [
              ['himuro', 'お金の画面で二重送信は事故。送信中は sending を true にして、ボタンに disabled を付ける。終わったら false に戻す。'],
              ['himuro', '戻すのは finally の中。送信が失敗して例外が飛んだら、その後ろの行は動かない。そうするとボタンが一生押せないまま。'],
              ['himuro', 'あと form の onSubmit では、最初に e.preventDefault() を呼ぶ。呼ばないとブラウザがページを読み込み直して、state ごと全部消える。'],
              ['player', '細谷さんの連打テスト、これで耐えられるかな。'],
              ['himuro', '画面だけじゃ足りない。本当はサーバー側でも冪等キーで止める。スプリント8で出るから、そこで見て。'],
            ],
            code: {
              lang: 'react',
              text: String.raw`async function handleSubmit(e) {
  e.preventDefault();
  if (sending) return;
  setSending(true);
  try {
    await onTransfer(amount);
  } finally {
    setSending(false);
  }
}

<button type="submit" disabled={sending}>振り込む</button>`,
            },
            points: ['送信中は disabled でボタンを押せなくする', '送信中フラグは finally で必ず戻す', 'form の onSubmit では最初に e.preventDefault() を呼ぶ'],
            quiz: [
              {
                id: 'react-4-3-q1', type: 'review', title: '真壁さんと読む: 振込フォーム', lang: 'react',
                story: '{osamu}「振込フォームのPRだ。お金が動く画面だから、失敗したときと連打されたときに何が起きるかを見てくれ」 仕様: 送信中は振込ボタンを押せないこと。',
                code: String.raw`import { useState } from 'react';

export function TransferForm({ onTransfer }) {
  const [amount, setAmount] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSubmit(e) {
    setSending(true);
    await onTransfer(Number(amount));
    setSending(false);
  }

  return (
    <form onSubmit={handleSubmit}>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button type="submit">振り込む</button>
      {sending && <p>送信中…</p>}
    </form>
  );
}`,
                defects: [
                  { line: 8, kind: 'bug', why: 'handleSubmit の最初で e.preventDefault() を呼んでいない。フォームの送信でページが読み込み直され、state も送信も途中で失われる。' },
                  { line: 10, kind: 'bug', why: 'onTransfer が失敗して例外になると、この行まで来ない。sending が true のまま戻らなくなる。try / finally の finally で戻す。' },
                  { line: 16, kind: 'spec', why: '送信中もボタンが押せる。仕様は「送信中は押せない」。disabled に sending を渡して二重送信を防ぐ。' },
                ],
                hints: [
                  '欠陥は3つ。「form の送信」「失敗したとき」「連打」の3つの観点で見ましょう。',
                  'form の onSubmit で、最初に呼ぶべきものは何でしたか？',
                  'await onTransfer(...) が例外を投げたら、次の行は実行されますか？',
                  '送信中にボタンを押せなくする属性が、どこかに付いていますか？',
                ],
                why: '8行目: preventDefault がなく、ページが読み込み直される（バグ）。10行目: 失敗すると sending が戻らない。finally で戻す（バグ）。16行目: disabled がなく送信中も押せる（仕様とずれ）。',
              },
              {
                id: 'react-4-3-q2', type: 'predict', title: '失敗したあとのボタン', lang: 'react',
                code: String.raw`async function handleSend() {
  setSending(true);
  try {
    await onSend(text);
    setText('');
  } finally {
    setSending(false);
  }
}

<button disabled={sending} onClick={handleSend}>送信</button>`,
                q: 'onSend が通信エラーで失敗（例外）した。そのあとの画面は？',
                choices: [
                  'ボタンはまた押せる状態に戻り、入力した文字は残っている',
                  'ボタンは押せないまま、入力した文字は消える',
                  'ボタンはまた押せる状態に戻り、入力した文字は消える',
                  'ボタンは押せないまま、入力した文字は残っている',
                ],
                answer: 0,
                hints: [
                  'await onSend(text) が例外を投げたら、try の中の次の行は実行されますか？',
                  'setText(\'\') は try の中にあります。',
                  'finally の中は、成功しても失敗しても実行されます。',
                ],
                why: '例外が出ると try の残り（setText(\'\')）は飛ばされるので、入力した文字は残る（打ち直さずに再送できる）。finally は必ず動くので sending は false に戻り、ボタンはまた押せる。',
              },
            ],
          },
        ],
      },
      // ================================================================ 5章
      {
        id: 'react-5',
        title: 'useEffect と副作用',
        badge: { icon: '🧹', name: '後片付け名人' },
        handout: {
          units: ['ハッカソン スプリント3「AIにつなぐ: 返答の届け方」', 'ハッカソン スプリント13「仕様ひっくり返し: ポーリングからストリーミングへ」'],
          knowledge: ['React テキスト 3章「state と useState」', 'JavaScript のクロージャ（関数は作られたときの変数を覚えている）', 'setInterval と clearInterval'],
          talk: [
            ['himuro', '描画とは関係ない仕事、つまり通信・タイマー・購読みたいな「副作用」は useEffect に書く。スプリント13のポーリングの PR は、この章が読めないと一行も読めない。'],
            ['himuro', '3章の state と、クロージャ。クロージャは5-3でもう一度ちゃんと説明するから、なんとなくでいい。'],
          ],
        },
        sections: [
          {
            id: 'react-5-1',
            title: 'useEffect と依存配列',
            talk: [
              ['himuro', 'useEffect に渡した関数は、描画が画面に出たあとに動く。いつ動くかは2つ目の引数、依存配列で決まる。'],
              ['himuro', '依存配列を書かなければ毎回の描画のあと。空の配列なら最初の1回だけ。roomId を入れておけば、最初と、roomId が変わったときだけ。'],
              ['player', '中で使ってる値は依存配列に入れる、が基本か。'],
              ['himuro', 'そう。入れ忘れると古い値で動くし、依存配列ごと書き忘れて中で set すると、描画 → effect → set → 描画……で無限に回る。ありがちだけど、本番で見たら普通に怖い。'],
            ],
            figure: {
              title: '依存配列と動くタイミング',
              text: String.raw`  useEffect(fn)
    → 毎回の描画のあと

  useEffect(fn, [])
    → 最初の描画のあと1回だけ

  useEffect(fn, [roomId])
    → 最初 ＋ roomId が変わった
      描画のあと

  ┌──────┐   ┌────────┐   ┌────────┐
  │ 描画 │ → │ 画面に │ → │ effect │
  └──────┘   │ 出る   │   │ が動く │
             └────────┘   └────────┘`,
            },
            code: {
              lang: 'react',
              text: String.raw`useEffect(() => {
  loadHistory(roomId).then(setMessages);
}, [roomId]);`,
            },
            points: ['useEffect の関数は描画が画面に出たあとに動く', '依存配列: なし = 毎回、空 = 最初だけ、値あり = 最初とその値が変わったとき', '中で使う props や state は依存配列に入れる'],
            quiz: [
              {
                id: 'react-5-1-q1', type: 'predict', title: '何回読み込む？', lang: 'react',
                code: String.raw`function ChatRoom({ roomId }) {
  const [text, setText] = useState('');

  useEffect(() => {
    console.log('履歴を読み込む: ' + roomId);
  }, [roomId]);

  return <input value={text} onChange={(e) => setText(e.target.value)} />;
}

// 1. roomId=1 で表示
// 2. 入力欄に「こんにちは」と5文字打つ
// 3. 親が roomId=2 に切り替える`,
                q: '1〜3のあいだに「履歴を読み込む」は何回出る？',
                choices: ['2回', '1回', '7回', '6回'],
                answer: 0,
                hints: [
                  '依存配列には何が入っていますか？',
                  '文字を打つと描き直されますが、そのとき roomId は変わっていますか？',
                  'effect が動くのは「最初」と「roomId が変わったとき」です。',
                ],
                why: '最初の表示で1回（roomId=1）。文字を打つと描き直されるが roomId は変わらないので動かない。roomId が 2 に変わったときにもう1回。合計2回。',
              },
              {
                id: 'react-5-1-q2', type: 'predict', title: '止まらない画面', lang: 'react',
                code: String.raw`function Rate() {
  const [rate, setRate] = useState(0);

  useEffect(() => {
    setRate(rate + 0.001);
  });

  return <p>金利: {rate.toFixed(3)}%</p>;
}`,
                q: 'この部品を表示すると、どうなる？',
                choices: [
                  '描画 → effect → set → 描画……がくり返されて止まらない（無限ループ）',
                  '最初に1回だけ 0.001 足されて「金利: 0.001%」で止まる',
                  '何も起きず「金利: 0.000%」のまま',
                  'rate を直接変えていないのでエラーになる',
                ],
                answer: 0,
                hints: [
                  'useEffect の2つ目の引数（依存配列）はありますか？',
                  '依存配列がないと、effect はいつ動くのでしたか？',
                  'effect の中で set を呼ぶと、何が起きますか？',
                ],
                why: '依存配列がないので effect は毎回の描画のあとに動く。その中で setRate を呼ぶと描き直しになり、また effect が動く……と止まらない。最初の1回だけでよいなら空の配列を渡す。',
              },
            ],
          },
          {
            id: 'react-5-2',
            title: 'クリーンアップ（後片付け）',
            talk: [
              ['himuro', 'useEffect の関数から関数を return すると、それが後片付け（クリーンアップ）になる。次に effect が動く直前と、部品が画面から消えるときに呼ばれる。'],
              ['himuro', 'setInterval で5秒ごとに新着を取りに行くなら、後片付けで clearInterval する。しないと、部屋を切り替えるたびにタイマーが増えていく。'],
              ['kasuga', 'タイマーが増えるとどうなるの……？ 私、こういうの全然分かんなくて……'],
              ['himuro', '前の部屋の新着まで取りに行き続ける。通信が増えて、違う部屋のメッセージが混ざる。……分かんないなら今覚えればいいだけだろ。'],
              ['player', '春日、つまり「部屋を出るときは電気を消そう」ってこと。氷室は「今覚えれば大丈夫」って言ってるんだよ。'],
            ],
            figure: {
              title: '部屋を切り替えたときの順番',
              text: String.raw`  roomId=1 で表示
    └▶ effect: タイマーA 開始

  roomId=2 に切り替え
    ├▶ 後片付け: タイマーA 停止
    └▶ effect: タイマーB 開始

  画面から消える
    └▶ 後片付け: タイマーB 停止

  後片付けがないと A も B も動き続ける`,
            },
            code: {
              lang: 'react',
              text: String.raw`useEffect(() => {
  const id = setInterval(() => {
    loadNewMessages(roomId);
  }, 5000);
  return () => clearInterval(id);
}, [roomId]);`,
            },
            points: ['effect から返した関数が後片付け。次の effect の前と、消えるときに呼ばれる', 'setInterval・購読・接続は後片付けで止める'],
            quiz: [
              {
                id: 'react-5-2-q1', type: 'fix', title: '新着の取得が増えていく', lang: 'react',
                story: '{hosoya}「相談ルームを何回か切り替えたら、通信の回数がどんどん増えて、前のルームのメッセージまで流れてきました」',
                code: String.raw`export function ChatRoom({ roomId }) {
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    const id = setInterval(() => {
      loadNewMessages(roomId).then(setMessages);
    }, 5000);
    () => clearInterval(id);
  }, [roomId]);

  return <MessageList messages={messages} />;
}`,
                bugLine: 8,
                fixes: ['return () => clearInterval(id);', 'clearInterval(id);', 'return clearInterval(id);', 'return () => setInterval(id);'],
                answer: 0,
                hints: [
                  '切り替えるたびに増えていくのは何でしょう？',
                  '後片付けの関数は、effect からどうやって React に渡すのでしたか？',
                  '8行目はアロー関数を作っているだけで、誰にも渡していません。',
                  '「関数を return する」ことが大事です。return clearInterval(id) だと、その場で止めてしまいます。',
                ],
                why: '8行目はアロー関数を作って捨てているだけで、React に後片付けとして渡っていない。return () => clearInterval(id); と関数を返せば、切り替えの前に古いタイマーが止まる。return clearInterval(id) だと作った直後にタイマーを止めてしまい、新着が取れない。',
              },
              {
                id: 'react-5-2-q2', type: 'predict', title: '後片付けのない購読', lang: 'react',
                code: String.raw`function RateTicker({ currency }) {
  useEffect(() => {
    subscribeRate(currency, (r) => console.log(currency, r));
    // 後片付けを書いていない
  }, [currency]);
  return null;
}

// currency が 'USD' → 'EUR' → 'GBP' と変わった`,
                q: '3つ目（GBP）に切り替わったあと、レートが届くたびに動いている購読はいくつ？',
                choices: ['3つ（USD・EUR・GBP）', '1つ（GBP だけ）', '2つ（EUR・GBP）', '0（currency が変わると自動で止まる）'],
                answer: 0,
                hints: [
                  'effect は currency が変わるたびに動き、新しく購読します。',
                  '前の購読を止める処理は、どこかにありますか？',
                  'React は、あなたが書いた後片付けしか呼びません。',
                ],
                why: '後片付けがないので、前の購読は止まらない。USD・EUR・GBP の3つが動き続け、関係ない通貨のログや処理が流れ続ける。購読の解除を返す関数を effect から return する。',
              },
            ],
          },
          {
            id: 'react-5-3',
            title: '古い値を掴んだままの関数（stale closure）',
            talk: [
              ['himuro', '関数は、作られたときの変数を覚えてる。これがクロージャ。effect の中で作った関数も、その描画のときの state を覚えてる。'],
              ['himuro', '依存配列が空の effect で setInterval を始めると、中の関数は最初の描画のときに1回作られたきり。だから中の count はずっと 0 のまま。'],
              ['player', '「毎秒 count + 1」が、毎秒「0 + 1」になるってことか。'],
              ['himuro', 'そう。直し方は3章でやった関数形式。setCount(prev => prev + 1) なら、覚えてる count を使わずに、React が最新の値を prev に入れてくれる。……3章ちゃんと読んでたら気づけるはず。'],
            ],
            figure: {
              title: '最初の描画の count を掴んだまま',
              text: String.raw`  1回目の描画（count = 0）
    effect: setInterval(fn) 開始
            fn は count = 0 を覚える
               │
     1秒後     ▼ setCount(0 + 1) → 1
     2秒後     ▼ setCount(0 + 1) → 1
     3秒後     ▼ setCount(0 + 1) → 1

  ✔ setCount(prev => prev + 1)
     → 0 → 1 → 2 → 3`,
            },
            points: ['関数は作られたときの値を覚えている（クロージャ）', '空の依存配列の effect の中では、state は最初の値のまま', '前の値から計算するなら関数形式で、古い値を掴む問題を避けられる'],
            quiz: [
              {
                id: 'react-5-3-q1', type: 'predict', title: '止まって見えるタイマー', lang: 'react',
                code: String.raw`function SessionTimer() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setSeconds(seconds + 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <p>操作がない時間: {seconds} 秒</p>;
}`,
                q: '表示してから5秒たったとき、画面の表示は？',
                choices: ['操作がない時間: 1 秒', '操作がない時間: 5 秒', '操作がない時間: 0 秒', '数字がでたらめに増減する'],
                answer: 0,
                hints: [
                  '依存配列は空です。effect は何回動きますか？',
                  'setInterval に渡した関数は、どの描画の seconds を覚えていますか？',
                  '最初の描画の seconds はいくつでしたか？',
                  '毎秒「0 + 1 にして」と頼み続けると……？',
                ],
                why: 'effect は最初の1回だけ動き、中の関数は seconds = 0 を覚えたまま。毎秒 setSeconds(0 + 1) を頼むので、1 秒後に 1 になったあとはずっと 1。setSeconds(s => s + 1) にすれば 5 になる。',
              },
              {
                id: 'react-5-3-q2', type: 'fix', title: '残り時間が減らない', lang: 'react',
                story: '{amano}「ワンタイムパスワードの残り時間、60 から 59 になったあと止まっちゃうんだって！ ユーザーさんが焦っちゃう！」',
                code: String.raw`export function OtpCountdown() {
  const [left, setLeft] = useState(60);

  useEffect(() => {
    const id = setInterval(() => {
      setLeft(left - 1);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return <p>あと {left} 秒</p>;
}`,
                bugLine: 6,
                fixes: ['setLeft((prev) => prev - 1);', 'setLeft(left--);', 'left = left - 1;', 'setLeft(60 - 1);'],
                answer: 0,
                hints: [
                  '59 になったあと止まる、ということは、毎秒同じ値を set しているのかもしれません。',
                  'setInterval の関数が覚えている left は、いつの値ですか？',
                  '依存配列が空なので、関数は最初の描画（left = 60）のときに作られたきりです。',
                  '覚えている値を使わずに、最新の値から計算する書き方がありました。',
                ],
                why: '6行目の関数は最初の描画の left = 60 を覚えたままなので、毎秒 setLeft(59) を頼み続ける。関数形式 setLeft((prev) => prev - 1) なら、React が最新の値を prev に入れるので 59, 58, 57……と減っていく。state への直接代入や left-- は state を書き換えるだけで描き直されない。',
              },
            ],
          },
        ],
      },
      // ================================================================ 6章
      {
        id: 'react-6',
        title: 'リスト・key・条件付き表示とパフォーマンス',
        badge: { icon: '🔑', name: 'key の番人' },
        handout: {
          units: ['ハッカソン スプリント17「速さの壁: 一覧の再描画とN+1」', 'ハッカソン スプリント19「XSS: AIの返答を表示する」'],
          knowledge: ['React テキスト 3章「state と useState」・5章「useEffect と副作用」', 'JavaScript の配列の map / filter と論理演算子（&& と ||）'],
          talk: [
            ['himuro', '最後はリスト。チャットのメッセージ一覧は map で並べる。key・条件付き表示・速さ・XSS まで、レビューで実際に指摘されるところを全部やる。'],
            ['himuro', 'map と filter、それから && の動きを使う。&& が「最後に見た値」を返すって知らないなら、6-2 で必ず引っかかる。'],
          ],
        },
        sections: [
          {
            id: 'react-6-1',
            title: 'map と key（index を key にする罠）',
            talk: [
              ['himuro', '配列を map で JSX の配列にすれば、一覧が出る。そのとき、1件ずつに key を付ける。React は key で「前の描画のどの行と同じか」を見分けてる。'],
              ['himuro', 'key には、そのデータに固有の id を使う。map の2つ目の引数の index を使うと、先頭に追加したり途中を消したりしたとき、行と中身の対応がずれる。'],
              ['player', 'ずれると何が起きる？'],
              ['himuro', '行ごとに持ってる state、たとえば入力中の返信や開閉の状態が、別のメッセージにくっつく。見た目では気づきにくいから、レビューで key を見るのは普通のこと。'],
            ],
            figure: {
              title: 'index を key にして先頭を消すと',
              text: String.raw`  消す前
    key=0「家賃」[メモA]
    key=1「食費」[メモB]
    key=2「光熱」
         │ 先頭の「家賃」を消す
         ▼
  消した後
    key=0「食費」[メモA] ← ずれた
    key=1「光熱」[メモB] ← ずれた

  React「key=0 は前と同じ行だ」
  ✔ key=m.id なら 「食費」[メモB] のまま`,
            },
            code: {
              lang: 'react',
              text: String.raw`<ul>
  {messages.map((m) => (
    <li key={m.id}>{m.text}</li>
  ))}
</ul>`,
            },
            points: ['map で並べる要素には key を付ける', 'key はデータ固有の id。index は並びが変わるとずれる', 'key がずれると行ごとの state が別の行にくっつく'],
            quiz: [
              {
                id: 'react-6-1-q1', type: 'fix', title: 'メモが隣の行に移る', lang: 'react',
                story: '{hosoya}「支出の一覧で、1行目を削除したら、2行目に書いていたメモが、別の行に移りました。正確さが足りません」',
                code: String.raw`export function ExpenseList({ expenses, onRemove }) {
  return (
    <ul>
      {expenses.map((x, i) => (
        <ExpenseRow
          key={i}
          expense={x}
          onRemove={() => onRemove(x.id)}
        />
      ))}
    </ul>
  );
}`,
                bugLine: 6,
                fixes: ['key={x.id}', 'key={0}', 'key={i + 1}', 'key={x}'],
                answer: 0,
                hints: [
                  '行ごとのメモ（state）が、別の行に移っています。React は何で行を見分けていますか？',
                  'key に使っている i は、削除したあとも同じ行を指しますか？',
                  '1行目を消すと、もとの2行目の i は 1 から 0 に変わります。',
                  'データに固有の値を key に使いましょう。',
                ],
                why: '6行目は index を key にしているので、1行目を消すと全行の key が1つずつずれ、React は別のデータを同じ行だと思ってメモ（state）を引き継ぐ。key に x.id のような固有の id を使う。i + 1 も index なので同じくずれる。オブジェクトを key にすると文字列になってすべて同じ値になる。',
              },
            ],
          },
          {
            id: 'react-6-2',
            title: '条件付き表示: && と三項演算子',
            talk: [
              ['himuro', '「条件が真のときだけ出す」は && で書くことが多い。条件が偽なら何も出ない……はずなんだけど、落とし穴がある。'],
              ['himuro', '&& は左が偽っぽい値ならその値をそのまま返す。false や null や undefined なら React は何も描かない。でも数値の 0 は「0」と描いてしまう。'],
              ['player', '未読 0 件のときに、謎の「0」が画面の隅に出るやつか。'],
              ['himuro', 'それ。数値で条件を書くなら count > 0 みたいに真偽値にする。「Aか B か」は三項演算子。読めば分かるから、ここは短く終わる。'],
            ],
            figure: {
              title: '&& の左側と、画面に出るもの',
              text: String.raw`  左側の値   │ 画面
  ───────────┼───────────────
  true       │ 右側の要素
  false      │ 何も出ない
  null       │ 何も出ない
  undefined  │ 何も出ない
  0          │ 「0」が出る ← 罠
  ''         │ 何も出ない`,
            },
            code: {
              lang: 'react',
              text: String.raw`{unread > 0 && <span className="badge">{unread}</span>}

{loggedIn ? <AccountMenu /> : <LoginButton />}`,
            },
            points: ['&& は左が偽っぽい値なら、その値を返す', '0 は画面に「0」と出る。数値なら count > 0 のように真偽値にする', '「AかBか」は三項演算子で書く'],
            quiz: [
              {
                id: 'react-6-2-q1', type: 'predict', title: '未読バッジ', lang: 'react',
                code: String.raw`function Inbox({ unread, notices }) {
  return (
    <div>
      <h2>お知らせ</h2>
      {unread && <span>未読 {unread} 件</span>}
      {notices.length > 0 && <ul>…</ul>}
    </div>
  );
}

<Inbox unread={0} notices={[]} />`,
                q: 'unread=0、notices が空の配列のとき、h2 の下に表示されるのは？',
                choices: ['「0」という文字だけ', '何も表示されない', '「未読 0 件」', '「0」と空の一覧'],
                answer: 0,
                hints: [
                  'unread が 0 のとき、unread && … は何を返しますか？',
                  '&& は左が偽っぽい値なら、その値そのものを返します。',
                  'React は 0 を描きますか？ false はどうでしたか？',
                  'notices.length > 0 は真偽値の false です。',
                ],
                why: 'unread && … は unread が 0 なので 0 を返し、React は数値の 0 を「0」と描く。notices.length > 0 は false なので何も出ない。unread > 0 && … と書くべき。',
              },
              {
                id: 'react-6-2-q2', type: 'predict', title: '三項演算子の出し分け', lang: 'react',
                code: String.raw`function Status({ loading, error, balance }) {
  return (
    <p>
      {loading ? '読み込み中…' : error ? '取得できませんでした' : balance + '円'}
    </p>
  );
}

<Status loading={false} error="timeout" balance={12000} />`,
                q: '表示される文字は？',
                choices: ['取得できませんでした', '読み込み中…', '12000円', 'timeout'],
                answer: 0,
                hints: [
                  '三項演算子が2つ続いています。左から順に読みましょう。',
                  'loading は false なので、最初の「:」の右側に進みます。',
                  'error は "timeout" という文字列です。空でない文字列は真っぽい値です。',
                ],
                why: 'loading が false なので後ろへ進み、error は空でない文字列（真っぽい値）なので「取得できませんでした」。読み込み中 → エラー → 正常、の順で出し分けている。',
              },
            ],
          },
          {
            id: 'react-6-3',
            title: 'useMemo / useCallback の考え方と dangerouslySetInnerHTML',
            talk: [
              ['himuro', '描き直しのたびに関数は全部実行される。だから重い計算を毎回やってたら、1文字打つごとに固まる。useMemo は「依存する値が変わらない限り、前の計算結果を使い回す」。'],
              ['himuro', 'useCallback は同じ考え方で、関数そのものを使い回す。子に渡す関数が毎回新しくなると、子の描き直しを省けないときに使う。どっちも「速くなる魔法」じゃなくて、遅いと分かったところに使う道具。'],
              ['himuro', 'もう1つ。波かっこで埋めた文字は、React が自動でエスケープする。だから AI の返答に script タグが入ってても、ただの文字として出る。dangerouslySetInnerHTML はそれを全部外す。名前に dangerously って書いてあるだろ。'],
              ['player', 'AI の返答をそのまま入れたら、XSS の入口になるってことか。'],
              ['himuro', 'そう。どうしても HTML を出すなら、サニタイズしてから。スプリント19で全部出てくる。……ここまで読めたなら、もう React の PR は普通に読めるよ。'],
            ],
            figure: {
              title: 'useMemo は計算結果を覚えておく',
              text: String.raw`  const total = useMemo(
    () => sumTokens(messages),
    [messages]
  );

  文字を打つ（query が変わる）
    → messages は同じ → 前の結果 ♻
  メッセージが増える
    → messages が変わる → 計算し直す

  埋め込み表示 → 自動でエスケープ   ✔
  dangerouslySetInnerHTML → しない  ✘`,
            },
            points: ['useMemo は計算結果、useCallback は関数を、依存する値が変わるまで使い回す', '最適化は遅いと分かったところに使う', '波かっこの埋め込みは自動でエスケープ。dangerouslySetInnerHTML は XSS の入口になる'],
            quiz: [
              {
                id: 'react-6-3-q1', type: 'review', title: '鬼塚と読む: 相談履歴の検索', lang: 'react',
                story: '{onizuka}「うちのチームの検索画面、レビュー頼まれたんだけど、一緒に見てくれ。1文字打つたびにカクつくらしい。あと AI の返答は太字とかを出したいから HTML で表示してるって」',
                code: String.raw`import { useState } from 'react';

export function History({ messages }) {
  const [query, setQuery] = useState('');
  const total = messages.reduce((sum, m) => sum + countTokens(m.text), 0);
  const hits = messages.filter((m) => m.text.includes(query));

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>合計トークン: {total}</p>
      {hits.map((m, i) => (
        <div
          key={i}
          className="msg"
          dangerouslySetInnerHTML={{ __html: m.text }}
        />
      ))}
    </div>
  );
}`,
                defects: [
                  { line: 5, kind: 'perf', why: '1文字打つたびに全履歴のトークンを数え直している。total は messages にしか依存しないので、useMemo で messages が変わったときだけ計算する。' },
                  { line: 14, kind: 'bug', why: 'index を key にしている。検索で絞り込むたびに並びが変わり、行と中身の対応がずれる。m.id を使う。' },
                  { line: 16, kind: 'security', why: 'AI の返答（外から来た文字列）をサニタイズせずに HTML として入れている。script やイベント属性が動く XSS の入口になる。ふつうに波かっこで埋め込むか、サニタイズしてから使う。' },
                ],
                hints: [
                  '欠陥は3つ。「カクつく」「一覧」「HTML で表示」の3つを手がかりに。',
                  '1文字打つと何が描き直され、どの計算がやり直されますか？ その計算は query に関係ありますか？',
                  'map の key に何を使っていますか？ 検索で絞り込むと並びはどうなりますか？',
                  'dangerouslySetInnerHTML に、外から来た文字列をそのまま入れていませんか？',
                ],
                why: '5行目: query と無関係な重い計算を毎回やり直している（性能。useMemo で覚える）。14行目: index を key にしていて、絞り込みで行がずれる（バグ）。16行目: AI の返答を無害化せずに HTML として入れている（セキュリティ。XSS）。',
              },
              {
                id: 'react-6-3-q2', type: 'predict', title: 'useMemo はいつ計算し直す？', lang: 'react',
                code: String.raw`function Report({ transactions }) {
  const [filter, setFilter] = useState('all');

  const summary = useMemo(() => {
    console.log('集計します');
    return summarize(transactions);
  }, [transactions]);

  // ……
}

// 1. 最初の表示
// 2. filter を 'food' に変える
// 3. filter を 'all' に戻す
// 4. 親が新しい transactions を渡す`,
                q: '1〜4のあいだに「集計します」は何回出る？',
                choices: ['2回', '1回', '4回', '3回'],
                answer: 0,
                hints: [
                  'useMemo の依存配列には何が入っていますか？',
                  'filter を変えると描き直されますが、transactions は変わっていますか？',
                  '計算し直すのは、最初と、依存配列の値が変わったときです。',
                ],
                why: '最初の表示で1回。filter の変更（2・3）では transactions が同じなので前の結果を使い回す。4で transactions が新しくなったのでもう1回。合計2回。',
              },
            ],
          },
        ],
      },
    ],
  });
})(globalThis);
