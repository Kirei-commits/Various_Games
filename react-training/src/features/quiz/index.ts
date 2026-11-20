// クイズの受付窓口。答えの保存はしない（外から渡してもらう）ので、ほかの機能には頼らない。
export { Quiz } from './components/Quiz';
export { MiniTask } from './components/MiniTask';
export { shuffledOrder } from './logic/shuffle';
export { isAllCorrect } from './types';
export type { QuizQuestion, MiniTaskData } from './types';
