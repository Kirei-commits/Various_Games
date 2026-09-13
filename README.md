# Various Games

ブラウザで遊べるゲームのコレクションです。サーバー不要・静的HTMLで動作します。

## ゲーム一覧

| ディレクトリ | ゲーム | 説明 |
|---|---|---|
| [gomoku-narabe](./gomoku-narabe/) | 五目並べ（サイバーパンク風） | AI対戦・2人対戦・詰め五目。禁じ手ルール対応。 |
| [god-arena](./god-arena/) | 神器大戦（ゴッドフィールド風） | 属性つきの多人数バトル。武器を引いて撃ち合い、同じ属性の防具で受ける。 |
| [gungun-farm](./gungun-farm/) | ぐんぐん農園（ヘイデイ風） | 待ち時間は最長10秒。育てて、加工して、注文に届ける。1画面で完結。 |

## 遊び方

`index.html` をブラウザで直接開けば、そのまま遊べます（サーバー不要・ビルド不要）。

GitHub Pages でも公開しています。

```
https://kirei-commits.github.io/Various_Games/
```

> 初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする必要があります。

## 開発

各ゲームのディレクトリで `npm ci && npm test`。
実ブラウザで最後まで遊ぶ `npm run playtest` を持つゲームもあります。

```bash
node .github/scripts/discover-games.mjs   # いまCIが回しているゲームの一覧
node .github/scripts/check-repo.mjs       # リポジトリ全体の整合
node .github/scripts/build-site.mjs --out _site   # 配信するものを組み立てる
```

CI はリポジトリ直下の `.github/workflows/` にあります。
**ゲームの一覧はワークフローに書かれていません。** `discover-games.mjs` が
「package.json と index.html があるディレクトリ」を数え上げて matrix に渡すので、
ゲームを足すときにワークフローを直す必要はありません。

このリポジトリの改善は自動ループで進めています。手順は [LOOP.md](./LOOP.md) を参照してください。
