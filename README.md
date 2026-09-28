# Various Games

ブラウザで遊べるゲームのコレクションです。サーバー不要・静的HTMLで動作します。

## ゲーム一覧

| ディレクトリ | ゲーム | 説明 |
|---|---|---|
| [god-arena](./god-arena/) | 神器大戦（ゴッドフィールド風） | 属性つきの多人数バトル。武器を引いて撃ち合い、同じ属性の防具で受ける。 |
| [gomoku-narabe](./gomoku-narabe/) | 五目並べ（サイバーパンク風） | AI対戦・2人対戦・詰め五目。禁じ手ルール対応。 |
| [tsuri-quest](./tsuri-quest/) | つりクエスト（釣り／レベルアップ） | 魚30種。名前とパスワードでセーブ、ログインボーナス、ブースト、パーツ、2種類のレベル。 |
| [eikaiwa-swipe](./eikaiwa-swipe/) | SwipeTalk（英会話フレーズ学習） | 全40章・2000フレーズ（基本編＋アメリカ生活編）。スワイプで仕分け、英→日／日→英テスト、シャドーイング、抑揚つき音声。Google ログインでクラウド保存。 |

## 遊び方

`index.html` をブラウザで直接開けば、そのまま遊べます（サーバー不要）。

GitHub Pages でも公開しています。

```
https://kirei-commits.github.io/Various_Games/
https://kirei-commits.github.io/Various_Games/eikaiwa-swipe/   ← SwipeTalk
```

> 初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする必要があります。
> 公開は `.github/workflows/pages.yml` が行います。ゲームを追加したら、そこの `for game in ...` にも足してください。

## 開発

各ゲームのディレクトリで `npm ci && npm test`。
god-arena には実ブラウザで通しプレイする `npm run playtest` もあります。
eikaiwa-swipe は `src/` から `index.html` を生成するので、変更後は `npm run build` して `index.html` もコミットします。

CI はリポジトリ直下の `.github/workflows/ci.yml` だけです（GitHub Actions はリポジトリ直下しか読みません）。
**ゲームを追加したら、CI の matrix と Pages の対象にディレクトリ名を足してください。**
このリポジトリの改善は自動ループで進めています。手順は [LOOP.md](./LOOP.md) を参照してください。
