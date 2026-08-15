import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Button } from '../../components/ui/Button.jsx';

export default function DepreciationPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['depreciation', year],
    queryFn: () => api.get(`/inventory/depreciation?year=${year}`).then((r) => r.data),
  });

  function exportCsv() {
    const lines = ['Asset Name,SKU,Method,Current Value,Annual Depreciation,% Deprecated'];
    for (const r of records) {
      const originalCost = r.item?.unitCost || 0;
      const pct = originalCost > 0 ? (((originalCost - r.currentValue) / originalCost) * 100).toFixed(1) : '0.0';
      lines.push(
        `"${r.item?.name || ''}","${r.item?.sku || ''}","${r.item?.depreciationMethod || ''}",${r.currentValue?.toFixed(2) || '0'},${r.annualDepreciation?.toFixed(2) || '0'},${pct}`
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `depreciation-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold">Asset Depreciation</h1>
        <div className="flex gap-3 items-center">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <Button variant="outline" onClick={exportCsv} disabled={records.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-left">
            <tr>
              {['Asset Name', 'SKU', 'Method', 'Current Value', 'Annual Depreciation', '% Deprecated'].map((h) => (
                <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {records.map((r) => {
              const originalCost = r.item?.unitCost || 0;
              const pct = originalCost > 0
                ? (((originalCost - r.currentValue) / originalCost) * 100).toFixed(1)
                : '0.0';
              return (
                <tr key={r.item?._id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800">
                  <td className="px-4 py-3 font-medium">{r.item?.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.item?.sku}</td>
                  <td className="px-4 py-3 uppercase text-gray-500">{r.item?.depreciationMethod}</td>
                  <td className="px-4 py-3">{r.currentValue?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-red-500">{r.annualDepreciation?.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-500">{pct}%</td>
                </tr>
              );
            })}
            {records.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No fixed assets found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
