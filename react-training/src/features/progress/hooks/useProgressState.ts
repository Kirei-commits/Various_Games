// キッチン：進み具合のデータを持ち、変更のしかた（答える・チェックする・完了する）を決める。
import { useEffect, useState } from 'react';
import { EMPTY_PROGRESS, loadProgress, saveProgress, type Progress } from '../api/progressStorage';

export type ProgressActions = {
  answer: (questionId: string, choiceIndex: number) => void;
  setConfirmed: (id: string, value: boolean) => void;
  completeLesson: (lessonId: number) => void;
  setUnlockAll: (value: boolean) => void;
  reset: () => void;
};

export function useProgressState(): { progress: Progress; actions: ProgressActions } {
  const [progress, setProgress] = useState<Progress>(loadProgress);

  // 変わるたびに保存する（次に開いたとき続きから始められる）
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const actions: ProgressActions = {
    answer: (questionId, choiceIndex) =>
      setProgress((p) => ({ ...p, answers: { ...p.answers, [questionId]: choiceIndex } })),
    setConfirmed: (id, value) =>
      setProgress((p) => ({ ...p, confirmed: { ...p.confirmed, [id]: value } })),
    completeLesson: (lessonId) =>
      setProgress((p) =>
        p.completedLessons.includes(lessonId)
          ? p
          : { ...p, completedLessons: [...p.completedLessons, lessonId] },
      ),
    setUnlockAll: (value) => setProgress((p) => ({ ...p, unlockAll: value })),
    reset: () => setProgress(EMPTY_PROGRESS),
  };

  return { progress, actions };
}
