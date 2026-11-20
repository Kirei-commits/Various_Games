export type ChecklistItem = {
  /** 保存に使う名前（変えるとチェックが外れる） */
  id: string;
  /** 確認すること */
  text: string;
  /** なぜそれを見るのか */
  reason: string;
};

type Props = {
  title?: string;
  items: ChecklistItem[];
  /** チェック済みの印（項目ID → true） */
  checked: Record<string, boolean>;
  onToggle: (id: string, value: boolean) => void;
};

// レビューのときに見る項目の一覧。チェックの保存は外から渡してもらう。
export function Checklist({ title = '✅ レビューチェックリスト', items, checked, onToggle }: Props) {
  const doneCount = items.filter((item) => checked[item.id]).length;

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
                checked={checked[item.id] === true}
                onChange={(e) => onToggle(item.id, e.target.checked)}
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
