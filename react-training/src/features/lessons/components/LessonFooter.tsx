import { useProgress } from '../../progress';
import { isAllCorrect, type MiniTaskData, type QuizQuestion } from '../../quiz';
import { LESSONS } from '../lessons';

type Props = {
  lessonId: number;
  /** 完了するために全問正解が必要な問題 */
  questions: QuizQuestion[];
  /** 完了するために「納得した」が必要なミニ課題 */
  tasks: MiniTaskData[];
  onNext: () => void;
};

// 各回のいちばん下。理解度の確認が済んだら、次の回へ進めるようにする。
export function LessonFooter({ lessonId, questions, tasks, onNext }: Props) {
  const { progress, actions } = useProgress();
  const quizLeft = questions.filter((q) => progress.answers[q.id] !== q.answerIndex).length;
  const taskLeft = tasks.filter((t) => !progress.confirmed[t.id]).length;
  const ready = isAllCorrect(questions, progress.answers) && taskLeft === 0;
  const completed = progress.completedLessons.includes(lessonId);
  const isLast = lessonId === LESSONS.length;

  return (
    <footer className="lesson-footer">
      {!ready && (
        <p className="muted">
          次へ進むには、あと
          {quizLeft > 0 && <strong> クイズ{quizLeft}問</strong>}
          {quizLeft > 0 && taskLeft > 0 && ' と'}
          {taskLeft > 0 && <strong> ミニ課題{taskLeft}つ</strong>}
          　が残っています。納得できるまで、何度でも戻って読み直して大丈夫です。
        </p>
      )}
      {ready && !completed && (
        <button type="button" className="btn btn-primary" onClick={() => actions.completeLesson(lessonId)}>
          納得した！ 第{lessonId}回を完了する
        </button>
      )}
      {completed && !isLast && (
        <button type="button" className="btn btn-primary" onClick={onNext}>
          第{lessonId + 1}回へ進む →
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
