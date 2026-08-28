import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    rollupOptions: {
      // Два независимых входа: веб-SPA и Telegram Mini App. Общий код
      // (apiClient, tokenManager, локали) Rollup вынесет в общий чанк сам —
      // тяжёлый роутер и компоненты веба в tma-бандл не попадут.
      input: {
        main: resolve(__dirname, 'index.html'),
        tma: resolve(__dirname, 'tma.html'),
      },
    },
  },
});
