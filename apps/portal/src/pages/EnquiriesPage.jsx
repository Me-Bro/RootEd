import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ENQUIRY_STATUSES } from '@rooted/shared/constants';
import api from '@/lib/api.js';
import { fmtDate } from '@/lib/format.js';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Select } from '@/components/ui/Input.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Card, CardContent } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, Spinner } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const STATUS_VARIANT = { new: 'info', contacted: 'warning', closed: 'default' };

function EnquiryRow({ enquiry, onChanged }) {
  const { t, i18n } = useTranslation();
  const move = useMutation({
    mutationFn: (status) => api.patch(`/admin/enquiries/${enquiry._id}`, { status }),
    onSuccess: onChanged,
  });

  return (
    <TableRow data-testid={`enquiry-${enquiry.collegeName}`}>
      <TableCell className="text-xs text-muted-foreground">
        {fmtDate(enquiry.createdAt, i18n.language)}
      </TableCell>
      <TableCell>
        <div className="font-medium">{enquiry.collegeName}</div>
        {enquiry.message && (
          <div className="max-w-64 text-xs text-muted-foreground">{enquiry.message}</div>
        )}
      </TableCell>
      <TableCell>
        <div>{enquiry.contactName}</div>
        <a className="text-xs underline" href={`mailto:${enquiry.email}`}>
          {enquiry.email}
        </a>
        <div>
          <a className="text-xs underline" href={`tel:${enquiry.phone}`}>
            {enquiry.phone}
          </a>
        </div>
      </TableCell>
      <TableCell>{t(`enquiries.programme.${enquiry.programme}`)}</TableCell>
      <TableCell>
        <Badge variant={STATUS_VARIANT[enquiry.status]} data-testid="enquiry-status">
          {t(`enquiries.status.${enquiry.status}`)}
        </Badge>
      </TableCell>
      <TableCell>
        <select
          aria-label={t('enquiries.moveFor', { college: enquiry.collegeName })}
          className="h-8 rounded-lg border border-input bg-card px-2 text-sm"
          value={enquiry.status}
          disabled={move.isPending}
          onChange={(e) => move.mutate(e.target.value)}
        >
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enquiries.status.${s}`)}
            </option>
          ))}
        </select>
        {move.isError && (
          <p role="alert" className="text-xs text-destructive">
            {t('common.error')}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Colleges that asked for a proposal on the public page, for the Rural Root Cloud team. */
export default function EnquiriesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');

  const query = useQuery({
    queryKey: ['enquiries', status],
    queryFn: () =>
      api
        .get('/admin/enquiries', { params: { limit: 100, ...(status ? { status } : {}) } })
        .then((r) => r.data),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('enquiries.title')} description={t('enquiries.description')} />

      <div className="max-w-48">
        <Select
          label={t('enquiries.filter')}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{t('enquiries.all')}</option>
          {ENQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`enquiries.status.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <Spinner />
      ) : query.error ? (
        <ErrorNote error={query.error} onRetry={query.refetch} />
      ) : query.data.enquiries.length === 0 ? (
        <EmptyState title={t('enquiries.none')} description={t('enquiries.noneHint')} />
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('enquiries.received')}</TableHead>
                  <TableHead>{t('enquiries.college')}</TableHead>
                  <TableHead>{t('enquiries.contact')}</TableHead>
                  <TableHead>{t('enquiries.interest')}</TableHead>
                  <TableHead>{t('enquiries.statusLabel')}</TableHead>
                  <TableHead>{t('enquiries.move')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.enquiries.map((e) => (
                  <EnquiryRow
                    key={e._id}
                    enquiry={e}
                    onChanged={() => queryClient.invalidateQueries({ queryKey: ['enquiries'] })}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
