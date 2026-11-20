import type { FaqItem } from '../../../shared/components/Faq';
import type { MiniTaskData, QuizQuestion } from '../../../features/quiz';
import type { ChecklistItem } from '../../../features/checklist';
import type { Mistake } from '../../../shared/components/Mistakes';
import { shoppingListSource } from '../../../features/shopping-list';
import { badShoppingListSource } from '../../../features/shopping-list-bad';

// 第3回で見せるコードは、このアプリの中で実際に動いているファイルそのもの
export const badCode = badShoppingListSource;
export const apiCode = shoppingListSource.api;
export const hookCode = shoppingListSource.hook;
export const componentCode = shoppingListSource.component;
export const hookTestCode = shoppingListSource.hookTest;

export const countLines = (code: string) => code.replace(/\n+$/, '').split('\n').length;

export const TREE = `src/features/shopping-list/
├─ api/
│   └─ getItems.ts  ← 🚚 データを取るだけ
├─ hooks/
│   └─ useShoppingList.ts  ← 🍳 データを管理して、追加処理をするだけ
├─ components/
│   └─ ShoppingList.tsx  ← 🙋 画面に表示して、ボタンを押させるだけ
└─ index.ts  ← 受付窓口`;

export const STEP1 = `// api/getItems.ts に引っ越し
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

export const STEP2 = `// hooks/useShoppingList.ts に引っ越し
export function useShoppingList() {
  const [items, setItems] = useState<Item[]>([]);
  // ...読みこみ中・エラーの状態、最初の読みこみ...

  const addItem = (name: string): boolean => {
    // 空はダメ、同じ品物もダメ、というルール
  };

  return { items, isLoading, loadError, inputError, addItem, clearInputError };
}`;

export const STEP3 = `// components/ShoppingList.tsx に残るもの
export function ShoppingList() {
  const { items, isLoading, loadError, inputError, addItem, clearInputError } = useShoppingList();
  const [text, setText] = useState('');

  // あとは、受け取ったものを画面に出すだけ
  return ( /* 一覧・入力欄・ボタン・エラー文 */ );
}`;

export const QUIZ: QuizQuestion[] = [
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

export const TASK: MiniTaskData = {
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

export const CHECKLIST: ChecklistItem[] = [
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

export const MISTAKES: Mistake[] = [
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

export const FAQ: FaqItem[] = [
  {
    question: 'useEffect が何をしているのか、よく分からない',
    answer: [
      '「画面に出たときに、1回だけやってほしいこと」を書く場所、と考えてください。ここでは「最初にメモを取ってくる」がそれです。',
      '最後の [] は「最初の1回だけ」という印です。return で返している関数は「画面から消えるときの後片付け」で、ここでは「あとから届いた結果は無視する」印を立てています。',
    ],
  },
  {
    question: '入力中の文字（text）もフックに入れたほうが、すっきりしない？',
    answer: [
      '入れても動きます。ただ、打っている途中の1文字1文字は、メモのルールとは関係がありません。キッチンが知りたいのは「何を追加してほしいか」だけです。',
      '画面だけの一時的な状態はホールに置く、と決めておくと、フックが「機能として大事なこと」だけになり、読みやすさが保てます。',
    ],
  },
  {
    question: '3つに分けたら、合計の行数は増えた。それでも良いの？',
    answer: [
      '良いです。import や関数の枠の分だけ、合計は少し増えるのが普通です。',
      '比べるべきは合計ではなく「1つの変更のために読む行数」です。ボタンの文字を変えるために読む量は、分けたあとのほうが確実に少なくなっています。',
    ],
  },
  {
    question: 'フックの中の addItem は、なぜ true / false を返しているの？',
    answer: [
      'ホールが「追加できたら入力欄を空にする」ためです。できたかどうかを知らないと、失敗したときにも入力が消えてしまいます。',
      'キッチンは結果だけを伝え、入力欄をどうするか（空にする）はホールが決めています。ここでも役割が分かれています。',
    ],
  },
  {
    question: 'フックをさらに細かく分けたくなったら？',
    answer: [
      'フックが長くなり、「読みこみ」と「追加のルール」のように話題が2つ以上になったら、分ける合図です。',
      'React の道具を使わない計算（並べかえ、合計など）は、ただの関数として取り出すと、単体で確かめやすくなります。第4回のおまけに、その例があります。',
    ],
  },
];
