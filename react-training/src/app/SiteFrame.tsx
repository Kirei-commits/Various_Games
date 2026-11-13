// ページのいちばん上（題名）と、いちばん下（設定）。見せるだけの部品。

export function SiteHeader({ completed, total }: { completed: number; total: number }) {
  return (
    <header className="site-head">
      <p className="site-kicker">React アプリ設計・実践研修（全4回）</p>
      <h1>どこに・どんなファイルを作ればいいか、迷わなくなる</h1>
      <p className="site-sub">
        前提知識は要りません。レストランと部屋の片付けにたとえて、1回分ずつ進めます。
        進み具合はこのブラウザに保存されます（{completed} / {total} 回 完了）。
      </p>
    </header>
  );
}

type FooterProps = {
  unlockAll: boolean;
  onUnlockAllChange: (value: boolean) => void;
  onReset: () => void;
};

export function SiteFooter({ unlockAll, onUnlockAllChange, onReset }: FooterProps) {
  return (
    <footer className="site-foot">
      <label className="check-row">
        <input type="checkbox" checked={unlockAll} onChange={(e) => onUnlockAllChange(e.target.checked)} />
        <span>
          すべての回を自由に読めるようにする
          <small>復習や、先をのぞきたいとき用。ふだんは1回ずつ順番に進むのがおすすめです。</small>
        </span>
      </label>
      <button type="button" className="btn-mini danger" onClick={onReset}>
        進み具合をリセットする
      </button>
    </footer>
  );
}
