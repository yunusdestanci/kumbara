import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: telefonda tarayıcıdan "Ana ekrana ekle" ile uygulama gibi kurulur.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Kumbara Takip',
        short_name: 'Kumbara',
        lang: 'tr',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f6f4a',
        icons: [],
      },
    }),
  ],
});
