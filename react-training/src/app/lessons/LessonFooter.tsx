import { useProgress } from '../../features/progress';
import { isAllCorrect } from '../../features/quiz';
import type { Lesson } from './lessons';

type Props = {
  lesson: Lesson;
  isLast: boolean;
  onNext: () => void;
};

// 各回の最後のパートに出す。理解度の確認が済んだら、次の回へ進めるようにする。
export function LessonFooter({ lesson, isLast, onNext }: Props) {
  const { progress, actions } = useProgress();
  const quizLeft = lesson.questions.filter((q) => progress.answers[q.id] !== q.answerIndex).length;
  const taskLeft = lesson.tasks.filter((t) => !progress.confirmed[t.id]).length;
  const ready = isAllCorrect(lesson.questions, progress.answers) && taskLeft === 0;
  const completed = progress.completedLessons.includes(lesson.id);

  return (
    <footer className="lesson-footer">
      {!ready && (
        <p className="muted">
          次の回へ進むには、あと
          {quizLeft > 0 && <strong> 問題{quizLeft}問</strong>}
          {quizLeft > 0 && taskLeft > 0 && ' と'}
          {taskLeft > 0 && <strong> ミニ課題{taskLeft}つ</strong>}
          　が残っています（途中のパートの練習問題もふくみます）。
          納得できるまで、何度でも戻って読み直して大丈夫です。
        </p>
      )}
      {ready && !completed && (
        <button type="button" className="btn btn-primary" onClick={() => actions.completeLesson(lesson.id)}>
          納得した！ 第{lesson.id}回を完了する
        </button>
      )}
      {completed && !isLast && (
        <button type="button" className="btn btn-primary" onClick={onNext}>
          第{lesson.id + 1}回へ進む →
        </button>
      )}
      {completed && isLast && (
        <p className="finish">
          🎉 全4回おつかれさまでした。設計図をエディタに写して、1つ目の機能から作り始めよう。
          迷ったら「これはホール？キッチン？仕入れ？」と自分に聞けば大丈夫。
        </p>
      )}
    </footer>
  );
}
