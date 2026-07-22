import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Node 内置模块 events 在浏览器端会被 Vite externalize 成空对象，
      // 导致 pouchdb-browser 的 `class extends events.EventEmitter` 抛错白屏。
      // 此处指向真实的浏览器 polyfill 包，使 PouchDB 可正常初始化。
      events: 'events',
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'sql.js', 'events'],
  },
  build: {
    target: 'es2020',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['chart.js', 'react-chartjs-2'],
          data: ['sql.js', 'xlsx']
        }
      }
    },
    chunkSizeWarningLimit: 1000
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})
