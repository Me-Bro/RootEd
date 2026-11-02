import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { Card, CardContent } from '../ui/Card.jsx';
import { Button } from '../ui/Button.jsx';
import { Badge } from '../ui/Badge.jsx';

// "Ends today", "Ends in 2 days", "Ended 3 days ago": one phrase per row.
function expiryLabel(t, daysLeft) {
  if (daysLeft === 0) return t('studyCenter.desk.endsToday');
  if (daysLeft === 1) return t('studyCenter.desk.endsTomorrow');
  if (daysLeft > 1) return t('studyCenter.desk.endsIn', { count: daysLeft });
  if (daysLeft === -1) return t('studyCenter.desk.endedYesterday');
  return t('studyCenter.desk.endedAgo', { count: -daysLeft });
}

/**
 * Members whose plan ends soon or just ended and who have not renewed, for the front
 * desk. The phone is a tap-to-call link; Renew opens the sale with the learner and plan
 * filled in (and, for a plan still running, the start date right after it ends).
 */
export default function ExpiringPlans({ canRenew }) {
  const { t } = useTranslation();
  const plans = useQuery({
    queryKey: ['expiring-plans'],
    queryFn: () => api.get('/fee/reports/expiring-plans').then((r) => r.data.plans),
  });

  const rows = plans.data ?? [];
  // A nudge, never a blocker: nothing to show while loading, on error, or when empty.
  if (rows.length === 0) return null;

  return (
    <Card data-testid="expiring-plans">
      <CardContent className="flex flex-col gap-3 pt-4">
        <div>
          <h2 className="text-sm font-semibold">{t('studyCenter.desk.expiringTitle')}</h2>
          <p className="text-xs text-muted-foreground">{t('studyCenter.desk.expiringHint')}</p>
        </div>
        <ul className="flex flex-col divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.studentId}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
              data-testid="expiring-row"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {r.name}
                  <Badge variant={r.state === 'lapsed' ? 'warning' : 'secondary'} className="ml-2">
                    {t(`studyCenter.desk.badge_${r.state}`)}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {[r.planName, expiryLabel(t, r.daysLeft)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {r.phone && (
                  <a
                    href={`tel:${r.phone}`}
                    className="text-sm text-primary hover:underline"
                    aria-label={t('studyCenter.desk.callPhone', { name: r.name })}
                  >
                    {r.phone}
                  </a>
                )}
                {canRenew &&
                  (r.renewable ? (
                    <Link
                      to="/fee/sell"
                      state={{
                        learner: {
                          _id: r.studentId,
                          firstName: r.firstName,
                          lastName: r.lastName,
                          phone: r.phone,
                        },
                        feeStructureId: r.feeStructureId,
                        renewFrom: r.renewFrom,
                      }}
                    >
                      <Button size="sm" variant="outline" type="button">
                        {t('studyCenter.desk.renew')}
                      </Button>
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      {t('studyCenter.desk.renewUnavailable')}
                    </span>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
