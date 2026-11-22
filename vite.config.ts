import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5174 },
  build: {
    // three + drei + postprocessing is a large bundle; this is expected.
    chunkSizeWarningLimit: 2500,
  },
})
