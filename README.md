# Various Games

ブラウザで遊べるゲームのコレクションです。サーバー不要・静的HTMLで動作します。

## ゲーム一覧

| ディレクトリ | ゲーム | 説明 |
|---|---|---|
| [god-arena](./god-arena/) | 神器大戦（ゴッドフィールド風） | 属性つきの多人数バトル。武器を引いて撃ち合い、同じ属性の防具で受ける。 |
| [gomoku-narabe](./gomoku-narabe/) | 五目並べ（サイバーパンク風） | AI対戦・2人対戦・詰め五目。禁じ手ルール対応。 |
| [tsuri-quest](./tsuri-quest/) | つりクエスト（釣り／レベルアップ） | 魚30種。名前とパスワードでセーブ、ログインボーナス、ブースト、パーツ、2種類のレベル。 |
| [monster-strike](./monster-strike/) | ひっぱりストライク（モンスト風） | 引っぱって離すひっぱりアクション。反射・貫通の撃ち分け、友情コンボ、ボスの弱点、ダメージウォール・重力バリアとアビリティ。 |
| [eikaiwa-swipe](./eikaiwa-swipe/) | SwipeTalk（英会話フレーズ学習） | 全40章・2000フレーズ（基本編＋アメリカ生活編）。スワイプで仕分け、英→日／日→英テスト、シャドーイング、抑揚つき音声。Google ログインでクラウド保存。 |
| [pachinko-gokugoku](./pachinko-gokugoku/) | 極極FEVER（パチンコシミュレーター） | 単一HTML。釘・風車の物理、ヘソ入賞時抽選（1/319.6）、RUSH継続率81%、SPリーチ・一撃レバー・全回転・先バレ、Web Audio のBGM、スランプグラフ、デバッグ設定。 |

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
**ゲームを追加したら、CI（`ci.yml` の `changes` ジョブの `ALL`）と Pages の対象にディレクトリ名を足してください。** CI は変わったゲームの検査だけを走らせます（`ci.yml` 自体を変えたときと手動実行は全部）。
このリポジトリの改善は自動ループで進めています。手順は [LOOP.md](./LOOP.md) を参照してください。
