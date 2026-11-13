import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { FolderTree } from '../../../shared/components/FolderTree';
import { Section } from '../../../shared/components/Section';
import { MINIMAL_TREE, INDEX_CODE, IMPORT_GOOD, IMPORT_BAD } from './data';

// 第2回 パート2：最小構成と受付窓口
export function Part2() {
  return (
    <>
      <Section title="おすすめの最小構成" lead="迷ったら、この形をそのまま真似してください。第3回・第4回もこの形で進めます。">
        <FolderTree title="フォルダ構成図（最小）" code={MINIMAL_TREE} />
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
                <td>アプリの入口とページ。機能を読みこんで並べ、機能どうしを引き合わせる。</td>
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
          <p>
            窓口から読みこむのは、<strong>入口（app）だけ</strong>にします。機能が別の機能を読みこみ始めると、
            どれか1つを直すたびに、つながった先も気にしなければならなくなります。
          </p>
        </Callout>
      </Section>
    </>
  );
}
