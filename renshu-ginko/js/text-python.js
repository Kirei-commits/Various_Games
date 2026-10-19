/*
 * 言語テキスト: Python（先生役は九条 学）。形は js/texts.js の先頭の説明を参照。コードは String.raw で書く。
 * 話し言葉・ヒント・解説の中では波かっこで単語を囲まない（登場人物の名前として置き換わるため）。
 */
(function (g) {
  'use strict';
  const T = g.RGA.texts;

  T.addCourse({
    id: 'python',
    name: 'Python',
    icon: '🐍',
    teacher: 'kujo',
    intro: 'AIお金相談チャットの AI サービスは Python で書かれている。インデント・辞書・関数・クラス・例外・デコレータ・async……読めるようになれば、サーバー側のレビューも怖くない。先生はデータサイエンス部の九条。説明は数式寄りだけど、一生懸命かみ砕いてくれる（社員証はたまに忘れる）。',
    chapters: [
      // ---------------------------------------------------------------- 1
      {
        id: 'python-1',
        title: '基本とインデント',
        badge: { icon: '📏', name: 'インデントの番人' },
        handout: {
          units: ['ハッカソン スプリント2「サーバーの入り口を作る」', 'ハッカソン スプリント4「送る前に守る: マスキング」'],
          knowledge: ['変数に値を入れる・if 文で分ける', '文字列と数の違い（院の授業レベルで十分）'],
          talk: [
            ['kujo', '{player}、Python の章を始めよう。AI サービスのコードは全部 Python だから、まずは「ブロックの見え方」と「値の種類」から。'],
            ['kujo', '必要なのは、if で分ける考え方と、文字列と数の違いだけ。……あ、資料は印刷したんだけど、どこに置いたか忘れた。画面で見て。'],
          ],
        },
        sections: [
          {
            id: 'python-1-1',
            title: 'インデントがブロックになる',
            talk: [
              ['kujo', 'Python には、ブロックを囲む波かっこが無い。代わりに「行頭の空白（インデント）」がそのままブロックになるんだ。'],
              ['kujo', 'if の行の末尾にコロン、次の行から1段（ふつうは空白4つ）下げた行が if の中。段を戻したら if の外。'],
              ['player', 'つまり、見た目のずれがそのまま意味のずれになるのか。'],
              ['kujo', 'そう。俺の靴下は左右そろってなくても歩けるけど、インデントはそろってないと動かないか、もっと悪いと「動くけど意味が変わる」。'],
            ],
            figure: {
              title: 'インデントとブロック',
              text: String.raw`if amount >= 100000:      ← コロンで開始
    label = "高額"        ┐ if の中
    print("要確認")        ┘ （4つ下げ）
print(label)              ← 段が戻った
                             = if の外`,
            },
            code: {
              lang: 'python',
              text: String.raw`for msg in history:
    if msg["role"] == "user":
        count += 1      # for の中、かつ if の中
    last = msg          # for の中（if の外）
print(count)            # for の外。1回だけ動く`,
            },
            points: ['インデント（行頭の空白）がブロックを表す。行末のコロンが「ここからブロック」の合図', '段が1つ戻ったところでブロックが終わる。読むときは「縦の線」をなぞる'],
            quiz: [
              {
                id: 'python-1-1-q1', type: 'predict', title: '高額のときだけ', lang: 'python',
                code: String.raw`def reply_label(amount):
    label = "通常"
    if amount >= 100000:
        label = "高額"
        print("確認が必要です")
    print(label)

reply_label(5000)`,
                q: '表示されるのは？',
                choices: ['「通常」だけ', '「確認が必要です」と「通常」', '「高額」だけ', '何も表示されない'],
                answer: 0,
                hints: [
                  '5000 は 100000 以上ですか？',
                  '4〜5行目は、どのブロックの中にありますか？（インデントの深さを見ます）',
                  '6行目の print は if と同じ深さです。if の結果に関係なく動きます。',
                ],
                why: '5000 >= 100000 は False なので、if の中（4〜5行目）は飛ばされる。6行目は if と同じ深さ＝if の外なので必ず動き、label の初期値「通常」が表示される。',
              },
              {
                id: 'python-1-1-q2', type: 'fix', title: '合計が1件目だけ', lang: 'python',
                story: '九条くんが書いた集計。「履歴の合計を出したいのに、いつも1件目の金額しか返ってこない……数式は合ってるはずなんだけど」',
                code: String.raw`def total_spent(history):
    total = 0
    for item in history:
        total += item["amount"]
        return total`,
                bugLine: 5,
                fixes: [
                  'return total  # 1段戻して、for と同じ深さに置く',
                  'return total  # 深さはそのまま、上に break を足す',
                  'total = 0  # ループの中で毎回 0 に戻す',
                  'return item["amount"]  # 最後の1件を返す',
                ],
                answer: 0,
                hints: [
                  '合計を返すのは、ループが「全部」終わってからのはずです。',
                  '5行目の return は、どのブロックの中にありますか？',
                  'for の中の return は、1周目でいきなり関数を終わらせます。',
                  'インデントを1段戻すと、return は for の外（関数の直下）になります。',
                ],
                why: '5行目の return が for の中にあるので、1周目で関数が終わる。1段戻して for と同じ深さにすれば、全件を足し終えてから返す。インデントの深さがそのまま意味になる、Python らしいバグ。',
              },
            ],
          },
          {
            id: 'python-1-2',
            title: '変数と型、動的型付け、f文字列',
            talk: [
              ['kujo', 'Python は型を書かなくても動く。値のほうが型を持っていて、変数はただの「名札」なんだ。これを動的型付けという。'],
              ['player', '同じ変数に、さっきまで数、次は文字列……ってこともできるわけか。'],
              ['kujo', 'うん。だから "1000" と 1000 の取り違えが起きやすい。入力は文字列で来ることが多いから、AI サービスでもよく見るよ。俺も昨日、自分の社員番号を数で持って先頭の 0 を消した……。'],
              ['kujo', 'それと、文字列の前に f を付けたのが f文字列。中の波かっこに書いた式が、計算されてから埋め込まれる。'],
            ],
            figure: {
              title: '変数は名札、型は値が持つ',
              text: String.raw` balance ──→ ┌────────┐
             │ "1000" │ str（文字列）
             └────────┘
 bonus ────→ ┌────────┐
             │  500   │ int（整数）
             └────────┘
 "1000" * 2   → "10001000"（くり返し）
 "1000" + 500 → TypeError
 int("1000") + 500 → 1500`,
            },
            code: {
              lang: 'python',
              text: String.raw`name = "Aさん"
balance = 1500
print(f"{name}の残高は{balance}円です")
# → Aさんの残高は1500円です
print(type(balance), type(name))
# → <class 'int'> <class 'str'>`,
            },
            points: ['変数は名札。型は値が持つ（動的型付け）。"1000" と 1000 は別物', 'f"...{式}..." の f文字列は、波かっこの中の式を計算して埋め込む'],
            quiz: [
              {
                id: 'python-1-2-q1', type: 'predict', title: '2倍にしたつもり', lang: 'python',
                code: String.raw`balance = "1000"
print(balance * 2)`,
                q: '表示されるのは？',
                choices: ['2000', '10001000', 'TypeError になる', '1000 1000'],
                answer: 1,
                hints: [
                  'balance に入っているのは数ですか、文字列ですか？（引用符を見ます）',
                  '文字列に * で整数を掛けると、Python では「くり返し」になります。',
                  '"ab" * 3 は "ababab" です。',
                ],
                why: '"1000" は文字列なので、* 2 は「2回くり返す」意味になり 10001000 が表示される。エラーにならないぶん、気づきにくい。数として扱いたいなら int(balance) * 2。',
              },
              {
                id: 'python-1-2-q2', type: 'predict', title: 'f文字列の中の足し算', lang: 'python',
                code: String.raw`balance = "1000"
bonus = 500
print(f"合計: {balance + str(bonus)}円")`,
                q: '表示されるのは？',
                choices: ['合計: 1500円', '合計: 1000500円', 'TypeError になる', '合計: {balance + str(bonus)}円'],
                answer: 1,
                hints: [
                  '先頭に f があるので、波かっこの中は式として計算されます。',
                  'str(bonus) は、500 を文字列 "500" に変えます。',
                  '文字列どうしの + は、足し算ではなく「つなげる」です。',
                ],
                why: 'f文字列なので波かっこの中が計算される。balance は "1000"、str(bonus) は "500"。文字列どうしの + は連結なので "1000500"。合計したいなら int(balance) + bonus と書く。',
              },
            ],
          },
          {
            id: 'python-1-3',
            title: 'True / False / None と、is と ==',
            talk: [
              ['kujo', '「値がない」は None。if の条件では、None・0・空の文字列・空のリストは全部「偽」として扱われる。'],
              ['player', 'じゃあ if not amount: だと、0円も「未入力」扱いになるのか。'],
              ['kujo', 'さすが。手数料0円みたいに 0 が意味を持つときは、if amount is None: と書き分ける。'],
              ['kujo', 'もう1つ。== は「中身が同じか」、is は「同じ1個の実物か」。None との比較は is を使うのがお作法。……同じ型番の社員証が2枚あっても == だけど is じゃない。俺の場合は2枚とも家にあるけど。'],
            ],
            figure: {
              title: 'if で「偽」になるもの',
              text: String.raw` 偽（False 扱い）   真（True 扱い）
 ─────────────────  ─────────────────
 False              True
 None               "0"（文字が1つある）
 0 / 0.0            1, -5, 0.01
 ""（空文字）        "こんにちは"
 [] / {}（空）       [0]（要素が1つ）

 a == b → 中身が同じ？
 a is b → 同じ1個の実物？`,
            },
            points: ['None・0・空文字・空のリストや辞書は、if では偽', '0 が意味を持つ値は if x is None: で「無い」を判定する', '== は中身の比較、is は同じ実物かの比較。None には is を使う'],
            quiz: [
              {
                id: 'python-1-3-q1', type: 'predict', title: '同じリスト？', lang: 'python',
                code: String.raw`a = ["残高", "明細"]
b = ["残高", "明細"]
c = a
print(a == b, a is b, a is c)`,
                q: '表示されるのは？',
                choices: ['True False True', 'True True True', 'False False True', 'True False False'],
                answer: 0,
                hints: [
                  'a と b は、中身は同じですが別々に作られたリストです。',
                  '== は中身、is は「同じ1個の実物か」を比べます。',
                  'c = a は新しいリストを作りません。同じ実物に名札をもう1枚貼るだけです。',
                ],
                why: 'a と b は中身が同じなので a == b は True、でも別々に作った実物なので a is b は False。c = a は同じ実物を指すので a is c は True。',
              },
              {
                id: 'python-1-3-q2', type: 'fix', title: '手数料0円が「未設定」になる', lang: 'python',
                story: '振込手数料の表示。{hosoya}さんから「手数料無料の振込なのに『未設定』と出ます」と報告。仕様は「None なら未設定、0 なら 0円 と表示」。',
                code: String.raw`def fee_label(fee):
    if not fee:
        return "手数料: 未設定"
    return f"手数料: {fee}円"`,
                bugLine: 2,
                fixes: ['if fee is None:', 'if fee == False:', 'if fee == 0:', 'if not fee == 0:'],
                answer: 0,
                hints: [
                  'fee が 0 のとき、2行目の条件はどうなりますか？',
                  'if では 0 も None も「偽」です。not を付けるとどちらも True になります。',
                  '0 == False は True です。False と比べても 0 と None は見分けられません。',
                  '仕様では「None のときだけ」未設定です。None だけを判定する書き方は？',
                ],
                why: 'not fee は 0 でも None でも True になるので、0円が未設定扱いされる。None だけを見たいなら if fee is None:。fee == False は 0 も拾い、fee == 0 は逆に 0 を未設定にしてしまう。',
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 2
      {
        id: 'python-2',
        title: 'リスト・辞書・内包表記',
        badge: { icon: '🧺', name: 'コレクション収集家' },
        handout: {
          units: ['ハッカソン スプリント2「サーバーの入り口を作る」', 'ハッカソン スプリント11「コンフリクト祭り」', 'ハッカソン スプリント20「費用を守る: トークン予算」'],
          knowledge: ['1章: インデントと if', '1章: None と、if で偽になる値', '1章: == と is の違い'],
          talk: [
            ['kujo', 'この章は「入れ物」。会話の履歴はリスト、リクエストは辞書。AI サービスのコードの8割はこの2つでできてる（体感。ちゃんと数えてはいない）。'],
            ['kujo', '1章の None と is を使うから、怪しかったら戻って読んでね。'],
          ],
        },
        sections: [
          {
            id: 'python-2-1',
            title: '4つの入れ物とスライス',
            talk: [
              ['kujo', 'Python のよく使う入れ物は4つ。順番つきで変えられるリスト、変えられないタプル、重複なしのセット、キーで引く辞書。'],
              ['kujo', 'リストは後ろから数えられる。history[-1] は最後の1件、history[-3:] は「後ろから3件目から最後まで」。'],
              ['player', 'トークン予算のスプリントで「直近3件だけ送る」ってやつか。'],
              ['kujo', 'それ。[:3] だと「先頭から3件」で、いちばん古い会話を送っちゃう。俺も一度、最新の論文を読むつもりで最古の論文を読んでた。'],
            ],
            figure: {
              title: 'インデックスとスライス',
              text: String.raw` 添字:    0     1     2     3     4
 後ろ:   -5    -4    -3    -2    -1
       ┌────┬────┬────┬────┬────┐
       │ m0 │ m1 │ m2 │ m3 │ m4 │
       └────┴────┴────┴────┴────┘
 h[:3]  → m0 m1 m2 （先頭から3件）
 h[-3:] → m2 m3 m4 （直近3件）
 h[1:3] → m1 m2    （終わりは含まない）`,
            },
            code: {
              lang: 'python',
              text: String.raw`history = ["m0", "m1", "m2"]   # list : 順番あり・変えられる
point = (35.68, 139.76)          # tuple: 変えられない
tags = {"残高", "振込", "残高"}  # set  : 重複は消える → 2個
user = {"name": "Aさん"}         # dict : キー → 値`,
            },
            points: ['list・tuple・set・dict の4つ。かっこの形で見分ける', 'スライス a[開始:終わり] は終わりを含まない。負の数は後ろから', '直近 n 件は history[-n:]'],
            quiz: [
              {
                id: 'python-2-1-q1', type: 'predict', title: '直近3件', lang: 'python',
                code: String.raw`history = ["こんにちは", "残高は？", "1000円です", "ありがとう", "どういたしまして"]
recent = history[-3:]
print(len(recent), recent[0])`,
                q: '表示されるのは？',
                choices: ['3 1000円です', '3 こんにちは', '2 ありがとう', '3 どういたしまして'],
                answer: 0,
                hints: [
                  'history は5件。-3 は後ろから3番目です。',
                  '後ろから数えると、-1 が「どういたしまして」、-2 が「ありがとう」、-3 は？',
                  '[-3:] は、-3 の位置から最後までを取り出します。',
                ],
                why: 'history[-3:] は後ろから3件「1000円です・ありがとう・どういたしまして」。要素は3個で、その先頭 recent[0] は「1000円です」。',
              },
            ],
          },
          {
            id: 'python-2-2',
            title: '辞書: get と [] の違い',
            talk: [
              ['kujo', '辞書から値を取る方法は2つ。d["キー"] はキーが無いと KeyError で止まる。d.get("キー") はキーが無いと None を返す。'],
              ['kujo', 'd.get("キー", 既定値) と2つ目を渡すと、無いときの値を決められる。'],
              ['player', '必須の項目は [] で止めて、任意の項目は get で既定値、って使い分けか。'],
              ['kujo', 'そう。読むときは「このキーが無かったらどうなる？」を毎回考える。俺が毎朝「社員証が無かったらどうなる？」を考えないのと逆のことをする。'],
            ],
            figure: {
              title: 'キーが無いとき',
              text: String.raw` req = { "message": "残高は？" }

 req["message"]        → "残高は？"
 req["lang"]           → KeyError（止まる）
 req.get("lang")       → None
 req.get("lang", "ja") → "ja"`,
            },
            code: {
              lang: 'python',
              text: String.raw`req = {"message": "残高は？", "lang": "en"}
a = {"model": "small", "lang": "ja"}
merged = {**a, **req}   # キーが重なると後ろが勝つ
print(merged["lang"])   # → en`,
            },
            points: ['d["キー"] は無いと KeyError。d.get("キー") は無いと None、2つ目で既定値', '辞書を合わせるとき、キーが重なれば後ろが勝つ'],
            quiz: [
              {
                id: 'python-2-2-q1', type: 'predict', title: '無いキーを取る', lang: 'python',
                code: String.raw`user = {"name": "Aさん", "plan": "basic"}
print(user.get("age"))
print(user.get("age", 20))
print(user["plan"])`,
                q: '表示されるのは（3行を / で区切って表しています）？',
                choices: ['None / 20 / basic', 'KeyError で止まる', '0 / 20 / basic', 'None / None / basic'],
                answer: 0,
                hints: [
                  '"age" というキーは user にありますか？',
                  'get はキーが無くてもエラーになりません。2つ目の値を渡したときと渡さないときで何が違う？',
                  '"plan" はあるキーなので、[] でも問題なく取れます。',
                ],
                why: 'user.get("age") はキーが無いので None。user.get("age", 20) は既定値の 20。user["plan"] はキーがあるので basic。[] で無いキーを取ったときだけ KeyError になる。',
              },
              {
                id: 'python-2-2-q2', type: 'review', title: 'チャットの受け口をレビュー', by: 'daichi', lang: 'python',
                story: '{daichi}くんの PR。仕様は「max_tokens が無ければ 500」「AI には直近3件の履歴だけ送る」「リクエストには個人情報が入るのでログに出さない」。',
                file: 'ai/handler.py',
                code: String.raw`def handle_chat(req):
    message = req.get("message", "")
    h = req.get("history", [])
    max_tokens = req.get("max_tokens")
    if len(message) > 1000:
        return {"status": 400}
    print("受信:", req)
    recent = h[:3]
    return {"status": 200, "recent": recent, "max_tokens": max_tokens}`,
                defects: [
                  { line: 3, kind: 'readability', why: 'h という1文字の名前では、何が入っているか読み取れない。history と名付ける。' },
                  { line: 4, kind: 'spec', why: 'キーが無いと None になる。仕様は 500 なので req.get("max_tokens", 500)。' },
                  { line: 7, kind: 'security', why: 'リクエストを丸ごとログに出すと、メッセージ内の個人情報がログに残る。' },
                  { line: 8, kind: 'bug', why: 'h[:3] は先頭（いちばん古い）3件。直近3件は h[-3:]。' },
                ],
                hints: [
                  '仕様は3つあります。1つずつ、どの行が担当しているか探しましょう。',
                  'get に既定値を渡していない行は、キーが無いと何を返しますか？',
                  'print で何を出していますか？ その中身に個人情報は入りませんか？',
                  '[:3] と [-3:] の違いを思い出しましょう。',
                  '仕様とは別に、名前だけで中身が分からない変数もあります。',
                ],
                why: '3行目は名前が h で読みにくい（readability）。4行目は既定値が無く None になる（spec）。7行目はリクエストを丸ごとログに出している（security）。8行目は直近ではなく最古の3件を取っている（bug）。',
              },
            ],
          },
          {
            id: 'python-2-3',
            title: '内包表記と、参照とコピー',
            talk: [
              ['kujo', '[式 for x in リスト if 条件] は内包表記。「リストの各 x について、条件に合うものだけ式に通して新しいリストを作る」。数学の集合の書き方に近くて、俺は大好き。'],
              ['kujo', '読むコツは、真ん中の for から読むこと。for → if → 先頭の式 の順に読めば迷わない。'],
              ['player', 'もう1つの「参照とコピー」は？'],
              ['kujo', 'b = a はコピーじゃなくて、同じリストに名札を2枚貼るだけ。b に足すと a も増える。別物にしたいなら a.copy()。俺も「コピーしたと思ってたら原本」でよく泣く。'],
            ],
            figure: {
              title: '参照（同じ実物）とコピー（別の実物）',
              text: String.raw` a ─┐
    ├──→ ["sys"]   b = a     （同じ実物）
 b ─┘

 a ────→ ["sys"]
 c ────→ ["sys"]   c = a.copy()（別の実物）

 b.append("x") → a も ["sys", "x"]
 c.append("x") → a は変わらない`,
            },
            code: {
              lang: 'python',
              text: String.raw`amounts = [1200, -300, 5000]
# 内包表記: for → if → 先頭の式 の順に読む
big = [a for a in amounts if a >= 1000]   # [1200, 5000]
names = {u["id"]: u["name"] for u in users}  # 辞書も作れる`,
            },
            points: ['内包表記は for → if → 先頭の式 の順に読む', 'b = a は同じ実物を指すだけ。別物が欲しいなら a.copy()（中まで別にするなら copy.deepcopy）'],
            quiz: [
              {
                id: 'python-2-3-q1', type: 'predict', title: '出金だけを取り出す', lang: 'python',
                code: String.raw`amounts = [1200, -300, 5000, 0, -80]
withdrawals = [-a for a in amounts if a < 0]
print(withdrawals)`,
                q: '表示されるのは？',
                choices: ['[300, 80]', '[-300, -80]', '[1200, 5000]', '[300, 0, 80]'],
                answer: 0,
                hints: [
                  '真ん中の for から読みます。amounts の各 a について……',
                  'if a < 0 に合うのはどれですか？ 0 は含まれますか？',
                  '先頭の式は -a です。-(-300) は？',
                ],
                why: '条件 a < 0 に合うのは -300 と -80（0 は合わない）。それぞれに先頭の式 -a を通すので 300 と 80。結果は [300, 80]。',
              },
              {
                id: 'python-2-3-q2', type: 'predict', title: 'プロンプトの部品', lang: 'python',
                code: String.raw`base = ["あなたは銀行のアシスタントです"]
prompt_a = base
prompt_b = base.copy()
prompt_a.append("敬語で答えて")
print(len(base), len(prompt_a), len(prompt_b))`,
                q: '表示されるのは？',
                choices: ['2 2 1', '1 2 1', '2 2 2', '1 1 1'],
                answer: 0,
                hints: [
                  'prompt_a = base は、新しいリストを作りますか？',
                  'prompt_a と base は同じ実物を指しています。',
                  'prompt_b は copy() で作った別の実物です。append の影響を受けますか？',
                ],
                why: 'prompt_a は base と同じ実物なので、append すると base も2件になる。prompt_b はコピーした別の実物なので1件のまま。結果は 2 2 1。',
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 3
      {
        id: 'python-3',
        title: '関数',
        badge: { icon: '🧰', name: '関数の職人' },
        handout: {
          units: ['ハッカソン スプリント2「サーバーの入り口を作る」', 'ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント14「429に備える: リトライとバックオフ」'],
          knowledge: ['2章: リストと辞書', '2章: 参照とコピー（b = a は同じ実物）'],
          talk: [
            ['kujo', '関数の章。数学の f(x) と同じ……と言いたいところだけど、Python の関数にはひとつ有名な罠がある。2章の「参照とコピー」がそのまま効いてくるよ。'],
          ],
        },
        sections: [
          {
            id: 'python-3-1',
            title: 'デフォルト引数とキーワード引数',
            talk: [
              ['kujo', 'def f(x, base=1): のように書くと、base を省いたとき 1 が使われる。これがデフォルト引数。'],
              ['kujo', '呼ぶ側で factor=3 のように名前を付けて渡すのがキーワード引数。名前付きなら、途中の引数を飛ばせる。'],
              ['player', 'リトライの待ち時間を計算する関数で見たな。base と factor。'],
              ['kujo', 'それ、指数バックオフ。base × factor の attempt 乗。……数式の話になると俺は急に元気になる。'],
            ],
            figure: {
              title: '引数の当てはまり方',
              text: String.raw` def retry_wait(attempt, base=1, factor=2)

 retry_wait(3)
   attempt=3 base=1 factor=2 （省略→既定）
 retry_wait(3, 5)
   attempt=3 base=5 factor=2 （順番どおり）
 retry_wait(3, factor=3)
   attempt=3 base=1 factor=3 （名前で指定）`,
            },
            points: ['def f(x, y=既定値) で、省いた引数に既定値が入る', '呼ぶときに 名前=値 と書くと、その引数だけを指定できる（キーワード引数）'],
            quiz: [
              {
                id: 'python-3-1-q1', type: 'predict', title: 'バックオフの待ち時間', lang: 'python',
                code: String.raw`def retry_wait(attempt, base=1, factor=2):
    return base * factor ** attempt

print(retry_wait(3), retry_wait(3, factor=3), retry_wait(2, 5))`,
                q: '表示されるのは？（** はべき乗）',
                choices: ['8 27 20', '6 9 10', '8 27 25', '9 27 20'],
                answer: 0,
                hints: [
                  '** はべき乗で、* より先に計算されます。2 ** 3 は 8。',
                  'retry_wait(3) は base=1・factor=2 のまま。',
                  'retry_wait(3, factor=3) は factor だけ 3 になります。',
                  'retry_wait(2, 5) の 5 は、2番目の引数 base に入ります。',
                ],
                why: '1 × 2^3 = 8、1 × 3^3 = 27、5 × 2^2 = 20。名前を付けずに渡した 5 は順番どおり base に入る。',
              },
            ],
          },
          {
            id: 'python-3-2',
            title: '可変なデフォルト引数の罠',
            talk: [
              ['kujo', 'ここが有名な罠。def add(text, history=[]): のデフォルトの空リストは、関数を定義したときに1回だけ作られる。'],
              ['player', '呼ぶたびに新しい空リスト、じゃないのか。'],
              ['kujo', 'じゃない。だから省略して呼ぶたびに同じリストに積み上がる。チャットだと、別のお客さんの会話が混ざる。俺の机の引き出しと同じで、一度入れたものは誰も片付けない。'],
              ['kujo', '直し方は決まってて、既定値を None にして、関数の中で「None なら新しい空リスト」を作る。この形を見たら「ああ、罠よけだな」と読めればOK。'],
            ],
            figure: {
              title: '既定値のリストは1個だけ',
              text: String.raw` def add(text, history=[])
                       │ 定義時に1回だけ作る
                       ▼
                   ┌─────────┐
 add("A") ───────→ │ ["A"]   │
 add("B") ───────→ │ ["A","B"]│ ← 同じリスト
                   └─────────┘
 罠よけ: history=None
         if history is None: history = []`,
            },
            code: {
              lang: 'python',
              text: String.raw`def add_message(text, history=None):
    if history is None:
        history = []      # 呼ぶたびに新しいリスト
    history.append(text)
    return history`,
            },
            points: ['デフォルト引数は定義のときに1回だけ評価される。リストや辞書を既定値にすると共有される', '可変な既定値は None にして、関数の中で新しく作る'],
            quiz: [
              {
                id: 'python-3-2-q1', type: 'predict', title: '2回呼んだら', lang: 'python',
                code: String.raw`def add_message(text, history=[]):
    history.append(text)
    return history

a = add_message("こんにちは")
b = add_message("残高は？")
print(a)`,
                q: '表示されるのは？',
                choices: ["['こんにちは']", "['こんにちは', '残高は？']", "['残高は？']", 'エラーになる'],
                answer: 1,
                hints: [
                  '既定値の [] は、いつ作られますか？',
                  '1回目も2回目も history を省いています。同じリストですか？',
                  'a と b は同じリストを指しています。print の時点で、そのリストの中身は？',
                ],
                why: '既定値の [] は定義のときに1回だけ作られ、省略して呼ぶたびに同じリストが使われる。a も b も同じリストを指し、print の時点では2件入っている。',
              },
              {
                id: 'python-3-2-q2', type: 'fix', title: '九条の罠よけ、あと一歩', lang: 'python',
                story: '九条くん「罠よけの2行を足したのに、まだ別のお客さんの system メッセージが増えていく……。あ、今日も靴下が左右違う」',
                code: String.raw`def start_session(user_id, history=[]):
    if history is None:
        history = []
    history.append({"role": "system", "content": "銀行のアシスタントです"})
    return {"user": user_id, "history": history}`,
                bugLine: 1,
                fixes: [
                  'def start_session(user_id, history=None):',
                  'def start_session(user_id, history=list()):',
                  'def start_session(user_id, history=()):',
                  'def start_session(user_id, *history):',
                ],
                answer: 0,
                hints: [
                  '2〜3行目は「history が None なら新しいリスト」です。history が None になるのはいつですか？',
                  '既定値が [] のままだと、省略しても None にはなりません。',
                  'list() も [] と同じく、定義のときに1回だけ作られます。',
                  '罠よけは「既定値を何にする」までがセットです。',
                ],
                why: '既定値が [] のままなので、2行目の is None は一度も True にならず、共有のリストに積み上がる。既定値を None にして初めて、3行目で毎回新しいリストが作られる。list() も定義時に1回だけ、() はタプルで append できない。',
              },
            ],
          },
          {
            id: 'python-3-3',
            title: '*args・**kwargs・複数の戻り値・型ヒント',
            talk: [
              ['kujo', 'return a, b と書くと、実は (a, b) という1つのタプルを返してる。受け取る側で x, y = f() と書けば、ばらして受け取れる。'],
              ['kujo', 'def f(*args, **kwargs): は「いくつでも受け取る」。args は名前なしの引数のタプル、kwargs は名前付きの引数の辞書。デコレータやログ関数でよく見る。'],
              ['player', 'total: int とか -> tuple[int, int] は型ヒントだよな。これでチェックされる？'],
              ['kujo', '実行時はチェックされない。読む人とエディタ向けのメモ。……俺が冷蔵庫に貼る「牛乳買う」のメモくらい、守られる保証はない。'],
            ],
            figure: {
              title: '引数のまとめ方',
              text: String.raw` log("send", "a", "b", user="u1", n=3)
       │      └──┬───┘  └─────┬─────┘
       ▼         ▼            ▼
 def log(name, *args,      **kwargs)
       name="send"
       args=("a", "b")        タプル
       kwargs=("user"→"u1",   辞書
               "n"→3)`,
            },
            code: {
              lang: 'python',
              text: String.raw`def split_amount(total: int, people: int) -> tuple[int, int]:
    return total // people, total % people   # 1つのタプル

each, rest = split_amount(1000, 3)   # ばらして受け取る
pair = split_amount(1000, 3)         # まとめて受け取る → (333, 1)`,
            },
            points: ['return a, b はタプル1つを返す。x, y = f() でばらせる', '*args は名前なしの引数のタプル、**kwargs は名前付きの引数の辞書', '型ヒントは実行時にはチェックされない（読む人とツール向け）'],
            quiz: [
              {
                id: 'python-3-3-q1', type: 'predict', title: '割り勘の端数', lang: 'python',
                code: String.raw`def split_amount(total: int, people: int) -> tuple[int, int]:
    return total // people, total % people

each, rest = split_amount(1000, 3)
print(each, rest)`,
                q: '表示されるのは？（// は切り捨ての割り算、% は余り）',
                choices: ['333 1', '333.3333333333333 0', '(333, 1)', '333 0'],
                answer: 0,
                hints: [
                  '1000 // 3 と 1000 % 3 をそれぞれ計算しましょう。',
                  '戻り値はタプル (333, 1) ですが、受け取る側で2つの変数にばらしています。',
                  'print(each, rest) は2つの値を空白で区切って表示します。',
                ],
                why: '1000 // 3 = 333、1000 % 3 = 1。戻り値のタプル (333, 1) を each と rest にばらしているので、表示は 333 1。print(pair) のようにまとめて受け取ったときだけ (333, 1) と出る。',
              },
              {
                id: 'python-3-3-q2', type: 'predict', title: 'ログ関数に渡したもの', lang: 'python',
                code: String.raw`def log_event(name, *args, **kwargs):
    print(name, len(args), list(kwargs))

log_event("send", "a", "b", user="u1", tokens=120)`,
                q: '表示されるのは？',
                choices: ["send 2 ['user', 'tokens']", 'send 4 []', "send 0 ['a', 'b', 'user', 'tokens']", "send 2 ['u1', 120]"],
                answer: 0,
                hints: [
                  '最初の "send" は name に入ります。',
                  '名前の付いていない残り（"a" と "b"）が args に入ります。',
                  '名前付きの引数は kwargs という辞書に入ります。辞書を list にすると、キーと値のどちらが並びますか？',
                ],
                why: 'name は "send"、args は ("a", "b") で2個、kwargs は user と tokens をキーにした辞書。list(辞書) はキーの一覧を、入れた順に返すので [\'user\', \'tokens\']。',
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 4
      {
        id: 'python-4',
        title: 'クラス',
        badge: { icon: '🏛️', name: 'クラスの建築士' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント16「ログに個人情報を残さない」'],
          knowledge: ['3章: 関数と引数', '3章: 可変なデフォルト引数の罠（共有されるリスト）', 'Java の章のクラス（読んでいれば比べやすい）'],
          talk: [
            ['kujo', 'クラスの章。Java を読んだなら考え方は同じで、書き方が違うだけ。self が出てきたら「this のことだな」と思えばいい。'],
            ['kujo', '3章の「共有されるリスト」の罠が、クラスでも形を変えて出てくる。……俺の傘も、気づくと会社の共有の傘立てに吸収されてる。'],
          ],
        },
        sections: [
          {
            id: 'python-4-1',
            title: 'class・__init__・self',
            talk: [
              ['kujo', 'class Account: が設計図。Account("Aさん", 1000) と呼ぶと実物ができて、そのとき __init__ が1回動く。Java のコンストラクタだね。'],
              ['kujo', 'メソッドの最初の引数 self が「この実物自身」。self.balance = balance で、実物に値を持たせる。'],
              ['player', '呼ぶときに self は渡さないんだよな。a.deposit(300) なら self に a が入る。'],
              ['kujo', 'そう。逆に書くときは self を付け忘れると、ただのローカル変数になって消える。俺が付箋に書いたメモと同じ運命。'],
            ],
            figure: {
              title: 'self が指すもの',
              text: String.raw` a = Account("Aさん", 1000)
        │
        ▼  __init__(self=a, owner="Aさん",
        │                   balance=1000)
 ┌─ a ─────────────┐
 │ owner  = "Aさん" │ ← self.owner
 │ balance = 1000   │ ← self.balance
 └──────────────────┘
 a.deposit(300) → deposit(self=a, 300)`,
            },
            code: {
              lang: 'python',
              text: String.raw`class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner        # 実物に持たせる
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance`,
            },
            points: ['__init__ は実物を作るときに1回動く（Java のコンストラクタ）', 'self はその実物自身。self. を付けた変数だけが実物に残る'],
            quiz: [
              {
                id: 'python-4-1-q1', type: 'predict', title: '2つの口座', lang: 'python',
                code: String.raw`class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        self.balance += amount
        return self.balance

a = Account("Aさん", 1000)
b = Account("Bさん")
a.deposit(300)
print(a.balance, b.balance)`,
                q: '表示されるのは？',
                choices: ['1300 0', '1300 300', '1000 0', '1300 1300'],
                answer: 0,
                hints: [
                  'b を作るとき balance を省いています。既定値は？',
                  'a.deposit(300) の self に入るのは a と b のどちら？',
                  'self.balance は実物ごとの値です。',
                ],
                why: 'a は 1000 で作られ、deposit で 1300 になる。b は balance を省いたので 0 のまま。self.balance は実物ごとに別々。',
              },
              {
                id: 'python-4-1-q2', type: 'fix', title: 'history が無いと言われる', lang: 'python',
                story: '会話セッションのクラス。add を呼ぶと AttributeError: \'ChatSession\' object has no attribute \'history\' で落ちる。',
                code: String.raw`class ChatSession:
    def __init__(self, user_id):
        self.user_id = user_id
        history = []

    def add(self, text):
        self.history.append(text)
        return len(self.history)`,
                bugLine: 4,
                fixes: ['self.history = []', 'history = self.history', 'self.history.append([])', 'global history'],
                answer: 0,
                hints: [
                  'エラーは「実物に history が無い」と言っています。',
                  '__init__ の中で、実物に値を持たせているのはどの行ですか？',
                  '3行目と4行目を見比べましょう。何が違いますか？',
                  'self. を付けない変数は、__init__ が終わると消えるローカル変数です。',
                ],
                why: '4行目の history = [] はローカル変数なので、__init__ が終わると消える。実物に持たせるには self.history = []。Java の this 付け忘れと同じ形のバグ。',
              },
            ],
          },
          {
            id: 'python-4-2',
            title: 'インスタンス変数とクラス変数の罠',
            talk: [
              ['kujo', 'class の直下（メソッドの外）に書いた変数はクラス変数。全部の実物で1つを共有する。self.x = ... で作ったのがインスタンス変数で、実物ごとに別。'],
              ['player', 'クラス直下に messages = [] って書いたら……。'],
              ['kujo', '全部のセッションで1つのリストを共有する。Aさんの相談が Bさんの履歴に出てくる。お金の相談でそれは事故。3章の罠のクラス版だね。'],
              ['kujo', '定数（上限の数とか）をクラス変数にするのはOK。変わるもの、特にリストや辞書を置いたら赤信号。'],
            ],
            figure: {
              title: 'クラス変数は全員で1つ',
              text: String.raw` class Session:
     messages = []  ──────┐ クラスに1つ
                          ▼
 s1 ─→ ┌──────┐     ┌────────────┐
       │user=A│ ──→ │ messages   │
       └──────┘     │ ["残高…"] │
 s2 ─→ ┌──────┐ ──→ │（共有）    │
       │user=B│     └────────────┘
       └──────┘
 直すなら __init__ で self.messages = []`,
            },
            points: ['class 直下の変数はクラス変数（全員で共有）。self.x はインスタンス変数（実物ごと）', 'リストや辞書をクラス変数にすると、ほかの実物とまざる。定数ならOK'],
            quiz: [
              {
                id: 'python-4-2-q1', type: 'predict', title: 'Bさんの履歴', lang: 'python',
                code: String.raw`class Session:
    messages = []

    def __init__(self, user):
        self.user = user

    def add(self, text):
        self.messages.append(text)

s1 = Session("Aさん")
s2 = Session("Bさん")
s1.add("残高を教えて")
print(len(s2.messages))`,
                q: '表示されるのは？',
                choices: ['1', '0', '2', 'AttributeError になる'],
                answer: 0,
                hints: [
                  'messages はどこに書かれていますか？ __init__ の中？ class の直下？',
                  'class 直下の変数は、全部の実物で共有されます。',
                  'self.messages.append は、実物に新しい変数を作るのではなく、見つけたクラスのリストに足します。',
                ],
                why: 'messages はクラス変数なので s1 と s2 で同じリスト。s1.add で足した1件が s2.messages からも見える。__init__ で self.messages = [] とすれば実物ごとに分かれる。',
              },
              {
                id: 'python-4-2-q2', type: 'review', title: 'ChatBot クラスをレビュー', by: 'rio', lang: 'python',
                story: '{rio}の PR。仕様は「会話はユーザーごとに分けて持つ」「AI に送るのは直近5件まで」「ユーザーの発言はログに出さない」。',
                file: 'ai/chatbot.py',
                code: String.raw`class ChatBot:
    history = []
    MAX_HISTORY = 10

    def __init__(self, user_id):
        self.user_id = user_id

    def ask(self, text):
        self.history.append(text)
        recent = self.history[-self.MAX_HISTORY:]
        print(f"user={self.user_id} text={text}")
        return recent`,
                defects: [
                  { line: 2, kind: 'bug', why: 'history がクラス変数なので、全ユーザーの会話が1つのリストにまざる。__init__ で self.history = [] にする。' },
                  { line: 3, kind: 'spec', why: '仕様は直近5件まで。10 では送りすぎ。' },
                  { line: 11, kind: 'security', why: 'ユーザーの発言 text をそのままログに出している。' },
                ],
                hints: [
                  '仕様は3つ。それぞれを担当している行を探しましょう。',
                  'history はどこに書かれていますか？ ユーザーごとに分かれますか？',
                  '直近何件を送っていますか？ その数はどこで決まっていますか？',
                  'print で出している中身を見ましょう。',
                ],
                why: '2行目の history はクラス変数で全ユーザー共有（bug）。3行目は仕様の5件と違う10件（spec）。11行目はユーザーの発言をログに出している（security）。MAX_HISTORY のような定数をクラス変数にするのは問題ない。',
              },
            ],
          },
          {
            id: 'python-4-3',
            title: '継承と super、__repr__、@property',
            talk: [
              ['kujo', 'class SavingsAccount(Account): で継承。子の __init__ を書いたら、super().__init__(...) で親の初期化を呼ぶのを忘れずに。忘れると親が用意するはずの値が無い。'],
              ['kujo', '__repr__ と __str__ は「print したときの見え方」を決める特別なメソッド。__str__ が無ければ __repr__ が使われる。カード番号を持つクラスでここを雑に書くと、ログに番号が丸ごと出る。'],
              ['kujo', '@property を付けたメソッドは、かっこなしで値みたいに読める。c.masked と書いてあっても、裏ではメソッドが動いてる。'],
              ['player', '属性に見えて実は計算、ってことか。読むとき気をつけないとな。'],
            ],
            figure: {
              title: '継承と super',
              text: String.raw` class Account:
     __init__(owner) → owner, balance=0
          ▲
          │ 継承
 class SavingsAccount(Account):
     __init__(owner, rate)
        super().__init__(owner) ← 親を呼ぶ
        self.rate = rate
 ─────────────────────────────
 print(x) → __str__ → 無ければ __repr__`,
            },
            code: {
              lang: 'python',
              text: String.raw`class Card:
    def __init__(self, number):
        self._number = number      # _ は「外から触らないで」の目印

    @property
    def masked(self):              # c.masked で読める
        return "****-" + self._number[-4:]`,
            },
            points: ['子の __init__ では super().__init__(...) で親の初期化を呼ぶ', 'print は __str__、無ければ __repr__ を使う。個人情報を出さない形にする', '@property はかっこなしで読めるメソッド'],
            quiz: [
              {
                id: 'python-4-3-q1', type: 'fix', title: '持ち主が 0.001 さん', lang: 'python',
                story: '{daichi}くんの PR。積立口座を作ったら s.owner が 0.001 になっていた。',
                code: String.raw`class Account:
    def __init__(self, owner):
        self.owner = owner
        self.balance = 0

class SavingsAccount(Account):
    def __init__(self, owner, rate):
        super().__init__(rate)
        self.rate = rate

s = SavingsAccount("Aさん", 0.001)
print(s.owner)`,
                bugLine: 8,
                fixes: ['super().__init__(owner)', 'super().__init__(self, owner)', 'self.owner = rate', 'Account.__init__(owner)'],
                answer: 0,
                hints: [
                  '親の __init__ は、何を受け取って self.owner に入れていますか？',
                  '8行目で親に渡しているのはどの値ですか？',
                  'super().__init__ に self は渡しません（自動で渡ります）。',
                  'Account.__init__ と書くなら self を自分で渡す必要があります。',
                ],
                why: '8行目で親に rate を渡しているので owner が 0.001 になる。super().__init__(owner) が正しい。super() 経由なら self は自動で渡るので、self を足すと引数が1つ多くなる。',
              },
              {
                id: 'python-4-3-q2', type: 'predict', title: 'カードを print する', lang: 'python',
                code: String.raw`class Card:
    def __init__(self, number):
        self._number = number

    @property
    def masked(self):
        return "****-" + self._number[-4:]

    def __repr__(self):
        return f"Card({self.masked})"

c = Card("1234-5678-9012-3456")
print(c.masked)
print(c)`,
                q: '表示されるのは（2行を / で区切って表しています）？',
                choices: ['****-3456 / Card(****-3456)', '****-3456 / Card(1234-5678-9012-3456)', 'エラーになる（masked にかっこが無い）', '****-3456 / <__main__.Card object at 0x...>'],
                answer: 0,
                hints: [
                  'masked には @property が付いています。かっこなしで読めます。',
                  '"1234-5678-9012-3456"[-4:] は後ろ4文字です。',
                  'print(c) は __str__ を探し、無ければ __repr__ を使います。',
                  '__repr__ の中で使っているのは _number ですか、masked ですか？',
                ],
                why: 'c.masked は @property なのでかっこなしで動き、****-3456。print(c) は __str__ が無いので __repr__ が使われ、中で masked を使っているので Card(****-3456)。番号を丸ごと出さない、よい __repr__ の例。',
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 5
      {
        id: 'python-5',
        title: '例外と with',
        badge: { icon: '🛡️', name: '例外ハンドラー' },
        handout: {
          units: ['ハッカソン スプリント8「連打に強く: 二重送信」', 'ハッカソン スプリント10「勘定系API（Java）とつなぐ」', 'ハッカソン スプリント14「429に備える: リトライとバックオフ」'],
          knowledge: ['3章: 関数と戻り値', '4章: クラスと特別なメソッド（__init__ など）'],
          talk: [
            ['kujo', '例外の章。失敗したときにどの行が動くか、を読めるようになろう。'],
            ['kujo', '4章の「特別なメソッド」が with の仕組みにも出てくる。……ちなみに俺の人生には finally が無いので、だいたい後片付けが漏れる。'],
          ],
        },
        sections: [
          {
            id: 'python-5-1',
            title: 'try / except / else / finally',
            talk: [
              ['kujo', 'try の中で例外が起きると、残りを飛ばして合う except へ。何も起きなければ else へ。finally はどちらでも必ず最後に動く。'],
              ['player', 'return した後でも finally は動くんだっけ？'],
              ['kujo', '動く。return の値を持ったまま finally を通ってから、呼び出し元に帰る。だから接続を閉じる処理は finally に置く。'],
              ['kujo', '流れ図で覚えるのがいちばん早い。俺は家の鍵を finally に置きたい。'],
            ],
            figure: {
              title: '動く順番',
              text: String.raw`        try:
          │
   例外? ─┼─ なし ─→ else:
          │ あり        │
          ▼             │
       except:          │
          │             │
          └──────┬──────┘
                 ▼
             finally:（必ず）`,
            },
            points: ['例外が起きたら try の残りを飛ばして except へ。起きなければ else へ', 'finally は必ず動く。return の後でも、例外が外へ出ていくときでも'],
            quiz: [
              {
                id: 'python-5-1-q1', type: 'predict', title: '0円の送金', lang: 'python',
                code: String.raw`def send(amount):
    try:
        print("A")
        if amount <= 0:
            raise ValueError("金額が不正")
        print("B")
    except ValueError as e:
        print("C", e)
    else:
        print("D")
    finally:
        print("E")

send(0)`,
                q: '表示される順番は？',
                choices: ['A → C 金額が不正 → E', 'A → B → D → E', 'A → C 金額が不正 → D → E', 'A → C 金額が不正'],
                answer: 0,
                hints: [
                  'amount は 0。4行目の条件は？',
                  'raise すると、try の残り（6行目）は飛ばされます。',
                  'else は「例外が起きなかったとき」だけ動きます。',
                  'finally はどんなときでも動きます。',
                ],
                why: 'A を表示 → 0 <= 0 なので ValueError → B は飛ばして except で「C 金額が不正」→ 例外が起きたので else は動かない → finally の E。',
              },
              {
                id: 'python-5-1-q2', type: 'predict', title: 'return の後の finally', lang: 'python',
                code: String.raw`def fetch_balance():
    try:
        return "1000円"
    finally:
        print("接続を閉じる")

print(fetch_balance())`,
                q: '表示される順番は？',
                choices: ['「接続を閉じる」→「1000円」', '「1000円」だけ', '「1000円」→「接続を閉じる」', '「接続を閉じる」だけ'],
                answer: 0,
                hints: [
                  'return したら、すぐ呼び出し元へ帰りますか？',
                  'finally は return の後でも動きます。',
                  '外側の print は、関数が値を返し終わってから動きます。',
                ],
                why: 'return "1000円" で値は決まるが、帰る前に finally が動いて「接続を閉じる」。その後で関数が値を返し、外側の print が「1000円」を表示する。',
              },
            ],
          },
          {
            id: 'python-5-2',
            title: '握りつぶさない、raise で伝える',
            talk: [
              ['kujo', 'except: pass や、except で 0 を返すのは「握りつぶし」。失敗したのに、成功したふりをする。'],
              ['kujo', '残高の取得に失敗して 0円 と表示したら、お客さんは本当に残高が 0 だと思う。それは失敗より悪い。'],
              ['player', 'じゃあ、どうするのが正解？'],
              ['kujo', '自分で何とかできないなら、ログを残して raise でそのまま上に伝える。except の中で raise とだけ書けば、同じ例外を投げ直せる。俺も忘れ物は握りつぶさず、すぐ{player}に申告するようにしてる。'],
            ],
            figure: {
              title: '握りつぶしと、伝える',
              text: String.raw` ✕ except Exception:
       return 0     → 失敗が「0円」に化ける

 ✕ except:
       pass         → 失敗が None に化ける

 ○ except Exception as e:
       logger.error(...)  ← 秘密は書かない
       raise              → 上に伝える`,
            },
            code: {
              lang: 'python',
              text: String.raw`def check_amount(amount):
    if amount <= 0:
        raise ValueError("金額は1円以上です")   # 自分から投げる
    return amount`,
            },
            points: ['except で 0 や None を返すと、失敗が成功に化ける（握りつぶし）', '自分で直せない例外は、ログを残して raise で上に伝える', 'ログに鍵や個人情報を書かない'],
            quiz: [
              {
                id: 'python-5-2-q1', type: 'review', title: '勘定系の呼び出しをレビュー', by: 'osamu', lang: 'python',
                story: '{osamu}さんの PR……ではなく、{osamu}さんが「昔の自分のコード」として持ってきた練習問題。仕様は「送金は1円以上10万円以下。それ以外は ValueError」。',
                file: 'ai/core_client.py',
                code: String.raw`def get_balance(account_id):
    try:
        res = core_api.balance(account_id)
        return res["amount"]
    except Exception:
        return 0

def transfer(src, dst, amount):
    if amount <= 0:
        raise ValueError("金額は1円以上10万円以下です")
    try:
        core_api.transfer(src, dst, amount)
    except Exception as e:
        logger.error(f"送金失敗 key={API_KEY} err={e}")
        raise`,
                defects: [
                  { line: 6, kind: 'bug', why: '取得に失敗したのに 0 を返すと、利用者には「残高0円」に見える。握りつぶさずに伝える。' },
                  { line: 9, kind: 'spec', why: '上限の10万円を確かめていない。amount <= 0 or amount > 100000 にする。' },
                  { line: 14, kind: 'security', why: 'API の鍵をログに書いている。ログを読める人に鍵が漏れる。' },
                ],
                hints: [
                  'except の中で何を返していますか？ それを見た利用者はどう思う？',
                  '仕様の範囲は「1円以上10万円以下」。両方の端を確かめていますか？',
                  'ログに書いている値の中に、秘密のものはありませんか？',
                  '15行目の raise は、ログを残したうえで上に伝えています。これは正しい書き方です。',
                ],
                why: '6行目は失敗を0円に化けさせる握りつぶし（bug）。9行目は上限の確認が無い（spec）。14行目は鍵をログに出している（security）。15行目の raise は同じ例外を投げ直す正しい書き方。',
              },
            ],
          },
          {
            id: 'python-5-3',
            title: 'with とコンテキストマネージャ',
            talk: [
              ['kujo', 'with open(path) as f: と書くと、ブロックを抜けるときに自動でファイルを閉じる。途中で例外が起きても閉じる。'],
              ['kujo', '仕組みは、入るときに __enter__、出るときに __exit__ が呼ばれるだけ。try / finally を毎回書かなくていいように包んだもの。'],
              ['player', '__exit__ は例外を止めるのか？'],
              ['kujo', '__exit__ が True を返したときだけ止める。ふつうは False（か何も返さない）で、例外はそのまま外へ出ていく。片付けはするけど、失敗は隠さない。……俺も見習いたい。'],
            ],
            figure: {
              title: 'with の流れ',
              text: String.raw` with Timer() as t:
   │  __enter__() ← 入るとき
   ▼
   ブロックの中身
   │（例外が起きても）
   ▼
   __exit__()    ← 出るとき必ず
   │
   ├ True を返す → 例外を止める
   └ False/None  → 例外は外へ`,
            },
            code: {
              lang: 'python',
              text: String.raw`with open("prompt.txt", encoding="utf-8") as f:
    text = f.read()
# ここではもう f は閉じている

# open のモード: "r" 読む / "w" 上書き / "a" 追記`,
            },
            points: ['with はブロックを出るときに必ず後片付けをする（ファイルを閉じる など）', '入るとき __enter__、出るとき __exit__。__exit__ が True を返さなければ例外は外へ出る', 'open のモード: "r" 読む・"w" 上書き・"a" 追記'],
            quiz: [
              {
                id: 'python-5-3-q1', type: 'predict', title: 'タイマーの中で失敗', lang: 'python',
                code: String.raw`class Timer:
    def __enter__(self):
        print("開始")
        return self

    def __exit__(self, exc_type, exc, tb):
        print("終了")
        return False

with Timer():
    print("AIに問い合わせ中")
    raise TimeoutError("応答なし")
print("ここまで来た？")`,
                q: 'どうなる？',
                choices: [
                  '開始 → AIに問い合わせ中 → 終了 → TimeoutError で止まる（最後の行は表示されない）',
                  '開始 → AIに問い合わせ中 → TimeoutError で止まる（終了は表示されない）',
                  '開始 → AIに問い合わせ中 → 終了 → ここまで来た？',
                  '開始 → 終了 → ここまで来た？',
                ],
                answer: 0,
                hints: [
                  'with に入るとき __enter__ が動きます。',
                  'ブロックの中で例外が起きても、出るときに __exit__ は呼ばれます。',
                  '__exit__ は False を返しています。例外は止まりますか？',
                ],
                why: '__enter__ で「開始」、中身で「AIに問い合わせ中」、例外が起きても __exit__ で「終了」。__exit__ が False なので例外は外へ出て、最後の print には届かない。',
              },
              {
                id: 'python-5-3-q2', type: 'fix', title: 'ログが書けない', lang: 'python',
                story: '{player}が書いた、会話ログ（マスキング済み）をファイルに1行ずつ追記する関数。io.UnsupportedOperation: not writable で落ちる。',
                code: String.raw`def save_log(path, line):
    with open(path, "r", encoding="utf-8") as f:
        f.write(line + "\n")`,
                bugLine: 2,
                fixes: [
                  'with open(path, "a", encoding="utf-8") as f:',
                  'with open(path, "w", encoding="utf-8") as f:',
                  'with open(path, "rb") as f:',
                  'f = open(path, "r", encoding="utf-8")',
                ],
                answer: 0,
                hints: [
                  'エラーは「書き込めない」と言っています。どのモードで開いていますか？',
                  '"r" は読み込み専用です。',
                  '"w" でも書けますが、開くたびに中身が消えます。仕様は「追記」です。',
                  '後ろに足していくモードは何でしたか？',
                ],
                why: '"r" は読み込み専用なので write できない。"w" は書けるが開くたびに上書きして過去のログが消える。追記は "a"。with をやめて open するだけでは閉じ忘れの元になる。',
              },
            ],
          },
        ],
      },

      // ---------------------------------------------------------------- 6
      {
        id: 'python-6',
        title: 'モジュール・デコレータ・非同期の入口',
        badge: { icon: '🪄', name: 'Python 読みの魔法使い' },
        handout: {
          units: ['ハッカソン スプリント3「AIにつなぐ: 返答の届け方」', 'ハッカソン スプリント14「429に備える: リトライとバックオフ」', 'ハッカソン スプリント21「負荷試験: 同時アクセス」'],
          knowledge: ['3章: *args と **kwargs', '3章: 関数を変数に入れて渡せること（return したものを呼ぶ）', '5章: 例外と try / except'],
          talk: [
            ['kujo', '最終章。AI サービスのファイルの先頭と、関数の上の @ と、async。ここが読めればサーバー側のコードは怖くない。'],
            ['kujo', '3章の *args と **kwargs、5章の例外を使うよ。……ここまで来た{player}に、俺から金のバッジを渡したいけど、たぶん家に忘れる。'],
          ],
        },
        sections: [
          {
            id: 'python-6-1',
            title: 'import と if __name__ == "__main__"',
            talk: [
              ['kujo', 'import money と書くと、money.py を上から全部実行して、その中の関数を money.yen のように使えるようにする。'],
              ['kujo', '「上から全部実行」がポイント。ファイルの直下に print があれば、import しただけで表示される。'],
              ['player', 'じゃあ if __name__ == "__main__": は？'],
              ['kujo', 'そのファイルを直接実行したときだけ True になる。import されたときは __name__ がモジュール名（"money"）になるから、中は動かない。お試しのコードを置く場所だね。'],
            ],
            figure: {
              title: '__name__ の中身',
              text: String.raw` python money.py   （直接実行）
   money.py の __name__ = "__main__"
   → if の中も動く

 python main.py    （main が import money）
   money.py の __name__ = "money"
   → if の中は動かない
   → でも直下の print は動く`,
            },
            points: ['import はそのファイルを上から1回実行する。直下の処理は import だけで動く', 'if __name__ == "__main__": の中は、直接実行したときだけ動く'],
            quiz: [
              {
                id: 'python-6-1-q1', type: 'predict', title: 'main.py を実行すると', lang: 'python',
                code: String.raw`# ---- money.py ----
print("money を読み込み中")

def yen(n):
    return f"{n:,}円"

if __name__ == "__main__":
    print(yen(1000))

# ---- main.py ----
import money
print(money.yen(1234567))`,
                q: 'python main.py を実行したときに表示されるのは？（:, は3桁ごとにカンマを入れる書式）',
                choices: [
                  '「money を読み込み中」→「1,234,567円」',
                  '「1,234,567円」だけ',
                  '「money を読み込み中」→「1,000円」→「1,234,567円」',
                  '「1,000円」→「1,234,567円」',
                ],
                answer: 0,
                hints: [
                  'import money で、money.py は上から実行されます。',
                  'money.py の直下の print は、import のときに動きますか？',
                  'import されたとき、money.py の __name__ は "__main__" ですか？',
                ],
                why: 'import で money.py が上から実行され「money を読み込み中」。__name__ は "money" なので if の中（1,000円）は動かない。最後に main.py の print で「1,234,567円」。',
              },
            ],
          },
          {
            id: 'python-6-2',
            title: 'デコレータの読み方',
            talk: [
              ['kujo', '関数の上の @log_call は、fee = log_call(fee) の省略形。元の関数を、ひと回り大きな関数で包んで差し替えるんだ。'],
              ['kujo', '数学で言えば合成関数。g(f(x)) みたいに、前後に処理を足す。ログ・リトライ・時間計測でよく使う。'],
              ['player', '包む側の中に wrapper があって、最後に return wrapper、が定番の形だな。'],
              ['kujo', 'そう。読むときは「wrapper の中で、元の func をいつ呼んで、何を返しているか」だけ見ればいい。……俺も毎朝、誰かに包んでもらって「社員証持った？」って前処理を足してほしい。'],
            ],
            figure: {
              title: '@ は包んで差し替える',
              text: String.raw` @log_call            fee = log_call(fee)
 def fee(...)    ＝   と同じ

 ┌── wrapper ───────────────┐
 │ print("呼び出し")   前処理│
 │ result = func(...)  元の  │
 │ print("結果")       後処理│
 │ return result             │
 └───────────────────────────┘`,
            },
            points: ['@deco は「関数 = deco(関数)」の省略形', 'デコレータは return wrapper（呼ばずに関数そのもの）を返す', 'wrapper は元の関数の結果を return しないと None になる'],
            quiz: [
              {
                id: 'python-6-2-q1', type: 'predict', title: 'ログつきの手数料', lang: 'python',
                code: String.raw`def log_call(func):
    def wrapper(*args, **kwargs):
        print("呼び出し:", func.__name__)
        result = func(*args, **kwargs)
        print("結果:", result)
        return result
    return wrapper

@log_call
def fee(amount):
    return 110 if amount >= 30000 else 0

fee(50000)`,
                q: '表示されるのは（2行を / で区切って表しています）？',
                choices: ['呼び出し: fee / 結果: 110', '呼び出し: wrapper / 結果: 110', '結果: 110 だけ', '呼び出し: fee / 結果: 0'],
                answer: 0,
                hints: [
                  '@log_call で、fee は wrapper に差し替わっています。',
                  'wrapper の中の func は、元の fee です。func.__name__ は？',
                  '50000 >= 30000 なので、元の fee は何を返しますか？',
                ],
                why: 'fee(50000) は wrapper を呼ぶ。func は元の fee なので名前は fee。元の fee は 50000 >= 30000 で 110 を返す。表示は「呼び出し: fee」「結果: 110」。',
              },
              {
                id: 'python-6-2-q2', type: 'fix', title: 'デコレータを付けた瞬間に落ちる', lang: 'python',
                story: '九条くんのリトライ用デコレータ。@retry を付けた関数を定義しただけで TypeError が出る。「呼んでもいないのに……俺の関数まで俺に似てきた」',
                code: String.raw`def retry(func):
    def wrapper(*args, **kwargs):
        for i in range(3):
            try:
                return func(*args, **kwargs)
            except TimeoutError:
                print("再試行", i + 1)
        raise TimeoutError("3回失敗しました")
    return wrapper()`,
                bugLine: 9,
                fixes: ['return wrapper', 'return func', 'return wrapper(*args, **kwargs)', 'return func()'],
                answer: 0,
                hints: [
                  '@retry は、定義した瞬間に retry(関数) を実行します。',
                  'retry が返すべきなのは「関数そのもの」ですか、「関数を呼んだ結果」ですか？',
                  'かっこを付けると、その場で呼び出してしまいます。',
                  'return func だと、包まずに元の関数を返すのでリトライが効きません。',
                ],
                why: '9行目の wrapper() は、デコレータを付けた瞬間に wrapper を呼んでしまい、引数なしで元の関数が呼ばれて TypeError になる。関数そのものを返す return wrapper が正しい。return func では包まないのでリトライされない。',
              },
            ],
          },
          {
            id: 'python-6-3',
            title: 'ジェネレータ yield と async / await',
            talk: [
              ['kujo', 'yield がある関数はジェネレータ。呼んでもすぐには中身が動かず、for で1つ取り出すたびに、次の yield まで進んで止まる。AI の返答を少しずつ流すストリーミングで見る形。'],
              ['kujo', 'async def の関数は、呼んだだけでは動かない「コルーチン」を返す。await を付けて初めて動いて、待っている間はほかの仕事に順番をゆずる。'],
              ['player', 'じゃあ async の中で await を付け忘れたら……。'],
              ['kujo', '結果じゃなくて「まだ動いてない約束」が入る。それと async の中で time.sleep みたいな普通の待ちをすると、全員を止める。待つなら await asyncio.sleep。俺が会議室の鍵を持ったまま帰るのと同じで、みんなが待たされる。'],
            ],
            figure: {
              title: 'yield は止まって渡す',
              text: String.raw` gen = stream()   ← まだ何も動かない
 for c in gen:
   1周目 → "お"   まで進んで止まる
   2周目 → "金の" まで進んで止まる
   3周目 → "相談" まで進んで止まる
 ───────────────────────────────
 async def ask()  → 呼ぶとコルーチン
 r = await ask()  → 動いて結果が入る
 r = ask()        → 結果ではない！`,
            },
            code: {
              lang: 'python',
              text: String.raw`import asyncio

async def ask_ai(text):
    await asyncio.sleep(1)       # 待つ間、ほかの処理に順番をゆずる
    return "返答: " + text

async def main():
    reply = await ask_ai("残高は？")   # await で結果を受け取る
    print(reply)`,
            },
            points: ['yield のある関数はジェネレータ。取り出すたびに次の yield まで進む', 'async def は呼ぶだけでは動かない。await で動かして結果を受け取る', 'async の中で time.sleep などの普通の待ちをすると、全体が止まる'],
            quiz: [
              {
                id: 'python-6-3-q1', type: 'predict', title: '少しずつ流れる返答', lang: 'python',
                code: String.raw`def stream_reply():
    print("生成開始")
    yield "お"
    yield "金の"
    yield "相談ですね"

gen = stream_reply()
print("まだ")
for chunk in gen:
    print(chunk, end="|")`,
                q: '表示される順番は？（end="|" は改行の代わりに | を付ける）',
                choices: [
                  'まだ → 生成開始 → お|金の|相談ですね|',
                  '生成開始 → まだ → お|金の|相談ですね|',
                  'まだ → お|金の|相談ですね|（生成開始は出ない）',
                  '生成開始 → お|金の|相談ですね| → まだ',
                ],
                answer: 0,
                hints: [
                  'yield のある関数は、呼んだだけでは中身が動きません。',
                  '7行目の時点では、まだ「生成開始」は表示されていません。',
                  'for で最初の1つを取り出すときに、関数の先頭から最初の yield まで進みます。',
                ],
                why: 'stream_reply() はジェネレータを作るだけで中身は動かない。先に「まだ」。for の1周目で先頭から最初の yield まで進むので「生成開始」→「お|」。以降「金の|」「相談ですね|」。',
              },
              {
                id: 'python-6-3-q2', type: 'review', title: '非同期のまとめ問い合わせ', by: 'kujo', lang: 'python',
                story: '九条くんの PR。「複数の質問をまとめて AI に投げる関数を書いた。……{onizuka}に見せたら『はぁ？』って言われた」。{onizuka}「2か所だけな。5分で見ろ」',
                file: 'ai/batch.py',
                code: String.raw`import asyncio
import time

async def ask_ai(text):
    await asyncio.sleep(1)
    return "返答: " + text

async def handle(texts):
    results = []
    for t in texts:
        time.sleep(1)
        results.append(ask_ai(t))
    return results`,
                defects: [
                  { line: 11, kind: 'perf', why: 'async の中で time.sleep は、その間ほかの処理を全部止める。待つなら await asyncio.sleep。' },
                  { line: 12, kind: 'bug', why: 'await が無いので、返答ではなくまだ動いていないコルーチンが入る。await ask_ai(t) にする。' },
                ],
                hints: [
                  '{onizuka}は「2か所」と言っています。',
                  'async def の関数を呼ぶとき、何が必要でしたか？',
                  'results に入るのは、返答の文字列ですか？',
                  'async の中での「待ち方」は2種類あります。全体を止めてしまうのはどちら？',
                ],
                why: '11行目の time.sleep はイベントループごと止めて、ほかのお客さんの処理まで待たせる（perf）。12行目は await が無く、返答の代わりにコルーチンが入る（bug）。5行目の await asyncio.sleep は正しい待ち方。',
              },
            ],
          },
        ],
      },
    ],
  });
})(globalThis);
