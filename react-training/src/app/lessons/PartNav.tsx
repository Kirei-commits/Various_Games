import type { LessonPart } from './types';

type Props = {
  parts: LessonPart[];
  /** いま開いているパート（1から数える） */
  current: number;
  onSelect: (part: number) => void;
};

// 1回分の中のパートを切りかえる。上に置く「いまどこ」の表示。
export function PartSteps({ parts, current, onSelect }: Props) {
  return (
    <nav className="part-steps" aria-label="この回のパート">
      <p className="part-now">
        パート {current} / {parts.length}：<strong>{parts[current - 1].title}</strong>
      </p>
      <ol>
        {parts.map((part, i) => (
          <li key={part.title}>
            <button
              type="button"
              className={i + 1 === current ? 'part-dot is-current' : 'part-dot'}
              aria-current={i + 1 === current ? 'step' : undefined}
              aria-label={`パート${i + 1}：${part.title}`}
              title={part.title}
              onClick={() => onSelect(i + 1)}
            >
              {i + 1}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

// 下に置く「前へ・次へ」。
export function PartPager({ parts, current, onSelect }: Props) {
  const prev = parts[current - 2];
  const next = parts[current];
  return (
    <div className="part-pager">
      {prev ? (
        <button type="button" className="btn" onClick={() => onSelect(current - 1)}>
          ← 前へ<small>{prev.title}</small>
        </button>
      ) : (
        <span />
      )}
      {next && (
        <button type="button" className="btn btn-next" onClick={() => onSelect(current + 1)}>
          次へ →<small>{next.title}</small>
        </button>
      )}
    </div>
  );
}
