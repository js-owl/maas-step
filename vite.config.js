import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    open: true,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  optimizeDeps: {
    include: ['three', 'occt-import-js']
  },
  define: {
    global: 'globalThis',
  },
  resolve: {
    alias: {
      'occt-import-js': 'occt-import-js/dist/occt-import-js.js'
    }
  },
  assetsInclude: ['**/*.wasm']
})

