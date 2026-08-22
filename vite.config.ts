import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // VITE_BASE env var lets CI override: '/' for FTP hosts, '/calude/' for GitHub Pages
  base: process.env.VITE_BASE ?? '/calude/',
  /*
   * In production the same host serves the app and the PHP endpoints, so a
   * request to /api/track.php is answered by PHP. In development it was
   * answered by Vite, which handed back the source of the script as a file —
   * so open tracking, click tracking and the unsubscribe link could not be
   * tried locally at all, and only broke once deployed.
   *
   * Pointing /api at a local `php -S 127.0.0.1:3001 -t public` makes
   * development behave like production. With no PHP server running the
   * requests fail exactly as they did before, so this costs nothing when it
   * is not wanted.
   */
  server: {
    proxy: {
      '^/[^/]*/?api/.*\\.php': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3001',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^.*?(\/api\/)/, '$1'),
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('d3-') || id.includes('victory-vendor')) return 'd3';
            if (id.includes('recharts')) return 'recharts';
            if (id.includes('lucide')) return 'lucide';
            if (id.includes('react-router')) return 'react-router';
            if (id.includes('react') || id.includes('react-dom') || id.includes('scheduler')) return 'react-core';
          }
        },
      },
    },
  },
})
