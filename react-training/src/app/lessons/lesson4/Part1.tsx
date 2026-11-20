import { Callout } from '../../../shared/components/Callout';
import { Section } from '../../../shared/components/Section';

// 第4回 パート1：機能の見つけ方
export function Part1() {
  return (
    <>
      <Section title="今日のゴール" lead="あなたが作りたいアプリの「フォルダ構成図」と「最初に作るファイルのひな形」を完成させます。終わったら、そのままエディタを開いて作り始められます。">
        <p>
          ここまでで、役割は3つ（第1回）、置き場所は機能ごと（第2回）、コードではこう見える（第3回）と学びました。
          最後は、<strong>自分のアプリに当てはめる</strong>番です。作りたいものがまだ無ければ、見本（ToDo・読書記録・家計簿）から選んで練習できます。
        </p>
      </Section>

      <Section title="機能の見つけ方" lead="いきなりフォルダを考えず、まず「使う人が何をできるか」を言葉にします。">
        <ol className="steps">
          <li>
            <strong>できることを、短い文で書き出す。</strong>
            <br />
            例：「読んだ本を登録できる」「本の一覧を見られる」「感想を書ける」「月に何冊読んだか見られる」
          </li>
          <li>
            <strong>文の中の「名詞」に丸をつける。</strong>
            <br />
            本、感想、月ごとの冊数。<strong>これが機能（引き出し）の候補</strong>です。
          </li>
          <li>
            <strong>「動詞」は、その機能の操作になる。</strong>
            <br />
            登録する、見る、書く。これは、キッチン（フック）が持つ操作の候補です。
          </li>
          <li>
            <strong>似たものをまとめる。</strong>
            <br />
            「本を登録する」と「本の一覧を見る」は、どちらも「本」の話。1つの引き出し（book-list）にまとめます。
          </li>
          <li>
            <strong>英語のフォルダ名をつける。</strong>
            <br />
            小文字で、単語の間はハイフン。<code>book-list</code>、<code>book-review</code>、<code>reading-stats</code>。
          </li>
        </ol>
        <Callout kind="tip" title="1つにするか、分けるか迷ったら">
          <p>
            <strong>「片方だけ消しても、もう片方は成り立つか？」</strong>と考えます。
            「感想」を消しても「本の一覧」は成り立つ → 別の機能。
            「一覧」を消したら「本の追加」は意味がない → 同じ機能。
          </p>
        </Callout>
        <Callout kind="tip" title="機能の「形」を3つから選ぶ">
          <p>次のパートの設計図づくりでは、機能ごとに形を選びます。形によって、ひな形コードが変わります。</p>
          <ul>
            <li>
              <strong>一覧を取ってきて見せる・足す：</strong>本の一覧、メモ、履歴など。仕入れ業者は「取ってくる」係（<code>get〜</code>）。
            </li>
            <li>
              <strong>入力してサーバーに送る：</strong>ログイン、問い合わせ、検索など。仕入れ業者は「届ける」係（<code>send〜</code>）。
            </li>
            <li>
              <strong>画面の中だけで終わる：</strong>電卓、表示の切りかえ、絞りこみなど。仕入れ業者は要らないので、<code>api</code> フォルダを作りません。
            </li>
          </ul>
          <p>
            見分け方：<strong>アプリを閉じて開き直しても残っていてほしいデータ</strong>や、<strong>ほかの人・ほかの機械と共有するデータ</strong>を扱うなら、仕入れ業者が要ります。
          </p>
        </Callout>
      </Section>
    </>
  );
}
