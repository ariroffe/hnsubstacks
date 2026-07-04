import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        preserveWhitespace: true
      }
    })
  ],
  // npm run build targets the worker's public dir
  build: {
    outDir: path.resolve(__dirname, '../worker/public'),
    emptyOutDir: true,
  }
});
