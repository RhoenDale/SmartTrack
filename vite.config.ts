import { defineConfig, loadEnv } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id: string) {
      if (id.startsWith('figma:asset/')) {
        return resolve(__dirname, 'src/assets', id.replace('figma:asset/', ''))
      }
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    // Build output uses relative paths — works when served from any sub-folder
    base: './',

    plugins: [figmaAssetResolver(), react(), tailwindcss()],

    resolve: {
      alias: { '@': resolve(__dirname, './src') },
    },

    assetsInclude: ['**/*.svg', '**/*.csv'],

    build: {
      // Output into dist/ (default)
      outDir: 'dist',
      emptyOutDir: true,
    },

    server: {
      // Override the target for XAMPP installations that use a non-default port.
      port: 5173,
      allowedHosts: ['.trycloudflare.com', 'smarttrack.pharmacy.com'],
      proxy: {
        '/SmartTrack/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:80',
          changeOrigin: true,
          // Preserve the full path — XAMPP expects /SmartTrack/api/...
        },
      },
    },
  }
})
