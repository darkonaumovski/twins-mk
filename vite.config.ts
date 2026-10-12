/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE_PATH lets the same build run at a domain root ("/") or on GitHub Pages ("/<repo>/").
const base = process.env.BASE_PATH ?? '/';
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  base,
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      // Updates wait for the user (see UpdatePrompt), registration happens in main.tsx.
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      includeAssets: ['icon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Twins Organizer',
        short_name: 'Twins Organizer',
        description: 'Подготовка и дневен планер за близнаци · Preparation checklist and daily planner for twins',
        lang: 'mk',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#16181d',
        theme_color: '#16181d',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Long-press the home-screen icon: straight to logging a feed, a diaper or sleep.
        shortcuts: [
          {
            name: 'Хранење · Feed',
            short_name: 'Хранење',
            url: './#/today?log=feed',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Пелена · Diaper',
            short_name: 'Пелена',
            url: './#/today?log=diaper',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
          {
            name: 'Спиење · Sleep',
            short_name: 'Спиење',
            url: './#/today?log=sleep',
            icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }],
          },
        ],
      },
    }),
  ],
  build: {
    rolldownOptions: {
      output: {
        // Libraries change less often than the app: a separate chunk keeps updates small.
        // The sync client (Supabase) is left out: it loads on demand, only on phones that sync.
        codeSplitting: { groups: [{ name: 'vendor', test: /node_modules[\\/](?!@supabase[\\/])/ }] },
      },
    },
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    // One process per test file: rhythm.test.ts sets process.env.TZ, which only takes effect (and stays contained) in a forked process.
    pool: 'forks',
    setupFiles: ['./src/test/setup.ts'],
  },
});
