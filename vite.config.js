import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs, so the build works from any folder, not just a domain root.
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // the site + the private admin dashboard (served at /admin/)
      input: { main: resolve(import.meta.dirname, 'index.html'), admin: resolve(import.meta.dirname, 'admin/index.html') },
    },
  },
  server: {
    // `npm run dev` talks to the API from `npm run dev:server`
    proxy: { '/api': 'http://localhost:8787', '/verify': 'http://localhost:8787' },
  },
})
