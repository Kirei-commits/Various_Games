/*
 * Firebase の設定（Firebase コンソール →「プロジェクトの設定」→「マイアプリ」の firebaseConfig）。
 * ここに書く値はページに公開されても問題ない値です（データの保護は Firestore のルールで行う）。
 * null のあいだはログイン機能を表示せず、進捗は端末にだけ保存します。
 *
 * 例:
 * export default {
 *   apiKey: "AIza...",
 *   authDomain: "your-project.firebaseapp.com",
 *   projectId: "your-project",
 *   appId: "1:1234567890:web:abcdef",
 * };
 */
export default {
  apiKey: "AIzaSyC1IDwGAIC5OavoSsr0sO3YuFVJiT6stwU",
  authDomain: "swipetalk-cd29b.firebaseapp.com",
  projectId: "swipetalk-cd29b",
  storageBucket: "swipetalk-cd29b.firebasestorage.app",
  messagingSenderId: "812465625407",
  appId: "1:812465625407:web:e6778a854713b409529b8a",
};
