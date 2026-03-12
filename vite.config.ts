import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src',
  server: {
    proxy: {
      '/api': 'http://localhost:8888',
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
