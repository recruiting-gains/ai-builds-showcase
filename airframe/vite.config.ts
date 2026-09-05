import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: { '/api': 'http://127.0.0.1:8791' } },
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', sourcemap: false }
});
