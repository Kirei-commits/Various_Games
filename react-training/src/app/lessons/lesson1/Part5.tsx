import { Section } from '../../../shared/components/Section';
import { MiniTask, Quiz } from '../widgets';
import { QUIZ, TASK } from './data';

// 第1回 パート5：理解度チェック
export function Part5() {
  return (
    <>
      <Section title="理解度チェック" lead="全問正解して、ミニ課題に納得できたら、第2回へ進めます。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>
    </>
  );
}
