import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Relative asset URLs, so the build works from any folder, not just a domain root.
  base: './',
  plugins: [react(), tailwindcss()],
})
