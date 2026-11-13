import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { Section } from '../../../shared/components/Section';
import { hookTestCode } from './data';

// 第3回 パート4：読みこみの向きと確かめ方
export function Part4() {
  return (
    <>
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
        <CodeBlock title="hooks/useShoppingList.test.ts" role="logic" code={hookTestCode} />
        <Callout kind="look" title="このテストの見どころ">
          <ul>
            <li>
              <strong><code>vi.mock(&apos;../api/getItems&apos;)</code> の1行：</strong>仕入れ業者を「にせもの」に入れかえています。
              本物のサーバー（この教材では0.6秒の待ち時間）には行きません。
            </li>
            <li>
              <strong>画面が1つも出てこない：</strong>ボタンも入力欄も無しで、「空の名前は断る」「もうある品物は断る」というルールだけを確かめています。
            </li>
            <li>
              <strong>失敗したときも試せる：</strong>最後のテストでは、にせの業者に「失敗して」と頼んでいます。本物のサーバーをわざと壊すのは大変ですが、にせものなら1行です。
            </li>
          </ul>
        </Callout>
        <p>
          これも説明用の絵ではなく、このアプリで実際に走らせているテストです。
          悪い例では、通信が画面の中に直接書かれているので、この差しかえができません。
          <strong>「差しかえられる」のは、通信が別の関数として外に出ているから</strong>です。
          今すぐテストを書けなくても大丈夫。「分けておくと、あとで確かめやすい」とだけ覚えておいてください。
        </p>
      </Section>
    </>
  );
}
