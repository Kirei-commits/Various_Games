export type Mistake = {
  /** どんな失敗か */
  pattern: string;
  /** 見分け方（コードのどこにどう現れるか） */
  sign: string;
  /** なぜ困るのか */
  why: string;
  /** どう直すか */
  fix: string;
};

export function Mistakes({ items }: { items: Mistake[] }) {
  return (
    <div className="mistakes">
      {items.map((m) => (
        <article key={m.pattern} className="mistake">
          <h4>❌ {m.pattern}</h4>
          <dl>
            <dt>見分け方</dt>
            <dd>{m.sign}</dd>
            <dt>なぜ困る？</dt>
            <dd>{m.why}</dd>
            <dt>直し方</dt>
            <dd>{m.fix}</dd>
          </dl>
        </article>
      ))}
    </div>
  );
}
