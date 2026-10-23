import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api.js';
import { fmtPct, fullName } from '@/lib/format.js';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton, Meter } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

// Only ever an anchor for plain http(s); the API refuses anything else.
const isWebLink = (url) => /^https?:\/\//i.test(url ?? '');

function Work({ student, items }) {
  const { t } = useTranslation();
  const titleOf = (id) => items.find((i) => String(i._id) === String(id))?.title ?? '?';
  const name = fullName(student.student);

  return (
    <details>
      <summary
        className="cursor-pointer text-sm text-primary"
        aria-label={t('roadmap.progress.workFor', { name })}
      >
        {t('roadmap.progress.work')}
      </summary>
      {student.work.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('roadmap.progress.noWork')}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {student.work.map((w) => (
            <li key={w.itemId} className="text-xs">
              <span className="font-medium">{titleOf(w.itemId)}</span>
              {w.completedAt && (
                <span className="ml-2 text-success">{t('roadmap.progress.completedMark')}</span>
              )}
              {w.answer && (
                <p className="whitespace-pre-wrap">
                  <span className="text-muted-foreground">{t('roadmap.progress.answer')}: </span>
                  {w.answer}
                </p>
              )}
              {w.linkUrl && (
                <p>
                  <span className="text-muted-foreground">{t('roadmap.progress.link')}: </span>
                  {isWebLink(w.linkUrl) ? (
                    <a
                      className="text-primary underline"
                      href={w.linkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {w.linkUrl}
                    </a>
                  ) : (
                    w.linkUrl
                  )}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

/** Every student's progress on one roadmap, with what they wrote, for mentors. */
export function RoadmapProgressTable({ roadmapId }) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['roadmap-progress', roadmapId],
    queryFn: () => api.get(`/training/roadmaps/${roadmapId}/progress`).then((r) => r.data),
  });

  if (query.isLoading) return <ListSkeleton />;
  if (query.error) return <ErrorNote error={query.error} onRetry={query.refetch} />;

  const { items, students } = query.data;
  if (students.length === 0) return <EmptyState title={t('roadmap.progress.none')} />;

  return (
    <Card data-testid="roadmap-progress">
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('roadmap.progress.student')}</TableHead>
              <TableHead>{t('roadmap.progress.done')}</TableHead>
              <TableHead>{t('roadmap.progress.percent')}</TableHead>
              <TableHead>
                <span className="sr-only">{t('roadmap.progress.work')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((row) => {
              const name = fullName(row.student);
              return (
                <TableRow key={row.student._id} data-testid={`progress-${name}`}>
                  <TableCell>
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">{row.student.admissionNo}</div>
                  </TableCell>
                  <TableCell>
                    {row.completed} / {row.total}
                  </TableCell>
                  <TableCell className="min-w-40">
                    <div className="flex items-center gap-2">
                      <Meter value={row.pct} label={name} />
                      <span className="w-12 text-right text-xs">{fmtPct(row.pct)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Work student={row} items={items} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
