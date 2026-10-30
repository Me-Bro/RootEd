import { useState, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';
import { RecordList, RecordListItem } from '../../components/ui/RecordList.jsx';
import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { Progress } from '../../components/ui/progress.jsx';
import ApprovalQueueCard from '../../components/leave/ApprovalQueueCard.jsx';

const selectCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function statusVariant(status) {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

function RejectModal({ open, onOpenChange, requestId, onSuccess }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/staff/leave-requests/${requestId}/reject`, { comment }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      onOpenChange(false);
      setComment('');
      setError('');
      onSuccess?.();
    },
    onError: (err) => setError(err.response?.data?.error || t('staff.leaves.rejectFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staff.leaves.rejectModalTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">{t('staff.leaves.commentOptional')}</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? t('staff.leaves.rejecting') : t('staff.leaves.reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyLeaveModal({ open, onOpenChange, staffId, leaveTypes }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm({
    defaultValues: { leaveTypeId: '', fromDate: '', toDate: '', reason: '' },
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      api.post('/staff/leave-requests', { ...data, staffId }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      onOpenChange(false);
      reset();
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('staff.leaves.submitFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('staff.leaves.applyForLeave')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('staff.leaves.leaveType')}</label>
              <select {...register('leaveTypeId', { required: true })} className={selectCls}>
                <option value="">{t('staff.leaves.selectPlaceholder')}</option>
                {leaveTypes.map((lt) => (
                  <option key={lt._id} value={lt._id}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label={t('staff.leaves.from')}
              type="date"
              {...register('fromDate', { required: true })}
            />
            <Input
              label={t('staff.leaves.to')}
              type="date"
              {...register('toDate', { required: true })}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">{t('staff.leaves.reasonOptional')}</label>
              <textarea
                {...register('reason')}
                rows={3}
                className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('staff.leaves.submitting') : t('staff.leaves.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeModal({ open, onOpenChange, leaveType }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const { register, handleSubmit, reset } = useForm({
    defaultValues: {
      name: leaveType?.name ?? '',
      maxDaysPerYear: leaveType?.maxDaysPerYear ?? '',
      isPaid: leaveType?.isPaid ?? true,
      requiresApproval: leaveType?.requiresApproval ?? true,
    },
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      leaveType
        ? api.patch(`/staff/leave-types/${leaveType._id}`, data).then((r) => r.data)
        : api.post('/staff/leave-types', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-types'] });
      onOpenChange(false);
      reset();
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || t('staff.leaves.saveLeaveTypeFailed')),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {leaveType ? t('staff.leaves.editLeaveTypeTitle') : t('staff.leaves.addLeaveTypeTitle')}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          <div className="flex flex-col gap-4">
            <Input label={t('common.name')} {...register('name', { required: true })} />
            <Input
              label={t('staff.leaves.maxDaysPerYear')}
              type="number"
              min="1"
              {...register('maxDaysPerYear', { required: true, valueAsNumber: true })}
            />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" {...register('isPaid')} />
              {t('staff.leaves.paidLeave')}
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" {...register('requiresApproval')} />
              {t('staff.leaves.requiresApproval')}
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypesSection({ leaveTypes }) {
  const { t } = useTranslation();
  const [modalType, setModalType] = useState(undefined);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">{t('staff.leaves.leaveTypesHeading')}</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setModalType(undefined);
            setShowModal(true);
          }}
        >
          {t('staff.leaves.addLeaveType')}
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {leaveTypes.map((lt) => (
          <div key={lt._id} className="flex items-center justify-between text-sm py-1">
            <span>
              {lt.name} — {t('staff.leaves.daysPerYear', { count: lt.maxDaysPerYear })}
              {lt.isPaid ? '' : ` (${t('staff.leaves.unpaid')})`}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setModalType(lt);
                setShowModal(true);
              }}
            >
              {t('common.edit')}
            </Button>
          </div>
        ))}
        {leaveTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('staff.leaves.noLeaveTypes')}</p>
        )}
      </div>
      <LeaveTypeModal open={showModal} onOpenChange={setShowModal} leaveType={modalType} />
    </div>
  );
}

const EMPTY_REQUESTS = [];

function ConflictBadge({ flags }) {
  const { t } = useTranslation();
  if (!flags?.length) return null;
  return (
    <Badge variant="warning" title={flags.join(', ')}>
      {t('staff.leaves.timetableConflict', { count: flags.length })}
    </Badge>
  );
}

export default function LeaveRequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const canApprove = permissions.includes('leave:approve');
  const canWrite = permissions.includes('leave:write');
  const canManageLeaveTypes = permissions.includes('tenant:admin');

  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [rejectId, setRejectId] = useState(null);
  const [showApply, setShowApply] = useState(false);

  const { data: myStaff } = useQuery({
    queryKey: ['my-staff-member'],
    queryFn: () => api.get('/staff/members/me').then((r) => r.data),
    enabled: canWrite,
    retry: false,
  });

  const { data: leaveTypes = [] } = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => api.get('/staff/leave-types').then((r) => r.data),
    enabled: canWrite || canManageLeaveTypes,
  });

  const { data: myBalances = [] } = useQuery({
    queryKey: ['leave-balances', myStaff?._id],
    queryFn: () => api.get(`/staff/leave-balances?staffId=${myStaff._id}`).then((r) => r.data),
    enabled: Boolean(myStaff?._id),
  });

  // Approver's Pending tab (Mock 2, docs/mobile-ui/12-leave-requests-approved.html)
  // works the whole pending set in one sitting instead of paging through it —
  // bump the limit to the API's max instead of the table's default page size.
  const isApproverQueue = tab === 'pending' && canApprove;

  const { data, isLoading, error } = useQuery({
    queryKey: ['leave-requests', tab, statusFilter, from, to, page, canApprove],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (tab === 'pending') {
        params.set('status', 'pending');
        if (canApprove) params.set('limit', '100');
      } else if (statusFilter) params.set('status', statusFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/staff/leave-requests?${params}`).then((r) => r.data);
    },
  });
  const requests = data?.requests ?? EMPTY_REQUESTS;

  // The approval chain (LeaveRequest.approvalChain / currentApproverIndex,
  // enforced server-side in staff.js's approve/reject routes) is sequential —
  // only the current step's approver may act. GET /leave-requests?status=pending
  // returns every pending request tenant-wide, not just "my turn" ones, so the
  // queue filters client-side to what this approver can actually decide right
  // now; otherwise a multi-step chain would surface a card that 403s on every
  // action with no way to skip it. A super_admin bypasses the chain check
  // server-side (see isCurrentApprover call sites in staff.js), so it bypasses
  // the filter here too. Not in the spec's literal text — see build report.
  const myPendingQueue = useMemo(() => {
    if (!isApproverQueue) return EMPTY_REQUESTS;
    if (user?.systemRole === 'super_admin') return requests;
    return requests.filter(
      (r) => r.approvalChain?.[r.currentApproverIndex]?.approverId === user?._id
    );
  }, [isApproverQueue, requests, user]);

  const currentRequest = myPendingQueue[0];

  // "N of Total" tracks progress through this approver's own actionable queue
  // (myPendingQueue), not the raw tenant-wide pending count — see comment above
  // on why those two numbers differ from the mock's flat "36 pending". Session
  // state (queueTotal/processedCount/queueError) is reset by adjusting it
  // directly during render — React's documented pattern for "reset state when
  // something changes" — rather than in an Effect, so re-entering the
  // approver's Pending tab always starts a fresh count without an extra
  // render-then-clear round trip.
  const [processedCount, setProcessedCount] = useState(0);
  const [queueTotal, setQueueTotal] = useState(null);
  const [queueError, setQueueError] = useState('');
  const lastQueueRequestId = useRef(null);

  if (!isApproverQueue) {
    if (queueTotal !== null || processedCount !== 0) {
      setQueueTotal(null);
      setProcessedCount(0);
    }
  } else if (queueTotal === null && data) {
    setQueueTotal(myPendingQueue.length);
  }

  if (currentRequest?._id !== lastQueueRequestId.current) {
    lastQueueRequestId.current = currentRequest?._id ?? null;
    if (queueError) setQueueError('');
  }

  const { data: currentBalance } = useQuery({
    queryKey: ['leave-balances', currentRequest?.staffId?._id],
    queryFn: () =>
      api.get(`/staff/leave-balances?staffId=${currentRequest.staffId._id}`).then((r) => r.data),
    enabled: isApproverQueue && Boolean(currentRequest?.staffId?._id),
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/staff/leave-requests/${id}/approve`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      setProcessedCount((c) => c + 1);
      setQueueError('');
    },
    onError: (err) => setQueueError(err.response?.data?.error || t('staff.leaves.approveFailed')),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => api.patch(`/staff/leave-requests/${id}/cancel`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    },
  });

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('staff.leaves.title')}
        action={
          canWrite && (
            <Button onClick={() => setShowApply(true)} disabled={!myStaff}>
              {t('staff.leaves.applyForLeave')}
            </Button>
          )
        }
      />

      {canManageLeaveTypes && <LeaveTypesSection leaveTypes={leaveTypes} />}

      {canWrite && myStaff && myBalances.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {myBalances.map((b) => (
            <div key={b._id} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{b.leaveTypeId?.name}: </span>
              <span className="font-medium">
                {t('staff.leaves.balanceLeftSuffix', { left: b.total - b.used, total: b.total })}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto border-b border-border">
        {['all', 'pending'].map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => {
              setTab(tabKey);
              setPage(1);
            }}
            className={[
              'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors',
              tab === tabKey
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tabKey === 'all'
              ? t('staff.leaves.allRequestsTab')
              : t('staff.leaves.pendingApprovalTab')}
          </button>
        ))}
      </div>

      {tab === 'all' && (
        <div className="flex gap-3 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className={selectCls}
          >
            <option value="">{t('staff.leaves.statusOptions.all')}</option>
            <option value="pending">{t('staff.leaves.statusOptions.pending')}</option>
            <option value="approved">{t('staff.leaves.statusOptions.approved')}</option>
            <option value="rejected">{t('staff.leaves.statusOptions.rejected')}</option>
            <option value="cancelled">{t('staff.leaves.statusOptions.cancelled')}</option>
          </select>
          <Input
            type="date"
            label=""
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            placeholder={t('staff.leaves.from')}
          />
          <Input
            type="date"
            label=""
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            placeholder={t('staff.leaves.to')}
          />
        </div>
      )}

      {error && <p className="text-destructive">{t('staff.leaves.loadFailed')}</p>}

      {isApproverQueue ? (
        isLoading ? (
          <p className="text-sm text-muted-foreground">{t('staff.leaves.loadingQueue')}</p>
        ) : myPendingQueue.length === 0 ? (
          <EmptyState
            title={t('staff.leaves.allCaughtUpTitle')}
            description={t('staff.leaves.allCaughtUpDescription')}
          />
        ) : (
          <div className="flex max-w-md flex-col gap-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span aria-live="polite">
                {t('staff.leaves.queueProgressLabel', {
                  current: Math.min(processedCount + 1, queueTotal ?? myPendingQueue.length),
                  total: queueTotal ?? myPendingQueue.length,
                })}
              </span>
            </div>
            <Progress
              value={
                queueTotal ? Math.min(100, Math.round((processedCount / queueTotal) * 100)) : 0
              }
              aria-label={t('staff.leaves.approvalQueueProgressAriaLabel')}
            />
            <ApprovalQueueCard
              key={currentRequest._id}
              request={currentRequest}
              balance={currentBalance}
              onApprove={() => approveMutation.mutate(currentRequest._id)}
              onReject={() => setRejectId(currentRequest._id)}
              busy={approveMutation.isPending}
              error={queueError}
            />
          </div>
        )
      ) : (
        <>
          <RecordList
            isLoading={isLoading}
            isEmpty={requests.length === 0}
            emptyMessage={t('staff.leaves.noRequestsFound')}
          >
            {requests.map((r) => {
              const isOwn = myStaff && r.staffId?._id === myStaff._id;
              return (
                <RecordListItem
                  key={r._id}
                  title={`${r.staffId?.firstName ?? ''} ${r.staffId?.lastName ?? ''}`.trim()}
                  meta={`${r.leaveTypeId?.name || '—'} · ${formatDate(r.fromDate)} – ${formatDate(
                    r.toDate
                  )} · ${t('staff.leaves.dayCount', { count: r.totalDays })}`}
                  trailing={
                    <>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      <ConflictBadge flags={r.conflictFlags} />
                    </>
                  }
                  footer={
                    r.status === 'pending' &&
                    (canApprove || isOwn) && (
                      <div className="flex flex-wrap gap-2">
                        {canApprove && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(r._id)}
                              disabled={approveMutation.isPending}
                            >
                              {t('staff.leaves.approve')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectId(r._id)}>
                              {t('staff.leaves.reject')}
                            </Button>
                          </>
                        )}
                        {isOwn && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelMutation.mutate(r._id)}
                            disabled={cancelMutation.isPending}
                          >
                            {t('common.cancel')}
                          </Button>
                        )}
                      </div>
                    )
                  }
                />
              );
            })}
          </RecordList>

          <DataTable
            className="hidden md:block"
            headers={[
              t('staff.leaves.columnStaff'),
              t('staff.leaves.leaveType'),
              t('staff.leaves.from'),
              t('staff.leaves.to'),
              t('staff.leaves.columnDays'),
              t('common.status'),
              t('common.actions'),
            ]}
            isLoading={isLoading}
            isEmpty={requests.length === 0}
            emptyMessage={t('staff.leaves.noRequestsFound')}
          >
            {requests.map((r) => {
              const isOwn = myStaff && r.staffId?._id === myStaff._id;
              return (
                <TableRow key={r._id} className="bg-card">
                  <TableCell className="px-4 py-3">
                    {r.staffId?.firstName} {r.staffId?.lastName}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-muted-foreground">
                    {r.leaveTypeId?.name || '—'}
                  </TableCell>
                  <TableCell className="px-4 py-3">{formatDate(r.fromDate)}</TableCell>
                  <TableCell className="px-4 py-3">{formatDate(r.toDate)}</TableCell>
                  <TableCell className="px-4 py-3">{r.totalDays}</TableCell>
                  <TableCell className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      <ConflictBadge flags={r.conflictFlags} />
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        {canApprove && (
                          <>
                            <Button
                              size="sm"
                              onClick={() => approveMutation.mutate(r._id)}
                              disabled={approveMutation.isPending}
                            >
                              {t('staff.leaves.approve')}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setRejectId(r._id)}>
                              {t('staff.leaves.reject')}
                            </Button>
                          </>
                        )}
                        {isOwn && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => cancelMutation.mutate(r._id)}
                            disabled={cancelMutation.isPending}
                          >
                            {t('common.cancel')}
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </DataTable>
        </>
      )}

      {!isApproverQueue && data && data.pages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            {t('staff.leaves.previous')}
          </Button>
          <span className="text-sm self-center text-muted-foreground">
            {t('staff.leaves.pageOfTotal', { page, total: data.pages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            {t('staff.leaves.next')}
          </Button>
        </div>
      )}

      <RejectModal
        open={Boolean(rejectId)}
        onOpenChange={(v) => !v && setRejectId(null)}
        requestId={rejectId}
        onSuccess={() => setProcessedCount((c) => c + 1)}
      />
      <ApplyLeaveModal
        open={showApply}
        onOpenChange={setShowApply}
        staffId={myStaff?._id}
        leaveTypes={leaveTypes}
      />
    </div>
  );
}
