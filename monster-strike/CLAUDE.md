# CLAUDE.md — ひっぱりストライク（monster-strike）

モンスト風のひっぱりアクション。**`index.html` 1ファイル・ビルド不要・実行時依存ゼロ**。
このディレクトリは `Various_Games` リポジトリの中のひとつのゲーム。
CI はリポジトリ直下の `.github/workflows/ci.yml` にあり、matrix にこのディレクトリが入っている。

## 構成

```
index.html
  <style>                         見た目
  <script id="ms-physics">        物理エンジン（純粋。DOM・乱数・時計に触らない）→ window.MSPhysics
  <script id="ms-battle">         戦闘ルール（純粋）: ダメージ・弱点・HP・攻撃カウンター・ウェーブ・勝敗 → window.MSBattle
  <script id="ms-data">           キャラとステージの定義（データだけ）→ window.MSData
  <script id="ms-game">           入力・進行・演出・描画・調整パネル → window.__ms（テスト窓口）
tests/lint.mjs                    インラインスクリプトの構文、外部参照なし、id の実在、純粋さ
tests/logic/helpers.mjs           純粋な3つのスクリプトを取り出して Node の vm で読み込む
tests/logic/bot.mjs               バランス測定用の自動プレイ（greedy / casual / random）
tests/logic/*.test.mjs            physics（物理）/ battle（戦闘）/ balance（難しさ）
tests/e2e/*.spec.mjs              Playwright（desktop + mobile）
```

「全ファイルを1つでプレビューできる」が元の要件なので、**ファイルを分けない**。
モジュールの境界は `<script id>` で保ち、テストはその id で中身を取り出す。
HTML コメントの中にスクリプトの開始タグをそのまま書かないこと（lint とテストの抽出が誤爆する）。

## 物理の約束ごと（フェーズ2以降も守る）

1. **固定タイムステップ（1/240秒）。** `World.step(dt)` に時間を渡す。最大初速でも
   1ステップの移動量（約9px）が半径（30px）より十分小さいので、すり抜けが起きない。
   初速や半径を大きく変えるときはステップも見直す。
2. **反射は鏡映し＋全体に反発係数。** 法線成分だけを減らすと浅い角度で角度が変わり、
   狙いの読みが成り立たない（`reflect()` のコメント参照）。
3. **弾かれた1体だけが動く。** 止まっている側（味方・敵）は動かない。動くのは円だけで、
   止まっている側は円か矩形（軸に平行）。当たりは `contact()` に一本化してある。
   フェーズ3の友情コンボは `hit` / `pierce` イベントの `other` が味方のときに発動させる。
4. **当たりはイベントで外へ出す。** `launch / wall / hit / pierce / weak / stop`。
   弱点は当たり判定を持たない円（`sensors`）。反射は `hit.weak` に、貫通は `weak` イベントで知らせる。
   ダメージ（フェーズ2）、友情コンボ（3）、ダメージウォール（4）は
   物理を書き換えずに**イベントを受け取る側**で足す。
   ただし重力バリアのように**動きそのものを変える**ギミックは物理側に足す。
5. **予測軌道は本番と同じ `step()` を複製の上で回す。** 別の近似式を書かない
   （表示と実際の動きがずれる）。
6. **貫通タイプは突入の瞬間だけ減速する**（`overlaps` で管理）。重なったまま止まったら
   `_resolve()` が空き地へ押し出す。
7. 手触りの数値は `DEFAULTS` に集める。変えたら `tests/logic/physics.test.mjs` の
   「2〜8秒動き続ける」などの範囲テストで確かめる。

## 戦闘の約束ごと

1. **ダメージ計算は `Battle.apply(events, world)` だけ。** 画面側は返ってきた記録で演出するだけ。
   倒した敵は `apply` の中で `world.remove()` する（同じ一発のうちに素通りになる）。
2. **`World.remove()` は他の物体の `overlaps` / `sensing` も消す。** 残すと貫通中の摩擦が
   かかり続ける（テストあり）。
3. **ターンの締めは `Battle.endTurn(world)`。** 全滅ならウェーブ進行（その回は敵が攻撃しない）、
   そうでなければカウンターを減らして0の敵が攻撃する。画面側はその結果を順に見せるだけ。
4. **敵の id はステージ全体で一意にする**（ウェーブをまたいで World から取り違えない）。
5. **数値を触ったら `balance.test.mjs` を回す。** 落ちたら「意図した難しさの変更か」を判断し、
   意図的なら冒頭の「測った値」と期待値を更新して、理由をコミットに残す。
6. 自動プレイの先読みは `world.clone()` と `battle.clone()` の上で行う（本物を汚さない）。

## テスト

```bash
npm run lint && npm run test:logic && npm run test:e2e
```

ブラウザを取得できない環境では `PW_CHROMIUM` に配置済みの chrome のパスを渡す（`../LOOP.md` 参照）。
`test:logic` の乱射テスト（空のフィールド1000発・ステージ300発）が、すり抜け・めり込み・停止しない・場外を検出する。
