import { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { SelectField, SelectItem } from '../../components/ui/SelectField.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import LearnerPicker from '../../components/study/LearnerPicker.jsx';
import { formatDate } from '../../utils/intl.js';
import { apiError } from '../../utils/studyCenter.js';

const time = (value) => formatDate(value, 'en-IN', { hour: '2-digit', minute: '2-digit' });
// The front desk: find or register a learner, put them on a seat, take them off it.
// Who is in right now is the list below. A plan that is unpaid, expired or missing
// warns here and never stops a check-in; after closing time only an owner can check
// anyone in (the server says so, and this page just shows the message).
export default function FrontDeskPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const canSeeFees = (user?.permissions ?? []).includes('fees:read');

  const [learner, setLearner] = useState(location.state?.learner ?? null);
  const [seatId, setSeatId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  const open = useQuery({
    queryKey: ['open-visits'],
    queryFn: () => api.get('/academic/visits/open').then((r) => r.data),
    refetchInterval: 30_000,
  });
  const free = useQuery({
    queryKey: ['free-seats', learner?._id],
    queryFn: () =>
      api
        .get('/academic/visits/free-seats', { params: { studentId: learner._id } })
        .then((r) => r.data),
    enabled: Boolean(learner),
  });
  const entitlement = useQuery({
    queryKey: ['entitlement', learner?._id],
    queryFn: () =>
      api.get('/fee/entitlement', { params: { studentId: learner._id } }).then((r) => r.data),
    enabled: Boolean(learner) && canSeeFees,
  });

  const visits = open.data ?? [];
  const current = learner ? visits.find((v) => v.student._id === learner._id) : null;
  const seats = free.data ?? [];
  const chosenSeat = seatId || seats[0]?.seatId || '';

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['open-visits'] });
    queryClient.invalidateQueries({ queryKey: ['free-seats'] });
  };

  const checkIn = useMutation({
    mutationFn: () =>
      api
        .post('/academic/visits/check-in', {
          studentId: learner._id,
          ...(seatId ? { seatId } : {}),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      setError('');
      setSeatId('');
      setNotice({
        name: learner.firstName,
        seat: data.seat.label,
        warning: data.warning,
        outsideHours: data.visit.outsideHours,
      });
      refresh();
    },
    onError: (err) => {
      setNotice(null);
      setError(apiError(err, t('studyCenter.desk.failed')));
      refresh();
    },
  });

  const checkOut = useMutation({
    mutationFn: (id) => api.post(`/academic/visits/${id}/check-out`),
    onSuccess: () => {
      setError('');
      setNotice(null);
      refresh();
    },
    onError: (err) => {
      setError(apiError(err, t('studyCenter.desk.failed')));
      refresh();
    },
  });

  const entitlementStatus = entitlement.data?.status;
  const warn = (status) => status && status !== 'valid';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.desk.title')}
        description={t('studyCenter.desk.description')}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {notice && (
        <Card data-testid="checkin-done">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            <p className="font-medium">
              {t('studyCenter.desk.checkedIn', { name: notice.name, seat: notice.seat })}
            </p>
            {notice.outsideHours && (
              <p className="text-muted-foreground">{t('studyCenter.desk.outsideHoursNote')}</p>
            )}
            {warn(notice.warning?.status) && (
              <p role="status" className="font-medium text-yellow-700">
                {t(`studyCenter.desk.warn_${notice.warning.status}`)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <LearnerPicker
            value={learner}
            onChange={(l) => {
              setLearner(l);
              setSeatId('');
              setNotice(null);
              setError('');
            }}
            allowWalkIn
          />

          {learner && (
            <>
              {canSeeFees && entitlementStatus && (
                <p
                  className={
                    warn(entitlementStatus)
                      ? 'text-sm text-yellow-700'
                      : 'text-sm text-muted-foreground'
                  }
                  data-testid="desk-entitlement"
                >
                  {t(`studyCenter.desk.entitlement_${entitlementStatus}`)}
                </p>
              )}

              {current ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm">
                    {t('studyCenter.desk.alreadyIn', {
                      seat: current.seat.label,
                      time: time(current.inAt),
                    })}
                  </p>
                  <Button
                    disabled={checkOut.isPending}
                    onClick={() => checkOut.mutate(current._id)}
                  >
                    {t('studyCenter.desk.checkOut')}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <SelectField
                    label={t('studyCenter.desk.seat')}
                    value={chosenSeat}
                    onValueChange={setSeatId}
                    placeholder={t('studyCenter.desk.noFreeSeat')}
                  >
                    {seats.map((s) => (
                      <SelectItem key={s.seatId} value={s.seatId}>
                        {s.own ? t('studyCenter.desk.ownSeat', { label: s.label }) : s.label}
                      </SelectItem>
                    ))}
                  </SelectField>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={!chosenSeat || checkIn.isPending}
                      onClick={() => checkIn.mutate()}
                    >
                      {t('studyCenter.desk.checkIn')}
                    </Button>
                    <Link to="/fee/sell" state={{ learner }}>
                      <Button variant="outline" type="button">
                        {t('studyCenter.desk.sellPlan')}
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">
          {t('studyCenter.desk.insideNow', { count: visits.length })}
        </h2>
        <DataTable
          headers={[
            t('studyCenter.desk.person'),
            t('studyCenter.desk.seat'),
            t('studyCenter.desk.since'),
            '',
          ]}
          isLoading={open.isLoading}
          isEmpty={!open.isLoading && visits.length === 0}
          emptyMessage={t('studyCenter.desk.nobody')}
        >
          {visits.map((v) => (
            <TableRow key={v._id}>
              <TableCell className="font-medium">
                {v.student.name}
                {v.student.kind === 'walk_in' && (
                  <Badge variant="secondary" className="ml-2">
                    {t('studyCenter.sell.walkIn')}
                  </Badge>
                )}
                {warn(v.entitlementAtCheckIn) && (
                  <Badge variant="warning" className="ml-2">
                    {t(`studyCenter.desk.badge_${v.entitlementAtCheckIn}`)}
                  </Badge>
                )}
              </TableCell>
              <TableCell>{v.seat.label}</TableCell>
              <TableCell>{time(v.inAt)}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={checkOut.isPending}
                  onClick={() => checkOut.mutate(v._id)}
                >
                  {t('studyCenter.desk.checkOut')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </DataTable>
      </div>
    </div>
  );
}
