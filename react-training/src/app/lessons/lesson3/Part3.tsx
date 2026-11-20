import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { FolderTree } from '../../../shared/components/FolderTree';
import { RoleBadge } from '../../../shared/components/RoleBadge';
import { Section } from '../../../shared/components/Section';
import { TREE, apiCode, hookCode } from './data';

// 第3回 パート3：良い例を読む
export function Part3() {
  return (
    <>
      <Section
        title="良い例：3ファイルに分割"
        lead="第2回のフォルダ構成に沿って置きます。1つずつ、上から読んでみよう。"
      >
        <FolderTree title="置き場所" code={TREE} />

        <h3>
          ① <RoleBadge role="api" long />
        </h3>
        <CodeBlock title="api/getItems.ts" role="api" code={apiCode} />
        <Callout kind="look" title="このファイルの見どころ">
          <ul>
            <li>
              React の道具（useState など）が<strong>1つも出てこない</strong>。ただの関数です。
            </li>
            <li>
              <code>{'Promise<Item[]>'}</code> … 「あとで Item
              の一覧を届けます」という約束。業者とキッチンの間の取り決めです。
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
              <strong>最後の return から読む：</strong>
              <code>{'{ items, isLoading, loadError, inputError, addItem, clearInputError }'}</code>。
              これが「キッチンがホールに出すもの」の全部。ここを読めば、このフックで何ができるか分かります。
            </li>
            <li>
              <strong>タグが1つも無い：</strong>
              画面のことは何も知りません。だから、見た目がどう変わっても影響を受けません。
            </li>
            <li>
              <strong>ルールは addItem に集まっている：</strong>
              「空はダメ」「同じ品物はダメ」。ルールを変えたいときは、ここだけ見ればいい。
            </li>
            <li>
              <strong>ignore の印：</strong>
              読みこみの途中で画面が閉じられたとき、あとから届いた結果で状態を書きかえないための工夫です。
              通信を useEffect で行うときの決まり文句として覚えておけば十分です。
            </li>
            <li>
              <strong>setItems を外に出していない：</strong>ホールができるのは addItem
              を呼ぶことだけ。ルールを通らずにメモを書きかえる道がありません。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  );
}
