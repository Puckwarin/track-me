import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = process.env.GITHUB_ACTIONS ? '/track-me/' : '/';

export default defineConfig({
  base: BASE,
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png', 'push-sw.js'],
      manifest: {
        id: BASE,
        name: 'Track Me — อาหาร ประจำเดือน น้ำหนัก & Planner',
        short_name: 'Track Me',
        description: 'บันทึกอาหาร ออกกำลังกาย ประจำเดือน น้ำหนัก สัตว์เลี้ยง และตารางกิจวัตรประจำวัน',
        lang: 'th',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#FAF7F2',
        theme_color: '#FAF7F2',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
        ]
      },
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,woff}'],
        navigateFallback: BASE + 'index.html',
        // ไม่ยุ่งกับ Firestore / Auth / Gemini — ให้ SDK จัดการเอง
        navigateFallbackDenylist: [/^\/__\//, /\/__\/auth\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ]
});
