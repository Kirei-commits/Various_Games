// クイズ・ミニ課題・チェックリスト（見せるだけの部品）に、進み具合の保存をつなぐ場所。
// quiz や checklist の機能は progress のことを知らない。2つを引き合わせるのは、入口（app）の仕事。
import { Checklist as ChecklistView, type ChecklistItem } from '../../features/checklist';
import { useProgress } from '../../features/progress';
import {
  MiniTask as MiniTaskView,
  Quiz as QuizView,
  type MiniTaskData,
  type QuizQuestion,
} from '../../features/quiz';

export function Quiz({ questions, compact = false }: { questions: QuizQuestion[]; compact?: boolean }) {
  const { progress, actions } = useProgress();
  return (
    <QuizView
      questions={questions}
      answers={progress.answers}
      onAnswer={actions.answer}
      compact={compact}
      // 仕分け練習（compact）はどの問題も同じ3択なので、並びをまぜない
      shuffle={!compact}
    />
  );
}

export function MiniTask({ task }: { task: MiniTaskData }) {
  const { progress, actions } = useProgress();
  return (
    <MiniTaskView
      task={task}
      note={progress.notes[task.id] ?? ''}
      onNoteChange={(text) => actions.setNote(task.id, text)}
      done={progress.confirmed[task.id] === true}
      onDoneChange={(value) => actions.setConfirmed(task.id, value)}
    />
  );
}

export function Checklist({ title, items }: { title?: string; items: ChecklistItem[] }) {
  const { progress, actions } = useProgress();
  return (
    <ChecklistView title={title} items={items} checked={progress.confirmed} onToggle={actions.setConfirmed} />
  );
}
