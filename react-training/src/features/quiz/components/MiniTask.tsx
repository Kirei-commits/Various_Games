import { useState } from 'react';
import type { MiniTaskData } from '../types';

type Props = {
  task: MiniTaskData;
  /** 書きかけの答え */
  note: string;
  onNoteChange: (note: string) => void;
  /** 「納得した」にチェック済みか */
  done: boolean;
  onDoneChange: (done: boolean) => void;
};

// 自分の言葉で答える課題。答えを書いてから模範解答を開き、比べて納得したらチェックする。
export function MiniTask({ task, note, onNoteChange, done, onDoneChange }: Props) {
  const [open, setOpen] = useState(done);

  return (
    <div className="minitask">
      <p className="minitask-label">✍️ ミニ課題</p>
      <p className="quiz-q">{task.prompt}</p>
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        rows={4}
        placeholder="ここに自分の答えを書いてみよう（このブラウザに保存されます）"
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
            <input type="checkbox" checked={done} onChange={(e) => onDoneChange(e.target.checked)} />
            <span>自分の答えと比べて、納得した</span>
          </label>
        </div>
      )}
    </div>
  );
}
