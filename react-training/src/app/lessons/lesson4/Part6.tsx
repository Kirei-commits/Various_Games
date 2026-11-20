import { Section } from '../../../shared/components/Section';
import { MiniTask, Quiz } from '../widgets';
import { QUIZ, TASK } from './data';

// 第4回 パート6：理解度チェック
export function Part6() {
  return (
    <>
      <Section title="理解度チェック" lead="最後の確認です。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>
    </>
  );
}
