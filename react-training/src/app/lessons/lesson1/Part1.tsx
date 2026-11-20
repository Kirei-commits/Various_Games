import { Callout } from '../../../shared/components/Callout';
import { RoleBadge } from '../../../shared/components/RoleBadge';
import { Section } from '../../../shared/components/Section';

// 第1回 パート1：3つの役割
export function Part1() {
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
    </>
  );
}
