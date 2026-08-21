import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appDomain = env.VITE_APP_DOMAIN || 'rooted.app';
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: ['localhost', '.localtest.me'],
      // Proxy API calls in dev and test so requests are same-origin (avoids SameSite=Lax
      // cookie blocking) and resolveTenant() sees the correct subdomain via Host override.
      // API_PROXY_TARGET overrides the upstream (e.g. `http://api:3001` when this dev
      // server runs inside the docker-compose.dev.yml `web` container, where `localhost`
      // is the container itself, not the `api` container).
      proxy: {
        '/__api': {
          target: apiProxyTarget,
          rewrite: (path) => path.replace(/^\/__api/, ''),
          changeOrigin: true,
          headers: { Host: `testschool.${appDomain}` },
        },
      },
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  };
});
