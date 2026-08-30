import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

/*
 * Which build is this?
 *
 * "Is my fix actually live?" was unanswerable from the deployed site — the
 * bundle carried no mark, so a stale cache and a missing deploy looked
 * identical. The commit and the build time are stamped in and shown by the
 * diagnostics panel.
 */
const BUILD_SHA = process.env.GITHUB_SHA?.slice(0, 7)
  ?? (() => {
    try { return execSync('git rev-parse --short HEAD').toString().trim(); }
    catch { return 'local'; }
  })();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(BUILD_SHA),
    __BUILT_AT__: JSON.stringify(new Date().toISOString()),
  },
  // VITE_BASE env var lets CI override: '/' for FTP hosts, '/calude/' for GitHub Pages
  base: process.env.VITE_BASE ?? '/calude/',
  /*
   * In production the same host serves the app and the PHP endpoints, so a
   * request to /api/track.php is answered by the Worker. In development Vite
   * would otherwise answer it itself and hand back the built asset, so open
   * tracking, click tracking and the unsubscribe link could not be exercised
   * locally at all — they only broke once deployed.
   *
   * Pointing /api at a local `npx wrangler dev` makes development behave like
   * production, against the real runtime and a local D1. With nothing running
   * on 8787 the requests fail exactly as they did before, so this costs
   * nothing when it is not wanted.
   */
  server: {
    proxy: {
      '^/[^/]*/?api/.*\\.php': {
        target: process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8787',
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
