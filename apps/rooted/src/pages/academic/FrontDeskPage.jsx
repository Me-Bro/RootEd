import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import LearnerPicker from '../../components/study/LearnerPicker.jsx';
import ExpiringPlans from '../../components/study/ExpiringPlans.jsx';
import DeskSummary from '../../components/study/DeskSummary.jsx';
import DeskLearnerList from '../../components/study/DeskLearnerList.jsx';
import DeskSeatMap from '../../components/study/DeskSeatMap.jsx';
import DeskActivity from '../../components/study/DeskActivity.jsx';
import CheckOutAllButton from '../../components/study/CheckOutAllButton.jsx';
import { apiError } from '../../utils/studyCenter.js';
import { canCheckOutAll, seatClickAction } from '../../utils/deskView.js';
import { formatTime } from '../../utils/intl.js';

// The front desk, on one screen: who is inside, every learner with one button to check
// them in or out, a live map of the seats, and today's activity. A plan that is unpaid,
// expired or missing warns here and never stops a check-in; after closing time only an
// owner can check anyone in (the server says so, and this page just shows the message).
export default function FrontDeskPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const permissions = user?.permissions ?? [];
  const isOwner = canCheckOutAll(permissions);
  const canOpenProfile = permissions.includes('students:read');

  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [pickedTile, setPickedTile] = useState(null);
  const [addingWalkIn, setAddingWalkIn] = useState(false);
  const [view, setView] = useState('list');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);

  // Search the server a moment after the last keystroke.
  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  const desk = useQuery({
    queryKey: ['desk', search, filter],
    queryFn: () =>
      api
        .get('/academic/visits/desk', { params: { ...(search ? { search } : {}), filter } })
        .then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

  const data = desk.data;
  const learners = data?.learners ?? [];
  const seats = data?.seats ?? [];
  // The picked learner, as the latest payload sees them (they may have just checked in).
  const learner = selected ? (learners.find((l) => l._id === selected._id) ?? selected) : null;
  const insideCount = data?.summary.insideNow ?? 0;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['desk'] });

  const checkIn = useMutation({
    mutationFn: ({ studentId, seatId }) =>
      api
        .post('/academic/visits/check-in', { studentId, ...(seatId ? { seatId } : {}) })
        .then((r) => r.data),
    onSuccess: (result, vars) => {
      setError('');
      setPickedTile(null);
      setNotice({
        name: vars.name,
        seat: result.seat.label,
        warning: result.warning,
        outsideHours: result.visit.outsideHours,
      });
      refresh();
    },
    onError: (err) => {
      setNotice(null);
      setError(apiError(err, t('studyCenter.desk.failed')));
      // A lost race changes who is where: show the truth, not the stale map.
      refresh();
    },
  });

  const checkOut = useMutation({
    mutationFn: (visitId) => api.post(`/academic/visits/${visitId}/check-out`),
    onSuccess: () => {
      setError('');
      setNotice(null);
      setPickedTile(null);
      refresh();
    },
    onError: (err) => {
      setError(apiError(err, t('studyCenter.desk.failed')));
      refresh();
    },
  });

  const checkOutAll = useMutation({
    mutationFn: () => api.post('/academic/visits/check-out-all').then((r) => r.data),
    onSuccess: (result) => {
      setError('');
      setPickedTile(null);
      setNotice({ closedAll: result.closed });
      refresh();
    },
  });

  async function confirmCheckOutAll() {
    try {
      await checkOutAll.mutateAsync();
      return true;
    } catch {
      return false;
    }
  }

  const busy = checkIn.isPending || checkOut.isPending;

  function onTile(tile) {
    setError('');
    const action = seatClickAction(tile, learner);
    if (action.type === 'checkIn') {
      checkIn.mutate({ studentId: action.studentId, seatId: action.seatId, name: learner.name });
    } else if (action.type === 'checkOut') {
      setPickedTile(tile);
    } else {
      setPickedTile(null);
      setError(
        t(
          action.type === 'alreadyInside'
            ? 'studyCenter.desk.pickAlreadyInside'
            : 'studyCenter.desk.pickLearnerFirst'
        )
      );
    }
  }

  const checkOutError = checkOutAll.isError
    ? apiError(checkOutAll.error, t('studyCenter.desk.failed'))
    : '';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('studyCenter.desk.title')}
        description={t('studyCenter.desk.description')}
        action={
          isOwner ? (
            <CheckOutAllButton
              count={insideCount}
              isPending={checkOutAll.isPending}
              error={checkOutError}
              onConfirm={confirmCheckOutAll}
            />
          ) : null
        }
      />

      <DeskSummary summary={data?.summary} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {notice && (
        <Card data-testid="checkin-done">
          <CardContent className="flex flex-col gap-1 pt-4 text-sm">
            {'closedAll' in notice ? (
              <p className="font-medium">
                {notice.closedAll === 0
                  ? t('studyCenter.desk.nobody')
                  : t('studyCenter.desk.checkedOutAll', { count: notice.closedAll })}
              </p>
            ) : (
              <>
                <p className="font-medium">
                  {t('studyCenter.desk.checkedIn', { name: notice.name, seat: notice.seat })}
                </p>
                {notice.outsideHours && (
                  <p className="text-muted-foreground">{t('studyCenter.desk.outsideHoursNote')}</p>
                )}
                {notice.warning && notice.warning.status !== 'valid' && (
                  <p role="status" className="font-medium text-yellow-700">
                    {t(`studyCenter.desk.warn_${notice.warning.status}`)}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {pickedTile?.occupant && (
        <Card data-testid="seat-checkout">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
            <p>
              {t('studyCenter.desk.onSeat', {
                name: pickedTile.occupant.name ?? '—',
                seat: pickedTile.label,
                time: formatTime(pickedTile.occupant.since),
              })}
            </p>
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => checkOut.mutate(pickedTile.occupant.visitId)}>
                {t('studyCenter.desk.checkOut')}
              </Button>
              <Button variant="outline" onClick={() => setPickedTile(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {permissions.includes('fees:read') && <ExpiringPlans canOpenProfile={canOpenProfile} />}

      {addingWalkIn && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <LearnerPicker
              value={null}
              allowWalkIn
              startAdding
              onChange={(l) => {
                if (!l) return;
                setAddingWalkIn(false);
                setText(l.phone || `${l.firstName} ${l.lastName}`.trim());
                setSelected({ _id: l._id, name: `${l.firstName} ${l.lastName}`.trim() });
              }}
            />
            <div>
              <Button variant="outline" size="sm" onClick={() => setAddingWalkIn(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* On a phone the list and the map are two views of one screen. */}
      <div className="flex gap-2 lg:hidden" role="group" aria-label={t('studyCenter.desk.view')}>
        {['list', 'map'].map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? 'default' : 'outline'}
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {t(`studyCenter.desk.view_${v}`)}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={view === 'list' ? 'block' : 'hidden lg:block'}>
          <DeskLearnerList
            learners={learners}
            truncated={data?.truncated}
            isLoading={desk.isLoading}
            search={text}
            onSearch={setText}
            filter={filter}
            onFilter={setFilter}
            selectedId={learner?._id}
            onSelect={(l) => setSelected(l ? { _id: l._id, name: l.name } : null)}
            onCheckIn={(l) => checkIn.mutate({ studentId: l._id, name: l.name })}
            onCheckOut={(visitId) => checkOut.mutate(visitId)}
            busy={busy}
            now={new Date()}
            onNewWalkIn={() => setAddingWalkIn(true)}
            canOpenProfile={canOpenProfile}
          />
        </div>
        <div className={view === 'map' ? 'block' : 'hidden lg:block'}>
          <DeskSeatMap seats={seats} selectedSeatId={pickedTile?.seatId} onTile={onTile} />
        </div>
      </div>

      <DeskActivity
        rows={data?.activity ?? []}
        isLoading={desk.isLoading}
        canOpenProfile={canOpenProfile}
      />
    </div>
  );
}
