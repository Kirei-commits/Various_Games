import { Section } from '../../../shared/components/Section';
import { MiniTask, Quiz } from '../widgets';
import { QUIZ, TASK } from './data';

// 第3回 パート6：理解度チェック
export function Part6() {
  return (
    <>
      <Section title="理解度チェック" lead="上のコードを見返しながら答えて大丈夫です。全問正解して、ミニ課題に納得できたら、第4回へ進めます。">
        <Quiz questions={QUIZ} />
        <MiniTask task={TASK} />
      </Section>
    </>
  );
}
