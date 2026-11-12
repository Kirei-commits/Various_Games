import { useState } from 'react';
import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { Section } from '../../../shared/components/Section';
import { Checklist, type ChecklistItem } from '../../checklist';
import { MiniTask, Quiz, type MiniTaskData, type QuizQuestion } from '../../quiz';
import { LessonFooter } from './LessonFooter';
import { Mistakes, type Mistake } from './Mistakes';

type Size = 'small' | 'medium' | 'large';

const SIZE_LABEL: Record<Size, string> = {
  small: '小さい（機能1つ）',
  medium: 'ふつう（機能3つ）',
  large: '大きい（機能6つ）',
};

const BY_KIND: Record<Size, string> = {
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

const BY_FEATURE: Record<Size, string> = {
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

const SIZE_COMMENT: Record<Size, string> = {
  small: '機能が1つのうちは、どちらでもほとんど同じです。種類別のほうがフォルダが浅くて楽に見えるくらい。差が出るのはここからです。',
  medium:
    '「ログインを直したい」とき、種類別では3つのフォルダを1つずつ開いて、ログインのファイルを探します。機能別では login フォルダを開くだけ。関係のあるファイルが隣どうしに並んでいます。',
  large:
    '種類別は、1つのフォルダに何十個もファイルが並び、「かごに関係するのはどれ？」を名前から探し当てることになります。機能別は、フォルダが増えるだけで、1つ1つの中身はずっと小さいままです。機能を丸ごと消すのも、フォルダを1つ消すだけ。',
};

const MINIMAL_TREE = `src/
├─ app/
│   └─ App.tsx                  ← 入口。機能を並べるだけ
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

const LOGIN_TREE = `src/
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

const INDEX_CODE = `// features/shopping-list/index.ts
// この機能の「受付窓口」。外の人に使ってほしいものだけを並べる。
export { ShoppingList } from './components/ShoppingList';`;

const IMPORT_GOOD = `// ⭕ 受付窓口を通す
import { ShoppingList } from '../features/shopping-list';`;

const IMPORT_BAD = `// ❌ 他の機能の引き出しの奥に、直接手を入れる
import { useShoppingList } from '../shopping-list/hooks/useShoppingList';
import { getItems } from '../shopping-list/api/getItems';`;

const QUIZ: QuizQuestion[] = [
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

const TASK: MiniTaskData = {
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

const CHECKLIST: ChecklistItem[] = [
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
    text: '他の機能のフォルダの「奥」を、直接読みこんでいないか',
    reason: '読みこみの道が features/別の機能/hooks/… のように奥まで入っていたら要注意。受付窓口（index.ts）を通すか、shared に移す。',
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

const MISTAKES: Mistake[] = [
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

export function Lesson2({ onNext }: { onNext: () => void }) {
  const [size, setSize] = useState<Size>('medium');

  return (
    <>
      <Section title="今日のゴール" lead="ファイルが増えても「どこに置くか」で迷わないルールを、1つだけ覚えます。">
        <p>
          第1回で、コードには3つの役割があると分かりました。次に出てくる疑問は
          <strong>「そのファイルを、どのフォルダに置くの？」</strong>です。今日は部屋の片付けにたとえて考えます。
        </p>
      </Section>

      <Section title="2つの片付け方" lead="同じ持ち物でも、分け方で探しやすさが大きく変わります。">
        <Callout kind="example">
          <p>
            <strong>種類別：</strong>家じゅうの物を「箱の形」で分ける片付け方です。四角い物の棚、丸い物の棚、長い物の棚。
            料理をしたいとき、フライパンは丸い物の棚、まな板は四角い物の棚、菜箸は長い物の棚へ取りに行きます。
          </p>
          <p>
            <strong>機能別：</strong>「使う場面」で分ける片付け方です。料理の道具はキッチンの引き出し、勉強の道具は机の引き出し。
            料理をしたいときは、キッチンの引き出しを1つ開ければ全部そろいます。
          </p>
        </Callout>
        <p>
          コードに置きかえると、種類別は <code>components</code>・<code>hooks</code>・<code>api</code> という3つの大きな箱に全ファイルを入れる方法。
          機能別は、<strong>「お買い物メモ」「ログイン」など、機能ごとに引き出しを作る</strong>方法です。
        </p>
      </Section>

      <Section title="大きさで比べる" lead="アプリの大きさを切りかえて、2つの分け方を見比べてみよう。">
        <div className="seg" role="group" aria-label="アプリの大きさ">
          {(Object.keys(SIZE_LABEL) as Size[]).map((key) => (
            <button
              key={key}
              type="button"
              className={size === key ? 'seg-item is-on' : 'seg-item'}
              aria-pressed={size === key}
              onClick={() => setSize(key)}
            >
              {SIZE_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="compare">
          <CodeBlock title="種類別" lang="text" code={BY_KIND[size]} />
          <CodeBlock title="機能別（おすすめ）" lang="text" code={BY_FEATURE[size]} />
        </div>
        <p className="compare-comment">{SIZE_COMMENT[size]}</p>
      </Section>

      <Section title="おすすめの最小構成" lead="迷ったら、この形をそのまま真似してください。第3回・第4回もこの形で進めます。">
        <CodeBlock title="フォルダ構成図（最小）" lang="text" code={MINIMAL_TREE} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>フォルダ</th>
                <th>置くもの</th>
                <th>置いてはいけないもの</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>app/</code></td>
                <td>アプリの入口。機能を読みこんで並べるだけ。</td>
                <td>機能の中身（計算・通信・細かい見た目）</td>
              </tr>
              <tr>
                <td><code>features/〇〇/api/</code></td>
                <td>その機能がサーバーなどとやり取りする関数。</td>
                <td>画面のタグ、入力チェック、useState</td>
              </tr>
              <tr>
                <td><code>features/〇〇/hooks/</code></td>
                <td>その機能のデータと操作（use〜）。</td>
                <td>画面のタグ、色や文言などの見た目、通信の細かいやり方</td>
              </tr>
              <tr>
                <td><code>features/〇〇/components/</code></td>
                <td>その機能の画面の部品。</td>
                <td>通信、長い計算、入力チェックのルール</td>
              </tr>
              <tr>
                <td><code>features/〇〇/index.ts</code></td>
                <td>外に見せるものの一覧（受付窓口）。</td>
                <td>処理そのもの（ここは「並べるだけ」）</td>
              </tr>
              <tr>
                <td><code>shared/</code></td>
                <td>2つ以上の機能で使う共用品。</td>
                <td>特定の機能しか知らないこと（「お買い物メモ」専用の部品など）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Callout kind="tip" title="3つ全部そろえなくてもいい">
          <p>
            サーバーと話さない機能（たとえば電卓）なら、<code>api</code> フォルダは要りません。
            <strong>要るものだけ作る</strong>で大丈夫です。あとで必要になったら足せば、ほかのファイルは動かさずに済みます。
          </p>
        </Callout>
      </Section>

      <Section title="受付窓口（index.ts）ってなに？" lead="機能の引き出しには、外向きの「窓口」を1つ作っておきます。">
        <Callout kind="example">
          <p>
            レストランに出前を頼むとき、キッチンの勝手口から入って冷蔵庫を開ける人はいません。受付で注文します。
            機能のフォルダも同じで、<strong>外から使ってよいものを窓口に並べておき、外の人は窓口だけを見る</strong>ようにします。
          </p>
        </Callout>
        <CodeBlock code={INDEX_CODE} title="受付窓口の中身" />
        <div className="compare">
          <CodeBlock code={IMPORT_GOOD} title="良い読みこみ方" />
          <CodeBlock code={IMPORT_BAD} title="避けたい読みこみ方" />
        </div>
        <Callout kind="why" title="なぜ窓口を通すのか">
          <p>
            窓口に出していないもの（フックや通信の関数）は、<strong>その機能の中だけの都合</strong>です。
            外から触られていなければ、名前を変えても、作り直しても、ほかの機能は壊れません。
            「中を自由に直せる」ことが、窓口を作るいちばんの得です。
          </p>
        </Callout>
      </Section>

      <Section title="なぜ「機能ごと」なのか">
        <Callout kind="why" title="一緒に変わるものは、近くに置く">
          <p>
            「ログインのしかたを変える」とき、直すのはログインの画面・ログインのルール・ログインの通信です。
            <strong>1つの変更で一緒に直すファイルが、同じフォルダにまとまっている</strong>と、探す時間も、直しもれも減ります。
            種類別は「似た形のもの」を集めますが、形が似ていても一緒に変わるわけではありません。
          </p>
        </Callout>
        <Callout kind="why" title="大きくなっても、1つ1つは小さいまま">
          <p>
            機能が10個になっても、開くフォルダの中身はいつも「api・hooks・components」の3つだけ。
            アプリ全体は大きくなっても、<strong>一度に頭に入れる範囲は変わりません</strong>。
          </p>
        </Callout>
        <Callout kind="why" title="消すのも、任せるのも楽">
          <p>
            使わなくなった機能は、フォルダを1つ消せば終わりです。人や AI に作業を頼むときも
            「この引き出しの中だけ直して」と範囲を言いやすく、できあがったものを確かめる範囲もはっきりします。
          </p>
        </Callout>
        <Callout kind="warn" title="機能別にも、迷う場面はある">
          <p>
            「これはどの機能のもの？」と決めにくいファイルが出てきます（例：ログイン中の人の名前を、あちこちで使う）。
            そのときの決め方は次の順です。
          </p>
          <ol>
            <li>いちばんよく使う機能の中に置く。</li>
            <li>2つ以上の機能で本当に必要になったら、<code>shared</code> に引っ越す。</li>
            <li>引っ越すときは、その機能だけの事情（文言や細かいルール）を一緒に持っていかない。</li>
          </ol>
        </Callout>
      </Section>

      <Section title="例題：ログイン機能を足すなら" lead="理解度チェックの前に、答えの形を先に見ておきます。">
        <CodeBlock title="ログインを足したあとの構成" lang="text" code={LOGIN_TREE} />
        <p>
          ポイントは、<strong>すでにある shopping-list のフォルダを1つも触っていない</strong>ことです。
          新しい機能は、隣に引き出しを足すだけ。入口の <code>App.tsx</code> に1行足せば、画面に出てきます。
        </p>
      </Section>

      <Section title="フォルダを見るときのポイント">
        <Callout kind="look" title="知らないアプリを開いたら">
          <ul>
            <li>
              <strong>まず features の中の「フォルダ名の一覧」を読む：</strong>それがそのまま「このアプリでできること」の目次になっています。
            </li>
            <li>
              <strong>直したい機能のフォルダだけ開く：</strong>ほかの引き出しは、今は見なくていい。
            </li>
            <li>
              <strong>index.ts を見る：</strong>その機能が外に何を出しているかが、数行で分かります。
            </li>
            <li>
              <strong>shared の大きさを見る：</strong>shared が features より大きかったら、分け方がうまくいっていないサインです。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="レビューで気をつけること">
        <Checklist items={CHECKLIST} />
      </Section>

      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="理解度チェック" lead="全問正解して、ミニ課題に納得できたら、第3回へ進めます。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>

      <LessonFooter lessonId={2} questions={QUIZ} tasks={[TASK]} onNext={onNext} />
    </>
  );
}
