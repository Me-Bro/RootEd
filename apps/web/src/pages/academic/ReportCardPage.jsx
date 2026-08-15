import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';

export default function ReportCardPage() {
  const [sectionId, setSectionId] = useState('');
  const [termId, setTermId] = useState('');
  const [jobId, setJobId] = useState(null);
  const [jobState, setJobState] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [pollError, setPollError] = useState('');

  const { data: sections = [] } = useQuery({
    queryKey: ['sections'],
    queryFn: () => api.get('/academic/sections').then((r) => r.data),
  });

  const { data: terms = [] } = useQuery({
    queryKey: ['terms'],
    queryFn: () => api.get('/academic/terms').then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      api.post('/academic/report-card/generate', { sectionId, termId }).then((r) => r.data),
    onSuccess: (data) => {
      setJobId(data.jobId);
      setJobState('waiting');
      setResultUrl(null);
      setPollError('');
    },
    onError: (err) => setPollError(err.response?.data?.error || 'Failed to start generation'),
  });

  useEffect(() => {
    if (!jobId) return;
    if (jobState === 'completed' || jobState === 'failed') return;

    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/academic/report-card/status/${jobId}`);
        setJobState(data.state);
        if (data.state === 'completed' && data.result?.url) {
          setResultUrl(data.result.url);
          clearInterval(interval);
        }
        if (data.state === 'failed') {
          setPollError('Report card generation failed');
          clearInterval(interval);
        }
      } catch {
        setPollError('Failed to check job status');
        clearInterval(interval);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [jobId, jobState]);

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
            {sections.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
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
            {terms.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        </div>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={!sectionId || !termId || generateMutation.isPending}
        >
          {generateMutation.isPending ? 'Starting…' : 'Generate Report Cards'}
        </Button>
      </div>

      {jobId && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 flex flex-col gap-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Job ID: <span className="font-mono text-xs">{jobId}</span>
          </p>
          <p className="text-sm">
            Status:{' '}
            <span className={[
              'font-medium',
              jobState === 'completed' ? 'text-green-600' : '',
              jobState === 'failed' ? 'text-red-600' : '',
              jobState === 'active' ? 'text-blue-600' : '',
            ].join(' ')}>
              {jobState ?? 'waiting'}
            </span>
          </p>
          {jobState !== 'completed' && jobState !== 'failed' && (
            <p className="text-xs text-gray-400">Polling every 3 seconds…</p>
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
    </div>
  );
}
