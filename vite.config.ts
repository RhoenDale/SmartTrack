import { defineConfig } from 'vite'
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

export default defineConfig({
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
    // Vite dev server — proxy all /SmartTrack/api calls to XAMPP port 80
    port: 5173,
    proxy: {
      '/SmartTrack/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
        // Preserve the full path — XAMPP expects /SmartTrack/api/...
      },
    },
  },
})
