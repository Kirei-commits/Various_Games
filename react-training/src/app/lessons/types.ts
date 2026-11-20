import type { ComponentType } from 'react';
import type { MiniTaskData, QuizQuestion } from '../../features/quiz';

export type LessonPart = {
  title: string;
  Component: ComponentType;
};

export type LessonContent = {
  /** 1回分を、短く読みきれるパートに分けたもの */
  parts: LessonPart[];
  /** 回を完了するために、全問正解が必要な問題 */
  questions: QuizQuestion[];
  /** 回を完了するために、「納得した」が必要なミニ課題 */
  tasks: MiniTaskData[];
};
