export type FaqItem = {
  /** 受講者が言いそうな疑問 */
  question: string;
  /** 答え（段落ごと） */
  answer: string[];
};

// つまずいたときに開く Q&A。質問を押すと答えが開く。
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="faq">
      {items.map((item) => (
        <details key={item.question}>
          <summary>{item.question}</summary>
          {item.answer.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </details>
      ))}
    </div>
  );
}
