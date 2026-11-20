import { Callout } from '../../../shared/components/Callout';
import { FolderTree } from '../../../shared/components/FolderTree';
import { Section } from '../../../shared/components/Section';
import { LOGIN_TREE } from './data';

// 第2回 パート3：なぜ機能ごとなのか
export function Part3() {
  return (
    <>
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
        <FolderTree title="ログインを足したあとの構成" code={LOGIN_TREE} />
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
    </>
  );
}
