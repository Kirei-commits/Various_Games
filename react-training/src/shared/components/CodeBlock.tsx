import { useState } from 'react';
import { highlight } from '../lib/highlight';
import { RoleBadge, type Role } from './RoleBadge';

type Props = {
  code: string;
  /** ファイル名や見出し */
  title?: string;
  /** どの役割のファイルか（色つきのラベルが付く） */
  role?: Role;
  /** 'text' にすると色をつけない（フォルダ構成図など） */
  lang?: 'tsx' | 'text';
};

export function CodeBlock({ code, title, role, lang = 'tsx' }: Props) {
  const [copied, setCopied] = useState(false);
  const source = code.replace(/\n+$/, '');
  const lineCount = source.split('\n').length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="code">
      <figcaption className="code-head">
        <span className="code-title">
          {role && <RoleBadge role={role} />}
          {title && <span className="code-name">{title}</span>}
        </span>
        <span className="code-meta">
          {lang === 'tsx' && <span>{lineCount}行</span>}
          <button type="button" className="btn-mini" onClick={copy}>
            {copied ? 'コピーした' : 'コピー'}
          </button>
        </span>
      </figcaption>
      <pre>
        <code>
          {lang === 'text'
            ? source
            : highlight(source).map((token, i) =>
                token.kind === 'plain' ? (
                  token.text
                ) : (
                  <span key={i} className={`tok-${token.kind}`}>
                    {token.text}
                  </span>
                ),
              )}
        </code>
      </pre>
    </figure>
  );
}
