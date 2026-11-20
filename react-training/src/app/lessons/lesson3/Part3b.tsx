import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { RoleBadge } from '../../../shared/components/RoleBadge';
import { Section } from '../../../shared/components/Section';
import { badCode, apiCode, hookCode, componentCode, countLines } from './data';

// 第3回 パート4：良い例を読む（ホールと、読む量の比較）
export function Part3b() {
  return (
    <>
      <Section
        title="良い例：つづき"
        lead="3つ目のファイルと、分ける前後で「読む量」がどう変わったかを見ます。"
      >
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
              <strong>「もし」は見た目の出し分けだけ：</strong>
              読みこみ中なら文字を出す、エラーがあれば出す。ルールの判断はしていません。
            </li>
            <li>
              <strong>text だけは自分で持つ：</strong>
              入力欄に打たれている途中の文字は「画面の都合」。追加が成功したら空に戻す、もホールの仕事です。
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
                <td>{countLines(badCode)}行（全部）</td>
                <td>{countLines(componentCode)}行（ShoppingList.tsx だけ）</td>
              </tr>
              <tr>
                <td>追加のルールを変える</td>
                <td>{countLines(badCode)}行（全部）</td>
                <td>{countLines(hookCode)}行（useShoppingList.ts だけ）</td>
              </tr>
              <tr>
                <td>データの取り先を変える</td>
                <td>{countLines(badCode)}行（全部）</td>
                <td>{countLines(apiCode)}行（getItems.ts だけ）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="muted">
          行数は、上に表示している実際のファイルから数えています（説明のコメントも含みます）。
          3ファイルの合計は元より少し増えますが、<strong>1回の変更で読む量</strong>は減っています。
        </p>
      </Section>
    </>
  );
}
