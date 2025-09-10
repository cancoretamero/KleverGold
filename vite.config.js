import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Universal base for Netlify/Cloudflare/Vercel and most static hosts.
// For GitHub Pages under a subpath, this still works in la mayoría de casos.
export default defineConfig({
  plugins: [react()],
  base: './',
})
