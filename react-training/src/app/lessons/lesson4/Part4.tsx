import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { FolderTree } from '../../../shared/components/FolderTree';
import { Section } from '../../../shared/components/Section';
import { THIS_APP_TREE, FIRST_STEPS } from './data';

// 第4回 パート4：エディタで始める
export function Part4() {
  return (
    <>
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
        <FolderTree title="この教材アプリの構成" code={THIS_APP_TREE} />
        <Callout kind="look" title="機能どうしを、入口で引き合わせている所">
          <p>
            <code>quiz</code> と <code>checklist</code> は「見せるだけ」の機能で、答えをどこに保存するかを知りません。
            <code>progress</code> は保存するだけで、クイズの見た目を知りません。
            この2つを引き合わせているのが <code>app/lessons/widgets.tsx</code> です。
            <strong>機能は別の機能を読みこまない。つなぐのは入口（app）</strong>、という第2回のルールを、このアプリ自身も守っています
            （守れているかは、テストで自動的に確かめています）。
          </p>
        </Callout>
        <Callout kind="look" title="基本の3つから、少しだけ増えている所">
          <p>
            <code>blueprint</code> には <code>logic/</code> というフォルダがあります。これは「キッチンの中のレシピ帳」で、
            React の道具を使わない<strong>ただの計算</strong>だけを取り出したものです。計算が長くなってきたら、フックからこうして外に出すと、
            その計算だけを単体で確かめられます。最初から作る必要はありません。<strong>フックが長くなって困ってから</strong>で十分です。
          </p>
        </Callout>
      </Section>
    </>
  );
}
