import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  optimizeDeps: { exclude: ['maplibre-gl'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{html,js,css,svg,png,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      manifest: {
        id: '/',
        name: 'HuntNav',
        short_name: 'HuntNav',
        description: 'A map-first field navigation companion for hunters.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a1411',
        theme_color: '#0a1411',
        categories: ['navigation', 'outdoors'],
        icons: [{
          src: '/icons/huntnav-icon.svg',
          sizes: 'any',
          type: 'image/svg+xml',
          purpose: 'any maskable',
        }],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
});
