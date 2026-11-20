import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { Section } from '../../../shared/components/Section';
import { STEP1, STEP2, STEP3 } from './data';

// 第3回 パート2：分け方の手順
export function Part2() {
  return (
    <>
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
    </>
  );
}
