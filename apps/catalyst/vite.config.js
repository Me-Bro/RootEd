import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appDomain = env.VITE_APP_DOMAIN || 'rooted.app';
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:3001';
  // The Host the API sees. Pinned to the existing portal host (not a tenant
  // subdomain) so the API takes the tenant from the access token's claim —
  // the same path the apex host already uses — in dev, e2e and production.
  const portalApiHost = env.PORTAL_API_HOST || appDomain;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5174,
      allowedHosts: ['localhost', '.localtest.me'],
      proxy: {
        '/__api': {
          target: apiProxyTarget,
          rewrite: (path) => path.replace(/^\/__api/, ''),
          changeOrigin: true,
          headers: {
            Host: portalApiHost,
            // Express trusts X-Forwarded-Host (trust proxy is on), so a browser
            // could otherwise name any tenant. Blank it: the Host above wins.
            'X-Forwarded-Host': '',
          },
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
