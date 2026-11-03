# CLAUDE.md — コスモ・フュージョン

同じ星どうしが合体して太陽をめざす物理シミュレーション。**単一の `index.html`・ビルド不要・実行時の依存ゼロ**。
仕様は `SPEC.md`。

## 構成
```
index.html              画面・描画・音・操作と、物理エンジンの両方
  <script id="engine">  物理と合体のルール（CosmoEngine）。DOM・音に触らない。Node のテストがここだけ取り出して動かす
  <script>              画面（Canvas 描画、星の絵、一覧表、効果音、操作、window.cosmo のテスト用入口）
tests/engine.mjs        index.html からエンジンを取り出して vm で読み込む
tests/logic/            エンジンのテスト（node --test）
tests/e2e/              ブラウザテスト（デスクトップ + スマホ）
tools/measure.mjs       放っておいたときのクリア時間を seed ごとに測る
```

## コマンド
```bash
npm ci
npm start            # http://127.0.0.1:8080/
npm run lint         # script の構文・外部ファイルなし・エンジンが DOM に触っていないか
npm run test:logic
npm run test:e2e     # 手元でブラウザを取れないときは PW_CHROMIUM=<chrome のパス>
npm run measure -- 20 '{"spawnInterval":0.2}'
```

## 守ること
1. エンジン（`<script id="engine">`）では `document` などの画面・音の API を使わない（lint が止める）。
2. 調整値はエンジンの `DEFAULTS` に集める。変えたら `npm run measure -- 20` と `npm run measure -- 20 '{}' --help` で、
   放っておくと時々失敗し、手助けすればほぼクリアできるか確かめる（`tests/logic` の「難しさ」のテストも同じ確認）。
3. 外部ファイル・CDN を読み込まない。
