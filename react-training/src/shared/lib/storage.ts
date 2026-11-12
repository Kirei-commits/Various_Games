// ブラウザの保存場所（localStorage）を安全に読み書きするための小さな道具。
// プライベートブラウズなどで保存が使えないときも、アプリが止まらないようにしている。

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できなくても学習は続けられるので、何もしない。
  }
}
