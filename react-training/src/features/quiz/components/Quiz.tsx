import { useProgress } from '../../progress';
import type { QuizQuestion } from '../types';

type Props = { questions: QuizQuestion[]; compact?: boolean };

export function Quiz({ questions, compact = false }: Props) {
  const { progress, actions } = useProgress();

  return (
    <ol className={compact ? 'quiz quiz-compact' : 'quiz'}>
      {questions.map((q) => {
        const chosen = progress.answers[q.id];
        const answered = chosen !== undefined;
        const correct = chosen === q.answerIndex;
        return (
          <li key={q.id} className="quiz-item">
            <p className="quiz-q">{q.question}</p>
            <div className="quiz-choices">
              {q.choices.map((choice, i) => {
                const state = chosen === i ? (correct ? 'is-correct' : 'is-wrong') : '';
                return (
                  <button
                    key={i}
                    type="button"
                    className={`choice ${state}`}
                    aria-pressed={chosen === i}
                    onClick={() => actions.answer(q.id, i)}
                  >
                    {choice}
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
