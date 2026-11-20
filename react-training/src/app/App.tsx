// アプリの入口：回とパートを切りかえて、機能を並べるだけ。
// クイズや設計図づくりの中身は features に、本文は lessons にまかせる。
import { useEffect, useRef } from 'react';
import { clearBlueprintDraft } from '../features/blueprint';
import { ProgressProvider, useProgress } from '../features/progress';
import { isUnlocked, resolveLocation } from './currentLesson';
import { LessonFooter } from './lessons/LessonFooter';
import { LessonNav } from './lessons/LessonNav';
import { PartPager, PartSteps } from './lessons/PartNav';
import { LESSONS } from './lessons/lessons';
import { SiteFooter, SiteHeader } from './SiteFrame';
import { useRoute } from './useRoute';

export function App() {
  return (
    <ProgressProvider>
      <Training />
    </ProgressProvider>
  );
}

function Training() {
  const { progress, actions } = useProgress();
  const { route, go } = useRoute();

  const isCompleted = (id: number) => progress.completedLessons.includes(id);
  const { lesson, partNo } = resolveLocation(route, LESSONS, progress);
  const part = lesson.parts[partNo - 1];
  const isLastPart = partNo === lesson.parts.length;

  // 回やパートを切りかえたら、本文の頭まで戻す（最初に開いたときは、ページのいちばん上のまま）
  const mainRef = useRef<HTMLElement>(null);
  const isFirstView = useRef(true);
  useEffect(() => {
    if (isFirstView.current) {
      isFirstView.current = false;
      return;
    }
    mainRef.current?.scrollIntoView();
  }, [lesson.id, partNo]);

  const handleReset = () => {
    if (
      window.confirm(
        'クイズの答え・チェック・書いた答え・設計図・完了の記録をすべて消します。よろしいですか？',
      )
    ) {
      actions.reset();
      clearBlueprintDraft();
      go(1, 1);
    }
  };

  return (
    <div className="page">
      <SiteHeader completed={progress.completedLessons.length} total={LESSONS.length} />

      <LessonNav
        lessons={LESSONS}
        current={lesson.id}
        isUnlocked={(id) => isUnlocked(id, progress)}
        isCompleted={isCompleted}
        onSelect={(id) => go(id, 1)}
      />

      <main className="lesson" ref={mainRef}>
        {/* key を変えて、パートごとに中身を作り直す（開いていた答えなどを持ちこさない） */}
        <div className="lesson-head">
          <p className="lesson-no">第{lesson.id}回</p>
          <h2>{lesson.title}</h2>
          <p className="lesson-metaphor">{lesson.metaphor}</p>
          <p className="lesson-goal">
            <strong>この回のゴール：</strong>
            {lesson.goal}
          </p>
          <PartSteps parts={lesson.parts} current={partNo} onSelect={(p) => go(lesson.id, p)} />
        </div>

        <part.Component key={`${lesson.id}-${partNo}`} />

        <PartPager parts={lesson.parts} current={partNo} onSelect={(p) => go(lesson.id, p)} />
        {isLastPart && (
          <LessonFooter
            lesson={lesson}
            isLast={lesson.id === LESSONS.length}
            onNext={() => go(lesson.id + 1, 1)}
          />
        )}
      </main>

      <SiteFooter
        unlockAll={progress.unlockAll}
        onUnlockAllChange={actions.setUnlockAll}
        onReset={handleReset}
      />
    </div>
  );
}
