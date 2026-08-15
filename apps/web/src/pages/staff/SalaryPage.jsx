import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';

function statusVariant(status) {
  if (status === 'paid') return 'success';
  if (status === 'generated') return 'warning';
  return 'default';
}

export default function SalaryPage() {
  const queryClient = useQueryClient();
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [genError, setGenError] = useState('');

  const { data: slips = [], isLoading, error } = useQuery({
    queryKey: ['salary-slips', month, year],
    queryFn: () => {
      const params = new URLSearchParams({ month, year });
      return api.get(`/staff/salary-slips?${params}`).then((r) => r.data);
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['staff-members-active'],
    queryFn: () => api.get('/staff/members?status=active').then((r) => r.data),
  });

  const generateMutation = useMutation({
    mutationFn: (staffId) =>
      api.post('/staff/salary-slips/generate', { staffId, month: Number(month), year: Number(year) }).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['salary-slips'] }),
    onError: (err) => setGenError(err.response?.data?.error || 'Failed to generate slip'),
  });

  async function generateAll() {
    setGenError('');
    for (const m of members) {
      if (m.salaryStructureId) {
        await generateMutation.mutateAsync(m._id).catch(() => {});
      }
    }
    queryClient.invalidateQueries({ queryKey: ['salary-slips'] });
  }

  const downloadMutation = useMutation({
    mutationFn: (id) => api.get(`/staff/salary-slips/${id}/download`).then((r) => r.data),
    onSuccess: (data) => window.open(data.url, '_blank'),
  });

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Salary Slips</h1>
        <Button onClick={generateAll} disabled={generateMutation.isPending || members.length === 0}>
          {generateMutation.isPending ? 'Generating…' : 'Generate All Slips'}
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          {MONTHS.map((m, i) => (
            <option key={m} value={String(i + 1)}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {genError && <p className="text-sm text-red-500">{genError}</p>}

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-500">Failed to load salary slips</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left">
            <tr>
              {['Staff Name', 'Gross Earnings', 'Deductions', 'Net Pay', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {slips.map((s) => (
              <tr key={s._id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="px-4 py-3">
                  {s.staffId?.firstName} {s.staffId?.lastName}
                </td>
                <td className="px-4 py-3">{s.grossEarnings?.toFixed(2)}</td>
                <td className="px-4 py-3">{s.totalDeductions?.toFixed(2)}</td>
                <td className="px-4 py-3 font-semibold">{s.netPay?.toFixed(2)}</td>
                <td className="px-4 py-3">
                  <Badge variant={statusVariant(s.status)}>{s.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => downloadMutation.mutate(s._id)}
                    disabled={!s.pdfKey || downloadMutation.isPending}
                  >
                    Download
                  </Button>
                </td>
              </tr>
            ))}
            {slips.length === 0 && !isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  No slips generated for this period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
