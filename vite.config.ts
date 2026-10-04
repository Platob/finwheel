import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, 'src/web');
const serverUrl = `http://127.0.0.1:${process.env.PORT ?? 4747}`;

export default defineConfig({
  root,
  publicDir: resolve(root, 'public'),
  plugins: [preact()],
  build: {
    outDir: resolve(import.meta.dirname, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        overlay: resolve(root, 'overlay/index.html'),
        dock: resolve(root, 'dock/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': { target: serverUrl, ws: true },
      '/api': serverUrl,
      '/media': serverUrl,
    },
  },
});
