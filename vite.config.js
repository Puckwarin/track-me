import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const BASE = process.env.GITHUB_ACTIONS ? '/track-me/' : '/';
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version || '5.3.0')
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true
  },
  plugins: [
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png', 'push-sw.js'],
      manifest: {
        id: BASE,
        name: 'Track Me — อาหาร ประจำเดือน น้ำหนัก & Planner',
        short_name: 'Track Me',
        description: 'บันทึกอาหาร ออกกำลังกาย ประจำเดือน น้ำหนัก สัตว์เลี้ยง และตารางกิจวัตรประจำวัน',
        lang: 'th',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        background_color: '#EAF3FD',
        theme_color: '#EAF3FD',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ],
        share_target: {
          action: `${BASE}share-target`,
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [
              {
                name: 'slip',
                accept: ['image/*', '.jpg', '.jpeg', '.png', '.webp', '.heic']
              }
            ]
          }
        }
      },
      devOptions: {
        enabled: true
      },
      workbox: {
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,woff}'],
        navigateFallback: BASE + 'index.html',
        // ไม่ยุ่งกับ Firestore / Auth / Gemini / Share Target POST — ให้จัดการเอง
        navigateFallbackDenylist: [/^\/__\//, /\/__\/auth\//, /\/share-target$/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'vendor-firebase';
          }
        }
      }
    }
  }
});
