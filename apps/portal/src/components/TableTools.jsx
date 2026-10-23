import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Input } from '@/components/ui/Input.jsx';
import { Button } from '@/components/ui/Button.jsx';

/**
 * Search box, "showing x of y" and CSV export for a batch table. A batch is a
 * few dozen students, so filtering happens in the browser on rows already loaded.
 */
export function TableTools({ query, onQuery, shown, total, onExport }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full max-w-xs">
        <Input
          type="search"
          label={t('common.search')}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
        />
      </div>
      <p role="status" className="pb-2 text-xs text-muted-foreground" data-testid="table-count">
        {t('common.showing', { shown, total })}
      </p>
      <Button variant="outline" className="ml-auto" onClick={onExport} disabled={shown === 0}>
        <Download className="size-4" aria-hidden="true" />
        {t('common.exportCsv')}
      </Button>
    </div>
  );
}
