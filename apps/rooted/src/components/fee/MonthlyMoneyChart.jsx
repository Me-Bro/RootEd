import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatCurrency } from '../../utils/intl.js';
import { formatMonth } from '../../utils/studyCenter.js';

// Two series, fixed order: collected is slot 1 (blue), spent slot 2 (orange) of the
// validated categorical palette, each with its own dark-mode step. The legend names
// them (colour is never the only cue) and a table view carries every exact figure.
const COLLECTED = 'bg-[#2a78d6] dark:bg-[#3987e5]';
const SPENT = 'bg-[#eb6834] dark:bg-[#d95926]';
const CHART_HEIGHT = 160; // px

const bar = (value, max) => (max > 0 && value > 0 ? Math.max((value / max) * CHART_HEIGHT, 2) : 0);

/**
 * Collected against spent for each month in `data` ([{ month, collected, spent }],
 * oldest first). A zero month draws no bar, only its label and its table row.
 */
export default function MonthlyMoneyChart({ data }) {
  const { t } = useTranslation();
  const [showTable, setShowTable] = useState(false);
  const max = Math.max(0, ...data.flatMap((d) => [d.collected, d.spent]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul className="flex gap-4 text-xs text-muted-foreground" aria-label={t('finance.legend')}>
          <li className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${COLLECTED}`} aria-hidden="true" />
            {t('finance.collected')}
          </li>
          <li className="flex items-center gap-1.5">
            <span className={`size-2.5 rounded-sm ${SPENT}`} aria-hidden="true" />
            {t('finance.spent')}
          </li>
        </ul>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {showTable ? t('finance.viewChart') : t('finance.viewTable')}
        </button>
      </div>

      {showTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-medium">{t('finance.month')}</th>
              <th className="py-1 text-right font-medium">{t('finance.collected')}</th>
              <th className="py-1 text-right font-medium">{t('finance.spent')}</th>
              <th className="py-1 text-right font-medium">{t('finance.net')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month} className="border-t border-border">
                <td className="py-1.5">{formatMonth(d.month)}</td>
                <td className="py-1.5 text-right">{formatCurrency(d.collected)}</td>
                <td className="py-1.5 text-right">{formatCurrency(d.spent)}</td>
                <td className="py-1.5 text-right">{formatCurrency(d.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div
          role="img"
          aria-label={t('finance.chartLabel')}
          className="flex items-end gap-2 border-b border-border"
          style={{ height: CHART_HEIGHT + 24 }}
          data-testid="money-chart"
        >
          {data.map((d) => (
            <div key={d.month} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                className="flex w-full items-end justify-center gap-0.5"
                style={{ height: CHART_HEIGHT }}
              >
                {[
                  ['collected', COLLECTED],
                  ['spent', SPENT],
                ].map(([key, color]) => (
                  <div
                    key={key}
                    className={`w-full max-w-6 rounded-t-[4px] ${color}`}
                    style={{ height: bar(d[key], max) }}
                    title={`${formatMonth(d.month)} · ${t(`finance.${key}`)}: ${formatCurrency(d[key])}`}
                  />
                ))}
              </div>
              <span className="truncate text-[11px] text-muted-foreground">
                {formatMonth(d.month)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
