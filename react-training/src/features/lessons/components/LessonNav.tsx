import { LESSONS } from '../lessons';

type Props = {
  current: number;
  isUnlocked: (lessonId: number) => boolean;
  isCompleted: (lessonId: number) => boolean;
  onSelect: (lessonId: number) => void;
};

export function LessonNav({ current, isUnlocked, isCompleted, onSelect }: Props) {
  return (
    <nav className="lesson-nav" aria-label="研修の回">
      {LESSONS.map((lesson) => {
        const unlocked = isUnlocked(lesson.id);
        const mark = isCompleted(lesson.id) ? '✔' : unlocked ? '' : '🔒';
        return (
          <button
            key={lesson.id}
            type="button"
            className={lesson.id === current ? 'nav-item is-current' : 'nav-item'}
            aria-current={lesson.id === current ? 'page' : undefined}
            disabled={!unlocked}
            onClick={() => onSelect(lesson.id)}
          >
            <span className="nav-no">
              第{lesson.id}回 {mark}
            </span>
            <span className="nav-title">{lesson.title}</span>
          </button>
        );
      })}
    </nav>
  );
}
