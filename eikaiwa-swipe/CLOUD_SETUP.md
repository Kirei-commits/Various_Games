# クラウド保存（Google ログイン）の設定手順

SwipeTalk は Firebase を使って、Google アカウントごとに進捗をクラウドへ保存できます。
設定するまではログインボタンは表示されず、これまでどおり端末にだけ保存します。

所要時間は 10〜15 分です。Firebase の無料プラン（Spark）で動きます。

## 1. Firebase プロジェクトを作る

1. <https://console.firebase.google.com/> を開き、Google アカウントでログイン
2. 「プロジェクトを作成」→ 名前（例: `swipetalk`）を入れて進む
   - Google アナリティクスは不要なのでオフで構いません

## 2. Web アプリを登録して設定値を取る

1. プロジェクトのトップで「ウェブ」アイコン（`</>`）を押す
2. アプリのニックネーム（例: `swipetalk-web`）を入れて「アプリを登録」
   - 「Firebase Hosting も設定する」はチェック不要
3. 表示される `firebaseConfig` の中身（`apiKey`、`authDomain`、`projectId`、`appId` など）をコピーする
   - この値はページに公開して問題ない値です

## 3. Google ログインを有効にする

1. 左メニュー「構築」→「Authentication」→「始める」
2. 「Sign-in method」タブ →「Google」→「有効にする」→ サポートメール（自分のアドレス）を選んで「保存」
3. 「設定」タブ →「承認済みドメイン」→「ドメインを追加」→ `kirei-commits.github.io` を追加
   - これを忘れると、ログイン時に「ドメインが許可されていません」と表示されます

## 4. データベース（Firestore）を作る

1. 左メニュー「構築」→「Firestore Database」→「データベースを作成」
2. ロケーションは `asia-northeast1`（東京）など近い場所を選ぶ
3. 「本番環境モード」で作成
4. 「ルール」タブを開き、このフォルダの [`firestore.rules`](./firestore.rules) の内容を貼り付けて「公開」
   - ログインした本人だけが自分の進捗を読み書きできるルールです
   - 対戦（早押しクイズ）の部屋（`rooms`）のルールも入っています。**ルールを書き換えたら、もう一度貼り付けて「公開」してください**（2026-10-03 に対戦を追加）

## 5. 設定値をアプリに入れる

[`src/cloud-config.js`](./src/cloud-config.js) の `export default null;` を、手順 2 でコピーした値に置き換えます。

```js
export default {
  apiKey: "AIza...",
  authDomain: "swipetalk-xxxx.firebaseapp.com",
  projectId: "swipetalk-xxxx",
  storageBucket: "swipetalk-xxxx.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

そのあと `npm run build` して、`src/cloud-config.js` と `index.html` をコミットします
（Claude に設定値を渡せば、この手順は代わりに行います）。

## 6. GitHub Pages で公開する

1. GitHub のリポジトリ →「Settings」→「Pages」
2. 「Build and deployment」の Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして「Save」
3. 数分後、`https://kirei-commits.github.io/Various_Games/eikaiwa-swipe/` で開けます
   - この変更が `main` に取り込まれている必要があります

## 仕組みと注意

- データは Firestore の `users/{ユーザーID}` に、進捗全体を1つの文字列として保存します（1人あたり数十KB）
- 操作のたびにではなく、1.5 秒ほどまとめてから保存します。アプリを閉じたときや通信が戻ったときもすぐ保存します
- ログイン前に端末で進めた分は、初めてログインしたときにアカウントの進捗と統合されます
- 同じアカウントで複数の端末を同時に使った場合は、最後に保存した端末の内容が優先されます
- ログアウトすると、その端末からは進捗が消えます（クラウドには残るので、もう一度ログインすれば戻ります）
- Claude の Artifact 版からは外部サービスに接続できないため、ログインは GitHub Pages 版でだけ使えます
