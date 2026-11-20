import { useState } from 'react';
import { Callout } from '../../../shared/components/Callout';
import { FolderTree } from '../../../shared/components/FolderTree';
import { Section } from '../../../shared/components/Section';
import { type Size, SIZE_LABEL, BY_KIND, BY_FEATURE, SIZE_COMMENT } from './data';

// 第2回 パート1：2つの片付け方
export function Part1() {
  const [size, setSize] = useState<Size>('medium');
  return (
    <>
      <Section title="今日のゴール" lead="ファイルが増えても「どこに置くか」で迷わないルールを、1つだけ覚えます。">
        <p>
          第1回で、コードには3つの役割があると分かりました。次に出てくる疑問は
          <strong>「そのファイルを、どのフォルダに置くの？」</strong>です。今日は部屋の片付けにたとえて考えます。
        </p>
      </Section>

      <Section title="2つの片付け方" lead="同じ持ち物でも、分け方で探しやすさが大きく変わります。">
        <Callout kind="example">
          <p>
            <strong>種類別：</strong>家じゅうの物を「箱の形」で分ける片付け方です。四角い物の棚、丸い物の棚、長い物の棚。
            料理をしたいとき、フライパンは丸い物の棚、まな板は四角い物の棚、菜箸は長い物の棚へ取りに行きます。
          </p>
          <p>
            <strong>機能別：</strong>「使う場面」で分ける片付け方です。料理の道具はキッチンの引き出し、勉強の道具は机の引き出し。
            料理をしたいときは、キッチンの引き出しを1つ開ければ全部そろいます。
          </p>
        </Callout>
        <p>
          コードに置きかえると、種類別は <code>components</code>・<code>hooks</code>・<code>api</code> という3つの大きな箱に全ファイルを入れる方法。
          機能別は、<strong>「お買い物メモ」「ログイン」など、機能ごとに引き出しを作る</strong>方法です。
        </p>
      </Section>

      <Section title="大きさで比べる" lead="アプリの大きさを切りかえて、2つの分け方を見比べてみよう。">
        <div className="seg" role="group" aria-label="アプリの大きさ">
          {(Object.keys(SIZE_LABEL) as Size[]).map((key) => (
            <button
              key={key}
              type="button"
              className={size === key ? 'seg-item is-on' : 'seg-item'}
              aria-pressed={size === key}
              onClick={() => setSize(key)}
            >
              {SIZE_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="compare">
          <FolderTree title="種類別" code={BY_KIND[size]} />
          <FolderTree title="機能別（おすすめ）" code={BY_FEATURE[size]} />
        </div>
        <p className="compare-comment">{SIZE_COMMENT[size]}</p>
      </Section>
    </>
  );
}
