import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'V-Vision Smart Assistant',
        short_name: 'V-Vision',
        description: 'Ứng dụng hỗ trợ thị giác cho người khiếm thị',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'https://cdn-icons-png.flaticon.com/512/2586/2586124.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})