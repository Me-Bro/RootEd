import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtPct } from '@/lib/format.js';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Meter, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

/** Read-only: the batch's names and how far each has got, never what they wrote. */
export default function LeaderboardPage() {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['my-leaderboard'],
    queryFn: () => api.get('/me/roadmap/leaderboard').then((r) => r.data.leaderboard),
  });

  if (query.isLoading) return <Spinner />;
  if (query.error) {
    return query.error.response?.status === 404 ? (
      <EmptyState title={t('me.noRecord')} description={t('me.noRecordHint')} />
    ) : (
      <ErrorNote error={query.error} onRetry={query.refetch} />
    );
  }

  const rows = query.data;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('leaderboard.title')} description={t('leaderboard.description')} />
      {rows.length === 0 ? (
        <EmptyState title={t('leaderboard.none')} description={t('leaderboard.noneHint')} />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <caption className="sr-only">{t('leaderboard.caption')}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('leaderboard.rank')}</TableHead>
                  <TableHead>{t('leaderboard.student')}</TableHead>
                  <TableHead>{t('leaderboard.completed')}</TableHead>
                  <TableHead>{t('leaderboard.progress')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={`${row.rank}-${row.displayName}`}
                    aria-current={row.isMe ? 'true' : undefined}
                    className={row.isMe ? 'bg-primary/5 font-medium' : undefined}
                    data-testid={`board-${row.displayName}`}
                  >
                    <TableCell>{row.rank}</TableCell>
                    <TableCell>
                      {row.displayName}
                      {row.isMe && (
                        <Badge variant="info" className="ml-2">
                          {t('leaderboard.you')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.completed} / {row.total}
                    </TableCell>
                    <TableCell className="min-w-40">
                      <div className="flex items-center gap-2">
                        <Meter value={row.pct} label={row.displayName} />
                        <span className="w-12 text-right text-xs">{fmtPct(row.pct)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
