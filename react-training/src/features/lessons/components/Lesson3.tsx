import { useState } from 'react';
import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { RoleBadge } from '../../../shared/components/RoleBadge';
import { Section } from '../../../shared/components/Section';
import { Checklist, type ChecklistItem } from '../../checklist';
import { MiniTask, Quiz, type MiniTaskData, type QuizQuestion } from '../../quiz';
import { ShoppingList } from '../../shopping-list';
import { BadShoppingList } from '../../shopping-list-bad/BadShoppingList';
import { LessonFooter } from './LessonFooter';
import { Mistakes, type Mistake } from './Mistakes';

// ここで見せるコードは、このアプリの中で実際に動いているファイルそのもの（?raw で中身を文字として読みこむ）
import badCode from '../../shopping-list-bad/BadShoppingList.tsx?raw';
import apiCode from '../../shopping-list/api/getItems.ts?raw';
import hookCode from '../../shopping-list/hooks/useShoppingList.ts?raw';
import componentCode from '../../shopping-list/components/ShoppingList.tsx?raw';

const TREE = `src/features/shopping-list/
├─ api/
│   └─ getItems.ts            🚚 データを取るだけ
├─ hooks/
│   └─ useShoppingList.ts     🍳 データを管理して、追加処理をするだけ
├─ components/
│   └─ ShoppingList.tsx       🙋 画面に表示して、ボタンを押させるだけ
└─ index.ts                   受付窓口`;

const STEP1 = `// api/getItems.ts に引っ越し
export async function getItems(): Promise<Item[]> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  return [
    { id: 1, name: '牛乳' },
    { id: 2, name: 'たまご' },
    { id: 3, name: '食パン' },
  ];
}

// 元のファイルでは、こう呼ぶだけになる
getItems().then((data) => setItems(data));`;

const STEP2 = `// hooks/useShoppingList.ts に引っ越し
export function useShoppingList() {
  const [items, setItems] = useState<Item[]>([]);
  // ...読みこみ中・エラーの状態、最初の読みこみ...

  const addItem = (name: string): boolean => {
    // 空はダメ、同じ品物もダメ、というルール
  };

  return { items, isLoading, loadError, inputError, addItem };
}`;

const STEP3 = `// components/ShoppingList.tsx に残るもの
export function ShoppingList() {
  const { items, isLoading, loadError, inputError, addItem } = useShoppingList();
  const [text, setText] = useState('');

  // あとは、受け取ったものを画面に出すだけ
  return ( /* 一覧・入力欄・ボタン・エラー文 */ );
}`;

const MOCK_TEST = `// イメージ：仕入れ業者を「にせもの」に差しかえて、キッチンだけを確かめる
import { vi } from 'vitest';
import * as api from '../api/getItems';

// 本物のサーバーには行かず、決まったデータをすぐ返す「にせの業者」
vi.spyOn(api, 'getItems').mockResolvedValue([{ id: 1, name: '牛乳' }]);

// これで「牛乳がもうあるとき、牛乳を追加しようとしたら断るか」を、
// サーバーも画面も無しで確かめられる。`;

const QUIZ: QuizQuestion[] = [
  {
    id: 'l3-q1',
    question: '「同じ品物でも追加できるようにしたい」。直すファイルはどれ？',
    choices: ['api/getItems.ts', 'hooks/useShoppingList.ts', 'components/ShoppingList.tsx'],
    answerIndex: 1,
    hint: '「同じ品物はダメ」は、見た目・ルール・通信のどれでしょう。',
    explanation:
      '追加のルールはキッチン（useShoppingList）の addItem の中にあります。そこの「同じ品物があるか」の3行を消すだけ。画面も通信も触りません。',
  },
  {
    id: 'l3-q2',
    question: '「追加」ボタンの文字を「メモに足す」に変えたい。直すファイルはどれ？',
    choices: ['api/getItems.ts', 'hooks/useShoppingList.ts', 'components/ShoppingList.tsx'],
    answerIndex: 2,
    hint: 'ボタンの文字は、お客さんの目に見えるものです。',
    explanation: '見た目はホール（ShoppingList.tsx）。ルールや通信のファイルは開かなくて済みます。',
  },
  {
    id: 'l3-q3',
    question: '「メモを本物のサーバーから取ってくるようにしたい」。直すファイルはどれ？',
    choices: ['api/getItems.ts', 'hooks/useShoppingList.ts', 'components/ShoppingList.tsx'],
    answerIndex: 0,
    hint: 'サーバーとのやり取りは、だれの仕事でしたか？',
    explanation:
      '仕入れ業者（getItems.ts）の中身を fetch に書きかえるだけ。返す形（id と name の一覧）が同じなら、キッチンもホールも1文字も変えずに動きます。',
  },
  {
    id: 'l3-q4',
    question: 'ShoppingList.tsx（ホール）が読みこんでいるのはどれ？',
    choices: [
      'getItems（仕入れ業者）を直接読みこんでいる',
      'useShoppingList（キッチン）だけを読みこんでいる',
      '何も読みこんでいない',
    ],
    answerIndex: 1,
    hint: '上の ShoppingList.tsx のコードの、いちばん上の import の行を見てみよう。',
    explanation:
      'ホールが知っているのはキッチンだけ。仕入れ業者のことは知りません。だから、仕入れのやり方が変わってもホールは影響を受けません。',
  },
  {
    id: 'l3-q5',
    question: '入力中の文字（text）は、なぜホール（コンポーネント）側で持っているの？',
    choices: [
      'フックでは useState が使えないから',
      '「入力欄にいま何が打たれているか」は画面の都合で、メモのルールとは関係ないから',
      'たまたま。どこに書いても同じ',
    ],
    answerIndex: 1,
    hint: 'キッチンが知りたいのは「何を追加してほしいか」だけ。打っている途中の1文字1文字は必要でしょうか。',
    explanation:
      '「画面だけの一時的な状態」はホールが持って構いません。キッチンが持つのは、機能としての大事なデータ（メモの中身）とルールです。迷ったら「ほかの画面でも同じ値が要るか？」と考えます。',
  },
];

const TASK: MiniTaskData = {
  id: 'l3-task',
  prompt: '「メモの品物を消せるようにしたい（各行に『消す』ボタンを付ける）」。3つのファイルのうち、どれに何を足しますか？ 足さないファイルがあれば、それも理由つきで書いてみよう。',
  modelAnswer: [
    '🍳 hooks/useShoppingList.ts … removeItem(id) という操作を足す（items から、その id のものを取りのぞく）。返す値に removeItem を加える。',
    '🙋 components/ShoppingList.tsx … 各行に「消す」ボタンを置き、押されたら removeItem(item.id) を呼ぶ。',
    '🚚 api/getItems.ts … 何も足さない。「取ってくる」やり方は変わらないから。',
    '（発展）消したことをサーバーにも伝えるなら、api/deleteItem.ts を新しく作り、removeItem の中から呼ぶ。',
  ],
  passLine: '「消すという操作はキッチン、ボタンはホール」と分けられていれば合格。',
};

const CHECKLIST: ChecklistItem[] = [
  {
    id: 'l3-c1',
    text: 'コンポーネントの import に、api のファイルが出てこないか',
    reason: 'ホールが仕入れ業者と直接話しているサイン。フックを通す。',
  },
  {
    id: 'l3-c2',
    text: 'コンポーネントの中の「もし〜なら」が、見た目の出し分けだけになっているか',
    reason: '「読みこみ中なら〜を出す」は見た目なのでOK。「空ならエラー」のようなルールが混ざっていたらフックへ。',
  },
  {
    id: 'l3-c3',
    text: 'フックが返すものが「データ」と「操作」だけで、名前から意味が分かるか',
    reason: 'items, isLoading, addItem のように、ホールが読んで分かる名前になっていると、フックの中を読まなくても使える。',
  },
  {
    id: 'l3-c4',
    text: '読みこみ中・失敗したときの扱いがあるか',
    reason: '通信は遅いことも失敗することもある。isLoading と loadError が無いコードは、うまくいく場合しか考えていない。',
  },
  {
    id: 'l3-c5',
    text: 'api の関数が、返すデータの形（型）をはっきり書いているか',
    reason: 'Promise<Item[]> のように書いてあると、キッチンは「何が届くか」を迷わない。業者との約束ごとになる。',
  },
  {
    id: 'l3-c6',
    text: 'useEffect の中身が「1つのこと」だけをしているか',
    reason: '読みこみも、計算も、保存も1つの useEffect に詰めこむと、いつ何が動くのか追えなくなる。',
  },
  {
    id: 'l3-c7',
    text: '同じルールが、2か所に書かれていないか',
    reason: '「空はダメ」がフックにもコンポーネントにもあると、片方だけ直して食いちがう。ルールはキッチンに1か所だけ。',
  },
];

const MISTAKES: Mistake[] = [
  {
    pattern: 'フックに「画面の言葉」が入りこむ',
    sign: 'フックの中で、色の名前やクラス名、ボタンの文言を決めている。',
    why: 'デザインを変えるたびにキッチンを開くことになる。別の画面で同じフックを使うと、見た目まで付いてきてしまう。',
    fix: 'フックは「状態」（例：エラーかどうか、エラーの内容）だけ返す。どう見せるかはコンポーネントが決める。',
  },
  {
    pattern: 'コンポーネントが、フックの中身を知りすぎている',
    sign: 'コンポーネントが setItems のような「生の道具」を受け取って、自分で配列を組み立てている。',
    why: 'ルールがホール側にもれ出す。ほかの画面で同じことをしたくなったら、また同じコードを書くことになる。',
    fix: 'フックは setItems を外に出さず、addItem・removeItem のような「意味のある操作」として出す。',
  },
  {
    pattern: 'api の関数が、届いたデータを勝手に加工する',
    sign: 'getItems の中で、並べかえや絞りこみ、画面用の文字づくりをしている。',
    why: '別の場所で「並べかえ前のデータ」が欲しくなったとき使えない。業者が勝手に下ごしらえをしている状態。',
    fix: '業者は届けるだけ。並べかえ・絞りこみはキッチン（フック）で行う。',
  },
  {
    pattern: '分けたら、かえって長くなった',
    sign: '3ファイルの合計行数が、元の1ファイルより多い。',
    why: 'これは失敗ではありません。import や関数の枠の分だけ、合計は少し増えるのが普通です。',
    fix: '見るべきは合計ではなく「1つの変更で読む行数」。ボタンの文字を変えるのに読む量は、確実に減っています。',
  },
];

export function Lesson3({ onNext }: { onNext: () => void }) {
  const [demo, setDemo] = useState<'bad' | 'good'>('bad');
  const lines = (code: string) => code.replace(/\n+$/, '').split('\n').length;

  return (
    <>
      <Section title="今日のゴール" lead="第1回の「3つの役割」と第2回の「フォルダ構成」が、本物の React のコードでどう見えるかを確かめます。">
        <p>
          題材は<strong>「お買い物メモ」</strong>。最初にメモを読みこんで一覧に出し、品物を追加できるだけの小さなアプリです。
          同じ動きをするコードを、<strong>悪い例（1ファイルに全部入り）</strong>と<strong>良い例（3ファイルに分割）</strong>の2通りで見比べます。
        </p>
        <p className="muted">
          このページに出てくるコードは、説明用に書いた絵ではありません。この教材アプリの中で実際に動いているファイルを、そのまま表示しています。
        </p>
      </Section>

      <Section title="まず動かしてみる" lead="悪い例と良い例を切りかえて、触ってみよう。空のまま追加したり、同じ品物を2回追加したりすると…？">
        <div className="seg" role="group" aria-label="動かす例">
          <button type="button" className={demo === 'bad' ? 'seg-item is-on' : 'seg-item'} aria-pressed={demo === 'bad'} onClick={() => setDemo('bad')}>
            悪い例（1ファイル）
          </button>
          <button type="button" className={demo === 'good' ? 'seg-item is-on' : 'seg-item'} aria-pressed={demo === 'good'} onClick={() => setDemo('good')}>
            良い例（3ファイル）
          </button>
        </div>
        <div className="demo">{demo === 'bad' ? <BadShoppingList key="bad" /> : <ShoppingList key="good" />}</div>
        <Callout kind="look" title="気づいてほしいこと">
          <p>
            <strong>動きはまったく同じ</strong>です。使う人から見れば、どちらでも変わりません。
            分け方の良し悪しは、画面には出ません。差が出るのは、<strong>コードを読んで直す人</strong>にとってです。
          </p>
        </Callout>
      </Section>

      <Section title="悪い例：1ファイルに全部入り" lead={`全部で${lines(badCode)}行。上から読んで、「いま何の話をしているか」が何回切りかわるか数えてみよう。`}>
        <CodeBlock title="BadShoppingList.tsx" code={badCode} />
        <Callout kind="look" title="どこがつらいか">
          <ul>
            <li>
              <strong>話題が行ったり来たりする：</strong>状態の宣言 → 通信 → 画面 → ルール → また画面。
              「追加のルール」を探すには、画面のタグの中（<code>onSubmit</code> の中）までもぐらないと見つかりません。
            </li>
            <li>
              <strong>通信のやり方が画面に埋まっている：</strong>サーバーの住所が変わったら、画面のファイルを開くことになります。
            </li>
            <li>
              <strong>ルールだけを取り出せない：</strong>「同じ品物を断る」を別の画面でも使いたくても、フォームの中に書いてあるので持っていけません。
            </li>
            <li>
              <strong>これでまだ小さいほう：</strong>ここに「消す」「並べかえ」「保存」が加わると、同じ調子で200行、300行と伸びていきます。
            </li>
          </ul>
        </Callout>
      </Section>

      <Section title="分け方の手順" lead="いきなり3つに分けようとせず、外側から1つずつ取り出します。料理で言えば、まず買い出しを人に任せ、次に調理を任せる順番です。">
        <ol className="steps">
          <li>
            <p><strong>手順1：仕入れを外に出す。</strong>「アプリの外とやり取りしている所」を探して、関数にして <code>api/</code> へ。いちばん切り出しやすい所から始めます。</p>
            <CodeBlock title="手順1のあと" role="api" code={STEP1} />
          </li>
          <li>
            <p><strong>手順2：キッチンを作る。</strong>データを覚えている所（useState）と、ルール（もし〜なら）をまとめて <code>use〜</code> という関数へ。最後に「データ」と「操作」を返します。</p>
            <CodeBlock title="手順2のあと" role="logic" code={STEP2} />
          </li>
          <li>
            <p><strong>手順3：残りがホール。</strong>元のファイルには「キッチンを呼ぶ1行」と「画面」だけが残ります。</p>
            <CodeBlock title="手順3のあと" role="ui" code={STEP3} />
          </li>
        </ol>
        <Callout kind="tip" title="1手順ごとに動かして確かめる">
          <p>
            手順を1つ終えるたびに、画面を動かして「前と同じ動きか」を見ます。3つ全部を一気に動かすと、
            壊れたときにどの手順が原因か分からなくなります。<strong>小さく動かして、すぐ確かめる</strong>が安全です。
          </p>
        </Callout>
      </Section>

      <Section title="良い例：3ファイルに分割" lead="第2回のフォルダ構成に沿って置きます。1つずつ、上から読んでみよう。">
        <CodeBlock title="置き場所" lang="text" code={TREE} />

        <h3>
          ① <RoleBadge role="api" long />
        </h3>
        <CodeBlock title="api/getItems.ts" role="api" code={apiCode} />
        <Callout kind="look" title="このファイルの見どころ">
          <ul>
            <li>React の道具（useState など）が<strong>1つも出てこない</strong>。ただの関数です。</li>
            <li>
              <code>{'Promise<Item[]>'}</code> … 「あとで Item の一覧を届けます」という約束。業者とキッチンの間の取り決めです。
            </li>
            <li>本物のサーバーにつなぐとき、書きかえるのはこのファイルの中だけ。</li>
          </ul>
        </Callout>

        <h3>
          ② <RoleBadge role="logic" long />
        </h3>
        <CodeBlock title="hooks/useShoppingList.ts" role="logic" code={hookCode} />
        <Callout kind="look" title="このファイルの見どころ">
          <ul>
            <li>
              <strong>最後の return から読む：</strong><code>{'{ items, isLoading, loadError, inputError, addItem }'}</code>。
              これが「キッチンがホールに出すもの」の全部。ここを読めば、このフックで何ができるか分かります。
            </li>
            <li>
              <strong>タグが1つも無い：</strong>画面のことは何も知りません。だから、見た目がどう変わっても影響を受けません。
            </li>
            <li>
              <strong>ルールは addItem に集まっている：</strong>「空はダメ」「同じ品物はダメ」。ルールを変えたいときは、ここだけ見ればいい。
            </li>
            <li>
              <strong>ignore の印：</strong>読みこみの途中で画面が閉じられたとき、あとから届いた結果で状態を書きかえないための工夫です。
              通信を useEffect で行うときの決まり文句として覚えておけば十分です。
            </li>
            <li>
              <strong>setItems を外に出していない：</strong>ホールができるのは addItem を呼ぶことだけ。ルールを通らずにメモを書きかえる道がありません。
            </li>
          </ul>
        </Callout>

        <h3>
          ③ <RoleBadge role="ui" long />
        </h3>
        <CodeBlock title="components/ShoppingList.tsx" role="ui" code={componentCode} />
        <Callout kind="look" title="このファイルの見どころ">
          <ul>
            <li>
              <strong>1行目でキッチンから全部受け取る：</strong>あとは、受け取ったものを並べているだけ。
            </li>
            <li>
              <strong>「もし」は見た目の出し分けだけ：</strong>読みこみ中なら文字を出す、エラーがあれば出す。ルールの判断はしていません。
            </li>
            <li>
              <strong>text だけは自分で持つ：</strong>入力欄に打たれている途中の文字は「画面の都合」。追加が成功したら空に戻す、もホールの仕事です。
            </li>
            <li>
              <strong>import に api が無い：</strong>ホールは仕入れ業者の存在を知りません。
            </li>
          </ul>
        </Callout>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>やりたいこと</th>
                <th>悪い例で読む量</th>
                <th>良い例で読む量</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>ボタンの文字を変える</td>
                <td>{lines(badCode)}行（全部）</td>
                <td>{lines(componentCode)}行（ShoppingList.tsx だけ）</td>
              </tr>
              <tr>
                <td>追加のルールを変える</td>
                <td>{lines(badCode)}行（全部）</td>
                <td>{lines(hookCode)}行（useShoppingList.ts だけ）</td>
              </tr>
              <tr>
                <td>データの取り先を変える</td>
                <td>{lines(badCode)}行（全部）</td>
                <td>{lines(apiCode)}行（getItems.ts だけ）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          行数は、上に表示している実際のファイルから数えています（説明のコメントも含みます）。
          3ファイルの合計は元より少し増えますが、<strong>1回の変更で読む量</strong>は減っています。
        </p>
      </Section>

      <Section title="読みこみの「向き」を見る" lead="3つのファイルは、一方向にだけつながっています。">
        <div className="dep" role="img" aria-label="ShoppingList が useShoppingList を読みこみ、useShoppingList が getItems を読みこむ図">
          <div className="flow-node flow-ui">ShoppingList.tsx</div>
          <div className="dep-arrow">読みこむ →</div>
          <div className="flow-node flow-logic">useShoppingList.ts</div>
          <div className="dep-arrow">読みこむ →</div>
          <div className="flow-node flow-api">getItems.ts</div>
        </div>
        <Callout kind="why" title="なぜ一方向にするのか">
          <p>
            矢印の<strong>先にあるファイルは、手前のファイルのことを知りません</strong>。getItems は、自分がだれに呼ばれているかを知らない。
            だから、手前（画面）をどれだけ作り変えても、先（通信）は壊れません。
          </p>
          <p>
            もし逆向きの矢印（getItems が ShoppingList を読みこむ、など）ができると、輪っかになります。
            輪っかになると、どれか1つを直すたびに全部を気にしなければならず、分けた意味がなくなります。
          </p>
        </Callout>
        <Callout kind="look" title="向きの確かめ方">
          <p>
            各ファイルのいちばん上の <code>import</code> の行だけを見ます。<code>../api/</code> を読みこんでよいのは hooks だけ。
            <code>../hooks/</code> を読みこんでよいのは components だけ。<code>api</code> のファイルは、同じ機能の中の何も読みこみません。
          </p>
        </Callout>
      </Section>

      <Section title="分けると、確かめるのも楽になる" lead="役割が分かれていると、「この部分だけ」を取り出して試せます。">
        <Callout kind="example">
          <p>
            新しいレシピを試すとき、本物の市場から食材が届くのを待つ必要はありません。冷蔵庫にある決まった食材で試せば、
            <strong>レシピが正しいかどうかだけ</strong>を、すぐに確かめられます。コードでも同じことができます。
          </p>
        </Callout>
        <CodeBlock title="仕入れ業者を差しかえる（イメージ）" code={MOCK_TEST} />
        <p>
          悪い例では、通信が画面の中に直接書かれているので、この差しかえができません。
          <strong>「差しかえられる」のは、通信が別の関数として外に出ているから</strong>です。
          今すぐテストを書けなくても大丈夫。「分けておくと、あとで確かめやすい」とだけ覚えておいてください。
        </p>
      </Section>

      <Section title="レビューで気をつけること" lead="分割されたコードを見るときの確認項目です。AI に書いてもらったコードにも、そのまま使えます。">
        <Checklist items={CHECKLIST} />
      </Section>

      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="理解度チェック" lead="上のコードを見返しながら答えて大丈夫です。全問正解して、ミニ課題に納得できたら、第4回へ進めます。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>

      <LessonFooter lessonId={3} questions={QUIZ} tasks={[TASK]} onNext={onNext} />
    </>
  );
}
