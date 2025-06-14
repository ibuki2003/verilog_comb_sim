import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
    target: "esnext",
    // polyfillDynamicImport: false,
  },

  css: {
    preprocessorOptions: {
      scss: { api: "modern-compiler" },
    },
  },
})
