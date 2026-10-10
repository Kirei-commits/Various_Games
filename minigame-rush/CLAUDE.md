# CLAUDE.md — ミニゲームラッシュ（minigame-rush）

いろんなミニゲームを遊べるコレクション。1本目は **武器拾いレギオン**（仕様は `SPEC.md`）。
**配るのは `index.html` 1枚（ビルド済み・実行時依存ゼロ）**、編集するのは `src/`。`index.html` は `npm run build` が生成する。直接編集しないこと。
CI はリポジトリ直下の `.github/workflows/ci.yml`（matrix にこのディレクトリが入っている）。

## 構成

```
src/shell.html               HTML の骨組み（ハブ・メニュー・パネルの DOM）
src/style.css                見た目。#app の font-size を JS が「幅/720×24px」にするので 1em = 論理24px
src/pure/legion-config.js    調整値すべて（データだけ）       → MGR.Legion.CONFIG
src/pure/legion-stage.js     地形とステージの自動生成（純粋）   → MGR.Legion.Stage
src/pure/legion-sim.js       ゲームの中身（純粋）・コインの計算 → MGR.Legion.createSim / reward / upgradeCost
src/pure/legion-bot.js       人と同じ操作だけで遊ぶボット       → MGR.Legion.createBot
src/game/NN-*.js             ブラウザ側。番号順につなげて1つの即時関数で包む（同じスコープを共有）
  00-util 01-store(セーブ) 02-audio(効果音・BGM) 03-view(遠近法) 04-sprites(絵) 05-fx(演出)
  06-render 07-input(ドラッグ) 08-game(1回のプレイ) 09-ui(画面) 10-main(起動・ループ・window.__MGR)
tools/build.mjs              src/ → index.html（--check で最新か確かめるだけ）
tools/measure.mjs            ボットでクリア率を測る（npm run measure）
tests/lint.mjs               ビルドが最新か / 構文 / script の並び / 外部参照 / id の実在 / 純粋さ
tests/logic/*.test.mjs       config / stage / sim / balance（index.html から純粋モジュールを取り出して Node で）
tests/e2e/*.spec.mjs         Playwright（desktop + mobile）。ドラッグはタッチ端末なら CDP で本物のタッチを送る
```

## 決まりごと

- **純粋なモジュールは DOM・Math.random・時計に触れない**（lint が見張る）。乱数は `rng` を引数でもらう。
  同じシードなら同じ結果になることをテストしている。
- 数値はまず `legion-config.js` を探す。座標はワールド単位（x 0〜5 = 盤面の5列、y 0〜6 が盤面、6〜22 が通路）。
- 弾は**英雄のいる列の真上**へ飛ぶ（弓の拡散と杖の追尾だけ曲がる）。どこに立つかが作戦。
- 盤面の「使えない武器」が増えすぎないよう、`randWeapon` は盤面の使える武器の割合が `ownedWeight` を下回るほど使える武器を出す。
  これを外すと盤面が使えない武器で詰まって、英雄がほとんど撃てなくなる（実際にそうなった）。
- 置いてある英雄は足元と周り1マス（`hero.idleReach`）の得意武器も拾う。ドラッグ中は通ったマスを全部たどる。
- ボスが拠点まで来たら、拠点HPが残っていても負け。
- ゲートと檻のHPの伸びは、敵のHPの伸びと揃えること。ずれると後半でゲート・檻が1つも壊れなくなる（実際にそうなった）。

## バランス（npm run measure、ボット skill 0.8、ふつう）

| 強化 | クリアできる目安 |
|---|---|
| なし | ステージ20前後まで |
| 中くらい（攻撃10・速度6・拠点6・弾2・英雄+1） | ステージ45前後まで |
| 最大 | ステージ99まで |

1回のプレイは 2.5〜3.5分。`tests/logic/balance.test.mjs` がこの形を確かめる。調整値を変えたら測り直すこと。

## ミニゲームを足すとき

ハブ（`#hub` の `.cards`）の COMING SOON の枠を置き換える。コインは `Store.d.coins` で共通。
ミニゲームごとのセーブは `Store.d.<名前>` に分ける。純粋なモジュールは `src/pure/<名前>-*.js` にして、`tools/build.mjs` の `PURE` に足す。
