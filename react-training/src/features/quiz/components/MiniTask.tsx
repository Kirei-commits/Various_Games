import { useState } from 'react';
import { useProgress } from '../../progress';
import type { MiniTaskData } from '../types';

// 自分の言葉で答える課題。答えを書いてから模範解答を開き、比べて納得したらチェックする。
export function MiniTask({ task }: { task: MiniTaskData }) {
  const { progress, actions } = useProgress();
  const done = progress.confirmed[task.id] === true;
  const [open, setOpen] = useState(done);
  const [draft, setDraft] = useState('');

  return (
    <div className="minitask">
      <p className="minitask-label">✍️ ミニ課題</p>
      <p className="quiz-q">{task.prompt}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        placeholder="ここに自分の答えを書いてみよう（メモ用。保存はされません）"
        aria-label="自分の答え"
      />
      {!open && (
        <button type="button" className="btn" onClick={() => setOpen(true)}>
          模範解答を見る
        </button>
      )}
      {open && (
        <div className="model-answer">
          <p className="model-answer-title">模範解答</p>
          <ul>
            {task.modelAnswer.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="pass-line">
            <strong>合格ライン：</strong>
            {task.passLine}
          </p>
          <label className="check-row">
            <input
              type="checkbox"
              checked={done}
              onChange={(e) => actions.setConfirmed(task.id, e.target.checked)}
            />
            <span>自分の答えと比べて、納得した</span>
          </label>
        </div>
      )}
    </div>
  );
}
