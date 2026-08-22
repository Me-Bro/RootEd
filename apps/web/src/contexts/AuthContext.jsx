import { useState, useEffect, useCallback } from 'react';
import api, { setAccessToken, setLogoutHandler, clearCsrfToken } from '../lib/api.js';
import { AuthContext } from './auth-context.js';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tenants, setTenants] = useState([]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // ignore
    }
    setAccessToken(null);
    setToken(null);
    setUser(null);
    clearCsrfToken();
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]);

  useEffect(() => {
    // The impersonation callback page supplies its own token via loginWithToken;
    // this refresh (using the admin-domain's refresh cookie, absent here) must
    // not race it and clear the freshly-set impersonation token.
    if (window.location.pathname === '/impersonate') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional skip-refresh on impersonation callback
      setLoading(false);
      return;
    }
    api
      .post('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setToken(data.accessToken);
        return api.get('/auth/me').catch(() => null);
      })
      .then((res) => {
        if (res?.data) setUser(res.data);
      })
      .catch(() => {
        setAccessToken(null);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password, totpCode) => {
    const { data } = await api.post('/auth/login', {
      email,
      password,
      ...(totpCode ? { totpCode } : {}),
    });
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    setTenants(data.tenants ?? []);
    try {
      const meRes = await api.get('/auth/me');
      setUser(meRes.data);
    } catch {
      setUser({ email });
    }
    return data;
  }, []);

  // Called from the tenant-picker screen when a general-portal user belongs
  // to more than one tenant — reissues the access token (and refresh cookie)
  // with a tenantId claim (see POST /auth/select-tenant).
  const selectTenant = useCallback(async (tenantId) => {
    const { data } = await api.post('/auth/select-tenant', { tenantId });
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    const meRes = await api.get('/auth/me');
    setUser(meRes.data);
    return meRes.data;
  }, []);

  // Used by the impersonation callback: an access token issued out-of-band by
  // POST /admin/tenants/:id/impersonate, landing on a fresh page load on the
  // tenant's own subdomain (no refresh cookie there, so the mount-time refresh
  // effect above will fail harmlessly before this resolves).
  const loginWithToken = useCallback(async (token) => {
    setAccessToken(token);
    setToken(token);
    const meRes = await api.get('/auth/me');
    setUser(meRes.data);
    setLoading(false);
    return meRes.data;
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, accessToken, loading, tenants, login, loginWithToken, selectTenant, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
