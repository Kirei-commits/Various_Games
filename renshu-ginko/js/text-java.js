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
              text: String.raw`  ┌─────── class Account（設計図）────────┐
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
              text: String.raw`new Account("Aさん", 1000)
        │
        ▼
Account(String owner, long balance) {
  this.owner   = owner;
  this.balance = balance;
}   ↑ 左: 自分のフィールド
          ↑ 右: 引数`,
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
      {
        id: 'java-2',
        title: 'カプセル化',
        badge: { icon: '🔒', name: '金庫番' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント16「ログに個人情報を残さない」'],
          knowledge: ['Java 1章「クラスとコンストラクタ」', 'this と フィールド'],
          talk: [
            ['rio', '2章はカプセル化。要するに「口座の中身を勝手にいじらせない」話な。'],
            ['rio', '1章のクラスとコンストラクタが読めれば大丈夫。スプリント6でまどかのPRに出てきた罠も、ここで種明かしするぞ。'],
          ],
        },
        sections: [
          {
            id: 'java-2-1',
            title: 'private と public、getter・setter',
            talk: [
              ['rio', 'フィールドに public を付けると、外から account.balance = 999999999; って書けちゃう。銀行としては最悪だろ？'],
              ['player', '自分の残高を自分で書き換えられる銀行……ちょっと住みたいけど、絶対ダメだな。'],
              ['rio', 'だからフィールドは private にして、外からは getter（読む）と setter（書く）のメソッドだけ通す。setter の中で「マイナスはお断り」みたいな関所を作れるのがポイント。'],
              ['rio', 'ちなみに院でさんざん「全部 public でいいじゃん」って言ってたやつ、だいたい後で泣いてたよな（笑）'],
            ],
            figure: {
              title: '外から触れるのは窓口だけ',
              text: String.raw`  外のコード
     │  getBalance()  setBalance()
     ▼
  ┌──── public（窓口）─────┐
  │ ┌── private（金庫）──┐ │
  │ │ balance = 1000     │ │
  │ └────────────────────┘ │
  └────────────────────────┘
  account.balance = 5;  → コンパイルエラー`,
            },
            code: {
              lang: 'java',
              text: String.raw`public class Account {
    private long balance;

    public long getBalance() {
        return balance;
    }

    public void setBalance(long balance) {
        if (balance < 0) return;   // 関所
        this.balance = balance;
    }
}`,
            },
            points: ['フィールドは private、外から使わせたいメソッドだけ public', 'getter は読むだけ、setter は書く前に値を確かめられる'],
            quiz: [
              {
                id: 'java-2-1-q1', type: 'predict', title: '関所のある setter', lang: 'java',
                code: String.raw`public class Account {
    private long balance;

    public long getBalance() {
        return balance;
    }

    public void setBalance(long balance) {
        if (balance < 0) return;
        this.balance = balance;
    }
}

// 別の場所で
Account a = new Account();
a.setBalance(1000);
a.setBalance(-500);
System.out.println(a.getBalance());`,
                q: '表示されるのは？',
                choices: ['1000', '-500', '500', '0'],
                answer: 0,
                hints: [
                  'setBalance は2回呼ばれています。1回ずつ追いましょう。',
                  '1回目の 1000 は、if の条件に引っかかりますか？',
                  '2回目の -500 は、if の条件 balance < 0 に当てはまります。',
                  'return すると、その下の代入は実行されません。',
                ],
                why: '1回目で balance は 1000 になる。2回目は -500 < 0 なので return し、代入されない。残高は 1000 のまま。',
              },
            ],
          },
          {
            id: 'java-2-2',
            title: 'final と不変オブジェクト',
            talk: [
              ['rio', 'final は「一度入れたら入れ替え禁止」の印。final long yen; なら、コンストラクタで入れた後は二度と変わらない。'],
              ['player', 'じゃあ final List<String> list なら、リストの中身も変わらない？'],
              ['rio', 'そこが引っかけ。final が守るのは「どのリストを指すか」だけで、リストの中身の add はできちゃう。箱のラベルは貼り替え禁止だけど、箱の中身は出し入れ自由、みたいな。'],
              ['rio', 'お金みたいな値は、中身を変えずに「新しいオブジェクトを返す」作りにするのが定番。これを不変オブジェクトっていう。String もこれだぞ。'],
            ],
            figure: {
              title: '不変オブジェクトの plus',
              text: String.raw`  a ──▶ ┌ Money ┐
         │ 100   │   a.plus(50)
         └───────┘──────────┐
                           ▼ new
  b ──▶ ┌ Money ┐
         │ 150   │   a は 100 のまま
         └───────┘`,
            },
            code: {
              lang: 'java',
              text: String.raw`public final class Money {
    private final long yen;

    public Money(long yen) {
        this.yen = yen;
    }

    public Money plus(long add) {
        return new Money(yen + add);   // 自分は変えない
    }

    public long yen() {
        return yen;
    }
}`,
            },
            points: ['final のフィールドは、コンストラクタで入れた後は入れ替えられない', 'final は「指す先」を固定するだけ。リストの中身は変えられる', '不変オブジェクトは、変更の代わりに新しいオブジェクトを返す'],
            quiz: [
              {
                id: 'java-2-2-q1', type: 'predict', title: '増えたのはどっち？', lang: 'java',
                code: String.raw`Money a = new Money(100);
Money b = a.plus(50);
System.out.println(a.yen() + " " + b.yen());`,
                q: '上の Money クラスを使ったとき、表示されるのは？',
                choices: ['100 150', '150 150', '150 100', '100 100'],
                answer: 0,
                hints: [
                  'plus の中身をもう一度見ましょう。yen に代入していますか？',
                  'plus は new Money(...) を返しています。',
                  'a が指しているオブジェクトは、一度も書き換えられていません。',
                ],
                why: 'plus は自分の yen を変えず、新しい Money(150) を作って返す。a は 100 のまま、b は 150。',
              },
              {
                id: 'java-2-2-q2', type: 'predict', title: 'final なリスト', lang: 'java',
                code: String.raw`final List<String> names = new ArrayList<>();
names.add("Aさん");
names.add("Bさん");
System.out.println(names.size());`,
                q: 'どうなる？',
                choices: ['2 と表示される', 'コンパイルエラー（final なので add できない）', '0 と表示される', '実行時に例外が出る'],
                answer: 0,
                hints: [
                  'final が禁止しているのは何でしたか？',
                  'names = new ArrayList<>(); のような「入れ替え」は禁止です。では add は？',
                  'add はリストの中身を変えるだけで、names が指す先は同じです。',
                ],
                why: 'final は names が別のリストを指すことを禁止するだけ。中身への add はできるので、size は 2。中身も守りたいなら List.of や List.copyOf の変更できないリストを使う。',
              },
            ],
          },
          {
            id: 'java-2-3',
            title: '内部のリストをそのまま返す罠',
            talk: [
              ['rio', 'カプセル化の最大の落とし穴がこれ。フィールドは private なのに、getter で中のリストをそのまま返すやつ。'],
              ['player', 'private にしたんだから安全じゃないの？'],
              ['rio', '金庫の鍵を窓口でそのまま渡してるのと同じ。受け取った側が add も clear もできる。スプリント6のまどかのPRで指摘したの、覚えてる？'],
              ['player', 'あー、50件の上限を素通りされるやつか。'],
              ['rio', 'それ。返すなら List.copyOf(...) で写しを渡す。これ見つけられたら、帰りラーメンおごるわ。'],
            ],
            figure: {
              title: 'そのまま返す vs 写しを返す',
              text: String.raw`  return items;
  ┌ Cart ┐        ┌ 呼び出し側 ┐
  │items─┼──▶[A,B]◀┼─got        │
  └──────┘        └────────────┘
   got.add() で Cart の中身も変わる

  return List.copyOf(items);
  items ──▶ [A,B]   got ──▶ [A,B]
           本物           写し（変更不可）`,
            },
            code: {
              lang: 'java',
              text: String.raw`public List<String> getItems() {
    return List.copyOf(items);   // 写しを返す
}`,
            },
            points: ['getter で中のリストを返すと、外から中身を変えられてしまう', 'List.copyOf などで写し（変更できないリスト）を返す'],
            quiz: [
              {
                id: 'java-2-3-q1', type: 'predict', title: 'カートの中身', lang: 'java',
                code: String.raw`public class Cart {
    private final List<String> items = new ArrayList<>();

    public void add(String item) {
        items.add(item);
    }

    public List<String> getItems() {
        return items;
    }

    public int count() {
        return items.size();
    }
}

// 別の場所で
Cart c = new Cart();
c.add("定期預金");
List<String> got = c.getItems();
got.add("外貨預金");
System.out.println(c.count());`,
                q: '表示されるのは？',
                choices: ['2', '1', '0', 'コンパイルエラー'],
                answer: 0,
                hints: [
                  'getItems は何を返していますか？ 写しですか、本物ですか？',
                  'got と items は、同じリストを指しています。',
                  'got.add は、Cart の中のリストに追加するのと同じことです。',
                ],
                why: 'getItems は中のリストそのものを返すので、got.add("外貨預金") で Cart の中身も 2 件になる。private でも、参照を渡せば外から変えられる。',
              },
              {
                id: 'java-2-3-q2', type: 'review', title: '大地くんのPR: 振込上限', lang: 'java',
                story: '{daichi}「1日の振込上限を持つクラスです！ マイナスはちゃんと弾いてます！」仕様は「上限は1円〜100万円」。',
                file: 'core/src/main/java/bank/TransferLimit.java',
                code: String.raw`public final class TransferLimit {
    private long dailyLimit;
    private final List<Long> history = new ArrayList<>();

    public TransferLimit(long dailyLimit) {
        setDailyLimit(dailyLimit);
    }

    public void setDailyLimit(long dailyLimit) {
        if (dailyLimit < 0) throw new IllegalArgumentException("上限が不正");
        this.dailyLimit = dailyLimit;
    }

    public void record(long amount) {
        history.add(amount);
    }

    public List<Long> getHistory() {
        return history;
    }

    public long getDailyLimit() {
        return dailyLimit;
    }
}`,
                defects: [
                  { line: 10, kind: 'spec', why: '仕様は1円〜100万円なのに、0 円も 1000 万円も通ってしまう。dailyLimit < 1 || dailyLimit > 1_000_000 を弾く。' },
                  { line: 19, kind: 'bug', why: '振込履歴のリストをそのまま返している。外から add や clear をされると、上限の判定に使う履歴が書き換わる。List.copyOf(history) で写しを返す。' },
                ],
                hints: [
                  'story に書かれた仕様と、setter の関所の条件を比べましょう。',
                  '0 円や 500 万円を渡したら、関所は止めてくれますか？',
                  'getter が返しているものは、本物ですか写しですか？',
                  '履歴を外から clear されたら、上限の判定はどうなるでしょう？',
                ],
                why: '関所の条件が仕様（1円〜100万円）とずれている。さらに getHistory が内部のリストをそのまま返していて、カプセル化が破れている。条件を仕様どおりにし、写しを返す。',
              },
            ],
          },
        ],
      },
      {
        id: 'java-3',
        title: '継承とオーバーライド',
        badge: { icon: '🧬', name: '親子三代' },
        handout: {
          units: ['ハッカソン スプリント10「勘定系API（Java）とつなぐ」', 'ハッカソン スプリント11「コンフリクト祭り」'],
          knowledge: ['Java 1章「クラスとコンストラクタ」（this(...)）', 'Java 2章「カプセル化」（private）'],
          talk: [
            ['rio', '3章は継承。勘定系は Account を親にして、普通預金・定期預金……って子クラスがわらわらいる。'],
            ['rio', '1章の this(...) と、2章の private が分かってれば読める。super は this の親戚だと思っとけ。'],
          ],
        },
        sections: [
          {
            id: 'java-3-1',
            title: 'extends と super(...)',
            talk: [
              ['rio', 'class SavingsAccount extends Account って書くと、Account の中身を全部引き継いだ子クラスになる。'],
              ['player', 'コピペしなくていいのは楽だな。'],
              ['rio', 'で、子のコンストラクタは、まず親のコンストラクタを呼ぶ決まり。それが super(...)。this(...) と同じで1行目にしか書けない。'],
              ['rio', '書かなかったら Java が勝手に super(); を差し込む。親に引数なしのコンストラクタがないと、そこでコンパイルエラー。新人がよく踏むやつな。'],
            ],
            figure: {
              title: '口座クラスの家系図',
              text: String.raw`           ┌──────────────┐
           │   Account    │  owner
           └──────┬───────┘
          extends │ extends
        ┌─────────┴─────────┐
        ▼                   ▼
  ┌───────────────┐ ┌─────────────┐
  │SavingsAccount │ │ TimeDeposit │
  │ rate          │ │ months      │
  └───────────────┘ └─────────────┘`,
            },
            code: {
              lang: 'java',
              text: String.raw`public class SavingsAccount extends Account {
    private final double rate;

    public SavingsAccount(String owner, double rate) {
        super(owner);        // 先に親を作る
        this.rate = rate;
    }
}`,
            },
            points: ['extends で親クラスの中身を引き継ぐ', '子のコンストラクタは1行目で super(...) を呼ぶ。書かないと super(); が自動で入る'],
            quiz: [
              {
                id: 'java-3-1-q1', type: 'fix', title: 'コンパイルが通らない子クラス', lang: 'java',
                story: '自分のコード。普通預金のクラスを足したら「constructor Account in class Account cannot be applied to given types」と怒られた。',
                code: String.raw`public class Account {
    protected final String owner;

    public Account(String owner) {
        this.owner = owner;
    }
}

public class SavingsAccount extends Account {
    private final double rate;

    public SavingsAccount(String owner, double rate) {
        super();
        this.rate = rate;
    }
}`,
                bugLine: 13,
                fixes: ['super(owner);', 'this(owner);', 'super.owner = owner;', 'Account(owner);'],
                answer: 0,
                hints: [
                  '親の Account には、どんなコンストラクタがありますか？',
                  'Account に引数なしのコンストラクタはありません。',
                  '子の13行目は、親のどのコンストラクタを呼ぼうとしていますか？',
                  '親に owner を渡して作ってもらうには、何と書けばよいでしょう？',
                ],
                why: 'Account には Account(String owner) しかないので、super(); は呼べる相手がいない。super(owner); で親に owner を渡す。owner は final なので、親のコンストラクタで入れるしかない。',
              },
            ],
          },
          {
            id: 'java-3-2',
            title: 'コンストラクタの呼ばれる順番',
            talk: [
              ['rio', 'new 子() したとき、どの順で動くか。答えは「ご先祖さまから順番に」。'],
              ['player', '親がいないと子は生まれない、か。急に深いな。'],
              ['rio', 'だろ（笑）。細かく言うと、super(...) が終わった直後に子のフィールドの初期化が走って、それから子のコンストラクタの残りが動く。'],
              ['rio', 'この順番、勘定系の初期化ログを読むときに地味に効くから覚えとけ。'],
            ],
            figure: {
              title: 'new Leaf() の流れ',
              text: String.raw`  new Leaf()
     │ Leaf() の1行目 super()
     ▼
  Mid() の1行目 super()
     │
     ▼
  Base() ── 本体を実行 ──▶ "A"
     │ 戻る
  Mid()  ── フィールド初期化 → 本体 ──▶ "B"
     │ 戻る
  Leaf() ── フィールド初期化 → 本体 ──▶ "C"`,
            },
            points: ['親のコンストラクタ → 子のフィールド初期化 → 子のコンストラクタの本体、の順', 'super(...) を書いていなくても、親のコンストラクタは必ず先に動く'],
            quiz: [
              {
                id: 'java-3-2-q1', type: 'predict', title: '三代の口座', lang: 'java',
                code: String.raw`class Base {
    Base() { System.out.println("A"); }
}

class Mid extends Base {
    Mid() { System.out.println("B"); }
}

class Leaf extends Mid {
    Leaf() {
        super();
        System.out.println("C");
    }
}

// 別の場所で
new Leaf();`,
                q: '表示される順番は？',
                choices: ['A → B → C', 'C → B → A', 'C だけ', 'A → C'],
                answer: 0,
                hints: [
                  'Leaf() の1行目で super() が呼ばれます。どこへ行きますか？',
                  'Mid() には super() が書いてありませんが、自動で入ります。',
                  'いちばん先に本体が動くのは、いちばん上の親です。',
                ],
                why: 'Leaf() → Mid() → Base() と上へ呼び、Base の本体から順に戻ってくる。表示は A → B → C。Mid に super() を書いていなくても自動で入る。',
              },
              {
                id: 'java-3-2-q2', type: 'predict', title: 'フィールドはいつ入る？', lang: 'java',
                code: String.raw`class Parent {
    Parent() { System.out.println("親"); }
}

class Child extends Parent {
    private String name = init();

    Child() { System.out.println("子"); }

    private String init() {
        System.out.println("フィールド");
        return "x";
    }
}

// 別の場所で
new Child();`,
                q: '表示される順番は？',
                choices: ['親 → フィールド → 子', 'フィールド → 親 → 子', '親 → 子 → フィールド', 'フィールド → 子 → 親'],
                answer: 0,
                hints: [
                  'Child() の1行目には、見えない super(); があります。',
                  'フィールドの初期化（name = init()）は、super(...) が終わった直後に走ります。',
                  'Child() の本体の println は、いちばん最後です。',
                ],
                why: 'まず自動の super() で親の本体が動き「親」。次に子のフィールド初期化で init() が呼ばれ「フィールド」。最後に Child() の本体で「子」。',
              },
            ],
          },
          {
            id: 'java-3-3',
            title: 'オーバーライド・super.method()・protected',
            talk: [
              ['rio', '子で親と同じ名前・同じ引数のメソッドを書くと、上書きできる。これがオーバーライド。'],
              ['rio', '上に @Override を付けるのがお作法。付けておくと、引数の型をミスったときにコンパイラが「それ上書きになってないよ」って止めてくれる。'],
              ['player', '付けないと？'],
              ['rio', '別物の新メソッドとして静かに追加される（オーバーロード）。手数料無料のはずが普通に取られて、お客さまセンターが炎上。super.fee() は「親の版を呼ぶ」、protected は「子クラスからは見える」な。'],
            ],
            code: {
              lang: 'java',
              text: String.raw`class Account {
    protected long fee() { return 200; }
}

class PremiumAccount extends Account {
    @Override
    protected long fee() {
        return super.fee() / 2;   // 親の版の半額
    }
}`,
            },
            points: ['オーバーライド = 同じ名前・同じ引数で親のメソッドを上書き', '@Override を付けると、上書きになっていないときにコンパイルエラーで気づける', 'super.メソッド() で親の版を呼べる。protected は子クラスから見える'],
            quiz: [
              {
                id: 'java-3-3-q1', type: 'predict', title: '親のメソッドから呼ぶと', lang: 'java',
                code: String.raw`class Account {
    long fee() { return 200; }

    String info() { return "手数料" + fee(); }
}

class PremiumAccount extends Account {
    @Override
    long fee() { return super.fee() - 200; }
}

// 別の場所で
PremiumAccount p = new PremiumAccount();
System.out.println(p.info());`,
                q: '表示されるのは？',
                choices: ['手数料0', '手数料200', '手数料-200', '手数料400'],
                answer: 0,
                hints: [
                  'info() は PremiumAccount には書かれていないので、親の info() が動きます。',
                  'では、親の info() の中の fee() はどちらの版でしょう？',
                  'オブジェクトの正体は PremiumAccount です。上書きされた版が呼ばれます。',
                  'super.fee() は 200 です。',
                ],
                why: 'info() は親から引き継いだものだが、中の fee() はオブジェクトの正体（PremiumAccount）の版が呼ばれる。super.fee() - 200 = 0 なので「手数料0」。',
              },
              {
                id: 'java-3-3-q2', type: 'review', title: 'ひかりのPR: ゴールド口座', lang: 'java',
                story: '{hikari}「ゴールド会員は振込手数料ゼロ円！ ポイントも貯まるよ✨」親クラス Account には protected long calcFee(long amount) がある。',
                file: 'core/src/main/java/bank/GoldAccount.java',
                code: String.raw`// 親クラス Account には protected long calcFee(long amount) がある
public class GoldAccount extends Account {
    public int point;

    public GoldAccount(String owner) {
        super(owner);
    }

    // ゴールド会員は振込手数料が無料
    public long calcFee(int amount) {
        return 0;
    }

    public void ap(int p) {
        point = point + p;
    }
}`,
                defects: [
                  { line: 3, kind: 'security', why: 'ポイントが public で、外のコードから point = 99999999; と書き換えられる。private にして、増やす口はメソッドだけにする。' },
                  { line: 10, kind: 'bug', why: '親は calcFee(long)、こちらは calcFee(int) で引数の型が違う。上書きではなく別のメソッドが増えただけで、Account として扱われると親の手数料が取られる。long にして @Override を付ける。' },
                  { line: 14, kind: 'readability', why: 'ap では何をするメソッドか読めない。addPoint のように、していることが分かる名前にする。' },
                ],
                hints: [
                  'フィールドの印を見ましょう。外から変えられて困るものは？',
                  '親の calcFee と、子の calcFee の引数の型を見比べましょう。',
                  '@Override が付いていたら、コンパイラは何と言ったでしょう？',
                  'メソッドの名前だけで、何をするか分かりますか？',
                ],
                why: 'ポイントは private にする。calcFee は引数の型が違うので上書きになっておらず、手数料無料が効かない（@Override があれば気づけた）。ap は addPoint のような名前にする。',
              },
            ],
          },
        ],
      },
      {
        id: 'java-4',
        title: 'インターフェースと抽象クラス・ポリモーフィズム',
        badge: { icon: '🎭', name: '変身の達人' },
        handout: {
          units: ['ハッカソン スプリント10「勘定系API（Java）とつなぐ」', 'ハッカソン スプリント18「揺れるテスト」'],
          knowledge: ['Java 3章「継承とオーバーライド」', '@Override'],
          talk: [
            ['rio', '4章はインターフェースと抽象クラス。勘定系クライアントを本物とテスト用で差し替えられるのも、この仕組みのおかげ。'],
            ['rio', '3章のオーバーライドが分かってれば、あとは「親の型の箱に子を入れる」だけだ。'],
          ],
        },
        sections: [
          {
            id: 'java-4-1',
            title: 'interface と implements',
            talk: [
              ['rio', 'interface は「このメソッドを持ってること」っていう約束だけを書いたもの。中身は書かない。'],
              ['rio', 'class NormalFee implements FeePolicy で「約束守ります」と宣言して、中身を書く。'],
              ['player', 'コンセントの形だけ決めといて、挿す家電は何でもいい、みたいな？'],
              ['rio', 'そう、それ。呼ぶ側は FeePolicy の型で持つから、中身が通常料金でも無料キャンペーンでも同じように呼べる。'],
            ],
            figure: {
              title: '約束と、それを守るクラス',
              text: String.raw`       ┌── interface FeePolicy ──┐
       │ long fee(long amount)   │
       └────────────┬────────────┘
         implements │ implements
        ┌───────────┴──────────┐
        ▼                      ▼
  ┌─────────────┐      ┌─────────────┐
  │ NormalFee   │      │ FreeFee     │
  │ 3万未満220円│      │ いつも0円   │
  └─────────────┘      └─────────────┘`,
            },
            code: {
              lang: 'java',
              text: String.raw`interface FeePolicy {
    long fee(long amount);
}

class NormalFee implements FeePolicy {
    public long fee(long amount) {
        return amount >= 30000 ? 0 : 220;
    }
}

class FreeFee implements FeePolicy {
    public long fee(long amount) {
        return 0;
    }
}`,
            },
            points: ['interface はメソッドの約束だけを書く', 'implements したクラスが中身を書く', '呼ぶ側は interface の型で持てば、中身を差し替えられる'],
            quiz: [
              {
                id: 'java-4-1-q1', type: 'predict', title: '手数料の合計', lang: 'java',
                code: String.raw`FeePolicy[] policies = {
    new NormalFee(),
    new FreeFee(),
    new NormalFee()
};
long total = 0;
for (FeePolicy p : policies) {
    total += p.fee(10000);
}
System.out.println(total);`,
                q: '上の NormalFee・FreeFee を使ったとき、表示されるのは？',
                choices: ['440', '660', '0', '220'],
                answer: 0,
                hints: [
                  '配列には3つ入っています。それぞれの正体は何ですか？',
                  'NormalFee は、10000 円のとき何円返しますか？（3万円以上かどうか）',
                  'FreeFee はいつも 0 円です。',
                ],
                why: '10000 は 3万未満なので NormalFee は 220、FreeFee は 0。220 + 0 + 220 = 440。同じ p.fee(...) でも、中身の正体によって動きが変わる。',
              },
            ],
          },
          {
            id: 'java-4-2',
            title: 'abstract クラス',
            talk: [
              ['rio', 'abstract クラスは「途中まで書いてある設計図」。共通の処理は書いておいて、違うところだけ abstract メソッドにして子に任せる。'],
              ['player', '穴あきプリントみたいだな。'],
              ['rio', 'うまい。で、穴あきのままじゃ使えないから、abstract クラスは new できない。必ず穴を埋めた子クラスを new する。'],
              ['rio', '通知の送り方は共通、頭に付ける文字だけメールとアプリで違う……みたいなときに便利。'],
            ],
            figure: {
              title: '穴あきプリント',
              text: String.raw`  ┌── abstract class Notifier ──┐
  │ send(msg):                  │
  │   println(prefix() + msg)   │
  │ abstract prefix()  ← 穴     │
  └──────────────┬──────────────┘
        ┌────────┴────────┐
        ▼                 ▼
  MailNotifier       PushNotifier
  prefix="[メール]"  prefix="[通知]"`,
            },
            code: {
              lang: 'java',
              text: String.raw`abstract class Notifier {
    public final void send(String msg) {
        System.out.println(prefix() + msg);
    }

    protected abstract String prefix();
}

class MailNotifier extends Notifier {
    protected String prefix() { return "[メール]"; }
}

class PushNotifier extends Notifier {
    protected String prefix() { return "[通知]"; }
}`,
            },
            points: ['abstract クラスは共通の処理を持ち、違うところを abstract メソッドで子に任せる', 'abstract クラスは new できない'],
            quiz: [
              {
                id: 'java-4-2-q1', type: 'predict', title: '届いた通知', lang: 'java',
                code: String.raw`Notifier n = new PushNotifier();
n.send("入金がありました");`,
                q: '上の Notifier たちを使ったとき、表示されるのは？',
                choices: ['[通知]入金がありました', '[メール]入金がありました', '入金がありました', 'コンパイルエラー'],
                answer: 0,
                hints: [
                  'send は親の Notifier に書かれています。',
                  'send の中の prefix() は、どのクラスの版が呼ばれますか？',
                  'n の正体は PushNotifier です。',
                ],
                why: 'send は共通の処理だが、穴の prefix() は正体の PushNotifier の版が呼ばれる。表示は [通知]入金がありました。',
              },
              {
                id: 'java-4-2-q2', type: 'predict', title: '穴あきのまま new', lang: 'java',
                q: '上の Notifier について、new Notifier() と書いたらどうなる？',
                choices: ['コンパイルエラーになる', '何も表示しない Notifier ができる', '実行時に例外が出る', 'prefix() が null を返す Notifier ができる'],
                answer: 0,
                hints: [
                  'Notifier には何という印が付いていますか？',
                  'prefix() の中身は、どこにも書かれていません。',
                  '中身のないメソッドを持ったまま実物は作れません。',
                ],
                why: 'abstract クラスは new できないので、コンパイルの時点でエラーになる。穴（abstract メソッド）を埋めた子クラスを new する。',
              },
            ],
          },
          {
            id: 'java-4-3',
            title: '親の型の変数と動的ディスパッチ',
            talk: [
              ['rio', 'Account a = new Savings(); って書ける。親の型の変数に、子のオブジェクトを入れられるんだ。'],
              ['rio', 'で、a.type() を呼ぶと、変数の型（Account）じゃなくて、正体（Savings）の版が動く。実行するときに正体を見て決めるから、動的ディスパッチっていう。'],
              ['kurokawa', 'ただし、オーバーロード（同じ名前で引数の型が違うメソッド）の選択は、コンパイルのときに変数の型で決まる。そこを混ぜて読むやつは、レビューで秒で見抜かれるぞ。'],
              ['player', '黒川、急に出てきて怖いこと言うなよ……。でもありがとう。'],
            ],
            figure: {
              title: '見た目の型と正体',
              text: String.raw`  Account a = new Savings();
  ───┬───        ───┬───
     │              │
  変数の型        正体（実物）
  コンパイル時     実行時
     │              │
     ▼              ▼
  どのオーバー    どのオーバー
  ロードか決める  ライドか決める`,
            },
            points: ['親の型の変数に、子のオブジェクトを入れられる', 'オーバーライドされたメソッドは、正体のクラスの版が動く（動的ディスパッチ）', 'オーバーロードの選択は、変数の型でコンパイル時に決まる'],
            quiz: [
              {
                id: 'java-4-3-q1', type: 'predict', title: '正体はどっち', lang: 'java',
                code: String.raw`class Account {
    String type() { return "普通"; }
}

class Savings extends Account {
    @Override
    String type() { return "定期"; }
}

// 別の場所で
Account a = new Savings();
Savings s = new Savings();
Account b = s;
Account c = new Account();
System.out.println(a.type() + " " + b.type() + " " + c.type());`,
                q: '表示されるのは？',
                choices: ['定期 定期 普通', '普通 普通 普通', '普通 定期 普通', '定期 普通 普通'],
                answer: 0,
                hints: [
                  'a・b・c の正体（new したクラス）をそれぞれ確かめましょう。',
                  'b は s を入れただけです。s の正体は？',
                  'オーバーライドされたメソッドは、変数の型ではなく正体で決まります。',
                ],
                why: 'a と b の正体は Savings なので「定期」、c の正体は Account なので「普通」。変数の型が Account でも、動くのは正体の版。',
              },
              {
                id: 'java-4-3-q2', type: 'predict', title: '黒川の小テスト: オーバーロード', lang: 'java',
                story: '{kurokawa}「証券の注文処理で実際にあったやつだ。これを間違えるなら、ちゃんと読み直せ」',
                code: String.raw`class Printer {
    void print(Account a) { System.out.println("口座"); }
    void print(Savings s) { System.out.println("定期口座"); }
}

// Savings は Account を extends している
Account a = new Savings();
new Printer().print(a);`,
                q: '表示されるのは？',
                choices: ['口座', '定期口座', '口座 と 定期口座 の両方', 'コンパイルエラー'],
                answer: 0,
                hints: [
                  'print は2つありますが、上書きではなく「引数の型違い」です。',
                  'オーバーロードのどれを呼ぶかは、いつ決まりますか？',
                  'コンパイラから見ると、a は Account 型の変数です。',
                ],
                why: 'オーバーロードはコンパイル時に変数の型で選ばれる。a の型は Account なので print(Account) が呼ばれ「口座」。正体を見て決まるのはオーバーライドだけ。',
              },
            ],
          },
        ],
      },
      {
        id: 'java-5',
        title: 'static・equals・hashCode',
        badge: { icon: '⚖️', name: '同一性の番人' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント21「負荷試験: 同時アクセス」'],
          knowledge: ['Java 2章「カプセル化」（final）', 'Java 4章（オーバーライド・@Override）'],
          talk: [
            ['rio', '5章は static と equals。スプリント6で修さんが出した「文字列の比較」の小テスト、あれの続きだ。'],
            ['kurokawa', '同時アクセスで static が壊れる話もする。スプリント21の前に読んでおけ。'],
          ],
        },
        sections: [
          {
            id: 'java-5-1',
            title: 'static フィールドとメソッド',
            talk: [
              ['rio', 'static が付いたフィールドは、オブジェクトごとじゃなくてクラスに1個だけ。全員で共有するホワイトボードみたいなもん。'],
              ['rio', 'static メソッドは new しなくても クラス名.メソッド() で呼べる。Math.max とかな。'],
              ['kurokawa', 'そして、サーバーでは全リクエストがそのホワイトボードを同時に書く。足し算ひとつでも、読んでから書くまでの間に割り込まれて、合計がずれる。'],
              ['player', 'ホワイトボードの取り合い……文化祭の模擬店の売上表みたいな事故が起きるわけか。'],
            ],
            figure: {
              title: 'static はクラスに1つ',
              text: String.raw`  ┌── class Ticket ──────┐
  │ static count = 3     │ ← 全員で共有
  └──────────────────────┘
     ▲        ▲        ▲
  ┌─ a ─┐  ┌─ b ─┐  ┌─ c ─┐
  │no=1 │  │no=2 │  │no=3 │ ← それぞれ
  └─────┘  └─────┘  └─────┘`,
            },
            code: {
              lang: 'java',
              text: String.raw`class Ticket {
    static int count = 0;    // クラスに1つ
    private final int no;    // オブジェクトごと

    Ticket() {
        count++;
        no = count;
    }

    int no() { return no; }
}`,
            },
            points: ['static フィールドはクラスに1つだけで、全オブジェクトが共有する', 'static メソッドは new せずに クラス名.メソッド() で呼べる', 'サーバーでは static な値を複数のスレッドが同時に触る'],
            quiz: [
              {
                id: 'java-5-1-q1', type: 'predict', title: '整理券の番号', lang: 'java',
                code: String.raw`Ticket a = new Ticket();
Ticket b = new Ticket();
Ticket c = new Ticket();
System.out.println(a.no() + " " + c.no() + " " + Ticket.count);`,
                q: '上の Ticket を使ったとき、表示されるのは？',
                choices: ['1 3 3', '1 1 1', '1 3 1', '3 3 3'],
                answer: 0,
                hints: [
                  'count はクラスに1つ、no はオブジェクトごとです。',
                  'new するたびに count が1増え、その値が no に入ります。',
                  'a を作ったときの count はいくつでしたか？ 3つ作った後の count は？',
                ],
                why: 'count は共有なので new のたびに 1, 2, 3 と増える。a.no は 1、c.no は 3、最後の Ticket.count は 3。',
              },
              {
                id: 'java-5-1-q2', type: 'review', title: '大地くんのPR: 振込サービス', lang: 'java',
                story: '{daichi}「今日の振込合計を数えるようにしました！ 最後に振り込んだ口座も分かると便利かなって」',
                file: 'core/src/main/java/bank/TransferService.java',
                code: String.raw`public class TransferService {
    private static long todayTotal = 0;
    public static String lastAccountNo;

    public void transfer(String accountNo, long amount) {
        lastAccountNo = accountNo;
        todayTotal = todayTotal + amount;
        send(accountNo, amount);
    }

    public static long getTodayTotal() {
        return todayTotal;
    }
}`,
                defects: [
                  { line: 3, kind: 'security', why: 'public static なので、全リクエストで共有され、どこからでも読み書きできる。別のお客さまの口座番号が見えたり、書き換えられたりする。そもそも持たないか、ログには伏せて残す。' },
                  { line: 7, kind: 'bug', why: '複数のスレッドが同時に「読んで、足して、書く」と、片方の足し算が上書きされて合計がずれる。AtomicLong や LongAdder を使う。' },
                ],
                hints: [
                  'static のフィールドは、誰と誰が共有していますか？',
                  'サーバーには、別々のお客さまのリクエストが同時に来ます。',
                  '口座番号を、全員で共有する public な場所に置いて大丈夫ですか？',
                  'todayTotal + amount を2つのスレッドが同時に計算したら、結果は？',
                ],
                why: 'static は全リクエストで共有される。口座番号を public static に置くと他人に見え、合計の足し算は同時に走るとずれる。共有したくない値は static にしない。共有する数は AtomicLong などで守る。',
              },
            ],
          },
          {
            id: 'java-5-2',
            title: '== と equals',
            talk: [
              ['rio', '== は「同じ物か」、equals は「中身が同じか」。スプリント6でやったよな。'],
              ['rio', 'ただし equals は、自分のクラスで上書きしないと Object の版が使われる。中身は == と同じ、つまり「同じ物か」を比べるだけ。'],
              ['player', 'じゃあ new Money(100) を2つ作って equals しても……。'],
              ['rio', 'false。100円玉が2枚あっても「同じ硬貨ですか？」って聞いたら違う、ってこと。文字列は String が equals を上書きしてくれてるから、中身で比べられる。'],
            ],
            figure: {
              title: '== と equals',
              text: String.raw`  a ──▶ ┌ Money 100 ┐
  b ──▶ ┌ Money 100 ┐   別の物

  a == b       → false（物が違う）
  a.equals(b)  → 上書きしていなければ
                 == と同じ → false`,
            },
            points: ['== は同じ物かどうか、equals は中身が同じかどうか', 'equals を上書きしていないクラスは、equals も「同じ物か」を比べる', '文字列の比較は equals を使う'],
            quiz: [
              {
                id: 'java-5-2-q1', type: 'predict', title: '同じ100円？', lang: 'java',
                code: String.raw`class Money {
    final long yen;
    Money(long yen) { this.yen = yen; }
    // equals は書いていない
}

// 別の場所で
Money a = new Money(100);
Money b = new Money(100);
System.out.println(a.equals(b) + " " + a.equals(a));`,
                q: '表示されるのは？',
                choices: ['false true', 'true true', 'false false', 'true false'],
                answer: 0,
                hints: [
                  'Money は equals を上書きしていません。どのクラスの equals が使われますか？',
                  'Object の equals は、== と同じく「同じ物か」を比べます。',
                  'a と b は、別々に new した物です。',
                ],
                why: 'equals を上書きしていないので Object の equals（同じ物か）が使われる。a と b は別物なので false、a と a は同じ物なので true。',
              },
              {
                id: 'java-5-2-q2', type: 'fix', title: '管理者になれない管理者', lang: 'java',
                story: '自分のコード。画面から送られてきた role が "admin" なのに、管理者メニューが出ない。テストで直接 "admin" を渡すと通るのに……。',
                code: String.raw`public class RoleChecker {
    public boolean isAdmin(String role) {
        if (role == null) return false;
        return role == "admin";
    }
}`,
                bugLine: 4,
                fixes: ['return role.equals("admin");', 'return role = "admin";', 'return role != "admin";', 'return role.hashCode() == 1;'],
                answer: 0,
                hints: [
                  '4行目は、文字列を何で比べていますか？',
                  '== は「中身」と「同じ物か」のどちらを比べますか？',
                  '画面から来た文字列は、リテラルの "admin" とは別の物として作られます。',
                  '中身で比べるメソッドを使いましょう。',
                ],
                why: '== は同じ物かを比べる。テストのリテラルは使い回されるので通るが、画面から来た文字列は別の物なので false になる。role.equals("admin") で中身を比べる（3行目で null は弾いてある）。',
              },
            ],
          },
          {
            id: 'java-5-3',
            title: 'equals を書いたら hashCode も',
            talk: [
              ['rio', 'HashSet や HashMap は、まず hashCode で「どの棚か」を決めて、その棚の中で equals で探す。'],
              ['kurokawa', 'だから equals だけ上書きして hashCode を放置すると、中身が同じでも別の棚に入る。重複チェックが素通りして、同じ注文が2回通る。証券なら始末書だ。'],
              ['player', '始末書は嫌だ……。じゃあ equals と hashCode はセットで書く、と。'],
              ['rio', 'そう。今どきは record を使えば、両方自動で書いてくれる。値を表すクラスなら、まず record を疑え。'],
            ],
            figure: {
              title: 'HashSet の探し方',
              text: String.raw`  contains(x)
     │ ① x.hashCode() で棚を選ぶ
     ▼
  ┌棚0┐┌棚1┐┌棚2┐┌棚3┐
  │   ││ A ││   ││ B │
  └───┘└───┘└───┘└───┘
     │ ② その棚の中だけ equals で探す
     ▼
  hashCode が違えば、equals は呼ばれない`,
            },
            code: {
              lang: 'java',
              text: String.raw`// equals・hashCode・toString を自動で書いてくれる
public record AccountNo(String value) {}`,
            },
            points: ['HashSet・HashMap は hashCode で棚を決め、equals で探す', 'equals を上書きしたら hashCode も必ず上書きする', 'record なら equals と hashCode を自動で用意してくれる'],
            quiz: [
              {
                id: 'java-5-3-q1', type: 'review', title: 'まどかのPR: 口座番号クラス', lang: 'java',
                story: '{madoka}「口座番号を表すクラスです。同じ番号なら同じと判定できるよう equals を書きました。HashSet で重複を省くのに使います」',
                file: 'core/src/main/java/bank/AccountNo.java',
                code: String.raw`public final class AccountNo {
    private final String value;

    public AccountNo(String value) {
        this.value = value;
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof AccountNo)) return false;
        return value == ((AccountNo) o).value;
    }

    @Override
    public String toString() {
        return "口座番号:" + value;
    }
}`,
                defects: [
                  { line: 9, kind: 'bug', why: 'equals を上書きしたのに hashCode を上書きしていない。同じ番号でも別の棚に入り、HashSet の重複チェックが効かない。Objects.hash(value) を返す hashCode を足す（record にするのが早い）。' },
                  { line: 11, kind: 'bug', why: '文字列を == で比べている。別々に作られた同じ番号の文字列だと false になる。value.equals(other.value) にする。' },
                  { line: 16, kind: 'security', why: 'toString に口座番号をそのまま入れると、ログに出したときに全桁が残る。下4桁以外を伏せる。' },
                ],
                hints: [
                  'story によると、このクラスは HashSet で使われます。HashSet は何と何を使って探しますか？',
                  'equals の相方になるメソッドは、このクラスにありますか？',
                  'equals の中で、文字列を何で比べていますか？',
                  'toString の結果は、どこに出力されることが多いでしょう？',
                ],
                why: 'equals を書いたら hashCode もセットで書く。文字列は equals で比べる。toString はログに出るので、口座番号は伏せる。record AccountNo(String value) にすれば前の2つは自動で正しくなる。',
              },
              {
                id: 'java-5-3-q2', type: 'predict', title: 'record と HashSet', lang: 'java',
                code: String.raw`record AccountNo(String value) {}

// 別の場所で
Set<AccountNo> set = new HashSet<>();
set.add(new AccountNo("0012345"));
set.add(new AccountNo("0012345"));
set.add(new AccountNo("0099999"));
System.out.println(set.size());`,
                q: '表示されるのは？',
                choices: ['2', '3', '1', '0'],
                answer: 0,
                hints: [
                  'record は equals と hashCode を自動で用意します。',
                  '中身が同じ "0012345" の2つは、HashSet から見て同じですか？',
                  'Set は同じものを2回入れても1つしか持ちません。',
                ],
                why: 'record は中身で比べる equals と hashCode を自動で持つので、"0012345" の2つは同じと判定され1つにまとまる。"0099999" と合わせて 2。',
              },
            ],
          },
        ],
      },
      {
        id: 'java-6',
        title: 'コレクションとジェネリクス',
        badge: { icon: '🧺', name: '仕分けの達人' },
        handout: {
          units: ['ハッカソン スプリント6「会話履歴を保存する」', 'ハッカソン スプリント17「速さの壁: 一覧の再描画とN+1」'],
          knowledge: ['Java 5章「static・equals・hashCode」', 'Java 2章（内部のリストをそのまま返す罠）'],
          talk: [
            ['rio', '6章はコレクション。List・Map・Set と、<String> みたいな山かっこ（ジェネリクス）を読めるようにする。'],
            ['rio', '5章の equals と hashCode が、Set と Map の裏側でそのまま効いてくる。終わったらラーメンな。'],
          ],
        },
        sections: [
          {
            id: 'java-6-1',
            title: 'List・Map・Set',
            talk: [
              ['rio', 'ざっくり3種類。List は順番つきの行列、Set は重複なしの名簿、Map は「キー → 値」の対応表。'],
              ['player', '会話履歴は List、ブロックしたユーザーは Set、口座番号から残高は Map、って感じか。'],
              ['rio', '完璧。中身の実物としては ArrayList・HashSet・HashMap がほぼ定番。Map に同じキーで put すると、前の値は上書きされるのも覚えとけ。'],
              ['rio', 'あと HashSet と HashMap は並び順を約束しない。表示順に頼ったテストは、スプリント18みたいに揺れるぞ。'],
            ],
            figure: {
              title: '3つの入れ物',
              text: String.raw`  List  [円, ドル, 円]   順番あり・重複OK
         0    1    2

  Set   {円, ドル}       重複なし・順番なし

  Map   円   ──▶ 2       キーで値を引く
        ドル ──▶ 5       同じキーは上書き`,
            },
            code: {
              lang: 'java',
              text: String.raw`List<String> history = new ArrayList<>();
Set<String> blocked = new HashSet<>();
Map<String, Long> balances = new HashMap<>();`,
            },
            points: ['List は順番つきで重複OK、Set は重複なし、Map はキーから値を引く', '実物は ArrayList・HashSet・HashMap が定番', 'Map に同じキーで put すると上書き。HashSet・HashMap は順番を約束しない'],
            quiz: [
              {
                id: 'java-6-1-q1', type: 'predict', title: '3つの入れ物', lang: 'java',
                code: String.raw`List<String> list = new ArrayList<>();
list.add("円");
list.add("ドル");
list.add("円");

Set<String> set = new HashSet<>(list);

Map<String, Integer> map = new HashMap<>();
map.put("円", 1);
map.put("円", 2);

System.out.println(list.size() + " " + set.size() + " " + map.get("円"));`,
                q: '表示されるのは？',
                choices: ['3 2 2', '3 3 1', '2 2 2', '3 2 1'],
                answer: 0,
                hints: [
                  'List は同じものを何回でも持てます。',
                  'Set に入れると、重複した "円" はどうなりますか？',
                  'Map に同じキーで2回 put すると、値はどちらが残りますか？',
                ],
                why: 'List は重複OKで 3 件。Set は "円" が1つにまとまり 2 件。Map は同じキー "円" の値が 2 で上書きされる。',
              },
            ],
          },
          {
            id: 'java-6-2',
            title: 'ジェネリクスと for-each、remove の罠',
            talk: [
              ['rio', 'List<Long> の <Long> がジェネリクス。「この List には Long しか入れません」っていう札。違う型を入れようとすると、コンパイルの時点で止めてくれる。'],
              ['rio', 'for (Long a : amounts) は for-each。全部を1つずつ取り出して回す。読みやすいから勘定系でもよく見る。'],
              ['player', '便利じゃん。じゃあ回しながら、いらないのを remove すれば……。'],
              ['rio', 'それが罠（笑）。for-each で回してる最中に、そのリストを remove すると ConcurrentModificationException。院の課題で俺が一晩溶かしたやつな。消すなら removeIf を使え。'],
            ],
            figure: {
              title: 'for-each 中の remove',
              text: String.raw`  for (Long a : list)   ← 裏で数を覚えている
     │
     ▼ list.remove(a)
  リストの数が変わる
     │
     ▼ 次の a を取ろうとする
  「数が変わった！」
   → ConcurrentModificationException

  list.removeIf(a -> a == 0);  ← 安全`,
            },
            code: {
              lang: 'java',
              text: String.raw`static <T> T first(List<T> list) {   // T は「何かの型」
    return list.get(0);
}

String s = first(List.of("円", "ドル"));   // T = String`,
            },
            points: ['<T> や <Long> は「何の型を入れるか」の札。違う型はコンパイル時に止まる', 'for-each は全部を1つずつ取り出して回す', 'for-each 中に同じリストを remove すると例外。removeIf を使う'],
            quiz: [
              {
                id: 'java-6-2-q1', type: 'predict', title: '残高の合計', lang: 'java',
                code: String.raw`Map<String, Long> balances = new HashMap<>();
balances.put("A", 1000L);
balances.put("B", 500L);
balances.put("A", 300L);

long sum = 0;
for (long v : balances.values()) {
    sum += v;
}
System.out.println(sum);`,
                q: '表示されるのは？',
                choices: ['800', '1800', '1500', '1300'],
                answer: 0,
                hints: [
                  'Map の "A" には、何回 put していますか？',
                  '同じキーで put すると、前の値は上書きされます。',
                  'values() に入っているのは、最後に残った値だけです。',
                ],
                why: '"A" は 300 で上書きされるので、値は 300 と 500。合計 800。並び順はどうでも、足し算の結果は変わらない。',
              },
              {
                id: 'java-6-2-q2', type: 'fix', title: '0円の明細を消したいだけなのに', lang: 'java',
                story: '自分のコード。[0, 500, 0, 300] を渡したテストで ConcurrentModificationException が出た。',
                code: String.raw`// 金額が 0 円の明細を取り除いて返す
public List<Long> withoutZero(List<Long> amounts) {
    List<Long> result = new ArrayList<>(amounts);
    for (Long a : result) if (a == 0) result.remove(a);
    return result;
}`,
                bugLine: 4,
                fixes: ['result.removeIf(a -> a == 0);', 'for (Long a : result) if (a.equals(0)) result.remove(a);', 'for (Long a : amounts) if (a == 0) amounts.remove(a);', 'for (Long a : result) if (a == 0) continue;'],
                answer: 0,
                hints: [
                  '例外の名前は「回している最中に変更された」という意味です。',
                  '4行目で、回しているリストと、remove しているリストは同じですか？',
                  'a.equals(0) は、Long と Integer の比較になるので一致しません。',
                  '「条件に合うものを消す」専用のメソッドがあります。',
                ],
                why: 'for-each で回している result を、その最中に remove しているので ConcurrentModificationException。removeIf で条件に合うものを安全に消す。a.equals(0) は Long と Integer の比較で常に false になる。',
              },
            ],
          },
          {
            id: 'java-6-3',
            title: 'Optional',
            talk: [
              ['rio', 'Optional は「入ってるかもしれないし、空かもしれない箱」。null を返す代わりに使う。'],
              ['rio', '開け方が大事で、get() でいきなり開けると、空のとき NoSuchElementException。orElse("お客さま") で「空ならこれ」を決めるのが正しい開け方。'],
              ['player', 'スプリント10で大地のPRに指摘したやつだ。ニックネーム未設定の口座で落ちるって。'],
              ['rio', 'そうそう。map(...) は「中身があれば変換、空なら空のまま」。空の箱に何をしても、空のまま流れてくるのがミソ。'],
            ],
            figure: {
              title: 'Optional の流れ',
              text: String.raw`  Optional.of("taro")
     │ map(toUpperCase)
     ▼
  Optional["TARO"] ─ orElse("なし") → "TARO"

  Optional.empty()
     │ map(toUpperCase)  ← 何もしない
     ▼
  Optional.empty  ─ orElse("なし") → "なし"`,
            },
            points: ['Optional は「ないかもしれない」を表す箱', 'get() でいきなり開けず、orElse などで「ないとき」を決める', 'map は中身があるときだけ変換し、空なら空のまま'],
            quiz: [
              {
                id: 'java-6-3-q1', type: 'predict', title: 'ニックネームの箱', lang: 'java',
                code: String.raw`Optional<String> none = Optional.empty();
Optional<String> taro = Optional.of("taro");

String a = none.orElse("お客さま");
String b = none.map(String::toUpperCase).orElse("なし");
String c = taro.map(String::toUpperCase).orElse("なし");
System.out.println(a + " " + b + " " + c);`,
                q: '表示されるのは？',
                choices: ['お客さま なし TARO', 'お客さま なし taro', 'null null TARO', 'お客さま お客さま TARO'],
                answer: 0,
                hints: [
                  'none は空の箱です。orElse は空のとき何を返しますか？',
                  '空の箱に map をしても、空のままです。',
                  'taro は中身があるので、map で大文字に変換されます。',
                ],
                why: 'a は空なので "お客さま"。b は空のまま map を通って "なし"。c は "taro" が map で "TARO" になり、orElse は使われない。',
              },
              {
                id: 'java-6-3-q2', type: 'review', title: '修さんのPR: 送り先の絞り込み', lang: 'java',
                story: '{osamu}「キャンペーン通知の送り先から、配信停止のお客さまを外す。お客さまは10万人、配信停止は2万人くらいだ」',
                file: 'core/src/main/java/bank/CampaignTargets.java',
                code: String.raw`public class CampaignTargets {
    private final List<String> stoppedIds;

    public CampaignTargets(List<String> stoppedIds) {
        this.stoppedIds = List.copyOf(stoppedIds);
    }

    public List<String> targets(List<String> customerIds) {
        List<String> result = new ArrayList<>();
        for (String id : customerIds) {
            if (!stoppedIds.contains(id)) result.add(id);
        }
        return result;
    }

    public String greeting(Optional<Customer> customer) {
        return customer.get().getNickname() + "さん";
    }
}`,
                defects: [
                  { line: 11, kind: 'perf', why: 'List の contains は先頭から1件ずつ探す。10万人 × 2万件で最大20億回の比較になる。Set.copyOf(stoppedIds) で持てば、1回の確認がほぼ一瞬になる。' },
                  { line: 17, kind: 'bug', why: 'Optional を確かめずに get() している。お客さまが見つからないと NoSuchElementException。map(Customer::getNickname).map(n -> n + "さん").orElse("お客さま") のように、ないときを決める。' },
                ],
                hints: [
                  'story の人数に注目しましょう。ループは何回まわりますか？',
                  'List の contains は、どうやって探しますか？',
                  '「入っているか」を何度も確かめるのに向いている入れ物は？',
                  'Optional をいきなり get() で開けている行があります。',
                ],
                why: '「入っているか」を何度も聞くなら List ではなく Set。List.contains は全件をなめるので、件数の掛け算で遅くなる。Optional は get() で開けず、orElse で空のときを決める。',
              },
            ],
          },
        ],
      },
      {
        id: 'java-7',
        title: '例外',
        badge: { icon: '🧯', name: '火消しの達人' },
        handout: {
          units: ['ハッカソン スプリント10「勘定系API（Java）とつなぐ」', 'ハッカソン スプリント16「ログに個人情報を残さない」', 'ハッカソン スプリント22「リリース準備: 機能フラグと切り戻し」'],
          knowledge: ['Java 3章「継承とオーバーライド」（super(...)）', 'Java 6章「コレクションとジェネリクス」'],
          talk: [
            ['rio', '最終章は例外。勘定系が落ちたとき、こっちが何をするかを読む章だ。'],
            ['osamu', '本番障害の半分は、例外の扱いを読み違えたところから始まる。真面目に読め。'],
            ['rio', '3章の super(...) が独自例外で出てくるからな。これ終わったら、打ち上げでラーメン行こうぜ。'],
          ],
        },
        sections: [
          {
            id: 'java-7-1',
            title: 'try・catch・finally',
            talk: [
              ['rio', 'try の中で例外が投げられたら、その下の行は飛ばして catch に飛ぶ。'],
              ['rio', 'finally は、成功しても失敗しても、return があっても、最後に必ず動く。後片付け係だ。'],
              ['player', 'return した後でも動くの？ 律儀すぎない？'],
              ['rio', '律儀なのが取り柄なんだよ（笑）。正確には「return する値を決めた後、メソッドを抜ける前」に finally が動く。'],
            ],
            figure: {
              title: '例外が起きたときの流れ',
              text: String.raw`  try {
    A ──▶ 例外！ ─┐
    B   （飛ばす） │
  } catch {        │
    C ◀────────────┘
    return R2 を予約
  } finally {
    D   ← 必ず動く
  }
  → R2 を返して抜ける`,
            },
            points: ['try の中で例外が起きると、残りを飛ばして catch へ', 'finally は成功・失敗・return に関係なく最後に必ず動く'],
            quiz: [
              {
                id: 'java-7-1-q1', type: 'predict', title: 'finally は律儀', lang: 'java',
                code: String.raw`static String run() {
    try {
        System.out.println("A");
        int x = 10 / 0;
        System.out.println("B");
        return "R1";
    } catch (ArithmeticException e) {
        System.out.println("C");
        return "R2";
    } finally {
        System.out.println("D");
    }
}

// 別の場所で
System.out.println(run());`,
                q: '表示される順番は？',
                choices: ['A → C → D → R2', 'A → B → D → R1', 'A → C → R2 → D', 'A → C → R2'],
                answer: 0,
                hints: [
                  '10 / 0 は何を投げますか？',
                  '例外が起きた行より下の try の中身（B と R1）は実行されません。',
                  'catch で return "R2" しますが、メソッドを抜ける前に何が動きますか？',
                  'R2 が画面に出るのは、run() が戻ってきてからです。',
                ],
                why: 'A を出したあと 10 / 0 で ArithmeticException。B は飛ばして catch で C、return "R2" を予約。抜ける前に finally で D。最後に戻り値 R2 が表示される。',
              },
            ],
          },
          {
            id: 'java-7-2',
            title: '検査例外・非検査例外、throws と握りつぶし',
            talk: [
              ['rio', '例外には2種類ある。IOException みたいな検査例外は、catch するか throws で「投げるかもよ」と宣言しないとコンパイルが通らない。'],
              ['rio', 'RuntimeException の子（NullPointerException とか）は非検査例外で、宣言しなくていい。プログラムのミスを表すことが多い。'],
              ['osamu', 'いちばん怖いのは catch (Exception e) {} みたいな握りつぶしだ。何も起きなかったことになる。障害の調査で、ログに何も残っていない絶望を味わうぞ。'],
              ['player', '修さんの目が遠い……。実体験っぽい。'],
            ],
            figure: {
              title: '例外の家系図',
              text: String.raw`          Throwable
        ┌─────┴──────┐
        ▼            ▼
      Error      Exception
   （手に負えない）   │ 検査例外
               ┌─────┴──────┐
               ▼            ▼
          IOException  RuntimeException
          （要 throws）  │ 非検査例外
                         ▼
               NullPointerException など`,
            },
            code: {
              lang: 'java',
              text: String.raw`// 検査例外は throws で宣言する
public String load(Path path) throws IOException {
    return Files.readString(path);
}`,
            },
            points: ['検査例外は catch か throws が必要。RuntimeException の子は不要', 'catch して何もしない「握りつぶし」は、失敗を成功に見せてしまう'],
            quiz: [
              {
                id: 'java-7-2-q1', type: 'predict', title: 'throws が要るのは？', lang: 'java',
                q: 'メソッドの中で次の例外を投げるとき、catch しないなら throws を書かないとコンパイルが通らないのはどれ？',
                choices: ['IOException', 'IllegalArgumentException', 'NullPointerException', 'ArithmeticException'],
                answer: 0,
                hints: [
                  '家系図で、RuntimeException の下にいるのはどれでしょう？',
                  'RuntimeException の子は非検査例外で、throws は不要です。',
                  '残ったものは検査例外です。',
                ],
                why: 'IOException は検査例外なので、catch するか throws で宣言しないとコンパイルエラー。ほかの3つは RuntimeException の子（非検査例外）なので不要。',
              },
              {
                id: 'java-7-2-q2', type: 'review', title: 'ひかりのPR: 振込の実行', lang: 'java',
                story: '{hikari}「勘定系に振込を頼むところだよ！ エラーが出ても画面が落ちないように、全部 catch しといた🛡️」',
                file: 'core/src/main/java/bank/TransferExecutor.java',
                code: String.raw`public class TransferExecutor {
    private final CoreClient client;
    private final Logger log;

    public TransferExecutor(CoreClient client, Logger log) {
        this.client = client;
        this.log = log;
    }

    public void transfer(String from, String to, long amount) {
        try {
            client.transfer(from, to, amount);
        } catch (CoreException e) {
            log.warn("振込失敗 token=" + client.token(), e);
            throw e;
        } catch (Exception e) {
        }
    }
}`,
                defects: [
                  { line: 14, kind: 'security', why: '勘定系の認証トークンをログに書いている。ログを読める人なら誰でもトークンを使えてしまう。トークンは出さず、振込の受付番号など追える情報だけ残す。' },
                  { line: 16, kind: 'bug', why: 'それ以外の例外を握りつぶしている（中身が空の catch）。何も記録されず、呼び出し元は振込が成功したと思い込む。ログに残して投げ直す（そもそも catch しない）。' },
                ],
                hints: [
                  'catch の中身を1つずつ読みましょう。何をログに書いていますか？',
                  'トークンは、知られたら何ができてしまうものですか？',
                  '2つ目の catch の中には、何が書いてありますか？',
                  '例外が握りつぶされたら、呼び出し元は成功と失敗のどちらだと思うでしょう？',
                ],
                why: '認証トークンはログに出さない（スプリント16の教訓）。catch して何もしないと、失敗が成功に化ける。画面を落とさないのは、上の層で例外を受けて「振込できませんでした」と表示する役目。',
              },
            ],
          },
          {
            id: 'java-7-3',
            title: 'try-with-resources と独自例外',
            talk: [
              ['rio', 'ファイルや接続みたいな「閉じないといけないもの」は try ( ... ) の丸かっこの中で作る。これが try-with-resources。抜けるときに勝手に close してくれる。'],
              ['rio', '閉じる順番は作ったのと逆。それと、catch に入る前にもう閉じ終わってる。ここ、小テストに出すぞ。'],
              ['player', '先生みたいなこと言うじゃん。'],
              ['rio', '今は先生だからな（笑）。あと、業務のエラーは InsufficientBalanceException みたいな独自例外を作ると読みやすい。作るときは super(メッセージ) を忘れるなよ。3章の復習だ。'],
            ],
            figure: {
              title: 'try-with-resources の順番',
              text: String.raw`  try (Conn a = ...; Conn b = ...) {
       ① open A   ② open B
    ③ 本体 ── 例外！
  }
    ④ close B  ⑤ close A  ← 逆順
  catch (...) {
    ⑥ ここに来るのは閉じた後
  }`,
            },
            code: {
              lang: 'java',
              text: String.raw`public class InsufficientBalanceException extends RuntimeException {
    public InsufficientBalanceException(long shortage) {
        super("残高が " + shortage + " 円足りません");
    }
}`,
            },
            points: ['try ( ... ) で作ったものは、抜けるときに作った逆順で自動で close される', 'close は catch より先に終わる', '独自例外は Exception や RuntimeException を extends し、super でメッセージを渡す'],
            quiz: [
              {
                id: 'java-7-3-q1', type: 'predict', title: '閉じる順番', lang: 'java',
                code: String.raw`class Conn implements AutoCloseable {
    private final String name;

    Conn(String name) {
        this.name = name;
        System.out.println("open " + name);
    }

    @Override
    public void close() {
        System.out.println("close " + name);
    }
}

// 別の場所で
try (Conn a = new Conn("A"); Conn b = new Conn("B")) {
    System.out.println("work");
    throw new IllegalStateException("x");
} catch (IllegalStateException e) {
    System.out.println("catch");
}`,
                q: '表示される順番は？',
                choices: [
                  'open A → open B → work → close B → close A → catch',
                  'open A → open B → work → catch → close B → close A',
                  'open A → open B → work → close A → close B → catch',
                  'open A → open B → work → catch',
                ],
                answer: 0,
                hints: [
                  'A と B は、書いた順に作られます。',
                  '例外が起きると、try の丸かっこで作ったものが閉じられます。順番は？',
                  '閉じるのは、作ったのと逆の順番です。',
                  'catch の中身が動くのは、閉じ終わった後です。',
                ],
                why: 'A → B の順に開き、work のあと例外。catch に入る前に、作った逆順で B → A と close される。そのあと catch が動く。',
              },
              {
                id: 'java-7-3-q2', type: 'fix', title: 'ログに null と出る', lang: 'java',
                story: '自分のコード。残高不足のとき、ログに「振込失敗: null」と出てしまい、何円足りないのか分からない。ログは log.warn("振込失敗: " + e.getMessage()) で出している。',
                code: String.raw`public class InsufficientBalanceException extends RuntimeException {
    private final long shortage;

    public InsufficientBalanceException(long shortage) {
        super();
        this.shortage = shortage;
    }

    public long getShortage() {
        return shortage;
    }
}`,
                bugLine: 5,
                fixes: ['super("残高が " + shortage + " 円足りません");', 'this("残高不足");', 'super.getMessage();', 'return "残高が足りません";'],
                answer: 0,
                hints: [
                  'getMessage() が返すメッセージは、どこで決まりますか？',
                  '親の RuntimeException に、メッセージを渡している行はありますか？',
                  'super() は、メッセージなしで親を作ります。',
                  '親のコンストラクタには、メッセージを受け取る版があります。',
                ],
                why: 'super() だとメッセージなしで作られ、getMessage() は null。super("残高が " + shortage + " 円足りません") で親にメッセージを渡す。コンストラクタの1行目なので、引数の shortage はここで使える。',
              },
            ],
          },
        ],
      },
    ],
  });
})(globalThis);
