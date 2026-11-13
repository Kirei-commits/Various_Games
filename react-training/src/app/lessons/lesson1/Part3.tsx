import { Callout } from '../../../shared/components/Callout';
import { Section } from '../../../shared/components/Section';
import { Quiz } from '../widgets';
import { SORTING } from './data';

// 第1回 パート3：見分け方と練習
export function Part3() {
  return (
    <>
      <Section title="コードを見るときのポイント" lead="知らないコードを開いたとき、まずここを見ると役割が分かります。">
        <Callout kind="look" title="3秒で役割を見分ける">
          <ul>
            <li>
              <strong>ファイル名を見る：</strong>大文字始まりで <code>.tsx</code> → ホール。<code>use</code> 始まり → キッチン。
              <code>get</code> や <code>create</code> 始まり、または <code>api</code> フォルダの中 → 仕入れ業者。
            </li>
            <li>
              <strong>最後に何を返しているか見る：</strong>タグ（<code>{'<div>'}</code> など）を返す → ホール。
              データと関数のセットを返す → キッチン。データだけを返す → 仕入れ業者。
            </li>
            <li>
              <strong>いちばん上の読みこみ（import）を見る：</strong>そのファイルが「誰に頼っているか」が分かる。
              ホールがキッチンを、キッチンが仕入れ業者を読みこんでいれば、流れは正しい。
            </li>
          </ul>
        </Callout>
        <Callout kind="look" title="読む順番のおすすめ">
          <p>
            知らない機能を読むときは <strong>ホール → キッチン → 仕入れ業者</strong> の順が楽です。
            画面を見れば「何ができる機能か」が分かり、キッチンで「どんなルールか」が分かり、最後に「データはどこから来るか」が分かります。
            お客さんと同じ入口から店に入る、と覚えてください。
          </p>
        </Callout>
      </Section>

      <Section title="練習：この仕事はだれの担当？" lead="8つの仕事を、3つの役割に仕分けてみよう。まちがえても、何度でも選び直せます。">
        <Quiz questions={SORTING} compact />
      </Section>
    </>
  );
}
