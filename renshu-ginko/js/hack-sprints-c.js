/*
 * ハッカソン: スプリント17〜24（性能・安全〜リリース）
 * 形は js/hackathon.js の先頭の説明を参照。コードは String.raw で書く。行番号は1始まり。
 */
(function (g) {
  'use strict';
  const H = g.RGA.hack;

  H.addSprints([
    {
      no: 17,
      title: '速さの壁: 一覧の再描画とN+1',
      goal: '会話の履歴画面を、会話が数百件あっても待たされない速さにする',
      knowledge: ['React の key と再描画（index を key にしない）', '重い計算は useMemo で覚えておく', 'N+1 問題（ループの中で DB に問い合わせない）'],
      briefing: [
        ['daichi', '今回のスクラムマスターは僕、小森です！ 緊張するけど、がんばります！ テーマは「速さ」。履歴画面が重いって声が出てるんだ。'],
        ['amano', '会話が200件を超えると、履歴を開くのに数秒かかるの。お客さまは待ってくれないよ！ 今回のゴールは「数百件でもサクサク」！'],
        ['rio', 'この章の知識を配るね。React は state が変わるたびに関数全体を実行し直すから、重い計算は useMemo で「入力が変わったときだけ」やり直す。一覧の key に index を使うと、絞り込みで並びが変わったとき、別の行に状態がくっつく。'],
        ['osamu', 'サーバー側も見ろ。1回の一覧取得で、件数ぶん DB に問い合わせていたら、それが N+1 だ。100件なら101回。'],
      ],
      problems: [
        {
          id: 'S17-1', type: 'review', title: 'ひかりのPR: 履歴の検索ボックス', by: 'hikari', lang: 'react', points: 3,
          story: '{hikari}「履歴に検索ボックスを付けたよ〜✨ でも1文字打つたびにカクッてするのと、チェックがずれる気がする…」（summarizeAll は全メッセージの文字数を数えて集計する重い関数）',
          file: 'src/HistoryList.jsx',
          code: String.raw`import { useState } from 'react';

export function HistoryList({ messages }) {
  const [query, setQuery] = useState('');
  const stats = summarizeAll(messages);
  const shown = messages.filter((m) => m.text.includes(query));

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <p>合計 {stats.count} 件・平均 {stats.avgLength} 文字</p>
      <ul>
        {shown.map((m, i) => (
          <li key={i}>
            <input type="checkbox" defaultChecked={m.pinned} />
            {m.text}
          </li>
        ))}
      </ul>
    </div>
  );
}`,
          defects: [
            { line: 5, kind: 'perf', why: '1文字打つたびに（query が変わるたびに）重い summarizeAll が全件ぶん走る。messages は変わっていないので、useMemo(() => summarizeAll(messages), [messages]) で覚えておける。' },
            { line: 14, kind: 'bug', why: 'index を key にしているので、絞り込みで並びが変わると、チェックボックスの状態が別の会話にくっつく。key={m.id} のように、その会話だけが持つ値を使う。' },
          ],
          hints: [
            'カクッとするのは「毎回やらなくていい計算」を毎回しているからかも。入力のたびに何が実行されますか？',
            'query が変わると、コンポーネントの関数全体がもう一度実行されます。5行目の計算は query を使っていますか？',
            'チェックがずれるのは一覧の目印の問題です。絞り込むと、i（何番目か）は同じ会話を指し続けるでしょうか？',
            '5行目は perf（useMemo で messages が変わったときだけ計算）、14行目は bug（key に m.id を使う）です。',
          ],
          why: '再描画のたびに走る重い計算は useMemo で入力が変わったときだけに。key は「何番目か」ではなく「誰か」を表す値にする。index を key にすると、絞り込みや並び替えで状態が別の行に移ってしまう。',
        },
        {
          id: 'S17-2', type: 'fix', title: '自分のコード: 会話一覧のAPI', by: 'player', lang: 'python', points: 3,
          story: '先週{player}が書いた会話一覧の API。{osamu}「ログを見たら、1回の一覧表示で SQL が201回流れてる」',
          file: 'api/conversations.py',
          code: String.raw`def list_conversations(db, user_id):
    convs = db.query(
        "SELECT id, title FROM conversations WHERE user_id = ?", (user_id,)
    )
    result = []
    for c in convs:
        last = db.query(
            "SELECT text FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1",
            (c["id"],),
        )
        text = last[0]["text"] if last else ""
        result.append({"id": c["id"], "title": c["title"], "last": text})
    return result`,
          bugLine: 7,
          fixes: [
            'ループの前で、会話の id をまとめて IN (...) に入れて「各会話の最後のメッセージ」を1回の SQL で取り、辞書にしてループの中では辞書から引く',
            'ループの中の db.query の前に time.sleep(0.01) を入れて、DB への負荷をならす',
            'LIMIT 1 を LIMIT 10 にして、1回で多めに取っておく',
            'ループの中の db.query をスレッドで並列に呼んで、待ち時間を短くする',
          ],
          answer: 0,
          hints: [
            '会話が200件あると、この関数は SQL を何回流すでしょう？',
            '1回目の SELECT（2行目）と、for の中の SELECT（7行目）を分けて数えてみましょう。',
            '「ループの中で DB に問い合わせる」形が N+1 です。問い合わせをループの外に出せませんか？',
            '並列にしても回数は減りません。必要なのは「まとめて1回で取る」直し方です。',
          ],
          why: '会話 N 件に対して 1 + N 回 SQL を流すのが N+1 問題。必要な行を IN や JOIN で1回で取り、辞書で引けば回数は件数によらず2回になる。sleep や並列化は回数そのものを減らさない。',
        },
      ],
      event: {
        id: 'S17-E', type: 'talk', title: '細谷さんのストップウォッチ', by: 'hosoya', from: 'hosoya', lang: 'text', points: 1,
        text: '{hosoya}「会話を250件作って、履歴を10回開きました。平均2.8秒、いちばん遅いときは4.1秒です。何秒なら合格にしますか？」',
        options: [
          { text: '「お使いの端末が古いのかもしれません」', best: false, reply: [['hosoya', '研修用の標準端末です。利用者の多くも、これと同じくらいの端末です。']], note: '計測の事実を、相手の環境のせいにしない。' },
          { text: '「測ってくださってありがとうございます。今の修正後の値もこちらで測ってお見せします。目標の秒数は天野さんと決めて、受け入れ条件に書きます」', best: true, reply: [['hosoya', '……数字で返してもらえるなら納得できます。私も同じ手順で測り直します。'], ['amano', 'じゃあ「250件で1秒以内」を受け入れ条件にしよう！']], note: '数字には数字で返す。目標値は思いつきで言わず、POと決めて受け入れ条件として残す。' },
          { text: '「じゃあ表示を最新10件だけにします」とその場で約束する', best: false, reply: [['madoka', '仕様が変わっちゃうよ。表示件数を減らすかはPOと相談しよう。']], note: '速くする手段として仕様を勝手に削らない。' },
        ],
        hints: [
          '細谷さんは「測った数字」を持ってきています。こちらは何で答えるのがよいでしょう？',
          '「何秒なら合格か」は、開発者だけで決めてよいことでしょうか？',
          '受け入れ条件として残しておくと、あとで誰が助かりますか？',
        ],
        why: '計測には計測で返し、目標値はPOと決めて受け入れ条件に残す。性能は「速くなった気がする」ではなく数字で確かめる。',
      },
      retro: [
        ['daichi', 'スクラムマスター、なんとかやれた…！ よかったこと: SQL が201回から2回になった！ 次に試すこと: PRに「件数が増えたら？」の欄を作る。'],
        ['rio', '{player}が自分のコードの N+1 にすぐ気づいたの、良かった。ループの中の通信を疑う目ができてる。'],
        ['kumagai', '速さも品質のうちだよ〜。お客さんの数秒は、積もるとけっこうな時間だからねぇ。'],
      ],
    },
    {
      no: 18,
      title: '揺れるテスト',
      goal: 'ときどき落ちるテスト（フレーキーなテスト）をなくし、CI を信頼できる状態に戻す',
      knowledge: ['テストは「いつ・何回・どの順で」実行しても同じ結果になるべき', '現在時刻や乱数は外から渡して固定する', 'テスト同士で状態を共有しない（beforeEach で毎回用意する）'],
      briefing: [
        ['madoka', '今回のスクラムマスターは{player}！ よろしくね。'],
        ['osamu', 'CI がときどき赤くなる。再実行すると緑になる。この状態が一番まずい。本当に壊れたときも「またか」で流される。'],
        ['shiraishi', '配る知識はこれ。テストが揺れる原因の多くは「今の時刻」「乱数」「ほかのテストが残した状態」の3つ。今の時刻や乱数はテストの中で固定した値を渡し、変数はテストごとに用意し直そうね。'],
        ['hikari', '{player}、スクラムマスターがんばって！ 困ったらすぐ言ってね〜💪'],
      ],
      problems: [
        {
          id: 'S18-1', type: 'predict', title: '大地くんのテストはいつ落ちる？', by: 'daichi', lang: 'js', points: 2,
          story: '{daichi}「僕のテスト、手元ではいつも通るのに、CI で月に1回くらい落ちるって{osamu}さんに言われて…」',
          code: String.raw`function daysLeftInMonth(now) {
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return end.getDate() - now.getDate();
}

test('月末までの残り日数', () => {
  const now = new Date();
  expect(daysLeftInMonth(now)).toBeGreaterThan(0);
});`,
          q: 'このテストが落ちるのはいつ？',
          choices: ['毎月の最終日だけ', '2月だけ', '毎月1日だけ', 'いつ実行しても落ちない'],
          answer: 0,
          hints: [
            '2行目の new Date(年, 月 + 1, 0) は「次の月の0日」＝「今月の最終日」です。',
            '3行目は「最終日の日付 − 今日の日付」。これが 0 になるのはどんな日？',
            '8行目は「0 より大きい」ことを確かめています。0 のときは？',
            '7行目で「今」を使っているので、実行した日によって結果が変わります。',
          ],
          why: '月の最終日に実行すると残り日数は 0 になり、toBeGreaterThan(0) が落ちる。テストの中で new Date() を使うと結果が実行日に左右される。new Date(2026, 9, 19) のように日付を固定して、月末の場合のテストも別に書く。',
        },
        {
          id: 'S18-2', type: 'comment', title: 'ひかりのテストにコメントを書く', by: 'hikari', lang: 'js', points: 3,
          story: '{hikari}「残高のテストを書いたよ！ …でも、たまに2つ目が落ちるんだよね🤔」{osamu}「順番を入れ替えて実行してみろ。もっと落ちる」',
          file: 'tests/balance.test.js',
          code: String.raw`let balance = 10000;

test('引き出すと残高が減る', () => {
  const amount = _.random(0, 20000);
  balance = withdraw(balance, amount);
  expect(balance).toBeLessThan(10000);
});

test('残高照会は 10000 円を返す', () => {
  expect(balance).toBe(10000);
});`,
          focus: [1, 4],
          prompt: '1行目と4行目について、レビューコメントを書いてください（なぜテストが揺れるか・どう直すか）。',
          checks: [
            { label: '乱数で結果が毎回変わることに触れている', any: ['random', '乱数', 'ランダム', '毎回違', '毎回変わ'] },
            { label: 'テスト同士で状態を共有し、順番に依存していることに触れている', any: ['共有', '順番', '順序', '依存', '独立'] },
            { label: '直し方（値を固定する／beforeEach で毎回用意する）を示している', any: ['固定', 'beforeeach', 'テストの中で', '初期化', 'リセット'] },
          ],
          min: 2,
          sample: '4行目、_.random（乱数）で金額を決めているので、0円や10000円を超える値が出たときに結果が毎回違います。金額は 3000 のように固定しませんか？ また1行目の balance を2つのテストで共有しているので、実行の順番に依存して10行目が落ちます。beforeEach で毎回 10000 に初期化すると独立したテストになります。テスト名が日本語で分かりやすいのは良いと思います！',
          hints: [
            '4行目の金額は、実行するたびに同じ値になりますか？',
            '金額が 0 のとき、6行目の「10000 より小さい」は成り立つでしょうか？',
            '1行目の balance は、2つのテストのどちらからも書き換えたり読んだりされています。',
            '1つ目のテストが先に走ると、2つ目のテストが見る balance はいくつ？',
            '「乱数を固定」「beforeEach で毎回初期化」の2点を、理由つきで書きましょう。',
          ],
          why: '乱数を使うと結果が実行ごとに変わり、テストの外の変数を共有すると実行順で結果が変わる。テストは値を固定し、必要な状態は beforeEach で毎回用意して、互いに独立させる。',
        },
        {
          id: 'S18-3', type: 'fix', title: '自分のテスト: あいさつの時間帯', by: 'player', lang: 'js', points: 2,
          story: '{player}が書いたあいさつのテスト。{osamu}「夜のCIで毎晩落ちてる」',
          file: 'src/greeting.test.js',
          code: String.raw`export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 11) return 'おはようございます';
  if (h < 18) return 'こんにちは';
  return 'こんばんは';
}

test('昼のあいさつ', () => {
  expect(greeting()).toBe('こんにちは');
});`,
          bugLine: 9,
          fixes: [
            "expect(greeting(new Date(2026, 9, 19, 13, 0))).toBe('こんにちは');",
            "expect(['おはようございます', 'こんにちは', 'こんばんは']).toContain(greeting());",
            "if (new Date().getHours() < 18) expect(greeting()).toBe('こんにちは');",
            "jest.retryTimes(3); expect(greeting()).toBe('こんにちは');",
          ],
          answer: 0,
          hints: [
            '夜に実行すると greeting() は何を返しますか？',
            '9行目の greeting() には引数がありません。そのとき now には何が入りますか？',
            'greeting は now を引数で受け取れる作りになっています。これを活かせませんか？',
            '何でも通るテストや、夜は何も確かめないテスト、再実行頼みのテストは「直した」とは言えません。',
          ],
          why: '引数を省くと現在時刻が使われ、実行する時間でテストの結果が変わる。昼の時刻を固定して渡せば、いつ実行しても「昼のあいさつ」を確かめられる。何でも通す・条件付きで飛ばす・リトライに頼るのは、テストの意味をなくす。',
        },
      ],
      event: {
        id: 'S18-E', type: 'talk', title: '営業部長の提案', by: 'sales', from: 'sales', lang: 'text', points: 1,
        text: '{sales}「CIってのが、ときどき赤くなるんだって？ 再実行すれば通るんでしょ。そんなの放っておいて、お客さまに頼まれた『家計簿グラフ』を先に作ってよ」',
        options: [
          { text: '「分かりました。テストの修正は後回しにします」', best: false, reply: [['osamu', '赤が当たり前になったら、本当に壊れたときに誰も気づかない。']], note: '揺れるテストを放置すると、テスト全体が信用されなくなる。' },
          { text: '「ご要望ありがとうございます。CIが揺れていると、本当の不具合を見逃してお客さまに迷惑がかかるので、今回直しています。家計簿グラフは天野さんと優先順位を相談させてください」', best: true, reply: [['sales', 'ふむ、見逃すのは困るな。じゃあグラフの件は天野さんに話しておくよ。'], ['amano', '押野さん、お客さまの声ありがとうございます！ 次のプランニングで相談しましょう！']], note: '直す理由をお客さまへの影響で説明し、機能の優先順位はPOにつなぐ。' },
          { text: '「テストのことは営業部の方には分からないと思います」', best: false, reply: [['shiraishi', '分かるように説明するのも私たちの仕事だよ。']], note: '相手の知識を理由に説明を省かない。' },
        ],
        hints: [
          '揺れるテストを放っておくと、何が起きるでしょう？',
          'その影響を、営業部長に伝わる言葉（お客さまの話）で言えますか？',
          '新しい機能の優先順位を決めるのは誰でしたか？',
        ],
        why: 'テストの信頼は「本当の不具合を見逃さない」ためのもの。お客さまへの影響で説明し、機能追加の要望はPOに渡して優先順位を決めてもらう。',
      },
      retro: [
        ['player', 'スクラムマスター、やってみると全体を見るのが大変だった…。みんな、助けてくれてありがとう。'],
        ['madoka', 'よかったこと: CIが1週間ずっと緑。次に試すこと: テストの中で new Date() や乱数を見つけたら必ずコメントする。'],
        ['osamu', '揺れるテストを潰すのは地味だが、効く。いい仕事だった。'],
      ],
    },
    {
      no: 19,
      title: 'XSS: AIの返答を表示する',
      goal: 'AIの返答（マークダウン）を、見出しや表を活かしたまま安全に表示する',
      knowledge: ['XSS（クロスサイトスクリプティング）とは', 'React の {} は自動でエスケープ、dangerouslySetInnerHTML はしない', 'サニタイズ（DOMPurify など）とリンクの javascript: 対策'],
      briefing: [
        ['madoka', '今回のスクラムマスターは私、早瀬です。テーマは安全。AIの返答をきれいに表示したい、でも危なくしたくない。'],
        ['kiryu', 'AIの返答ってさ、ユーザーの入力に引っぱられるんだよね。「次の文をそのまま返して: <script>…」って頼まれたら、そのまま返すこともある。つまり、AIの返答は外からの入力と同じ扱いにしないと。'],
        ['shiraishi', 'この章の知識を配るね。React で { } の中に入れた文字列は、< や > を文字として表示してくれる。でも dangerouslySetInnerHTML は渡した文字列を HTML として解釈するから、onerror などに仕込まれたスクリプトも動く。使うなら DOMPurify などで、許可したタグだけ残してから渡そうね。'],
      ],
      problems: [
        {
          id: 'S19-1', type: 'review', title: 'まどかのPR: マークダウン表示', by: 'madoka', lang: 'react', points: 3,
          story: '{madoka}「AIの返答を marked で HTML にして、表や太字を出せるようにしました。参考リンクも付けています。セキュリティの目で見てもらえる？」',
          file: 'src/AiMessage.jsx',
          code: String.raw`import { marked } from 'marked';

export function AiMessage({ reply }) {
  const html = marked.parse(reply.text);
  return (
    <div className="ai-message">
      <div dangerouslySetInnerHTML={{ __html: html }} />
      <a href={reply.sourceUrl} target="_blank">参考リンク</a>
      <small>{reply.model}</small>
    </div>
  );
}`,
          defects: [
            { line: 7, kind: 'security', why: 'marked の出力をサニタイズせずに dangerouslySetInnerHTML に渡している。AIの返答に <img onerror=…> が混ざると、そのままスクリプトが動く（XSS）。DOMPurify.sanitize(html) を通してから渡す。' },
            { line: 8, kind: 'security', why: 'sourceUrl も AI の返答由来。javascript: で始まる URL だとクリックでスクリプトが動く。http/https だけを許可し、target="_blank" には rel="noopener noreferrer" を付ける。' },
          ],
          hints: [
            'AIの返答は、ユーザーが誘導すれば好きな文字列を含められます。どこにそのまま入っていますか？',
            'dangerouslySetInnerHTML は、名前のとおり「危険」を引き受ける書き方です。渡す前に何が必要でしょう？',
            'リンクの href に「javascript:alert(1)」が入ったら、クリックしたときに何が起きますか？',
            '7行目（サニタイズなし）と8行目（URL の検査なし）がどちらも security です。',
          ],
          why: 'AIの返答は外部入力として扱う。HTML として表示するなら DOMPurify などで許可したタグだけに絞り、リンクは http/https のみ許可して rel="noopener noreferrer" を付ける。',
        },
        {
          id: 'S19-2', type: 'predict', title: '理央の小テスト: {} と dangerouslySetInnerHTML', by: 'rio', lang: 'react', points: 2,
          story: '{rio}「違いを体で覚えよう。同じ文字列を2通りで表示したら、どうなる？」',
          code: String.raw`const text = '金利は<b>年0.2%</b>です<img src="x" onerror="alert(1)">';

function A() {
  return <p>{text}</p>;
}

function B() {
  return <p dangerouslySetInnerHTML={{ __html: text }} />;
}`,
          q: 'A と B を画面に出すと？',
          choices: [
            'A はタグも文字としてそのまま表示され、B は「年0.2%」が太字になり、onerror のスクリプトも動く',
            'A も B も「年0.2%」が太字になり、スクリプトはどちらも動かない',
            'A は太字になり、B はタグが文字としてそのまま表示される',
            'A も B もスクリプトが動く',
          ],
          answer: 0,
          hints: [
            'React の {} に文字列を入れると、< や > はどう扱われますか？',
            'dangerouslySetInnerHTML は、文字列を HTML として解釈します。',
            'src="x" の画像は読み込みに失敗します。そのとき onerror は？',
          ],
          why: '{} は自動でエスケープするので、タグは文字として表示されスクリプトも動かない。dangerouslySetInnerHTML は HTML として解釈するので、太字にもなるが onerror のスクリプトも実行される。',
        },
        {
          id: 'S19-3', type: 'fix', title: '自分のコード: 手作りの無害化', by: 'player', lang: 'js', points: 2,
          story: '{player}が先に書いていた無害化の関数。{kiryu}「それ、<img onerror> で抜けられるよ」',
          file: 'src/safeHtml.js',
          code: String.raw`import { marked } from 'marked';
import DOMPurify from 'dompurify';

export function toSafeHtml(markdown) {
  const html = marked.parse(markdown);
  return html.replace(/<script>/g, '').replace(/<\/script>/g, '');
}`,
          bugLine: 6,
          fixes: [
            'return DOMPurify.sanitize(html);',
            "return html.replace(/<script.*?>/gi, '').replace(/<\\/script>/gi, '');",
            "return html.replace(/</g, '');",
            'return encodeURI(html);',
          ],
          answer: 0,
          hints: [
            '危ないのは <script> だけでしょうか？ 前の問題の B を思い出しましょう。',
            '正規表現で消すやり方は、書き方を少し変えた攻撃（大文字、属性、別のタグ）に弱いです。',
            '2行目で読み込んでいるのに、使われていないものがありますね。',
            '< を全部消すと安全にはなりますが、表や太字も出せなくなります。',
          ],
          why: '自前の置き換えでは onerror や javascript: などの抜け道をふさぎきれない。実績のあるサニタイザ（DOMPurify.sanitize）に任せれば、許可したタグと属性だけが残る。',
        },
      ],
      event: {
        id: 'S19-E', type: 'talk', title: 'セキュリティ室の確認', by: 'sec', from: 'sec', lang: 'text', points: 1,
        text: '{sec}「AIの返答を HTML で表示すると聞きました。どのように無害化しているか、方針を説明してください」',
        options: [
          { text: '「AIは悪いことをしないので、特に対策はしていません」', best: false, reply: [['sec', 'AIの返答はユーザーの入力に誘導されます。外部入力として扱ってください。']], note: 'AIの出力も信用しない入力として扱う。' },
          { text: '「DOMPurify で許可したタグだけ残し、リンクは http/https だけ許可しています。攻撃用の文字列を並べたテストも CI で毎回流しています」', best: true, reply: [['sec', '方針とテストの両方があるのは良いですね。CSP（コンテンツセキュリティポリシー）の設定も合わせて確認させてください。'], ['madoka', 'CSP の確認、タスクに入れます！']], note: '使っている仕組み・許可の範囲・テストで確かめていることを、具体的に説明できている。' },
          { text: '「心配でしたら、今日中に全部プレーンテキスト表示に戻します」', best: false, reply: [['amano', '表や見出しはお客さまに好評なんだ。安全に出す方法があるなら、まずそれを説明しよう！']], note: '安全に実現する方法を説明せずに、機能を独断で削らない。' },
        ],
        hints: [
          'セキュリティ室が知りたいのは「どう守っているか」の方針です。',
          '「使っている仕組み」と「それを確かめている方法」を言えますか？',
          '機能を削るかどうかは、誰と決めることでしたか？',
        ],
        why: '仕組み（サニタイズとURLの許可リスト）と確認方法（攻撃文字列のテスト）を具体的に説明する。AIの出力は外部入力として扱う。',
      },
      retro: [
        ['madoka', 'よかったこと: XSS を2か所、リリース前に止められた。次に試すこと: dangerouslySetInnerHTML を見たら必ず「サニタイズは？」と聞く。'],
        ['kiryu', '{player}、手作りの置き換えを潔く捨てたの、いい判断だったよ。車輪の再発明は、セキュリティでは一番危ないからね。'],
        ['shiraishi', '「自分のコードは安全なはず」と思わないこと。今回それができてたよ。'],
      ],
    },
    {
      no: 20,
      title: '費用を守る: トークン予算',
      goal: 'AIの費用を予算内に収める（返答の長さ・履歴の量・モデルの使い分け）',
      knowledge: ['トークン: AIの料金は入力と出力の量で決まる', 'max_tokens で返答の長さに上限をかける', '会話の履歴は全部送らず、直近だけに絞る'],
      briefing: [
        ['rio', 'スクラムマスターの神崎です。今回は費用。試算したら、このままだと月のAI費用が予算をかなり超える。'],
        ['rio', '知識を配るね。AIへの料金は「送ったトークン＋返ってきたトークン」で決まる。毎回それまでの会話を全部送ると、入力は往復のたびに増えていく。だから履歴は直近だけに絞り、max_tokens で返答の上限を決める。簡単な相談には小さいモデルを使うのも効く。'],
        ['amano', '安くしても、答えの質が落ちたら意味がないからね！ 「どこを削っても困らないか」を考えてね！'],
        ['kiryu', 'ついでに言うと、システムプロンプトみたいに毎回同じ部分は先頭に固定しておくと、プロンプトキャッシュが効きやすいよ。'],
      ],
      problems: [
        {
          id: 'S20-1', type: 'review', title: '大地くんのPR: AIを呼ぶ関数', by: 'daichi', lang: 'python', points: 3,
          story: '{daichi}「AIの返答を作る関数です！」 チームで決めたこと: ふだんは model-small、むずかしい相談だけ model-large に回す。返答は max_tokens 1024 まで。',
          file: 'ai/reply.py',
          code: String.raw`import llm_client as llm

SYSTEM = "あなたは練習銀行のお金相談アシスタントです。"

def reply(history, user_text):
    history.append({"role": "user", "content": user_text})
    res = llm.create(
        model="model-large",
        system=SYSTEM,
        messages=history,
        max_tokens=64000,
    )
    history.append({"role": "assistant", "content": res.text})
    return res.text`,
          defects: [
            { line: 8, kind: 'spec', why: 'チームの決めごとは「ふだんは model-small」。すべての相談を高いモデルに送っている。' },
            { line: 10, kind: 'perf', why: '会話の履歴を毎回すべて送っているので、往復するたびに入力トークン（費用と待ち時間）が増え続ける。直近の数往復に絞って送る。' },
            { line: 11, kind: 'spec', why: '返答の上限は 1024 と決めたのに 64000 になっている。長い返答はそのまま費用になる。' },
          ],
          hints: [
            'story の「チームで決めたこと」と、コードの値を1つずつ見比べましょう。',
            'モデルの指定と max_tokens の値は、決めごとどおりですか？',
            'もう1つは決めごとには書かれていない問題。messages に渡しているものは、会話が続くとどうなりますか？',
            '8行目と11行目は spec、10行目は perf（履歴を全部送っている）です。',
          ],
          why: 'モデルと max_tokens は決めた値に合わせる。履歴を全部送ると、会話が長くなるほど1回あたりの費用と待ち時間が増える。直近だけに絞る関数を通してから送る。',
        },
        {
          id: 'S20-2', type: 'fix', title: '自分のコード: 履歴を絞る', by: 'player', lang: 'python', points: 2,
          story: '{player}が書いた、履歴を直近10往復に絞る関数。{hosoya}「長く話していると、さっき話したことをAIが忘れて、最初の話ばかりします」',
          file: 'ai/history.py',
          code: String.raw`MAX_TURNS = 10

def trim_history(history):
    """直近 MAX_TURNS 往復（user と assistant の組）だけ残す"""
    keep = MAX_TURNS * 2
    trimmed = history[:keep]
    if trimmed and trimmed[0]["role"] != "user":
        trimmed = trimmed[1:]
    return trimmed`,
          bugLine: 6,
          fixes: [
            'trimmed = history[-keep:]',
            'trimmed = history[keep:]',
            'trimmed = history[:MAX_TURNS]',
            'trimmed = list(reversed(history))[:keep]',
          ],
          answer: 0,
          hints: [
            '「最初の話ばかりする」ということは、AIに残っているのはどの部分の履歴でしょう？',
            'history[:keep] は、リストの「先頭から」keep 個です。',
            '「後ろから keep 個」は、Python のスライスでどう書きますか？',
            '逆順にすると、AIに渡す会話の順番まで逆になってしまいます。',
          ],
          why: 'history[:keep] は古い方を残してしまう。history[-keep:] で新しい方の keep 個を残す。逆順にすると会話の流れが崩れる。',
        },
        {
          id: 'S20-3', type: 'predict', title: '理央の試算: 履歴を全部送ると', by: 'rio', lang: 'python', points: 2,
          story: '{rio}「履歴を全部送ったときの入力トークンを、3往復ぶん計算してみよう」',
          code: String.raw`# 1往復で user 50 トークン、assistant 150 トークンとする
# 毎回、それまでの履歴を全部送る（システムプロンプトは数えない）
total_input = 0
history_tokens = 0
for turn in range(1, 4):
    history_tokens += 50           # 今回のユーザー発言
    total_input += history_tokens  # 送る入力トークン
    history_tokens += 150          # AIの返答が履歴に足される
print(total_input)`,
          q: '表示される数は？',
          choices: ['150', '750', '600', '450'],
          answer: 1,
          hints: [
            'range(1, 4) は 1, 2, 3 の3回です。',
            '1回目: 送るのは 50。そのあと履歴は 200 になります。',
            '2回目: 履歴は 250 になってから送ります。3回目は？',
          ],
          why: '送る量は 50 → 250 → 450 と増え、合計 750。毎回ユーザー発言だけなら 150 で済む。往復が増えるほど差は広がるので、履歴は直近に絞る。',
        },
      ],
      event: {
        id: 'S20-E', type: 'talk', title: '役員の決断', by: 'exec', from: 'exec', lang: 'text', points: 1,
        text: '{exec}「試算を見たよ。AIの費用が予算の3倍？ じゃあ、いちばん安いモデルだけにしよう。今日ここで決めてくれ」',
        options: [
          { text: '「承知しました。今日からいちばん安いモデルだけにします」', best: false, reply: [['amano', '待ってください、むずかしい相談の答えの質がどうなるか、まだ確かめていません！']], note: '品質への影響を確かめずに、その場で方針を決めない。' },
          { text: '「履歴を絞る・返答に上限をかける・ふだんは小さいモデルにする、の3つで試算すると予算内に収まります。答えの質を比べた結果を、明日天野さんと一緒にお見せして決めていただけますか」', best: true, reply: [['exec', '……数字があるなら話は早い。明日見せてくれ。'], ['amano', '答えの比較表、チームで用意します！']], note: '打ち手と効果を数字で示し、品質の確認をはさんで、POと一緒に判断の材料を出す。' },
          { text: '「費用のことは開発チームには分かりません」', best: false, reply: [['kumagai', '費用も設計のうちだよ〜。ぼくらが一番材料を持ってるんだから。']], note: '費用は技術の選び方で大きく変わる。開発チームが材料を出す。' },
        ],
        hints: [
          '役員が気にしているのは「費用」。でも安くするだけで困ることはありませんか？',
          'チームはこのスプリントで、費用を下げる打ち手をいくつも用意しています。',
          '最後に優先順位を決めるのは誰と一緒でしょう？',
        ],
        why: '思いつきの方針に即答せず、打ち手ごとの効果（数字）と品質への影響をそろえて、POと一緒に判断してもらう。',
      },
      retro: [
        ['rio', '試算では、費用は当初の約3分の1。履歴を絞るだけで半分近く下がった。数字で話せると強い。'],
        ['daichi', 'モデルの指定、決めごとを見ずに書いちゃってた…。{player}、見つけてくれてありがとう！'],
        ['kumagai', 'お金の相談アプリが、お金を使いすぎてたら笑えないからねぇ（笑）。いい仕事だったよ〜。'],
      ],
    },
    {
      no: 21,
      title: '負荷試験: 同時アクセス',
      goal: '想定の2倍の同時アクセスでも、残高がずれず、待たされ続けないことを確かめる',
      knowledge: ['スレッドセーフ: 複数の処理が同時に同じものを触っても壊れないこと', 'check-then-act（確認してから実行）の間に割り込まれる問題', 'タイムアウト: 待つ時間に上限をつける'],
      briefing: [
        ['hikari', '今回のスクラムマスターはひかりだよ〜！ テーマは負荷試験！ 400人が同時に使ったらどうなるか、試してみよう🔥'],
        ['osamu', '知識を配る。Java のサーバーは1つのオブジェクトを複数のスレッドで同時に使う。HashMap や SimpleDateFormat は同時に触られる前提で作られていない。それと「残高を確かめてから引く」は、確かめた後、引く前に別のスレッドが割り込める。'],
        ['osamu', 'もう1つ。外のAPIを呼ぶときは必ず待つ時間の上限を決めろ。上限がないと、相手が詰まったときにこちらのスレッドが全部待ちっぱなしになる。'],
        ['rio', '同時実行のバグは、手元で1回試しただけではまず出ない。だから読んで見つけるのが大事なんだ。'],
      ],
      problems: [
        {
          id: 'S21-1', type: 'review', title: '理央のPR: 振替サービス（試作）', by: 'rio', lang: 'java', points: 5,
          story: '{rio}「負荷試験用の振替サービスの試作。このクラスは1つだけ作って、全リクエストで使い回すよ」 負荷試験で、残高がマイナスになる口座が見つかった。',
          file: 'core/TransferService.java',
          code: String.raw`public class TransferService {
    private static final SimpleDateFormat FMT = new SimpleDateFormat("yyyy-MM-dd HH:mm");
    private final Map<String, Long> balances = new HashMap<>();

    public String transfer(String from, String to, long amount) {
        long current = balances.getOrDefault(from, 0L);
        if (current < amount) {
            throw new IllegalStateException("残高不足");
        }
        balances.put(from, current - amount);
        balances.put(to, balances.getOrDefault(to, 0L) + amount);
        return FMT.format(new Date());
    }
}`,
          defects: [
            { line: 2, kind: 'bug', why: 'SimpleDateFormat はスレッドセーフではない。static で共有すると、同時に format したときに日時が壊れることがある。スレッドセーフな DateTimeFormatter を使う。' },
            { line: 3, kind: 'bug', why: '全リクエストで共有する HashMap は、同時に書き込むと中身が壊れたり更新が消えたりする。本番では DB のトランザクションで扱い、試作でも ConcurrentHashMap などにする。' },
            { line: 7, kind: 'bug', why: '残高を確かめて（6〜7行目）から引く（10行目）までの間に、別のスレッドが同じ口座から引ける（check-then-act）。2つとも確認を通ると残高がマイナスになる。確認と更新を1つのロックやトランザクションの中で行う。' },
          ],
          hints: [
            'このクラスは「1つだけ作って使い回す」。つまり、複数のスレッドが同時に同じフィールドを触ります。',
            '2行目と3行目のクラスは、同時に使っても安全なものでしょうか？',
            '残高がマイナスになった原因は「確かめる」と「引く」の間にあります。',
            '2つのスレッドが同時に6〜7行目を通ったら、どちらも「残高は足りる」と判断しませんか？',
            '2行目（SimpleDateFormat）・3行目（HashMap）・7行目（確認と更新が別々）がすべて bug です。',
          ],
          why: '共有されるオブジェクトのフィールドは、同時に触られても安全な型にする。確認してから更新する処理は、その2つを1つのロックやトランザクションにまとめないと、間に割り込まれて残高がずれる。',
        },
        {
          id: 'S21-2', type: 'predict', title: '修の小テスト: 2つのスレッドで数える', by: 'osamu', lang: 'java', points: 2,
          story: '{osamu}「さっきのバグの小さい版だ。何が表示される？」',
          code: String.raw`class Counter {
    private int count = 0;
    void inc() { count++; }
    int get() { return count; }
}

Counter c = new Counter();
// 2つのスレッドが、それぞれ c.inc() を 10000 回呼ぶ
// 両方のスレッドの終了を join で待ってから表示する
System.out.println(c.get());`,
          q: '表示されるのは？',
          choices: ['必ず 20000', '必ず 10000', '20000 以下のどれか（実行するたびに変わりうる）', '必ず 0'],
          answer: 2,
          hints: [
            'count++ は1つの操作に見えますが、「読む → 1足す → 書く」の3段階です。',
            '2つのスレッドが同時に同じ値を読んだら、書き戻した結果はどうなりますか？',
            '更新が「消える」ことがあるなら、合計は 20000 より…？',
          ],
          why: 'count++ は読む・足す・書くの3段階なので、同時に読んだ更新が上書きされて消えることがある。結果は 20000 以下で実行ごとに変わりうる。AtomicInteger や synchronized で守る。',
        },
        {
          id: 'S21-3', type: 'fix', title: '自分のコード: 勘定系APIの呼び出し', by: 'player', lang: 'java', points: 3,
          story: '{player}が書いた残高取得の処理。負荷試験で勘定系APIが詰まったとき、こちらのサーバーのスレッドが全部「待ち」のまま止まった。',
          file: 'core/BalanceClient.java',
          code: String.raw`public BalanceResponse fetchBalance(String accountId) throws Exception {
    HttpClient client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(2))
        .build();
    HttpRequest req = HttpRequest.newBuilder()
        .uri(URI.create(CORE_API + "/accounts/" + accountId + "/balance"))
        .GET()
        .build();
    HttpResponse<String> res = client.send(req, HttpResponse.BodyHandlers.ofString());
    return BalanceResponse.parse(res.body());
}`,
          bugLine: 7,
          fixes: [
            '.timeout(Duration.ofSeconds(3)).GET()',
            '.GET().header("Connection", "keep-alive")',
            '.GET() // 遅いときは利用者に再読み込みしてもらう',
            '.POST(HttpRequest.BodyPublishers.noBody())',
          ],
          answer: 0,
          hints: [
            '3行目の connectTimeout は「つながるまで」の上限です。つながった後、返事が来ないときは？',
            'リクエストごとに「返事を待つ上限」を決める設定があります。',
            'HttpRequest.Builder には、待つ時間を決めるメソッドがあります。',
            '答えは、リクエストに .timeout(...) を付ける直し方です。',
          ],
          why: 'connectTimeout は接続までの上限で、接続後に返事が来ない場合は守ってくれない。リクエストに timeout を付ければ、勘定系が詰まっても3秒で諦めてエラーを返し、スレッドを解放できる。',
        },
      ],
      event: {
        id: 'S21-E', type: 'talk', title: '桐生さんの質問', by: 'kiryu', from: 'kiryu', lang: 'text', points: 1,
        text: '{kiryu}「負荷試験やったんだ！ 何人同時で試したの？ それと、想定を超えたらどうなる？ いきなり落ちる？」',
        options: [
          { text: '「たくさんで試したので大丈夫です」', best: false, reply: [['kiryu', '「たくさん」じゃ判断できないなぁ。数字で教えて？']], note: '性能の話は数字で答える。' },
          { text: '「想定ピーク200人の2倍、400人同時で試して、応答の95%が1.2秒以内でした。それを超えたら『混み合っています』と表示して、少し待ってから再試行してもらいます」', best: true, reply: [['kiryu', 'いいね。落ちる前に、ちゃんと断れる設計なのが大事なんだよ。']], note: '試した条件・結果・上限を超えたときのふるまいを、具体的に答えている。' },
          { text: '「上限を超えることはないと思います」', best: false, reply: [['osamu', 'キャンペーンの日に超える。超えたときの動きを決めておくんだ。']], note: '想定外は起きる前提で、超えたときのふるまいを決めておく。' },
        ],
        hints: [
          '質問は2つ。「何人で試したか」と「超えたらどうなるか」。',
          '「たくさん」「大丈夫」は、聞いた人が判断に使えるでしょうか？',
          '想定を超えたときに、落ちずにできることは何でしょう？',
        ],
        why: '試験の条件と結果を数字で伝え、上限を超えたときは落ちるのではなく「断って待ってもらう」ふるまいを用意しておく。',
      },
      retro: [
        ['hikari', 'よかったこと: 400人同時でも残高が1円もずれなかった🎉 次に試すこと: 外を呼ぶコードには必ずタイムアウトがあるか見る！'],
        ['rio', '同時実行のバグを、動かす前に読んで3つ見つけられたのは大きい。{player}の「この間に割り込まれたら？」って質問が効いた。'],
        ['hosoya', '負荷試験の報告書、読みました。数字があるのは良いことです。'],
      ],
    },
    {
      no: 22,
      title: 'リリース準備: 機能フラグと切り戻し',
      goal: '本番に出したあとで、少しずつ公開範囲を広げ、問題があればすぐ戻せるようにする',
      knowledge: ['機能フラグ: コードを出しても、機能はフラグで ON/OFF できる', '段階公開（10% → 50% → 100%）', '切り戻し（ロールバック）の手順を、出す前に決めておく'],
      briefing: [
        ['osamu', '今回のスクラムマスターは真壁だ。テーマはリリース準備。出す前に、戻し方を決める。'],
        ['osamu', '知識を配る。機能フラグを使えば、コードは本番にあっても機能は OFF にしておける。本番は OFF で出して、10%、50%、100% と広げる。何かあればフラグを OFF にすれば止まる。それでも駄目なら1つ前の版に戻す。この2段構えが基本だ。'],
        ['madoka', 'release/1.0 ブランチを切ったよ。ここからは、リリースに必要な変更だけを入れていくね。'],
        ['amano', '出すのはゴールじゃなくてスタート！ 安心して出せる準備をしよう！'],
      ],
      problems: [
        {
          id: 'S22-1', type: 'conflict', title: 'release/1.0 へのマージでコンフリクト', by: 'rio', lang: 'js', points: 3,
          story: '{rio}の feature/budget-guard を release/1.0 に取り込もうとしたら、フラグの設定ファイルでぶつかった。',
          file: 'src/config/flags.js',
          context: 'release/1.0（HEAD）側では、{osamu}がリリース計画に合わせて「本番では aiChat を OFF で出す」ように変え、段階公開の割合 aiChatPercent（最初は 0）を足した。feature/budget-guard 側では、{rio}が前のスプリントの費用対策として tokenBudgetGuard フラグを足した。このブランチは release を切る前に分かれたので、aiChat は古い「常に true」のままになっている。',
          conflict: String.raw`const env = process.env.APP_ENV;

export const FLAGS = {
<<<<<<< HEAD
  aiChat: env !== 'production', // 本番は OFF で出し、段階公開で広げる
  aiChatPercent: 0,
=======
  aiChat: true,
  tokenBudgetGuard: true,
>>>>>>> feature/budget-guard
};`,
          options: [
            String.raw`const env = process.env.APP_ENV;

export const FLAGS = {
  aiChat: env !== 'production', // 本番は OFF で出し、段階公開で広げる
  aiChatPercent: 0,
  tokenBudgetGuard: true,
};`,
            String.raw`const env = process.env.APP_ENV;

export const FLAGS = {
  aiChat: true,
  tokenBudgetGuard: true,
};`,
            String.raw`const env = process.env.APP_ENV;

export const FLAGS = {
  aiChat: env !== 'production', // 本番は OFF で出し、段階公開で広げる
  aiChatPercent: 0,
};`,
            String.raw`const env = process.env.APP_ENV;

export const FLAGS = {
  aiChat: true,
  aiChatPercent: 0,
  tokenBudgetGuard: true,
};`,
          ],
          answer: 0,
          hints: [
            'それぞれの側が「何をしたくて」変えたのかを、context で確かめましょう。',
            'HEAD 側の意図は「本番は OFF で出す」。feature 側の意図は「費用を守るフラグを足す」。',
            'feature 側の aiChat: true は、意図して変えたものでしょうか？ それとも古いままなだけ？',
            '両方の意図を残すと、aiChat は HEAD の書き方、tokenBudgetGuard は feature から取り込みます。',
          ],
          why: 'コンフリクトは「どちらを取るか」ではなく「両方の意図を残す」のが基本。aiChat の本番 OFF と段階公開の割合は release 側の意図、tokenBudgetGuard は feature 側の意図なので、両方を残す。feature 側の aiChat: true は古いだけなので取らない。',
        },
        {
          id: 'S22-2', type: 'review', title: 'まどかのPR: 本番のデプロイ設定', by: 'madoka', lang: 'js', points: 3,
          story: '{madoka}「本番のデプロイ設定を書いたよ。リリース計画（本番は OFF で出して段階公開・問題があれば1つ前の版に戻せること）と見比べてほしいな」',
          file: 'deploy/production.config.js',
          code: String.raw`module.exports = {
  release: '1.0.0',
  flags: {
    aiChat: { default: true },
    aiChatPercent: 10,
  },
  rollback: {
    enabled: false,
    previousRelease: '0.9.3',
  },
  ai: {
    apiKey: 'sk-live-REPLACE-ME-0000',
    timeoutMs: 3000,
  },
};`,
          defects: [
            { line: 4, kind: 'spec', why: '計画では本番は OFF で出す。default: true だと、出した瞬間に全員に公開されてしまい、段階公開の意味がなくなる。' },
            { line: 8, kind: 'spec', why: '計画では「問題があれば1つ前の版に戻せる」こと。切り戻しが無効になっている。' },
            { line: 12, kind: 'security', why: 'API キーを設定ファイルに直接書いている。リポジトリに残り、多くの人に見えてしまう。シークレット管理（環境変数など）から読む。' },
          ],
          hints: [
            'story のリリース計画を2つに分けて、それぞれに当たる設定を探しましょう。',
            '「本番は OFF で出す」に当たるのはどの行？ 値は合っていますか？',
            '「1つ前の版に戻せる」に当たる設定は、有効になっていますか？',
            '計画とは別に、設定ファイルに書いてはいけないものが混ざっていませんか？',
            '4行目と8行目は spec、12行目は security です。',
          ],
          why: '設定は計画と1行ずつ見比べる。本番 OFF・切り戻し有効を計画どおりにし、API キーはシークレットとして外から渡す。',
        },
      ],
      event: {
        id: 'S22-E', type: 'talk', title: '法務部からの連絡', by: 'legal', from: 'legal', lang: 'text', points: 1,
        text: '{legal}「リリース直前にすみません。AIの返答の下に『この回答は一般的な情報で、投資助言ではありません』という注意書きを必ず表示してください。法令上の要件です」',
        options: [
          { text: '「リリース後のアップデートで対応します」', best: false, reply: [['legal', '要件を満たさないまま公開することはできません。']], note: '法令上の要件は「あとで」にできない。' },
          { text: '「承知しました。文言を確定版でいただけますか。天野さんと相談してリリースに含め、表示を確認するテストとレビューを通して入れます」', best: true, reply: [['legal', '確定した文言を、今日中にお送りします。'], ['amano', '必須の要件だね。release/1.0 に入れよう！ 小さな変更でもレビューは通してね！']], note: '要件として受け止め、文言を確定してもらい、POと相談してリリースに含める。急ぎでもテストとレビューは省かない。' },
          { text: '「AIのシステムプロンプトに『投資助言はしない』と書けば足りると思います」', best: false, reply: [['kiryu', 'それはAIへのお願いで、利用者への表示じゃないよね。']], note: '求められているのは利用者に見える表示。AIへの指示とは別物。' },
        ],
        hints: [
          '「法令上の要件」は、リリースに含めないという選択ができるものでしょうか？',
          '急いで入れるとしても、省いてはいけない手順はありますか？',
          '求められているのは「利用者に見える表示」です。',
        ],
        why: '法令上の要件は必須として受け止め、文言を確定してもらい、POと相談してリリースに含める。急ぎの変更でもテストとレビューは通す。',
      },
      retro: [
        ['osamu', 'よかったこと: 切り戻しの手順を書いて、リハーサルまでやった。フラグ OFF で2分、版の切り戻しで8分。'],
        ['madoka', '設定の見落とし、{player}が計画と1行ずつ見比べてくれて助かった。次に試すこと: 設定ファイルにもチェックリストを作る。'],
        ['shiraishi', '「出す準備」と同じくらい「戻す準備」が大事。今回それをチームで体験できたね。'],
      ],
    },
    {
      no: 23,
      title: 'リリース前夜: 最終レビュー',
      goal: 'リリース前の最終レビューと、ユーザー代表の受け入れテストを終える',
      knowledge: ['最終レビューは「新しい指摘」より「約束したことが守られているか」を見る', 'ログに個人情報を出さない', '受け入れテストで見つかった問題は、重さと影響でリリース可否を判断する'],
      briefing: [
        ['daichi', '2回目のスクラムマスター、小森です！ いよいよリリース前夜…！ 今回は前より落ち着いてやれる気がします！'],
        ['kumagai', 'ここまで来たねぇ。前夜はみんな焦るから、深呼吸してね〜。焦ってるときほど、レビューを飛ばしたくなるんだ。そこだけは飛ばさないよ。'],
        ['shiraishi', '知識を配るね。最終レビューでは、新しい改善案を探すより、これまでに約束したこと（連打で二重送信しない・500文字まで・ログに個人情報を出さない）が守られているかを確かめよう。'],
        ['hosoya', '明日の朝までに、受け入れテストを30項目すべて実施します。'],
      ],
      problems: [
        {
          id: 'S23-1', type: 'review', title: '大地くんのPR: 送信ボックスの最終版', by: 'daichi', lang: 'react', points: 3,
          story: '{daichi}「送信中の状態を足しました！ スプリント1で細谷さんに言われた連打の件、これで直ってるはず…！」 仕様: メッセージは500文字まで。',
          file: 'src/SendBox.jsx',
          code: String.raw`import { useState } from 'react';

export function SendBox({ onSend }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    await onSend(text);
    setSending(false);
    setText('');
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSend(); }}>
      <input value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} />
      <button type="submit">送信</button>
    </form>
  );
}`,
          defects: [
            { line: 9, kind: 'bug', why: 'onSend が失敗（例外）すると10行目に進まず、sending が true のまま戻らない。try { … } finally { setSending(false); } にする。' },
            { line: 16, kind: 'spec', why: '仕様は500文字まで。maxLength が 5000 になっている。' },
            { line: 17, kind: 'bug', why: 'sending を作ったのに、ボタンを disabled={sending} にしていない。送信中も押せるので、連打で二重に送られる。' },
          ],
          hints: [
            'sending という state は、どこで「使われて」いますか？ 作っただけになっていませんか？',
            '連打を防ぐには、送信中のボタンをどうすればよいでしょう？',
            'onSend が失敗したら、10行目の setSending(false) は実行されますか？',
            '仕様の数字と、コードの中の数字を見比べましょう。',
            '9行目（失敗時に戻らない）と17行目（disabled なし）が bug、16行目が spec です。',
          ],
          why: '送信中フラグは、ボタンの disabled に使って初めて連打を防げる。失敗しても必ず戻すよう finally で setSending(false) し、文字数は仕様の500に合わせる。',
        },
        {
          id: 'S23-2', type: 'comment', title: '理央のPR: チャットのログ', by: 'rio', lang: 'python', points: 3,
          story: '{rio}「障害のときに追えるよう、ログを足したよ」 最終レビューのチェックリストには「ログに個人情報を出さない」がある。',
          file: 'ai/handler.py',
          code: String.raw`import logging

log = logging.getLogger(__name__)

def handle_chat(user, text):
    log.info("chat user=%s account=%s text=%s", user.name, user.account_no, text)
    answer = ask_ai(mask_pii(text))
    log.info("answered in %d chars", len(answer))
    return answer`,
          focus: [6],
          prompt: '6行目について、レビューコメントを書いてください（何が問題か・なぜ・どう直すか）。',
          checks: [
            { label: '氏名・口座番号・本文などの個人情報をログに出していることに触れている', any: ['個人情報', '口座', '氏名', '名前', 'pii', 'account'] },
            { label: '理由（ログは多くの人に見られる・長く残る・漏れる経路になる）を書いている', any: ['見られ', '閲覧', '保存', '残る', '漏え', '漏れ', 'セキュリティ'] },
            { label: '直し方（マスクする・内部の ID だけにする）を示している', any: ['マスク', 'mask', 'user.id', 'ID', '伏せ', '出さない'] },
          ],
          min: 2,
          sample: '6行目、氏名と口座番号、相談の本文をそのままログに出しています。ログは運用の多くの人に見られ、長く保存されるので、個人情報が漏れる経路になります。7行目と同じように mask_pii(text) を通すか、user.id のような内部の ID だけを出しませんか？ 8行目の文字数だけのログは、中身を出さずに状況が分かって良いと思います。',
          hints: [
            '6行目でログに出している3つの値は、それぞれ何でしょう？',
            '7行目では AI に送る前に何をしていますか？ 6行目はどうでしょう？',
            'ログは誰が、どのくらいの期間見られるものでしょう？',
            '直し方は「マスクする」か「内部の ID だけを出す」。8行目は良い例として触れてもよいです。',
          ],
          why: 'ログは多くの人が長く見られる場所なので、氏名・口座番号・相談本文は出さない。追跡に必要なら内部の ID だけを出し、本文はマスクする。良い例（8行目）にも触れると伝わりやすい。',
        },
      ],
      event: {
        id: 'S23-E', type: 'talk', title: '細谷さんの受け入れテスト', by: 'hosoya', from: 'hosoya', lang: 'text', points: 2,
        text: '{hosoya}「受け入れテストの結果です。30項目中29項目は合格。1つだけ、送信ボタンを10回連打したら、3回目以降に『エラーが発生しました』と出ました。リリースは明日ですよね？」',
        options: [
          { text: '「10回も連打する人はいないと思います」', best: false, reply: [['hosoya', 'スプリント1でも同じことを言われました。います。私です。']], note: 'スプリント1と同じ。利用者の操作は事実として受け止める。' },
          { text: '「ありがとうございます。今ここで一緒に再現させてください。原因と直す時間を見積もって、リリースに含めるかを今日中に天野さんと決めます」', best: true, reply: [['hosoya', '……では、手順をもう一度やります。見ていてください。'], ['daichi', 'あっ、今日直したボタンの disabled が、まだ release/1.0 に入ってないかも！'], ['amano', '原因が分かって、修正が小さいなら入れよう。レビューとテストは必ず通してね！']], note: 'まず事実を一緒に確かめ、原因と影響を見積もってから、POとリリース可否を決める。' },
          { text: '「明日のリリースは延期します」とその場で決める', best: false, reply: [['madoka', '原因も分からないうちに決めるのは早いよ。まず再現して、天野さんと判断しよう。']], note: '延期するかどうかも、原因と影響が分かってからPOと決める。' },
          { text: '黙って直して、そのままリリースに入れる', best: false, reply: [['osamu', 'レビューを通さない前夜の修正が、一番事故る。']], note: '急ぎの修正ほど、見える形でレビューとテストを通す。' },
        ],
        hints: [
          'スプリント1の、細谷さんとの最初のやりとりを思い出しましょう。',
          'まず確かめるべきなのは「本当に起きるか」と「なぜ起きるか」です。',
          'リリースに含めるか・延期するかは、誰と、何が分かってから決めるのがよいでしょう？',
        ],
        why: '受け入れテストの報告は事実として受け止め、その場で再現して原因と影響を見積もる。リリース可否はPOと決め、急ぎの修正でもレビューとテストは通す。',
      },
      retro: [
        ['daichi', '原因は、ボタンの修正が release/1.0 に取り込まれていなかったことでした…。チェックリストに「release ブランチに入っているか」を足します！'],
        ['hosoya', '修正版で、もう一度30項目を実施しました。すべて合格です。……連打しても、1回だけ送られました。'],
        ['kumagai', '前夜にちゃんと止まれるチーム、いいねぇ。明日は胸を張って出そう〜。'],
      ],
    },
    {
      no: 24,
      title: 'リリース！ そして振り返り',
      goal: '「AIお金相談チャット」をリリースし、最初の小さな問題を落ち着いて直し、24スプリントを振り返る',
      knowledge: ['ホットフィックス: 本番の問題を小さく速く直す。それでもレビューとテストは通す', '人を責めない振り返り（ブレームレス）: 「誰が」ではなく「なぜ起きたか・どう防ぐか」', '再発を防ぐテストを足す'],
      briefing: [
        ['hikari', '今回のスクラムマスターは{player}！ 最初と最後を任されるなんて、すごいよ〜🎉'],
        ['amano', 'みんな、おはよう！ 今日はリリース日！ 10%のお客さまから公開するよ。ここまで本当にありがとう！'],
        ['osamu', '出したら終わりじゃない。最初の1時間はダッシュボードを見ていよう。'],
        ['shiraishi', '最後に配る知識はこれ。本番で問題が出たら、小さく直して、それでもレビューとテストは通す。振り返りでは「誰がやったか」ではなく「なぜ起きて、どう防ぐか」を話そうね。'],
      ],
      problems: [
        {
          id: 'S24-1', type: 'review', title: '大地くんのホットフィックス', by: 'daichi', lang: 'java', points: 2,
          story: '公開から30分。「支出がマイナスのとき、金額が『円-500』と表示される」という報告が1件。{daichi}がすぐにホットフィックスを出してくれた。{osamu}「落ち着いて、いつもどおり見よう」',
          file: 'core/YenFormatter.java',
          code: String.raw`public String formatYen(long amount) {
    // hotfix: マイナスの金額が「円-500」と表示されていた問題を直す
    NumberFormat nf = NumberFormat.getIntegerInstance(Locale.JAPAN);
    if (amount < 0) {
        return "-" + nf.format(amount) + "円";
    }
    return nf.format(amount) + "円";
}`,
          defects: [
            { line: 5, kind: 'bug', why: 'nf.format(-500) はすでに「-500」を返すので、前に "-" を足すと「--500円」になる。マイナスの場合分けはいらず、7行目だけで「-500円」になる。' },
          ],
          hints: [
            'amount が -500 のとき、5行目は何を返すでしょう？',
            'nf.format(-500) の結果には、すでにマイナス記号が付いていますか？',
            '7行目だけで、マイナスの金額はどう表示されるでしょう？',
            '5行目で「-」が2つになります。kind は bug です。',
          ],
          why: 'NumberFormat はマイナス記号も付けてくれるので、自分で "-" を足すと二重になる。if を消して7行目だけにすればよい。急ぎの修正ほど、境界の値で1回追ってみる。',
        },
        {
          id: 'S24-2', type: 'comment', title: 'ホットフィックスを承認するコメント', by: 'daichi', lang: 'java', points: 2,
          story: '{daichi}「直しました！ if を消して、テストも足しました！」 承認しつつ、同じ問題が戻ってこないための一言を添えたい。',
          file: 'core/YenFormatter.java',
          code: String.raw`public String formatYen(long amount) {
    NumberFormat nf = NumberFormat.getIntegerInstance(Locale.JAPAN);
    return nf.format(amount) + "円";
}

@Test
void formatsYen() {
    assertEquals("1,000円", formatYen(1000));
}`,
          focus: [7, 8],
          prompt: '承認のコメントを書いてください（良いところと、再発を防ぐテストの提案）。',
          checks: [
            { label: '今回の原因だったマイナスの金額のテストを提案している', any: ['マイナス', '負', '-500', 'negative'] },
            { label: '0円や大きな桁など、ほかの境界のテストにも触れている', any: ['0円', 'ゼロ', '境界', '大きな', '桁'] },
            { label: '感謝や良いところを伝えている', any: ['ありがとう', '助か', '良い', 'シンプル', 'おつかれ', 'お疲れ'] },
          ],
          min: 2,
          sample: '直してくれてありがとう、シンプルで読みやすくなりました。今回の原因だったマイナスの金額のテスト（formatYen(-500) が "-500円" になること）と、0円や大きな桁（1,000,000円）のテストも足しませんか？ 同じ不具合が戻ってきたときに、すぐ気づけます。',
          hints: [
            '8行目のテストは、どんな金額を確かめていますか？',
            '今回の不具合は、どんな金額で起きましたか？',
            'ほかに「境界」になりそうな金額は？（0円、桁が増えるところ）',
            '急いで直してくれた人への一言も、忘れずに。',
          ],
          why: 'ホットフィックスには、その不具合を再現するテストを必ず添える。境界（マイナス・0・大きな桁）を足しておけば、同じ問題が戻ってきてもすぐ気づける。急いで直した人への感謝も伝える。',
        },
      ],
      event: {
        id: 'S24-E', type: 'talk', title: '熊谷さんとの1on1', by: 'kumagai', from: 'kumagai', lang: 'text', points: 1,
        text: '{kumagai}「{player}、ちょっといいかな。リリースおめでとう。24スプリントやってみて、どうだった？」',
        options: [
          { text: '「最初はコードが全然書けなくて不安でした。でも読んでレビューするうちに、どこが危ないか分かるようになりました。チームのみんなに助けられたおかげです。次は、自分で書いたコードでもレビューで指摘を減らすのが目標です」', best: true, reply: [['kumagai', 'うん、うん。それが言えるなら、もう大丈夫だなぁ。読めるようになった人は、ちゃんと書けるようになるからね。'], ['kumagai', '……次のハッカソンでは、新人のレビューを{player}にお願いしようかな（笑）。']], note: '不安だったことも、伸びたことも、支えてくれた人も、次の目標も、自分の言葉で話せている。' },
          { text: '「ほとんど自分の力でやれたと思います」', best: false, reply: [['kumagai', 'ははは、頼もしいねぇ。でも、{hosoya}さんの連打がなかったら、どうなってたかな？']], note: 'チームや関係者に支えられたことにも目を向けたい。' },
          { text: '「まだ何もできるようになっていません…」', best: false, reply: [['kumagai', 'そんなことないよ〜。スプリント1の自分のレビューと、今日のレビュー、読み比べてごらん。']], note: '謙遜しすぎず、できるようになったことを認めるのも振り返りの大事な一部。' },
        ],
        hints: [
          '振り返りでは「よかったこと」と「次に試すこと」を話してきました。',
          '自分の成長を、謙遜しすぎず、言いすぎず、言葉にしてみましょう。',
          'ここまで支えてくれた人たちのことも思い出してみて。',
        ],
        why: '振り返りは、できるようになったこと・支えてもらったこと・次の目標を自分の言葉にする時間。謙遜しすぎも言いすぎもせず、正直に話す。',
      },
      retro: [
        ['player', 'みんな、24スプリント本当にありがとう。最初は1行も書けなかったけど、今はコードを読んで「ここが危ない」って言えるようになりました。'],
        ['madoka', 'こちらこそ。{player}のレビューは、いつも理由が書いてあって、チームの段取りが楽になったよ。'],
        ['hikari', 'みんなでリリースできて最高〜！！ {player}、最初の日の「何も分からない」って顔、今でも覚えてるよ😊 ほんとに頼もしくなった！'],
        ['rio', '理屈で考えるだけじゃなく、相手に伝わる言葉で指摘することを、{player}から学んだ。ありがとう。'],
        ['daichi', '僕のPRを何十本もレビューしてくれてありがとう！ {player}がいたから、未経験でも最後まで来れた！'],
        ['osamu', 'いいチームだった。本番は、これからも続く。一緒に守っていこう。'],
        ['amano', 'お客さまからの最初の感想、「気軽に聞けてうれしい」だって！ みんなのおかげだよ、本当にありがとう！'],
        ['shiraishi', '{player}さん、最初は「書けない」って悩んでたよね。でも今は、読んで、理由をつけてレビューして、チームを止めるべきときに止められる。それはもう立派なエンジニアの仕事だよ。おめでとう。'],
        ['kumagai', '書けなかった人が、読めるようになって、レビューできるようになった。これ以上うれしいことはないなぁ。……さ、今日は打ち上げだよ〜。次のスプリントは、また来週からね（笑）。'],
      ],
    },
  ]);
})(globalThis);
