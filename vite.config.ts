import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    // песочница отдаёт превью через прокси вида https://<port>-<sandbox>.e2b.app
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app', 'localhost', '.arena.ai'],
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: ['.e2b.app', 'localhost', '.arena.ai'],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
