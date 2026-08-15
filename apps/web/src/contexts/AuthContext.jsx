import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api, { setAccessToken, setLogoutHandler, clearCsrfToken } from '../lib/api.js';

const AuthContext = createContext(null);

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
    api.post('/auth/refresh')
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
    const { data } = await api.post('/auth/login', { email, password, ...(totpCode ? { totpCode } : {}) });
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    try {
      const meRes = await api.get('/auth/me');
      setUser(meRes.data);
    } catch {
      setUser({ email });
    }
    return data;
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
