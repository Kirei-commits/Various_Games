// アプリの入口：回を切りかえて、機能を並べるだけ。本文やクイズの中身は各機能にまかせる。
import { useEffect, useState } from 'react';
import { LESSONS, Lesson1, Lesson2, Lesson3, Lesson4, LessonNav } from './features/lessons';
import { ProgressProvider, useProgress } from './features/progress';

export function App() {
  return (
    <ProgressProvider>
      <Training />
    </ProgressProvider>
  );
}

function Training() {
  const { progress, actions } = useProgress();

  const isCompleted = (id: number) => progress.completedLessons.includes(id);
  // 第1回はいつでも読める。それ以降は、前の回を完了したら開く
  const isUnlocked = (id: number) => id === 1 || progress.unlockAll || isCompleted(id - 1);

  // 開いたときは、まだ完了していない最初の回から
  const [current, setCurrent] = useState(
    () => LESSONS.find((l) => !progress.completedLessons.includes(l.id))?.id ?? 1,
  );
  const lesson = LESSONS.find((l) => l.id === current) ?? LESSONS[0];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [current]);

  const goNext = () => setCurrent((id) => Math.min(id + 1, LESSONS.length));

  const handleReset = () => {
    if (window.confirm('クイズの答え・チェック・完了の記録をすべて消します。よろしいですか？')) {
      actions.reset();
      setCurrent(1);
    }
  };

  return (
    <div className="page">
      <header className="site-head">
        <p className="site-kicker">React アプリ設計・実践研修（全4回）</p>
        <h1>どこに・どんなファイルを作ればいいか、迷わなくなる</h1>
        <p className="site-sub">
          前提知識は要りません。レストランと部屋の片付けにたとえて、1回分ずつ進めます。
          進み具合はこのブラウザに保存されます（{progress.completedLessons.length} / {LESSONS.length} 回 完了）。
        </p>
      </header>

      <LessonNav current={current} isUnlocked={isUnlocked} isCompleted={isCompleted} onSelect={setCurrent} />

      <main className="lesson" key={lesson.id}>
        <div className="lesson-head">
          <p className="lesson-no">第{lesson.id}回</p>
          <h2>{lesson.title}</h2>
          <p className="lesson-metaphor">{lesson.metaphor}</p>
          <p className="lesson-goal">
            <strong>この回のゴール：</strong>
            {lesson.goal}
          </p>
        </div>
        {lesson.id === 1 && <Lesson1 onNext={goNext} />}
        {lesson.id === 2 && <Lesson2 onNext={goNext} />}
        {lesson.id === 3 && <Lesson3 onNext={goNext} />}
        {lesson.id === 4 && <Lesson4 onNext={goNext} />}
      </main>

      <footer className="site-foot">
        <label className="check-row">
          <input
            type="checkbox"
            checked={progress.unlockAll}
            onChange={(e) => actions.setUnlockAll(e.target.checked)}
          />
          <span>
            すべての回を自由に読めるようにする
            <small>復習や、先をのぞきたいとき用。ふだんは1回ずつ順番に進むのがおすすめです。</small>
          </span>
        </label>
        <button type="button" className="btn-mini danger" onClick={handleReset}>
          進み具合をリセットする
        </button>
      </footer>
    </div>
  );
}
