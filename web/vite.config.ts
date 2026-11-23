import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Flota SAREGO',
        short_name: 'Flota SAREGO',
        description: 'Mantenimiento de flota: fluidos, combustible, neumáticos y costos',
        theme_color: '#123a4a',
        background_color: '#f3f5f6',
        display: 'standalone',
        start_url: '/',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: {
        // Funciona sin señal: el shell queda cacheado y los datos los
        // maneja src/lib/offline.ts (cache de lecturas + cola de escrituras).
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/rest/v1') ||
              url.pathname.startsWith('/auth/v1') ||
              url.pathname.startsWith('/storage/v1') ||
              url.pathname.startsWith('/functions/v1'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
})
