import { useTranslation } from 'react-i18next';

/**
 * Linear progress bar for the "Generate All Slips" batch job.
 *
 * Shows the real completed/total count reported by the BullMQ job's progress
 * (see salarySlip.worker.js's `job.updateProgress({ completed, total })`,
 * mirroring reportCard.worker.js's identical pattern) instead of a silent
 * multi-second wait — docs/mobile-ui/13-salary-approved.html §1/§3/§6.
 */
export function GenerateProgress({ done, total }) {
  const { t } = useTranslation();
  const known = Number.isFinite(total) && total > 0;
  const pct = known ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? done : undefined}
      aria-label={
        known
          ? t('staff.salary.slipsGeneratedAria', { done, total })
          : t('staff.salary.generationStartingAria')
      }
      className="flex flex-col gap-2"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{t('staff.salary.generatingLabel')}</span>
        <span className="tabular-nums text-muted-foreground">
          {known ? t('staff.salary.doneOfTotal', { done, total }) : t('staff.salary.starting')}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
