import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Server PORT lives in the project-root .env (not client/.env), and
  // defaults to 3001 (see server/src/index.ts) when unset.
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, '..'), '')
  const apiPort = rootEnv.PORT || '3001'

  return {
    plugins: [react(), tailwindcss()],
    server: {
      // Allow reading instruksi-api-produksi.md from the project root
      // (one level above client/) for the "Instruksi API" page.
      fs: { allow: [path.resolve(import.meta.dirname, '..')] },
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  }
})
