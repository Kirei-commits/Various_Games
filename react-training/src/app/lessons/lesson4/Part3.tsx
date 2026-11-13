import { Callout } from '../../../shared/components/Callout';
import { Section } from '../../../shared/components/Section';

// 第4回 パート3：なぜ設計図を作るのか
export function Part3() {
  return (
    <>
      <Section title="なぜ、コードを書く前に設計図を作るのか">
        <Callout kind="why" title="置き場所を先に決めると、書くことに集中できる">
          <p>
            「このコード、どこに書こう」と手が止まるのは、置き場所が決まっていないからです。
            先に引き出しを用意しておけば、書くときは<strong>「これは見せる話？ 決める話？ 取ってくる話？」</strong>と聞くだけで、行き先が決まります。
          </p>
        </Callout>
        <Callout kind="why" title="人や AI に頼みやすくなる">
          <p>
            「読書アプリを作って」と丸ごと頼むより、「<code>features/book-list/hooks/useBookList.ts</code> に、題名が空なら断る追加の操作を書いて」
            と頼むほうが、<strong>できあがったものが合っているか確かめやすい</strong>です。設計図は、頼む側の地図にも、受け取ったコードをレビューする物差しにもなります。
          </p>
        </Callout>
        <Callout kind="warn" title="設計図は、作りながら直していい">
          <p>
            最初から完ぺきな構成は作れません。作ってみて「この機能は2つに分けたほうがいい」と思ったら、分けて構いません。
            機能ごとにまとまっていれば、分けるのも、まとめるのも、フォルダを動かすだけで済みます。
          </p>
        </Callout>
      </Section>

      <Section title="共用のものは、いつ shared に移すか" lead="迷いやすい所なので、判断の順番を決めておきます。">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>状況</th>
                <th>置き場所</th>
                <th>理由</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1つの機能でしか使っていない</td>
                <td>その機能のフォルダの中</td>
                <td>使う場所の近くにあるのが、いちばん探しやすい。</td>
              </tr>
              <tr>
                <td>2つ目の機能でも、まったく同じものが必要になった</td>
                <td><code>shared/</code> に引っ越す</td>
                <td>ここで初めて「共用品」だと分かる。</td>
              </tr>
              <tr>
                <td>似ているけれど、機能ごとに少しずつ違う</td>
                <td>それぞれの機能の中に、別々に置く</td>
                <td>無理に1つにすると、「もし〇〇機能なら」だらけの部品になる。</td>
              </tr>
              <tr>
                <td>ある機能のデータを、別の機能でも表示したい</td>
                <td>入口（app）で受け取って、渡す</td>
                <td>機能どうしを直接つなぐと、片方を直したとき、もう片方が壊れる。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
