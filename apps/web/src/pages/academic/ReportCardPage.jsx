import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';
import { useClassSections } from '../../hooks/useClassSections.js';
import { useAuth } from '../../contexts/useAuth.js';

const EMPTY_ARRAY = [];
const POLL_INTERVAL_MS = 3000;
const MAX_POLL_ATTEMPTS = 40; // ~2 minutes

export default function ReportCardPage() {
  const { user } = useAuth();
  const canGenerate = (user?.permissions ?? []).includes('grades:publish');

  const queryClient = useQueryClient();
  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [pollError, setPollError] = useState('');
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const [reusedJob, setReusedJob] = useState(false);
  const pollAttempts = useRef(0);

  const { classes } = useClassSections();

  const { data: terms = EMPTY_ARRAY } = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const historyQuery = useQuery({
    queryKey: ['report-card-history', sectionId, termId],
    queryFn: () =>
      api
        .get(`/academic/report-card/history?sectionId=${sectionId}&termId=${termId}`)
        .then((r) => r.data),
    enabled: Boolean(sectionId && termId),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/academic/report-card/generate', { sectionId, termId }).then((r) => r.data),
    onSuccess: (data) => {
      pollAttempts.current = 0;
      setJobId(data.jobId);
      setJobState('waiting');
      setResultUrl(null);
      setPollError('');
      setPollTimedOut(false);
      setReusedJob(Boolean(data.existing));
    },
    onError: (err) => setPollError(err.response?.data?.error || 'Failed to start generation'),
  });

  useEffect(() => {
    if (!jobId) return;
    if (jobState === 'completed' || jobState === 'failed') return;

    const interval = setInterval(async () => {
      pollAttempts.current += 1;
      if (pollAttempts.current > MAX_POLL_ATTEMPTS) {
        setPollTimedOut(true);
        clearInterval(interval);
        return;
      }

      try {
        const { data } = await api.get(`/academic/report-card/status/${jobId}`);
        setJobState(data.state);
        if (data.state === 'completed' && data.result?.url) {
          setResultUrl(data.result.url);
          queryClient.invalidateQueries({ queryKey: ['report-card-history', sectionId, termId] });
          clearInterval(interval);
        }
        if (data.state === 'failed') {
          setPollError('Report card generation failed');
          queryClient.invalidateQueries({ queryKey: ['report-card-history', sectionId, termId] });
          clearInterval(interval);
        }
      } catch {
        setPollError('Failed to check job status');
        clearInterval(interval);
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [jobId, jobState, queryClient, sectionId, termId]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Report Cards</h1>

      <div className="flex gap-3 flex-wrap items-end">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Section</label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select Section —</option>
            {classes.map((c) => (
              <optgroup key={c._id} label={c.name}>
                {(c.sections || []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="">— Select Term —</option>
            {terms.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {canGenerate && (
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={!sectionId || !termId || generateMutation.isPending}
          >
            {generateMutation.isPending ? 'Starting…' : 'Generate Report Cards'}
          </Button>
        )}
      </div>

      {!canGenerate && (
        <p className="text-sm text-gray-400">
          You don&apos;t have permission to generate report cards. Ask an admin for the{' '}
          <code className="font-mono text-xs">grades:publish</code> permission.
        </p>
      )}

      {jobId && (
        <div
          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col gap-3"
          aria-live="polite"
        >
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Job ID: <span className="font-mono text-xs">{jobId}</span>
          </p>
          {reusedJob && (
            <p className="text-xs text-gray-400">
              A generation for this section/term was already in progress — reusing it.
            </p>
          )}
          <p className="text-sm">
            Status:{' '}
            <span
              className={[
                'font-medium',
                jobState === 'completed' ? 'text-green-600' : '',
                jobState === 'failed' ? 'text-red-600' : '',
                jobState === 'active' ? 'text-blue-600' : '',
              ].join(' ')}
            >
              {jobState ?? 'waiting'}
            </span>
          </p>
          {jobState !== 'completed' && jobState !== 'failed' && !pollTimedOut && (
            <p className="text-xs text-gray-400">Polling every 3 seconds…</p>
          )}
          {pollTimedOut && (
            <p className="text-sm text-amber-600">
              Taking longer than expected — check the history below shortly.
            </p>
          )}
          {resultUrl && (
            <a
              href={resultUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:underline text-sm font-medium"
            >
              Download Report Cards PDF
            </a>
          )}
          {pollError && <p className="text-sm text-red-500">{pollError}</p>}
        </div>
      )}

      {sectionId && termId && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">History</h2>
          {historyQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          )}
          {historyQuery.data?.length === 0 && (
            <p className="text-sm text-gray-400">No report cards generated yet for this scope.</p>
          )}
          {historyQuery.data?.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Generated
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Status
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                      Download
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {historyQuery.data.map((b) => (
                    <tr key={b._id} className="bg-white dark:bg-gray-900">
                      <td className="px-4 py-3">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-3">{b.status}</td>
                      <td className="px-4 py-3">
                        {b.url ? (
                          <a
                            href={b.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            Download
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
