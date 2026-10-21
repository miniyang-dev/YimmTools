import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:8931' },
  },
  // CSP is font-src 'self': never inline fonts as data: URIs
  build: { outDir: 'dist', sourcemap: false, assetsInlineLimit: 0 },
})
