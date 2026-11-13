import { shuffledOrder } from '../logic/shuffle';
import type { QuizQuestion } from '../types';

type Props = {
  questions: QuizQuestion[];
  /** これまでの答え（問題ID → 選んだ選択肢の番号） */
  answers: Record<string, number>;
  onAnswer: (questionId: string, choiceIndex: number) => void;
  /** 選択肢を横に並べる（仕分け練習用） */
  compact?: boolean;
  /** 選択肢の並びをまぜるか。どの問題も同じ選択肢のときは false にする */
  shuffle?: boolean;
};

export function Quiz({ questions, answers, onAnswer, compact = false, shuffle = true }: Props) {
  return (
    <ol className={compact ? 'quiz quiz-compact' : 'quiz'}>
      {questions.map((q) => {
        const chosen = answers[q.id];
        const answered = chosen !== undefined;
        const correct = chosen === q.answerIndex;
        const order = shuffle ? shuffledOrder(q.choices.length, q.id) : q.choices.map((_, i) => i);
        return (
          <li key={q.id} className="quiz-item">
            <p className="quiz-q">{q.question}</p>
            <div className="quiz-choices">
              {order.map((i) => {
                const state = chosen === i ? (correct ? 'is-correct' : 'is-wrong') : '';
                return (
                  <button
                    key={i}
                    type="button"
                    className={`choice ${state}`}
                    aria-pressed={chosen === i}
                    onClick={() => onAnswer(q.id, i)}
                  >
                    {q.choices[i]}
                  </button>
                );
              })}
            </div>
            {answered && correct && (
              <p className="quiz-result ok">
                <strong>⭕ 正解。</strong> {q.explanation}
              </p>
            )}
            {answered && !correct && (
              <p className="quiz-result ng">
                <strong>🔁 もう一度。</strong> ヒント：{q.hint}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
