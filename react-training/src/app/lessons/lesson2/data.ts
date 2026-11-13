import type { FaqItem } from '../../../shared/components/Faq';
import type { MiniTaskData, QuizQuestion } from '../../../features/quiz';
import type { ChecklistItem } from '../../../features/checklist';
import type { Mistake } from '../../../shared/components/Mistakes';

export type Size = 'small' | 'medium' | 'large';

export const SIZE_LABEL: Record<Size, string> = {
  small: '小さい（機能1つ）',
  medium: 'ふつう（機能3つ）',
  large: '大きい（機能6つ）',
};

export const BY_KIND: Record<Size, string> = {
  small: `src/
├─ components/
│   └─ ShoppingList.tsx
├─ hooks/
│   └─ useShoppingList.ts
└─ api/
    └─ getItems.ts`,
  medium: `src/
├─ components/
│   ├─ ShoppingList.tsx
│   ├─ LoginForm.tsx
│   └─ ProfileCard.tsx
├─ hooks/
│   ├─ useShoppingList.ts
│   ├─ useLogin.ts
│   └─ useProfile.ts
└─ api/
    ├─ getItems.ts
    ├─ login.ts
    └─ getProfile.ts`,
  large: `src/
├─ components/        ← 18個が1か所に
│   ├─ CartButton.tsx
│   ├─ CartList.tsx
│   ├─ CouponInput.tsx
│   ├─ LoginForm.tsx
│   ├─ OrderHistory.tsx
│   ├─ ProfileCard.tsx
│   ├─ ShoppingList.tsx
│   └─ …あと11個
├─ hooks/             ← 9個が1か所に
│   ├─ useCart.ts
│   ├─ useCoupon.ts
│   ├─ useLogin.ts
│   └─ …あと6個
└─ api/               ← 12個が1か所に
    ├─ applyCoupon.ts
    ├─ getCart.ts
    ├─ getItems.ts
    └─ …あと9個`,
};

export const BY_FEATURE: Record<Size, string> = {
  small: `src/
└─ features/
    └─ shopping-list/
        ├─ api/
        │   └─ getItems.ts
        ├─ hooks/
        │   └─ useShoppingList.ts
        └─ components/
            └─ ShoppingList.tsx`,
  medium: `src/
└─ features/
    ├─ shopping-list/
    │   ├─ api/getItems.ts
    │   ├─ hooks/useShoppingList.ts
    │   └─ components/ShoppingList.tsx
    ├─ login/
    │   ├─ api/login.ts
    │   ├─ hooks/useLogin.ts
    │   └─ components/LoginForm.tsx
    └─ profile/
        ├─ api/getProfile.ts
        ├─ hooks/useProfile.ts
        └─ components/ProfileCard.tsx`,
  large: `src/
└─ features/
    ├─ shopping-list/   ← 開けば、メモのことが全部ある
    ├─ cart/            ← 開けば、かごのことが全部ある
    │   ├─ api/
    │   ├─ hooks/
    │   └─ components/
    ├─ coupon/
    ├─ login/
    ├─ order-history/
    └─ profile/`,
};

export const SIZE_COMMENT: Record<Size, string> = {
  small: '機能が1つのうちは、どちらでもほとんど同じです。種類別のほうがフォルダが浅くて楽に見えるくらい。差が出るのはここからです。',
  medium:
    '「ログインを直したい」とき、種類別では3つのフォルダを1つずつ開いて、ログインのファイルを探します。機能別では login フォルダを開くだけ。関係のあるファイルが隣どうしに並んでいます。',
  large:
    '種類別は、1つのフォルダに何十個もファイルが並び、「かごに関係するのはどれ？」を名前から探し当てることになります。機能別は、フォルダが増えるだけで、1つ1つの中身はずっと小さいままです。機能を丸ごと消すのも、フォルダを1つ消すだけ。',
};

export const MINIMAL_TREE = `src/
├─ app/
│   └─ App.tsx                  ← 入口。機能を読みこんで並べる
├─ features/                    ← 機能ごとの引き出し
│   └─ shopping-list/           ← 「お買い物メモ」の引き出し
│       ├─ api/                 ← 🚚 仕入れ業者
│       │   └─ getItems.ts
│       ├─ hooks/               ← 🍳 キッチン
│       │   └─ useShoppingList.ts
│       ├─ components/          ← 🙋 ホールスタッフ
│       │   └─ ShoppingList.tsx
│       └─ index.ts             ← 受付窓口（外に見せるものだけ書く）
└─ shared/                      ← 2つ以上の機能で使う共用品
    ├─ components/              ← 例：共通のボタン
    └─ lib/                     ← 例：日付を整える関数`;

export const LOGIN_TREE = `src/
├─ app/
│   └─ App.tsx
├─ features/
│   ├─ shopping-list/
│   └─ login/                   ← ここに新しい引き出しを作る
│       ├─ api/
│       │   └─ login.ts         ← サーバーに名前と合言葉を送る
│       ├─ hooks/
│       │   └─ useLogin.ts      ← 入力チェック、ログイン中かどうかを覚える
│       ├─ components/
│       │   └─ LoginForm.tsx    ← 入力欄とボタン
│       └─ index.ts
└─ shared/`;

export const INDEX_CODE = `// features/shopping-list/index.ts
// この機能の「受付窓口」。外の人に使ってほしいものだけを並べる。
export { ShoppingList } from './components/ShoppingList';`;

export const IMPORT_GOOD = `// ⭕ 受付窓口を通す
import { ShoppingList } from '../features/shopping-list';`;

export const IMPORT_BAD = `// ❌ 他の機能の引き出しの奥に、直接手を入れる
import { useShoppingList } from '../shopping-list/hooks/useShoppingList';
import { getItems } from '../shopping-list/api/getItems';`;

export const QUIZ: QuizQuestion[] = [
  {
    id: 'l2-q1',
    question: '「ユーザーログイン機能」を追加します。最初に作るフォルダはどれ？',
    choices: ['src/components/login/', 'src/features/login/', 'src/shared/login/', 'src/hooks/login/'],
    answerIndex: 1,
    hint: '機能ごとの引き出しは、どのフォルダの下に並んでいましたか？',
    explanation:
      'features の下に login という引き出しを作り、その中に api・hooks・components を置きます。ログインに関するものは全部そこに入ります。',
  },
  {
    id: 'l2-q2',
    question: 'ログイン機能の「メールアドレスの形が正しいかチェックする」処理は、どこに書く？',
    choices: [
      'features/login/components/LoginForm.tsx',
      'features/login/hooks/useLogin.ts',
      'features/login/api/login.ts',
    ],
    answerIndex: 1,
    hint: '第1回の仕分け練習を思い出そう。入力チェックは、だれの仕事でしたか？',
    explanation: '入力チェックはルールなので、キッチン（hooks）です。フォームは結果のエラー文を表示するだけ。',
  },
  {
    id: 'l2-q3',
    question: '「お買い物メモ」と「ログイン」の両方で、同じ見た目のボタンを使いたくなりました。ボタンはどこに置く？',
    choices: [
      'features/shopping-list/components/ に置いて、login から読みこむ',
      'shared/components/ に置く',
      '両方の機能に、同じファイルをコピーして置く',
    ],
    answerIndex: 1,
    hint: '2つ以上の機能で使う「共用品」の置き場がありました。',
    explanation:
      '2つ以上の機能で使うものは shared へ。ある機能の引き出しから別の機能が直接取り出すと、片方を直したときにもう片方が壊れやすくなります。',
  },
  {
    id: 'l2-q4',
    question: '「種類別（components / hooks / api）」の分け方がつらくなるのは、どんなとき？',
    choices: [
      'アプリの機能が増えて、1つのフォルダにファイルが何十個も並んだとき',
      'ファイルが3つしかないとき',
      'フォルダ名を英語で書くとき',
    ],
    answerIndex: 0,
    hint: '上の「大きさで比べる」を「大きい」に切りかえて、見比べてみよう。',
    explanation:
      '種類別は、機能が増えるほど1フォルダの中身がふくらみ、関係するファイルが3か所に散らばります。機能別なら、増えるのはフォルダの数だけです。',
  },
];

export const TASK: MiniTaskData = {
  id: 'l2-task',
  prompt: '「お気に入り」機能を追加することになりました（品物に★を付けて、お気に入りだけの一覧を見られる）。作るフォルダと、最初に置くファイルを3つ、名前つきで書き出してみよう。',
  modelAnswer: [
    'フォルダ：src/features/favorites/',
    '🚚 api/getFavorites.ts … お気に入りの一覧をサーバーから取ってくる',
    '🍳 hooks/useFavorites.ts … 一覧を覚えておく、★を付ける・外す操作',
    '🙋 components/FavoriteList.tsx … 一覧と★ボタンを画面に出す',
    '（あれば）index.ts … 外に見せるのは FavoriteList だけ',
  ],
  passLine: 'features の下に機能名のフォルダを作り、その中を api・hooks・components に分けられていれば合格。ファイル名は違っていても大丈夫。',
};

export const CHECKLIST: ChecklistItem[] = [
  {
    id: 'l2-c1',
    text: 'フォルダ名を見て、「何をする機能か」が分かるか',
    reason: 'utils・common・misc のような「種類の名前」のフォルダは、何でも入るゴミ箱になりやすい。',
  },
  {
    id: 'l2-c2',
    text: '新しいファイルは、その機能のフォルダの中に置かれているか',
    reason: '機能の外にポツンと置かれたファイルは、あとで「これ、どこで使ってるの？」になる。',
  },
  {
    id: 'l2-c3',
    text: '機能のファイルが、他の機能を読みこんでいないか',
    reason: '読みこみの道に別の機能の名前（../login/ など）が出てきたら要注意。機能どうしを引き合わせるのは入口（app）の仕事。両方で使うものは shared に移す。',
  },
  {
    id: 'l2-c4',
    text: 'shared に置かれたものは、本当に2つ以上の機能で使われているか',
    reason: '「いつか使うかも」で shared に置くと、どの機能のものか分からない物であふれる。',
  },
  {
    id: 'l2-c5',
    text: '機能フォルダを丸ごと消したら、その機能だけがきれいに無くなるか（想像でOK）',
    reason: 'これが「うまく分かれている」いちばん分かりやすい目印。他が壊れるなら、どこかで絡まっている。',
  },
];

export const MISTAKES: Mistake[] = [
  {
    pattern: 'なんでも入る「utils」フォルダ',
    sign: 'utils や common の中に、関係のないファイルが20個、30個と並んでいる。',
    why: '「とりあえずここ」に置けてしまうので、置き場所を考えなくなる。結果、だれも全体を知らない物置ができる。',
    fix: '1つの機能でしか使っていないものは、その機能のフォルダへ戻す。本当に共用のものだけ shared に残す。',
  },
  {
    pattern: '機能どうしが、こっそりつながっている',
    sign: 'login のファイルが shopping-list の hooks を直接読みこんでいる、など。読みこみの道に別の機能名が出てくる。',
    why: '片方を直すと、もう片方が思わぬところで壊れる。「この機能だけ直す」ができなくなる。',
    fix: '共通で必要な部分を shared に移す。または、入口（App）で両方を並べて、必要な値だけを渡す。',
  },
  {
    pattern: '早すぎる共通化',
    sign: '1か所でしか使っていないのに shared に置いてある。「どの画面でも使えるように」と、設定項目だらけになった部品。',
    why: '使う場面がまだ1つなので、何が本当に共通なのか分からないまま作ることになり、2つ目の場面で結局合わない。',
    fix: '最初は機能の中に置く。2つ目の機能でも必要になったら、そのとき shared に引っ越す。「2回目で動かす」が目安。',
  },
  {
    pattern: '機能の切り方が「画面」になっている',
    sign: 'features/home-page/ のような「ページの名前」のフォルダに、関係のないものが全部入っている。',
    why: 'ホーム画面には、メモもお知らせもログイン状態も出る。ページ名で切ると、結局1つのフォルダに何でも入る。',
    fix: '「何を扱うか」で切る（shopping-list, notice, login）。ページは、それらの機能を並べるだけの場所にする。',
  },
];

export const FAQ: FaqItem[] = [
  {
    question: '小さいアプリなら、種類別（components / hooks / api）でもいい？',
    answer: [
      '機能が1つか2つで、これ以上増えないと分かっているなら、種類別でも困りません。',
      'ただ、アプリは作り始めると機能が増えるものです。最初から機能別にしておけば、増えたときに引っ越しをしなくて済みます。迷ったら機能別にしておくのが安全です。',
    ],
  },
  {
    question: '「機能」と「ページ（画面）」は同じもの？',
    answer: [
      'ちがいます。機能は「何を扱うか」（お買い物メモ、ログイン）。ページは「どの画面に何を並べるか」です。',
      '1つのページに複数の機能が並ぶこともあるし、1つの機能が複数のページに出ることもあります。ページは、機能を並べる入口（app）側の仕事です。',
    ],
  },
  {
    question: 'ある機能から、別の機能のものを使いたくなったら？',
    answer: [
      '機能どうしで直接読みこむのは避けます。方法は2つ。①両方で使う部分を shared に移す。②入口（app）で2つの機能を読みこみ、片方の値をもう片方に渡す。',
      'この教材アプリも②を使っています。クイズの部品は「答えを保存する機能」を知りません。入口側で2つを引き合わせています（第4回のおまけで見られます）。',
    ],
  },
  {
    question: 'index.ts（受付窓口）は、必ず作らないとダメ？',
    answer: [
      '機能が1つだけの小さなアプリなら、無くても困りません。',
      '機能が2つ、3つと増えてきたら作っておくと、「外から触っていいもの」と「中だけの都合」がはっきりして、中身を安心して直せるようになります。',
    ],
  },
  {
    question: 'shared に入れるか、機能の中に置くか、やっぱり迷う',
    answer: [
      '迷ったら機能の中に置きます。2つ目の機能でも必要になった「そのとき」に shared へ引っ越せば十分です。',
      '先に shared に置いてしまうと、あとで「これはどの機能のためのもの？」が分からなくなります。',
    ],
  },
];
