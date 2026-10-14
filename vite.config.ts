import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  // The api Edge Function only allows CORS from origins in ALLOWED_ORIGINS
  // (http://127.0.0.1:5173 and http://localhost:5173), so keep dev on port 5173.
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
      '@domain': path.resolve(import.meta.dirname, './supabase/functions/_shared/domain'),
    },
  },
})
