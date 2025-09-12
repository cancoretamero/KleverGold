import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // MUY IMPORTANTE para GitHub Pages y rutas estáticas
  base: './'
})
