import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { Section } from '../../../shared/components/Section';
import { BlueprintBuilder } from '../../blueprint';
import { Checklist, type ChecklistItem } from '../../checklist';
import { MiniTask, Quiz, type MiniTaskData, type QuizQuestion } from '../../quiz';
import { LessonFooter } from './LessonFooter';
import { Mistakes, type Mistake } from './Mistakes';

const THIS_APP_TREE = `react-training/src/
├─ App.tsx                    ← 入口。回を切りかえて、機能を並べるだけ
├─ features/
│   ├─ lessons/               ← 第1〜4回の本文と、回の切りかえ
│   ├─ quiz/                  ← クイズとミニ課題
│   ├─ checklist/             ← レビューチェックリスト
│   ├─ progress/              ← 進み具合の保存
│   │   ├─ api/progressStorage.ts      🚚 ブラウザの保存場所とやり取り
│   │   ├─ hooks/useProgressState.ts   🍳 答える・チェックする・完了する
│   │   └─ components/ProgressProvider.tsx
│   ├─ shopping-list/         ← 第3回の良い例（3ファイル）
│   ├─ shopping-list-bad/     ← 第3回の悪い例（1ファイル）
│   └─ blueprint/             ← このページの設計図づくり
│       ├─ api/blueprintStorage.ts     🚚 書きかけの保存
│       ├─ logic/generateBlueprint.ts  🍳 設計図を作る計算（テスト付き）
│       ├─ hooks/useBlueprint.ts       🍳 入力内容と操作
│       └─ components/BlueprintBuilder.tsx  🙋 入力欄と結果の表示
└─ shared/
    ├─ components/            ← コード表示・囲み・見出しなど共用の部品
    └─ lib/                   ← 保存の道具、コードの色分け`;

const FIRST_STEPS = `# 1. 新しい React のプロジェクトを作る（my-app は好きな名前に）
npm create vite@latest my-app -- --template react-ts
cd my-app
npm install

# 2. 設計図どおりにフォルダを作り、ひな形コードを貼る
#    （src/features/〇〇/api, hooks, components）

# 3. 動かす
npm run dev`;

const QUIZ: QuizQuestion[] = [
  {
    id: 'l4-q1',
    question: '機能を洗い出すとき、最初にやるとよいことは？',
    choices: [
      'フォルダを10個くらい先に作っておく',
      '「このアプリで、使う人は何ができる？」を短い文で書き出す',
      'いちばんむずかしい機能のコードから書き始める',
    ],
    answerIndex: 1,
    hint: '機能は、コードの都合ではなく「使う人ができること」から見つけます。',
    explanation:
      '「本を登録できる」「感想を書ける」のように書き出すと、文の中の名詞（本、感想）が機能の候補、動詞（登録する、書く）がその機能の操作になります。',
  },
  {
    id: 'l4-q2',
    question: '機能のフォルダ名として、いちばん良いのはどれ？',
    choices: ['utils', 'page1', 'book-review', 'components2'],
    answerIndex: 2,
    hint: '名前を見ただけで「何をする場所か」が分かるのはどれでしょう。',
    explanation:
      'book-review なら「本の感想に関するものが入っている」と開く前に分かります。utils や page1 は、中身が想像できません。',
  },
  {
    id: 'l4-q3',
    question: '設計図ができました。最初に作り始めるのはどれが良い？',
    choices: [
      'すべての機能を少しずつ、同時に',
      'いちばん大事な機能を1つだけ、画面に出るところまで',
      'shared フォルダの共用部品を先に全部',
    ],
    answerIndex: 1,
    hint: 'レストランを開くとき、全メニューを同時に開発しますか？ まず看板メニューを1つ、出せるところまで作ります。',
    explanation:
      '1つの機能を、仕入れ・キッチン・ホールまで通して動かすと、構成がうまくいっているか早く分かります。共用部品は、2つ目の機能で必要になってから作れば十分です。',
  },
  {
    id: 'l4-q4',
    question: '「日付を『3月5日』の形にする関数」を、いまは読書記録の機能だけで使っています。どこに置く？',
    choices: [
      'shared/lib/ に置く（いつか他でも使いそうだから）',
      'いまは読書記録の機能の中に置き、2つ目の機能で必要になったら shared に移す',
      'App.tsx に書く',
    ],
    answerIndex: 1,
    hint: '第2回の「早すぎる共通化」を思い出そう。',
    explanation:
      '「いつか使うかも」で shared に置くと、共用の物置がふくらみます。使う場所が2つになったときに引っ越す、が迷わないルールです。',
  },
];

const TASK: MiniTaskData = {
  id: 'l4-task',
  prompt: '上で作った自分の設計図を見て、「最初に作る機能」を1つ選び、その理由と、その機能の3つのファイルがそれぞれ何をするかを書いてみよう。',
  modelAnswer: [
    '（例：読書ノートの場合）最初に作るのは book-list。本の一覧が出ないと、感想もグラフも作れないから。',
    '🚚 api/getBookList.ts … 登録済みの本の一覧を取ってくる。',
    '🍳 hooks/useBookList.ts … 一覧を覚えておく。本を追加する操作（題名が空なら断る）を持つ。',
    '🙋 components/BookList.tsx … 一覧と、追加の入力欄・ボタンを画面に出す。',
    '選ぶ基準：「これが無いと、ほかの機能が成り立たない」ものから。',
  ],
  passLine: '選んだ理由が言えて、3つのファイルの役割を「取ってくる・決める・見せる」で説明できていれば合格。',
};

const CHECKLIST: ChecklistItem[] = [
  {
    id: 'l4-c1',
    text: 'features のフォルダ名を読むだけで、アプリでできることが分かるか',
    reason: 'フォルダ名の一覧が、そのままアプリの目次になっているのが理想。',
  },
  {
    id: 'l4-c2',
    text: 'それぞれの機能を、「〜を〜する場所」とひとことで説明できるか',
    reason: '説明に「と」「あと」が何回も入るなら、2つの機能が1つに混ざっている。',
  },
  {
    id: 'l4-c3',
    text: '1つの機能が大きすぎないか（ファイルが10個をこえそうなら分ける候補）',
    reason: '大きすぎる引き出しは、また中で探すことになる。',
  },
  {
    id: 'l4-c4',
    text: '逆に、細かく分けすぎていないか（ボタン1つで1機能、になっていないか）',
    reason: '機能は「使う人にとって意味のあるひとまとまり」。部品の単位ではない。',
  },
  {
    id: 'l4-c5',
    text: 'データのやり取りが無い機能に、空の api フォルダを作っていないか',
    reason: '要らないものは作らない。必要になったら足せばいい。',
  },
  {
    id: 'l4-c6',
    text: '最初に作る機能を1つ、決めたか',
    reason: '全部を同時に始めると、どれも動かないまま時間が過ぎる。',
  },
  {
    id: 'l4-c7',
    text: 'ひな形コードの TODO を、自分のアプリの言葉で埋められそうか',
    reason: '埋められない TODO があれば、その機能で「何をしたいか」がまだ決まっていないサイン。先にそこを考える。',
  },
];

const MISTAKES: Mistake[] = [
  {
    pattern: '機能を「画面の数」で数える',
    sign: 'home, detail, settings のように、ページ名がそのまま機能になっている。',
    why: '1つの画面に複数の機能が出るし、1つの機能が複数の画面に出る。画面で切ると、同じコードがあちこちに必要になる。',
    fix: '「何を扱うか」で切り直す。画面は、機能を並べる入口（app）側の仕事。',
  },
  {
    pattern: '最初から全部の機能を作りこもうとする',
    sign: '設計図に機能が10個あり、どれも「あとで要りそう」で入っている。',
    why: '使うか分からないものに時間を使い、いちばん大事な機能が後回しになる。',
    fix: '「これが無いとアプリにならない」ものを2〜3個だけ選ぶ。残りは名前だけメモしておく。',
  },
  {
    pattern: 'ひな形を貼って満足する',
    sign: 'TODO がそのまま残り、データの形が id と name のまま。',
    why: 'ひな形は「どこに何を書くか」の枠でしかない。中身は自分のアプリのもの。',
    fix: 'まず api のデータの形（本なら題名・著者・読んだ日など）を自分の言葉で決める。そこが決まると、キッチンとホールも書けるようになる。',
  },
  {
    pattern: '設計図を「一度決めたら変えてはいけないもの」と思う',
    sign: '作っている途中で合わないと感じても、最初の構成のまま無理に進める。',
    why: '作ってみて初めて分かることは必ずある。合わない構成に合わせてコードをゆがめるほうが、あとで直しにくい。',
    fix: '機能の名前を変える、2つに分ける、1つにまとめる、はいつやってもいい。機能ごとに分かれていれば、引っ越しはフォルダを動かすだけ。',
  },
];

export function Lesson4({ onNext }: { onNext: () => void }) {
  return (
    <>
      <Section title="今日のゴール" lead="あなたが作りたいアプリの「フォルダ構成図」と「最初に作るファイルのひな形」を完成させます。終わったら、そのままエディタを開いて作り始められます。">
        <p>
          ここまでで、役割は3つ（第1回）、置き場所は機能ごと（第2回）、コードではこう見える（第3回）と学びました。
          最後は、<strong>自分のアプリに当てはめる</strong>番です。作りたいものがまだ無ければ、見本（ToDo・読書記録・家計簿）から選んで練習できます。
        </p>
      </Section>

      <Section title="機能の見つけ方" lead="いきなりフォルダを考えず、まず「使う人が何をできるか」を言葉にします。">
        <ol className="steps">
          <li>
            <strong>できることを、短い文で書き出す。</strong>
            <br />
            例：「読んだ本を登録できる」「本の一覧を見られる」「感想を書ける」「月に何冊読んだか見られる」
          </li>
          <li>
            <strong>文の中の「名詞」に丸をつける。</strong>
            <br />
            本、感想、月ごとの冊数。<strong>これが機能（引き出し）の候補</strong>です。
          </li>
          <li>
            <strong>「動詞」は、その機能の操作になる。</strong>
            <br />
            登録する、見る、書く。これは、キッチン（フック）が持つ操作の候補です。
          </li>
          <li>
            <strong>似たものをまとめる。</strong>
            <br />
            「本を登録する」と「本の一覧を見る」は、どちらも「本」の話。1つの引き出し（book-list）にまとめます。
          </li>
          <li>
            <strong>英語のフォルダ名をつける。</strong>
            <br />
            小文字で、単語の間はハイフン。<code>book-list</code>、<code>book-review</code>、<code>reading-stats</code>。
          </li>
        </ol>
        <Callout kind="tip" title="1つにするか、分けるか迷ったら">
          <p>
            <strong>「片方だけ消しても、もう片方は成り立つか？」</strong>と考えます。
            「感想」を消しても「本の一覧」は成り立つ → 別の機能。
            「一覧」を消したら「本の追加」は意味がない → 同じ機能。
          </p>
        </Callout>
        <Callout kind="tip" title="「仕入れ業者が要る」かどうかの見分け方">
          <p>
            <strong>アプリを閉じて開き直しても残っていてほしいデータ</strong>や、<strong>ほかの人・ほかの機械と共有するデータ</strong>を扱うなら、要ります。
            画面の上だけで終わる機能（電卓、表示の切りかえ、絞りこみ）なら、要りません。
          </p>
        </Callout>
      </Section>

      <Section title="設計図を作る" lead="入力すると、下にフォルダ構成図とひな形コードができあがります。内容はこのブラウザに保存されます。">
        <BlueprintBuilder />
      </Section>

      <Section title="できた設計図をレビューする" lead="自動チェックは名前の形しか見ません。中身は、自分の目で確かめます。">
        <Checklist title="✅ 設計図のレビューチェックリスト" items={CHECKLIST} />
      </Section>

      <Section title="なぜ、コードを書く前に設計図を作るのか">
        <Callout kind="why" title="置き場所を先に決めると、書くことに集中できる">
          <p>
            「このコード、どこに書こう」と手が止まるのは、置き場所が決まっていないからです。
            先に引き出しを用意しておけば、書くときは<strong>「これは見せる話？ 決める話？ 取ってくる話？」</strong>と聞くだけで、行き先が決まります。
          </p>
        </Callout>
        <Callout kind="why" title="人や AI に頼みやすくなる">
          <p>
            「読書アプリを作って」と丸ごと頼むより、「<code>features/book-list/hooks/useBookList.ts</code> に、題名が空なら断る追加の操作を書いて」
            と頼むほうが、<strong>できあがったものが合っているか確かめやすい</strong>です。設計図は、頼む側の地図にも、受け取ったコードをレビューする物差しにもなります。
          </p>
        </Callout>
        <Callout kind="warn" title="設計図は、作りながら直していい">
          <p>
            最初から完ぺきな構成は作れません。作ってみて「この機能は2つに分けたほうがいい」と思ったら、分けて構いません。
            機能ごとにまとまっていれば、分けるのも、まとめるのも、フォルダを動かすだけで済みます。
          </p>
        </Callout>
      </Section>

      <Section title="共用のものは、いつ shared に移すか" lead="迷いやすい所なので、判断の順番を決めておきます。">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>状況</th>
                <th>置き場所</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1つの機能でしか使っていない</td>
                <td>その機能のフォルダの中</td>
                <td>使う場所の近くにあるのが、いちばん探しやすい。</td>
              </tr>
              <tr>
                <td>2つ目の機能でも、まったく同じものが必要になった</td>
                <td><code>shared/</code> に引っ越す</td>
                <td>ここで初めて「共用品」だと分かる。</td>
              </tr>
              <tr>
                <td>似ているけれど、機能ごとに少しずつ違う</td>
                <td>それぞれの機能の中に、別々に置く</td>
                <td>無理に1つにすると、「もし〇〇機能なら」だらけの部品になる。</td>
              </tr>
              <tr>
                <td>ある機能のデータを、別の機能でも表示したい</td>
                <td>入口（app）で受け取って、渡す</td>
                <td>機能どうしを直接つなぐと、片方を直したとき、もう片方が壊れる。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="エディタで始める手順" lead="設計図ができたら、ここから先は手を動かすだけです。">
        <CodeBlock title="ターミナルで打つこと" lang="text" code={FIRST_STEPS} />
        <ol className="steps">
          <li>設計図のフォルダを作り、<strong>最初に作ると決めた機能のファイルだけ</strong>ひな形を貼る。</li>
          <li><strong>仕入れ業者から書く。</strong>データの形（何という項目があるか）を自分のアプリに合わせて決める。最初は、決まったデータを返すだけでいい。</li>
          <li><strong>次にキッチン。</strong>データを受け取って覚える。操作（追加する、消す）を1つ足す。</li>
          <li><strong>最後にホール。</strong>キッチンから受け取ったものを画面に出す。</li>
          <li>動いたら、2つ目の機能へ。隣に引き出しを足すだけです。</li>
        </ol>
        <Callout kind="look" title="作りながら、ときどき確かめること">
          <ul>
            <li>コンポーネントが50行をこえてきたら → ルールや計算が混ざっていないか見る。</li>
            <li>フックが100行をこえてきたら → 2つの機能が1つに入っていないか見る。</li>
            <li>import の道に、ほかの機能の名前が出てきたら → shared に移すか、入口で渡すかを考える。</li>
          </ul>
          <p className="muted">行数はあくまで「立ち止まって見直す合図」です。こえたら必ずダメ、という決まりではありません。</p>
        </Callout>
      </Section>

      <Section title="おまけ：この教材アプリも、同じ構成でできています" lead="いま見ているこのアプリのフォルダ構成です。学んだ形が、少し大きなアプリでもそのまま使われていることを確かめてください。">
        <CodeBlock title="この教材アプリの構成" lang="text" code={THIS_APP_TREE} />
        <Callout kind="look" title="基本の3つから、少しだけ増えている所">
          <p>
            <code>blueprint</code> には <code>logic/</code> というフォルダがあります。これは「キッチンの中のレシピ帳」で、
            React の道具を使わない<strong>ただの計算</strong>だけを取り出したものです。計算が長くなってきたら、フックからこうして外に出すと、
            その計算だけを単体で確かめられます。最初から作る必要はありません。<strong>フックが長くなって困ってから</strong>で十分です。
          </p>
        </Callout>
      </Section>

      <Section title="よくある失敗と見分け方">
        <Mistakes items={MISTAKES} />
      </Section>

      <Section title="理解度チェック" lead="最後の確認です。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>

      <LessonFooter lessonId={4} questions={QUIZ} tasks={[TASK]} onNext={onNext} />
    </>
  );
}
