import type { ReactNode } from 'react';

type Props = { title: string; lead?: string; children: ReactNode };

export function Section({ title, lead, children }: Props) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {lead && <p className="lead">{lead}</p>}
      {children}
    </section>
  );
}
