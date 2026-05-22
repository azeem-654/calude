import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/calude/',
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
