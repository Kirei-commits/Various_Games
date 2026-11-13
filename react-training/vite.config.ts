import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// ソースの入口は src/index.html。ビルド結果（dist/）は tools/build.mjs が1枚の index.html にまとめる。
// base を './' にしておくと、サブフォルダ（/react-training/）に置いても動く。
export default defineConfig({
  root: 'src',
  base: './',
  plugins: [react()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    // 1枚にまとめるので、JS と CSS はそれぞれ1ファイルで出す
    cssCodeSplit: false,
    modulePreload: false,
  },
});
