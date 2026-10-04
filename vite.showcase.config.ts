import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Live wheels for the documentation site: builds docs/live/showcase.js (+ assets) for MkDocs. */
const root = resolve(import.meta.dirname, 'src/web/showcase');

export default defineConfig({
  root,
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, 'docs/live'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, 'showcase.ts'),
      output: {
        entryFileNames: 'showcase.js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
