import type { ReactNode } from 'react';

// 解説の「囲み」。種類ごとに色と見出しの印が変わる。
export type CalloutKind = 'why' | 'look' | 'warn' | 'tip' | 'example';

const MARK: Record<CalloutKind, string> = {
  why: '🤔 なぜこうするのか',
  look: '👀 見るポイント',
  warn: '⚠️ 気をつけること',
  tip: '💡 ヒント',
  example: '🍽️ たとえ話',
};

type Props = { kind: CalloutKind; title?: string; children: ReactNode };

export function Callout({ kind, title, children }: Props) {
  return (
    <aside className={`callout callout-${kind}`}>
      <p className="callout-mark">{MARK[kind]}</p>
      {title && <p className="callout-title">{title}</p>}
      <div className="callout-body">{children}</div>
    </aside>
  );
}
