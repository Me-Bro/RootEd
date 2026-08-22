import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api.js';

const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_MAX_ATTEMPTS = 40; // ~2 minutes

/**
 * Polls a BullMQ job-status endpoint (`{jobId, state, result}` shape, e.g.
 * GET /academic/report-card/status/:jobId or
 * GET /staff/salary-slips/status/:jobId) until it settles.
 *
 * statusUrl: full path string, or null/undefined to leave polling disabled.
 */
export function useJobPolling(
  statusUrl,
  { intervalMs = DEFAULT_INTERVAL_MS, maxAttempts = DEFAULT_MAX_ATTEMPTS, onSettled } = {}
) {
  const [state, setState] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [timedOut, setTimedOut] = useState(false);
  const attempts = useRef(0);

  const reset = useCallback(() => {
    attempts.current = 0;
    setState(null);
    setResult(null);
    setError('');
    setTimedOut(false);
  }, []);

  useEffect(() => {
    if (!statusUrl) return;
    if (state === 'completed' || state === 'failed') return;

    const interval = setInterval(async () => {
      attempts.current += 1;
      if (attempts.current > maxAttempts) {
        setTimedOut(true);
        clearInterval(interval);
        return;
      }

      try {
        const { data } = await api.get(statusUrl);
        setState(data.state);
        if (data.state === 'completed' || data.state === 'failed') {
          setResult(data.result);
          onSettled?.(data);
          clearInterval(interval);
        }
      } catch {
        setError('Failed to check job status');
        clearInterval(interval);
      }
    }, intervalMs);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusUrl, state, intervalMs, maxAttempts]);

  return { state, result, error, timedOut, reset };
}
