import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base を './' にしておくと、GitHub Pages のサブフォルダ（/react-training/）に置いても動く。
export default defineConfig({
  base: './',
  plugins: [react()],
});
