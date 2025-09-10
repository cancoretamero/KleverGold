import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Works well on Netlify/Cloudflare/Vercel and most static hosts.
// If later you publish under a subpath (e.g. GitHub Pages), you may set base to '/<repo>/'.
export default defineConfig({
  plugins: [react()],
  base: './',
})
