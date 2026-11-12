import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// เว็บอยู่ที่ https://<user>.github.io/track-me/ จึงต้องตั้ง base เป็นชื่อ repo
const BASE = '/track-me/';

export default defineConfig({
  base: BASE,
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Track Me — อาหาร ประจำเดือน น้ำหนัก',
        short_name: 'Track Me',
        lang: 'th',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#faf8ff',
        theme_color: '#7c3aed',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,woff}'],
        navigateFallback: BASE + 'index.html',
        // ไม่ยุ่งกับ Firestore / Auth / Gemini — ให้ SDK จัดการเอง
        navigateFallbackDenylist: [/^\/__\//, /\/__\/auth\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ]
});
