import { useState } from 'react';
import { Callout } from '../../../shared/components/Callout';
import { CodeBlock } from '../../../shared/components/CodeBlock';
import { Section } from '../../../shared/components/Section';
import { ShoppingList } from '../../../features/shopping-list';
import { BadShoppingList } from '../../../features/shopping-list-bad';
import { badCode, countLines } from './data';

// 第3回 パート1：悪い例を見る
export function Part1() {
  const [demo, setDemo] = useState<'bad' | 'good'>('bad');
  return (
    <>
      <Section title="今日のゴール" lead="第1回の「3つの役割」と第2回の「フォルダ構成」が、本物の React のコードでどう見えるかを確かめます。">
        <p>
          題材は<strong>「お買い物メモ」</strong>。最初にメモを読みこんで一覧に出し、品物を追加できるだけの小さなアプリです。
          同じ動きをするコードを、<strong>悪い例（1ファイルに全部入り）</strong>と<strong>良い例（3ファイルに分割）</strong>の2通りで見比べます。
        </p>
        <p className="muted">
          このページに出てくるコードは、説明用に書いた絵ではありません。この教材アプリの中で実際に動いているファイルを、そのまま表示しています。
        </p>
      </Section>

      <Section title="まず動かしてみる" lead="悪い例と良い例を切りかえて、触ってみよう。空のまま追加したり、同じ品物を2回追加したりすると…？">
        <div className="seg" role="group" aria-label="動かす例">
          <button type="button" className={demo === 'bad' ? 'seg-item is-on' : 'seg-item'} aria-pressed={demo === 'bad'} onClick={() => setDemo('bad')}>
            悪い例（1ファイル）
          </button>
          <button type="button" className={demo === 'good' ? 'seg-item is-on' : 'seg-item'} aria-pressed={demo === 'good'} onClick={() => setDemo('good')}>
            良い例（3ファイル）
          </button>
        </div>
        <div className="demo">{demo === 'bad' ? <BadShoppingList key="bad" /> : <ShoppingList key="good" />}</div>
        <Callout kind="look" title="気づいてほしいこと">
          <p>
            <strong>動きはまったく同じ</strong>です。使う人から見れば、どちらでも変わりません。
            分け方の良し悪しは、画面には出ません。差が出るのは、<strong>コードを読んで直す人</strong>にとってです。
          </p>
        </Callout>
      </Section>

      <Section title="悪い例：1ファイルに全部入り" lead={`全部で${countLines(badCode)}行。上から読んで、「いま何の話をしているか」が何回切りかわるか数えてみよう。`}>
        <CodeBlock title="BadShoppingList.tsx" code={badCode} />
        <Callout kind="look" title="どこがつらいか">
          <ul>
            <li>
              <strong>話題が行ったり来たりする：</strong>状態の宣言 → 通信 → 画面 → ルール → また画面。
              「追加のルール」を探すには、画面のタグの中（<code>onSubmit</code> の中）までもぐらないと見つかりません。
            </li>
            <li>
              <strong>通信のやり方が画面に埋まっている：</strong>サーバーの住所が変わったら、画面のファイルを開くことになります。
            </li>
            <li>
              <strong>ルールだけを取り出せない：</strong>「同じ品物を断る」を別の画面でも使いたくても、フォームの中に書いてあるので持っていけません。
            </li>
            <li>
              <strong>これでまだ小さいほう：</strong>ここに「消す」「並べかえ」「保存」が加わると、同じ調子で200行、300行と伸びていきます。
            </li>
          </ul>
        </Callout>
      </Section>
    </>
  );
}
