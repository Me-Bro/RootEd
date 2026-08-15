import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth.js';

export default function ImpersonateCallbackPage() {
  const { loginWithToken } = useAuth();
  const [status, setStatus] = useState('pending');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional bail-out on missing token
      setStatus('error');
      return;
    }

    loginWithToken(token)
      .then(() => {
        window.history.replaceState(null, '', window.location.pathname);
        setStatus('done');
      })
      .catch(() => setStatus('error'));
  }, [loginWithToken]);

  if (status === 'error') return <Navigate to="/login" replace />;
  if (status === 'done') return <Navigate to="/dashboard" replace />;
  return <p className="p-6 text-sm text-gray-500">Signing in…</p>;
}
