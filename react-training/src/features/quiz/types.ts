export type QuizQuestion = {
  id: string;
  question: string;
  choices: string[];
  answerIndex: number;
  /** まちがえたときに出すヒント */
  hint: string;
  /** 正解したときに出す解説（模範解答） */
  explanation: string;
};

export type MiniTaskData = {
  id: string;
  /** 自分の言葉で考えてもらう課題 */
  prompt: string;
  /** 模範解答 */
  modelAnswer: string[];
  /** どこまで言えていれば合格か */
  passLine: string;
};

/** 問題にすべて正解しているか（回を完了できるかの判定に使う） */
export function isAllCorrect(questions: QuizQuestion[], answers: Record<string, number>): boolean {
  return questions.every((q) => answers[q.id] === q.answerIndex);
}
