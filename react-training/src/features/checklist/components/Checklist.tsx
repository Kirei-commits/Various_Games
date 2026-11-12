import { useProgress } from '../../progress';

export type ChecklistItem = {
  /** 保存に使う名前（変えるとチェックが外れる） */
  id: string;
  /** 確認すること */
  text: string;
  /** なぜそれを見るのか */
  reason: string;
};

type Props = { title?: string; items: ChecklistItem[] };

// レビューのときに見る項目の一覧。チェックは保存される。
export function Checklist({ title = '✅ レビューチェックリスト', items }: Props) {
  const { progress, actions } = useProgress();
  const doneCount = items.filter((item) => progress.confirmed[item.id]).length;

  return (
    <div className="checklist">
      <p className="checklist-head">
        <span>{title}</span>
        <span className="count">
          {doneCount} / {items.length}
        </span>
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <label className="check-row">
              <input
                type="checkbox"
                checked={progress.confirmed[item.id] === true}
                onChange={(e) => actions.setConfirmed(item.id, e.target.checked)}
              />
              <span>
                <strong>{item.text}</strong>
                <small>{item.reason}</small>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
