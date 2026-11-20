// いま開いている「回」と「パート」を、ページの住所（#/2/3 = 第2回のパート3）で覚える。
// 住所にしておくと、ブラウザの「戻る」が効き、開き直しても同じ場所から読める。
import { useEffect, useState } from 'react';

export type Route = { lesson: number | null; part: number };

export function parseRoute(hash: string): Route {
  const match = /^#\/(\d+)(?:\/(\d+))?$/.exec(hash);
  if (!match) return { lesson: null, part: 1 };
  return { lesson: Number(match[1]), part: match[2] ? Number(match[2]) : 1 };
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const go = (lesson: number, part = 1) => {
    window.location.hash = `#/${lesson}/${part}`;
  };

  return { route, go };
}
