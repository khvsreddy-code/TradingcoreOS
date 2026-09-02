import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'frontend'),
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'esbuild'
  }
})
