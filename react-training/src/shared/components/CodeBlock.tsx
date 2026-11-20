import { CopyButton } from './CopyButton';
import { highlight, toLines, type Token } from '../lib/highlight';
import { RoleBadge, type Role } from './RoleBadge';

type Props = {
  code: string;
  /** ファイル名や見出し */
  title?: string;
  /** どの役割のファイルか（色つきのラベルが付く） */
  role?: Role;
  /** 'text' にすると色をつけない（ターミナルで打つ内容など） */
  lang?: 'tsx' | 'text';
};

// コードを表示する。長い行は横スクロールにせず、字下げを保ったまま折り返す。
export function CodeBlock({ code, title, role, lang = 'tsx' }: Props) {
  const source = code.replace(/\n+$/, '');
  const tokens: Token[] = lang === 'text' ? [{ kind: 'plain', text: source }] : highlight(source);
  const lines = toLines(tokens);

  return (
    <figure className="code">
      <figcaption className="code-head">
        <span className="code-title">
          {role && <RoleBadge role={role} />}
          {title && <span className="code-name">{title}</span>}
        </span>
        <span className="code-meta">
          {lang === 'tsx' && <span>{lines.length}行</span>}
          <CopyButton text={source} />
        </span>
      </figcaption>
      <pre>
        <code>
          {lines.map((line, i) => (
            <span
              key={i}
              className="code-line"
              style={{ paddingLeft: `${line.indent + 2}ch` }}
            >
              {line.tokens.length === 0
                ? '​'
                : line.tokens.map((token, j) =>
                    token.kind === 'plain' ? (
                      token.text
                    ) : (
                      <span key={j} className={`tok-${token.kind}`}>
                        {token.text}
                      </span>
                    ),
                  )}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
