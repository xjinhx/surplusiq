import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'

// The SIQ_* OutSystems services send no CORS headers, so in dev the browser calls /siq and Vite forwards it.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue()],
    server: {
      port: 5173,
      proxy: {
        '/siq': {
          target: env.VITE_API_TARGET || 'https://smuedu-dev.outsystemsenterprise.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/siq/, ''),
        },
      },
    },
  }
})
