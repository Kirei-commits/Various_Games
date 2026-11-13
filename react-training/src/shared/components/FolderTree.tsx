import { Fragment } from 'react';
import { CopyButton } from './CopyButton';

type Props = {
  /** ├─ └─ でつないだ構成図。各行の「←」より右は説明として分けて表示する */
  code: string;
  title?: string;
};

// フォルダ構成図。線の部分は折り返さない。説明は、広い画面では右の列に、せまい画面では次の行に出す。
export function FolderTree({ code, title }: Props) {
  const source = code.replace(/\n+$/, '');
  const rows = source.split('\n').map((line) => {
    const at = line.indexOf('←');
    const path = at === -1 ? line : line.slice(0, at).trimEnd();
    const note = at === -1 ? '' : line.slice(at + 1).trim();
    // 線（│ ├─ └─ と空白）の長さ。せまい画面で説明を次の行に出すとき、同じだけ字下げする
    const indent = /^[│├└─\s]*/.exec(path)![0].length;
    return { path, note, indent };
  });
  const hasNotes = rows.some((row) => row.note !== '');

  return (
    <figure className="code">
      <figcaption className="code-head">
        <span className="code-title">{title && <span className="code-name">{title}</span>}</span>
        <span className="code-meta">
          <CopyButton text={source} />
        </span>
      </figcaption>
      <div className={hasNotes ? 'tree tree-with-notes' : 'tree'}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            <span className="tree-path">{row.path}</span>
            {hasNotes && (
              <span className="tree-note" style={{ paddingLeft: `calc(var(--tree-note-indent) * ${row.indent}ch)` }}>
                {row.note}
              </span>
            )}
          </Fragment>
        ))}
      </div>
    </figure>
  );
}
