import { useState, useEffect, useCallback } from 'react';
import api, { setAccessToken, setLogoutHandler, clearCsrfToken } from '../lib/api.js';
import { AuthContext } from './auth-context.js';

// Trimmed from apps/web's AuthContext: sign-in with a password (and TOTP for
// super admins), tenant selection, refresh and sign-out. Google sign-in and
// impersonation are not part of the portal.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

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
    api
      .post('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
        setToken(data.accessToken);
        return api.get('/auth/me');
      })
      .then((res) => setUser(res.data))
      .catch(() => {
        // A token without a user is worse than no token: every guard reads
        // user.permissions and user.orgs. Drop the session and sign in again.
        setAccessToken(null);
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier, password, totpCode) => {
    const { data } = await api.post('/auth/login', {
      identifier,
      password,
      ...(totpCode ? { totpCode } : {}),
    });
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    const meRes = await api.get('/auth/me');
    setUser(meRes.data);
    return meRes.data;
  }, []);

  // A person in several colleges picks one; this reissues the token with that
  // tenantId claim, which is how the API knows which college a request is for.
  const selectTenant = useCallback(async (tenantId) => {
    const { data } = await api.post('/auth/select-tenant', { tenantId });
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    const meRes = await api.get('/auth/me');
    setUser(meRes.data);
    return meRes.data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, selectTenant, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
