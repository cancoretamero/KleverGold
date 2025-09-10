import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Build with relative base so it works on any subpath (e.g., GitHub Pages)
export default defineConfig({
  plugins: [react()],
  base: './',
})
