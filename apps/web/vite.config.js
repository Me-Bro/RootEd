import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Proxy API calls in dev and test so requests are same-origin (avoids SameSite=Lax
    // cookie blocking) and resolveTenant() sees the correct subdomain via Host override.
    proxy: {
      '/__api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/__api/, ''),
        changeOrigin: true,
        headers: { Host: 'testschool.localhost' },
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
