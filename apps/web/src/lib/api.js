import axios from 'axios';

// If VITE_API_URL is not explicitly set, route through the Vite proxy on the same origin.
// This avoids SameSite=Lax cookie blocking that occurs when the API is on a different
// host/subdomain than the frontend.
const BASE_URL = import.meta.env.VITE_API_URL || `${window.location.origin}/__api`;

let _accessToken = null;
let _onLogout = null;
let _csrfToken = null;
let _csrfPromise = null;

export function setAccessToken(token) {
  _accessToken = token;
}

export function getAccessToken() {
  return _accessToken;
}

export function setLogoutHandler(fn) {
  _onLogout = fn;
}

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

const SAFE_METHODS = new Set(['get', 'head', 'options']);
const CSRF_SKIP_PATHS = new Set(['/auth/login', '/auth/refresh', '/csrf-token']);

async function fetchCsrfToken() {
  if (_csrfToken) return _csrfToken;
  if (!_csrfPromise) {
    _csrfPromise = axios
      .get(
        `${BASE_URL}/csrf-token`,
        { withCredentials: true }
      )
      .then(({ data }) => {
        _csrfToken = data.csrfToken;
        return _csrfToken;
      })
      .finally(() => {
        _csrfPromise = null;
      });
  }
  return _csrfPromise;
}

export function clearCsrfToken() {
  _csrfToken = null;
}

api.interceptors.request.use(async (config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  const method = (config.method || 'get').toLowerCase();
  const path = (config.url || '').replace(config.baseURL || '', '');
  if (!SAFE_METHODS.has(method) && !CSRF_SKIP_PATHS.has(path)) {
    const token = await fetchCsrfToken();
    if (token) config.headers['x-csrf-token'] = token;
  }
  return config;
});

let isRefreshing = false;
let refreshSubscribers = [];

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (
      err.response?.status === 403 &&
      /csrf/i.test(err.response?.data?.error || '') &&
      !original._csrfRetry
    ) {
      original._csrfRetry = true;
      clearCsrfToken();
      const token = await fetchCsrfToken();
      original.headers['x-csrf-token'] = token;
      return api(original);
    }
    const reqPath = (original.url || '').replace(original.baseURL || '', '');
    const isAuthSkipReq = reqPath === '/auth/refresh' || reqPath === '/auth/logout' || reqPath === '/auth/login';
    if (err.response?.status === 401 && !original._retry && !isAuthSkipReq) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshSubscribers.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(api(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        setAccessToken(data.accessToken);
        onRefreshed(data.accessToken);
        isRefreshing = false;
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        isRefreshing = false;
        setAccessToken(null);
        if (_onLogout) _onLogout();
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
