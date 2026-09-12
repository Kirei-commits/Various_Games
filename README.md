# Various Games

ブラウザで遊べるゲームのコレクションです。サーバー不要・静的HTMLで動作します。

## ゲーム一覧

| ディレクトリ | ゲーム | 説明 |
|---|---|---|
| [gomoku-narabe](./gomoku-narabe/) | 五目並べ（サイバーパンク風） | AI対戦・2人対戦・詰め五目。禁じ手ルール対応。 |
| [god-arena](./god-arena/) | 神器大戦（ゴッドフィールド風） | 属性つきの多人数バトル。武器を引いて撃ち合い、同じ属性の防具で受ける。 |

## 遊び方

`index.html` をブラウザで直接開けば、そのまま遊べます（サーバー不要・ビルド不要）。

GitHub Pages でも公開しています。

```
https://kirei-commits.github.io/Various_Games/
```

> 初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする必要があります。

## 開発

各ゲームのディレクトリで `npm ci && npm test`。
god-arena には実ブラウザで通しプレイする `npm run playtest` もあります。

CI はリポジトリ直下の `.github/workflows/` にあり、両方のゲームを回します。
このリポジトリの改善は自動ループで進めています。手順は [LOOP.md](./LOOP.md) を参照してください。
