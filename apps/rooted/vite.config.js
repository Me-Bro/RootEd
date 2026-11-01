import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'url';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const appDomain = env.VITE_APP_DOMAIN || 'rooted.app';
  const apiProxyTarget = env.API_PROXY_TARGET || 'http://localhost:3001';
  // Which seeded tenant `--mode test` pins the API Host to. The study-center e2e
  // project starts a second Vite instance with E2E_TENANT_SUBDOMAIN=studycenter,
  // since one instance can only ever reach one tenant.
  const pinnedTenant = env.E2E_TENANT_SUBDOMAIN || 'testschool';

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
          // Only e2e pins the Host: its fixtures live in the seeded `testschool`
          // tenant (or the one named by E2E_TENANT_SUBDOMAIN) and Playwright browses 127.0.0.1, which carries no subdomain.
          // In dev, forward the browser's own Host instead — pinning it sent every
          // request to `testschool` regardless of who was logged in, so an org
          // without a `subdomain` (created via the org-creation flow, reachable
          // only through resolveTenant()'s token-claim fallback on the apex host)
          // 403'd on every tenant-scoped call.
          changeOrigin: mode === 'test',
          ...(mode === 'test' ? { headers: { Host: `${pinnedTenant}.${appDomain}` } } : {}),
        },
        // General-portal path — bare apex Host (no subdomain), exercises
        // resolveTenant()'s tenantId-claim fallback for tests. In `--mode test`
        // the /__api proxy above pins Host to the testschool subdomain, so this
        // is the only way to reach that branch there.
        // Vite matches proxy prefixes with a plain startsWith (no path-segment
        // boundary check) — this key must NOT itself start with '/__api' or
        // the rule above silently swallows it first.
        '/__portal-api': {
          target: apiProxyTarget,
          rewrite: (path) => path.replace(/^\/__portal-api/, ''),
          changeOrigin: true,
          headers: { Host: appDomain },
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
