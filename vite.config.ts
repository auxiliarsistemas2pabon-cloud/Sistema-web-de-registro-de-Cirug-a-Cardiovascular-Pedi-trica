import path from 'node:path'
import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const entorno = loadEnv(mode, process.cwd(), '')
  const httpsLocal = entorno.LOCAL_HTTPS === 'true'
  return {
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    ...(httpsLocal ? { https: { pfx: readFileSync(entorno.LOCAL_TLS_PFX_FILE), passphrase: readFileSync(entorno.LOCAL_TLS_PFX_PASSWORD_FILE, 'utf8').trim() } } : {}),
    proxy: {
      '/api': { target: `${httpsLocal ? 'https' : 'http'}://127.0.0.1:${entorno.PORT || 3001}`, secure: !httpsLocal },
    },
  },
  }
})
