import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { RoleBadge } from '../../../shared/components/RoleBadge';
import { Section } from '../../../shared/components/Section';
import { Checklist, type ChecklistItem } from '../../checklist';
import { MiniTask, Quiz, type MiniTaskData, type QuizQuestion } from '../../quiz';
import { LessonFooter } from './LessonFooter';
import { Mistakes, type Mistake } from './Mistakes';

const ROLE_CHOICES = ['🙋 ホールスタッフ', '🍳 キッチン', '🚚 仕入れ業者'];

const sorting = (id: string, question: string, answerIndex: number, explanation: string): QuizQuestion => ({
  id: `l1-sort-${id}`,
  question,
  choices: ROLE_CHOICES,
  answerIndex,
  hint: '「見た目の話」ならホール、「ルールや計算の話」ならキッチン、「アプリの外とのやり取り」なら仕入れ業者。',
  explanation,
});

const SORTING: QuizQuestion[] = [
  sorting('button', '「追加」ボタンを青色にして、入力欄の右に置く', 0, '色や配置は見た目の話。ホールスタッフの仕事です。'),
  sorting('fetch', 'サーバーから商品の一覧を取ってくる', 2, 'アプリの外（サーバー）とのやり取りは、仕入れ業者の仕事です。'),
  sorting('empty', '品名が空っぽのまま追加しようとしたら、断る', 1, '「空はダメ」はルール。ルールを決めて守らせるのはキッチンです。'),
  sorting('total', '買い物かごの合計金額を計算する', 1, '計算はキッチンの仕事。ホールは、出てきた合計を画面に出すだけです。'),
  sorting('loading', '読み込み中のあいだ、ぐるぐる回るマークを出す', 0, '「何を見せるか」はホールの仕事。「いま読み込み中かどうか」を知っているのはキッチンで、ホールはそれを聞いて表示を切りかえます。'),
  sorting('save', '入力された感想を、サーバーに送って保存する', 2, '送る・保存するも、アプリの外とのやり取り。仕入れ業者です（届けるのも業者の仕事）。'),
  sorting('sort', '一覧を、新しい順に並べかえる', 1, 'データの加工はキッチン。ホールは、並べかえ済みのものを上から順に出すだけ。'),
  sorting('list', '受け取った一覧を、1行ずつ画面に並べて出す', 0, '受け取ったものをそのまま並べて見せるのは、ホールの仕事です。'),
];

const QUIZ: QuizQuestion[] = [
  {
    id: 'l1-q1',
    question: 'ホールスタッフ（コンポーネント）が「やらない」ことはどれ？',
    choices: ['ボタンを画面に置く', 'サーバーと通信して、データを計算し直す', '受け取ったデータを画面に出す'],
    answerIndex: 1,
    hint: 'ホールスタッフは料理も仕入れもしません。お客さんの前に立つ係です。',
    explanation:
      '通信は仕入れ業者、計算はキッチンの仕事。ホールは「見せる」と「注文（ボタンが押されたこと）をキッチンに伝える」だけです。',
  },
  {
    id: 'l1-q2',
    question: '1つのファイルに全部書くと、いちばん困るのはどんなとき？',
    choices: [
      'アプリを最初に作る瞬間',
      'あとから「ボタンの色だけ」変えたいのに、計算や通信のコードも一緒に読まないといけないとき',
      'ファイルの数を数えるとき',
    ],
    answerIndex: 1,
    hint: '困るのは「作るとき」より「直すとき」。コードは書く時間より、読む時間のほうがずっと長いです。',
    explanation:
      '全部入りのファイルは、少し直すだけでも全体を読むことになり、関係ない所をうっかり壊しやすくなります。分けてあれば、見た目の変更はホールのファイルだけ見れば済みます。',
  },
  {
    id: 'l1-q3',
    question: 'キッチン（カスタムフック）は、名前の付け方に決まりがあります。どれ？',
    choices: ['get で始める（getItems）', 'use で始める（useShoppingList）', '大文字で始める（ShoppingList）'],
    answerIndex: 1,
    hint: 'このページの「3つの役割」の表に、名前の例が書いてあります。',
    explanation:
      'カスタムフックは use で始めるのが React の決まり。名前を見ただけで「これはキッチンだ」と分かります。大文字始まりはコンポーネント（ホール）の目印です。',
  },
];

const TASK: MiniTaskData = {
  id: 'l1-task',
  prompt: '友だちに「なんでコードを3つに分けるの？ 1つのファイルでも動くじゃん」と聞かれました。レストランのたとえを使って、ひとことで答えてみよう。',
  modelAnswer: [
    '「接客しながら料理も仕入れもする店員が1人だけの店」を想像してみて。お客さんが少ないうちは回るけど、メニューが増えると、どこで何が起きているのか誰にも分からなくなる。',
    '役割を分けておけば、「見た目を変えたい」→ホール、「ルールを変えたい」→キッチン、「データの取り先を変えたい」→仕入れ業者、と見る場所が1つに決まる。',
    'つまり、分ける目的は「あとで直すときに、探す場所と壊す心配を小さくするため」。',
  ],
  passLine: '「動くかどうか」ではなく「あとで直しやすいかどうか」の話だ、と言えていれば合格。',
};

const CHECKLIST: ChecklistItem[] = [
  {
    id: 'l1-c1',
    text: 'このファイルの役割を、ひとことで言えるか',
    reason: '「〜を表示して、〜を計算して、〜を取ってくる」と「て」でつながるなら、役割が混ざっているサイン。',
  },
  {
    id: 'l1-c2',
    text: 'コンポーネントの中に、通信（fetch など）が直接書かれていないか',
    reason: 'ホールスタッフが市場へ買い出しに行っている状態。仕入れ業者のファイルに移す。',
  },
  {
    id: 'l1-c3',
    text: 'コンポーネントの中に、長い計算や入力チェックが埋まっていないか',
    reason: 'ホールで料理をしている状態。キッチン（フック）に移すと、見た目のコードが短くなる。',
  },
  {
    id: 'l1-c4',
    text: 'フック（use〜）が、画面の見た目（タグ）を返していないか',
    reason: 'キッチンが客席まで出てきている状態。フックが返すのは「データ」と「操作」だけ。',
  },
  {
    id: 'l1-c5',
    text: '通信のファイルが、画面の状態（読み込み中かどうか等）まで管理していないか',
    reason: '仕入れ業者は届けるだけ。届いたものをどう扱うかはキッチンが決める。',
  },
];

const MISTAKES: Mistake[] = [
  {
    pattern: 'なんでも屋コンポーネント',
    sign: '1つのコンポーネントが100行をこえ、useState と useEffect がたくさん並び、その下に長い画面のコードが続く。',
    why: 'どこを直しても全体を読むことになる。同じ計算を別の画面で使いたくなっても、取り出せない。',
    fix: 'まず通信の部分を関数にして外へ出す。次に、データと操作をフックにまとめる。残った「見せるだけ」がコンポーネント。（第3回で実際にやります）',
  },
  {
    pattern: '分けたつもりで、中身は混ざったまま',
    sign: 'フックの名前は付いているのに、その中で画面の文言や色を決めている。あるいは、API のファイルの中で入力チェックをしている。',
    why: 'ファイルは分かれているのに、「見た目を変えたい」ときに3か所とも開くことになり、分けた意味がなくなる。',
    fix: '「この1行は、見た目・ルール・外とのやり取りのどれ？」と1行ずつ聞いて、合うファイルへ動かす。',
  },
  {
    pattern: '最初から分けすぎる',
    sign: '5行で済む内容なのに、ファイルが6つも7つもある。読むために行ったり来たりする。',
    why: '分けること自体が目的になると、かえって読みにくい。役割分担は「直しやすさ」のための道具。',
    fix: '基本の3つ（見せる・決める・取ってくる）だけ守る。それ以上は「困ってから」分ける。',
  },
];

const KITCHEN_SINK = `function ShoppingPage() {
  // ↓ 仕入れ（通信）
  useEffect(() => { fetch('/api/items').then(/* ... */) }, []);

  // ↓ 料理（ルール・計算）
  const add = () => {
    if (text.trim() === '') { /* エラーにする */ }
    if (items.some(/* 同じ品物がある？ */)) { /* エラーにする */ }
    /* ... */
  };

  // ↓ 接客（見た目）
  return <div> ...たくさんのタグ... </div>;
}`;

export function Lesson1({ onNext }: { onNext: () => void }) {
  return (
    <>
      <Section title="今日のゴール" lead="アプリの中身は、レストランと同じ3つの役割でできている。これだけ覚えれば今日は合格です。">
        <p>
          React のコードを前にして「どこに何を書けばいいのか分からない」と感じるのは、あなたのせいではありません。
          <strong>「役割分担」という地図をまだ持っていないだけ</strong>です。
          今日はその地図を、レストランにたとえて手に入れます。むずかしい言葉は使いません。
        </p>
      </Section>

      <Section title="アプリはレストランと同じ" lead="お客さん（アプリを使う人）から見えるのはホールだけ。その奥にキッチンがあり、さらに外から食材が届きます。">
        <div className="flow" role="img" aria-label="お客さん、ホールスタッフ、キッチン、仕入れ業者、市場の順につながる図">
          <div className="flow-node flow-outside">🧑 お客さん<small>アプリを使う人</small></div>
          <div className="flow-arrow">注文 ↓ ↑ 料理</div>
          <div className="flow-node flow-ui">🙋 ホールスタッフ<small>コンポーネント（画面）</small></div>
          <div className="flow-arrow">注文を伝える ↓ ↑ 料理を受け取る</div>
          <div className="flow-node flow-logic">🍳 キッチン<small>カスタムフック（use〜）</small></div>
          <div className="flow-arrow">食材を頼む ↓ ↑ 食材が届く</div>
          <div className="flow-node flow-api">🚚 仕入れ業者<small>API・通信の関数</small></div>
          <div className="flow-arrow">↓ ↑</div>
          <div className="flow-node flow-outside">🏪 市場<small>サーバー・データベース</small></div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>役割</th>
                <th>やること</th>
                <th>やらないこと</th>
                <th>コードでの姿</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><RoleBadge role="ui" /></td>
                <td>画面に出す。ボタンや入力欄を置く。押されたらキッチンに伝える。</td>
                <td>計算、入力チェック、通信</td>
                <td>
                  コンポーネント<br />
                  <code>ShoppingList.tsx</code>
                  <br />
                  <small>大文字で始まる・タグを返す</small>
                </td>
              </tr>
              <tr>
                <td><RoleBadge role="logic" /></td>
                <td>データを覚えておく。加工・計算する。入力をチェックする。</td>
                <td>見た目を決める、通信の細かいやり方</td>
                <td>
                  カスタムフック<br />
                  <code>useShoppingList.ts</code>
                  <br />
                  <small>use で始まる・データと操作を返す</small>
                </td>
              </tr>
              <tr>
                <td><RoleBadge role="api" /></td>
                <td>サーバーなど「アプリの外」からデータを取ってくる・届ける。</td>
                <td>画面のこと、ルールのこと</td>
                <td>
                  ふつうの関数<br />
                  <code>getItems.ts</code>
                  <br />
                  <small>get / create などで始まる・データを返す</small>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Callout kind="tip" title="「カスタムフック」ってなに？">
          <p>
            名前が <code>use</code> で始まる、自分で作る関数のことです。React の <code>useState</code>（覚えておく道具）などを中で使って、
            「データ」と「そのデータを変える操作」をひとまとめにして返します。今は<strong>「キッチン＝use で始まるファイル」</strong>とだけ覚えれば十分です。
          </p>
        </Callout>
      </Section>

      <Section title="注文が通る流れを追ってみる" lead="「お買い物メモに『牛乳』を追加する」とき、3つの役割はこう動きます。">
        <ol className="steps">
          <li>
            <RoleBadge role="ui" /> お客さんが「牛乳」と入力して「追加」を押す。ホールは<strong>中身を判断せず</strong>、そのままキッチンに伝える。
          </li>
          <li>
            <RoleBadge role="logic" /> キッチンがルールを確かめる。「空っぽじゃない？」「もうメモに無い？」。問題なければメモに足す。
          </li>
          <li>
            <RoleBadge role="api" /> 保存が必要なら、キッチンが仕入れ業者に「これをサーバーに届けて」と頼む。
          </li>
          <li>
            <RoleBadge role="ui" /> キッチンから新しいメモが出てくる。ホールはそれを画面に並べ直す。
          </li>
        </ol>
        <Callout kind="look" title="流れは必ず「一方向」">
          <p>
            頼みごとは <strong>ホール → キッチン → 仕入れ業者</strong> の向きにしか流れません。
            仕入れ業者がホールに直接指示を出したり、キッチンが客席のテーブルを動かしたりはしません。
            この「向き」は第3回でコードの形になって出てきます。
          </p>
        </Callout>
      </Section>

      <Section title="1つのファイルに全部書くと、なぜカオスになるのか">
        <Callout kind="example">
          <p>
            店員が1人しかいない店を想像してください。お客さんの注文を聞いている途中で鍋が吹きこぼれ、
            火を止めに行ったら食材が切れていて、買い出しに走る。そのあいだ、お客さんは放っておかれます。
            <strong>1つのファイルに全部書く</strong>のは、この店員と同じ状態です。
          </p>
        </Callout>
        <p>コードで見ると、こうなります（中身は省略しています。第3回で本物を見ます）。</p>
        <CodeBlock title="全部入りのコンポーネント（イメージ）" code={KITCHEN_SINK} />
        <p>動きはします。困るのは<strong>あとから</strong>です。</p>
        <ul>
          <li>
            <strong>読むのが大変：</strong>ボタンの色を変えたいだけなのに、通信と計算のコードを読み飛ばしながら探すことになる。
          </li>
          <li>
            <strong>壊しやすい：</strong>全部が同じ場所にあるので、見た目を直したつもりで計算を壊す、が起きる。
          </li>
          <li>
            <strong>使い回せない：</strong>「同じメモを別の画面にも出したい」と思っても、計算が画面にくっついていて取り出せない。
          </li>
          <li>
            <strong>確かめにくい：</strong>「空の品名を断るか」を確かめたいだけなのに、画面ごと動かさないと試せない。
          </li>
          <li>
            <strong>一緒に作業しにくい：</strong>2人が同じファイルを同時に直すことになり、ぶつかる。
          </li>
        </ul>
      </Section>

      <Section title="なぜこの分け方なのか">
        <Callout kind="why" title="「変わる理由」が違うものは、別の場所に置く">
          <p>3つの役割は、<strong>変わるきっかけがそれぞれ違います</strong>。</p>
          <ul>
            <li>見た目が変わるのは、「デザインを変えたい」とき。</li>
            <li>ルールが変わるのは、「同じ品物も追加できるようにしたい」など、決まりを変えたいとき。</li>
            <li>通信が変わるのは、「サーバーの住所や返ってくる形が変わった」とき。</li>
          </ul>
          <p>
            きっかけが違うものを別のファイルにしておくと、<strong>1つの変更で開くファイルが1つで済みます</strong>。
            これが、分けることで得られるいちばん大きなごほうびです。
          </p>
        </Callout>
        <Callout kind="why" title="なぜ「3つ」なのか">
          <p>
            もっと細かく分ける流儀もあります。でも、最初から細かくすると、どこに置くかで毎回迷います。
            「見せる・決める・取ってくる」の3つは、<strong>ほとんどのコードが迷わずどれかに入る</strong>、ちょうどいい粗さです。
            小さなアプリならこの3つで最後まで足ります。足りなくなったら、そのとき分ければ十分です。
          </p>
        </Callout>
        <Callout kind="warn" title="分けることにも、少しだけコストがある">
          <p>
            ファイルが増える分、行ったり来たりは増えます。だから、<strong>10行で終わる使い捨ての画面</strong>まで無理に3つに分ける必要はありません。
            目安は「通信がある」「ルール（もし〜なら）が2つ以上ある」「ほかの画面でも使いそう」のどれかに当てはまったら分ける、です。
          </p>
        </Callout>
      </Section>

      <Section title="コードを見るときのポイント" lead="知らないコードを開いたとき、まずここを見ると役割が分かります。">
        <Callout kind="look" title="3秒で役割を見分ける">
          <ul>
            <li>
              <strong>ファイル名を見る：</strong>大文字始まりで <code>.tsx</code> → ホール。<code>use</code> 始まり → キッチン。
              <code>get</code> や <code>create</code> 始まり、または <code>api</code> フォルダの中 → 仕入れ業者。
            </li>
            <li>
              <strong>最後に何を返しているか見る：</strong>タグ（<code>{'<div>'}</code> など）を返す → ホール。
              データと関数のセットを返す → キッチン。データだけを返す → 仕入れ業者。
            </li>
            <li>
              <strong>いちばん上の読みこみ（import）を見る：</strong>そのファイルが「誰に頼っているか」が分かる。
              ホールがキッチンを、キッチンが仕入れ業者を読みこんでいれば、流れは正しい。
            </li>
          </ul>
        </Callout>
        <Callout kind="look" title="読む順番のおすすめ">
          <p>
            知らない機能を読むときは <strong>ホール → キッチン → 仕入れ業者</strong> の順が楽です。
            画面を見れば「何ができる機能か」が分かり、キッチンで「どんなルールか」が分かり、最後に「データはどこから来るか」が分かります。
            お客さんと同じ入口から店に入る、と覚えてください。
          </p>
        </Callout>
      </Section>

      <Section title="練習：この仕事はだれの担当？" lead="8つの仕事を、3つの役割に仕分けてみよう。まちがえても、何度でも選び直せます。">
        <Quiz questions={SORTING} compact />
      </Section>

      <Section title="レビューで気をつけること" lead="自分のコードでも、人のコードでも、AI が書いたコードでも、同じ項目で見られます。確認できたらチェックを入れよう。">
        <Checklist items={CHECKLIST} />
      </Section>

      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="理解度チェック" lead="全問正解して、ミニ課題に納得できたら、第2回へ進めます。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>

      <LessonFooter lessonId={1} questions={[...SORTING, ...QUIZ]} tasks={[TASK]} onNext={onNext} />
    </>
  );
}
