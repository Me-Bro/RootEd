import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';

// Builds src/components/ui as a library into dist-ui/ for the Claude Design sync
// (`pnpm --filter rooted build:ui-lib`). Dependencies stay external so the sync bundles them once.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist-ui',
    emptyOutDir: true,
    cssFileName: 'style',
    lib: { entry: 'ui-lib/index.js', formats: ['es'], fileName: () => 'index.es.js' },
    rollupOptions: {
      external: (id) => !/^(\.|\/|@\/|\w:|\0)/.test(id) && !id.startsWith('ui-lib'),
    },
  },
});
