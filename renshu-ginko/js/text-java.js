/*
 * 言語テキスト: Java（先生役は神崎 理央）。形は js/texts.js の先頭の説明を参照。コードは String.raw で書く。
 */
(function (g) {
  'use strict';
  const T = g.RGA.texts;

  T.addCourse({
    id: 'java',
    name: 'Java',
    icon: '☕',
    teacher: 'rio',
    intro: '練習銀行の勘定系 API は Java で書かれている。クラス・コンストラクタ・継承・インターフェース・例外……「全部読める」ようになれば、ハッカソンのレビューもぐっと楽になる。',
    chapters: [
      {
        id: 'java-1',
        title: 'クラスとコンストラクタ',
        badge: { icon: '🏗️', name: '設計図マスター' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント10「勘定系API（Java）とつなぐ」'],
          knowledge: ['変数と型（int・String）', 'メソッドの呼び出し'],
          talk: [
            ['rio', '{player}、Java の章を始めるぞ。勘定系のコードは全部クラスでできてるから、まずはクラスとコンストラクタから。'],
            ['rio', 'この章で使うのは「変数と型」「メソッドの呼び出し」だけ。院でやったことの復習だと思って気楽にいこう。'],
          ],
        },
        sections: [
          {
            id: 'java-1-1',
            title: 'クラスは設計図、オブジェクトは実物',
            talk: [
              ['rio', 'クラスは「口座とはこういうもの」という設計図。new すると、設計図から実物（オブジェクト）が1つできる。'],
              ['player', '設計図が1枚でも、口座はいくつでも作れるってことか。'],
              ['rio', 'そう。しかも実物どうしは別々の値を持つ。Aさんの口座に入金しても、Bさんの残高は変わらない。'],
            ],
            figure: {
              title: 'クラスとオブジェクト',
              text: String.raw`  ┌──────── class Account（設計図）────────┐
  │  フィールド: owner, balance            │
  │  メソッド:   deposit(), getBalance()    │
  └───────────────┬────────────────────────┘
          new     │      new
     ┌────────────┴────────────┐
     ▼                         ▼
  ┌─ a ──────────┐       ┌─ b ──────────┐
  │ owner="Aさん" │       │ owner="Bさん" │
  │ balance=1000 │       │ balance=500  │
  └──────────────┘       └──────────────┘`,
            },
            code: {
              lang: 'java',
              text: String.raw`Account a = new Account("Aさん", 1000);
Account b = new Account("Bさん", 500);
a.deposit(300);   // a だけが 1300 になる`,
            },
            points: ['クラス = 設計図、オブジェクト = new で作った実物', 'オブジェクトはそれぞれ自分のフィールドの値を持つ'],
            quiz: [
              {
                id: 'java-1-1-q1', type: 'predict', title: '2つの口座', lang: 'java',
                code: String.raw`Account a = new Account("Aさん", 1000);
Account b = new Account("Bさん", 500);
a.deposit(300);
System.out.println(a.getBalance() + " " + b.getBalance());`,
                q: '表示されるのは？',
                choices: ['1300 500', '1300 800', '1000 500', '1800 1800'],
                answer: 0,
                hints: [
                  'a と b は、同じ設計図から作った別々の実物です。',
                  'deposit を呼んだのはどちらのオブジェクトですか？',
                  'b の残高は、誰にも触られていません。',
                ],
                why: 'a と b は別々のオブジェクトなので、a.deposit(300) で変わるのは a の残高だけ。a は 1300、b は 500 のまま。',
              },
            ],
          },
          {
            id: 'java-1-2',
            title: 'コンストラクタと this',
            talk: [
              ['rio', 'new したときに最初に1回だけ動くのがコンストラクタ。クラスと同じ名前で、戻り値の型を書かないのが目印。'],
              ['rio', '引数とフィールドが同じ名前のときは this.balance = balance; と書く。this は「今作っている自分自身」だ。'],
              ['player', 'this を付け忘れると？'],
              ['rio', 'balance = balance; は「引数に引数を入れる」だけで、フィールドは 0 のまま。コンパイルは通るから、レビューで見つけるしかない。勘定系で実際に見たことあるぞ、これ。'],
            ],
            figure: {
              title: 'this が指すもの',
              text: String.raw`  new Account("Aさん", 1000)
          │
          ▼
  Account(String owner, long balance) {
      this.owner   = owner;     ← 左: 自分のフィールド / 右: 引数
      this.balance = balance;
  }`,
            },
            code: {
              lang: 'java',
              text: String.raw`public class Account {
    private final String owner;
    private long balance;

    public Account(String owner, long balance) {
        this.owner = owner;
        this.balance = balance;
    }
}`,
            },
            points: ['コンストラクタはクラスと同じ名前・戻り値の型なし・new のときに1回動く', '引数とフィールドが同名なら this. を付けてフィールドを指す'],
            quiz: [
              {
                id: 'java-1-2-q1', type: 'fix', title: '残高が 0 になる口座', lang: 'java',
                story: '大地くんの PR。「1000円で口座を作ったのに、残高が 0 と表示される」とテストが落ちている。',
                code: String.raw`public class Account {
    private final String owner;
    private long balance;

    public Account(String owner, long balance) {
        this.owner = owner;
        balance = balance;
    }

    public long getBalance() {
        return balance;
    }
}`,
                bugLine: 7,
                fixes: ['this.balance = balance;', 'long balance = balance;', 'balance = this.balance;', 'return balance;'],
                answer: 0,
                hints: [
                  'コンストラクタの中で、フィールドに値を入れているのはどの行ですか？',
                  '6行目と7行目を見比べてみましょう。違いは何でしょう？',
                  '引数と同じ名前のとき、ただの balance は引数を指します。',
                  'フィールドを指すには、何を付ければよいでしたか？',
                ],
                why: '7行目の balance = balance; は引数に引数を入れているだけで、フィールドは初期値の 0 のまま。this.balance = balance; と書いてフィールドに入れる。',
              },
            ],
          },
          {
            id: 'java-1-3',
            title: 'コンストラクタを複数用意する（オーバーロード）',
            talk: [
              ['rio', 'コンストラクタは引数の違うものを複数書ける。これをオーバーロードという。'],
              ['rio', 'this(...) と書くと、別のコンストラクタを呼べる。初期化の処理を1か所にまとめられるから、勘定系ではよく見る書き方だ。'],
              ['player', 'this.フィールド の this とは別物なんだな。'],
              ['rio', 'そう。this(...) は「自分の別のコンストラクタを呼ぶ」。コンストラクタの1行目にしか書けないのも覚えておくと読みやすい。'],
            ],
            code: {
              lang: 'java',
              text: String.raw`public Account(String owner) {
    this(owner, 0);          // 残高 0 で作る
}

public Account(String owner, long balance) {
    this.owner = owner;
    this.balance = balance;
}`,
            },
            points: ['引数の違うコンストラクタを複数書ける（オーバーロード）', 'this(...) は別のコンストラクタを呼ぶ。1行目にだけ書ける'],
            quiz: [
              {
                id: 'java-1-3-q1', type: 'predict', title: '呼ばれるコンストラクタ', lang: 'java',
                code: String.raw`public class Account {
    private long balance;
    private String plan;

    public Account() {
        this(1000);
        plan = "standard";
    }

    public Account(long balance) {
        this.balance = balance;
        this.plan = "basic";
    }

    public String describe() {
        return plan + ":" + balance;
    }
}

// 別の場所で
System.out.println(new Account().describe());`,
                q: '表示されるのは？',
                choices: ['standard:1000', 'basic:1000', 'standard:0', 'basic:0'],
                answer: 0,
                hints: [
                  'new Account() は、引数なしのコンストラクタを呼びます。',
                  'その1行目の this(1000) で、もう1つのコンストラクタが先に動きます。',
                  'そのあと、引数なしのコンストラクタの2行目に戻ってきます。',
                  '最後に plan に入った値はどちらでしょう？',
                ],
                why: 'this(1000) で balance=1000・plan="basic" になったあと、戻ってきて plan = "standard" で上書きされる。結果は standard:1000。',
              },
            ],
          },
        ],
      },
    ],
  });
})(globalThis);
