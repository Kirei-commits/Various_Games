/** @type {import('tailwindcss').Config} */
// 色と文字の決まり（デザインの土台）。画面のクラス名はここの名前だけを使う。
//   brand = アプリの主役の色（コバルトブルー。エアメールの青）
//   ink   = 地の色。明るい側は紙のような温かい白、暗い側は紺のインク
//   sun   = 差し色（黄色。ごほうび・強調）
// 赤（rose）= 覚えてない／まちがい、緑（emerald）= 覚えた／正解、は Tailwind のまま使う。
module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEF3FF", 100: "#DCE6FF", 200: "#BCD0FF", 300: "#8FB0FF", 400: "#5B86FB",
          500: "#3563F2", 600: "#1F4AE0", 700: "#1A3BBB", 800: "#182F8F", 900: "#16286E", 950: "#0E1845",
        },
        ink: {
          50: "#FAF7F1", 100: "#F3EEE4", 200: "#E5DED0", 300: "#CFC7B8", 400: "#9A9488",
          500: "#63646B", 600: "#474B57", 700: "#313747", 800: "#1F2740", 900: "#141B33", 950: "#0B1022",
        },
        sun: { 200: "#FFE699", 300: "#FFD766", 400: "#FFC83D", 500: "#F5B014" },
      },
      fontFamily: {
        // 英数字は Bricolage Grotesque（build.mjs が埋め込む）、日本語は端末のゴシック
        sans: ['"Bricolage Grotesque"', '"Hiragino Sans"', '"Hiragino Kaku Gothic ProN"', '"Noto Sans JP"', '"Yu Gothic"', "Meiryo", "system-ui", "sans-serif"],
      },
    },
  },
};
