import { defineConfig } from 'vite';

export default defineConfig({
  root: 'www',
  build: {
    outDir: '../dist',
    emptyDirOnDelete: true
  }
});
