import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

const selectCls =
  'h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

function statusVariant(status) {
  if (status === 'approved') return 'success';
  if (status === 'pending') return 'warning';
  if (status === 'rejected') return 'danger';
  return 'default';
}

function RejectModal({ open, onOpenChange, requestId }) {
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
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to reject'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reject Leave Request</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">Comment (optional)</label>
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
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyLeaveModal({ open, onOpenChange, staffId, leaveTypes }) {
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
    onError: (err) => setError(err.response?.data?.error || 'Failed to submit leave request'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for Leave</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Leave Type</label>
              <select {...register('leaveTypeId', { required: true })} className={selectCls}>
                <option value="">— Select —</option>
                {leaveTypes.map((lt) => (
                  <option key={lt._id} value={lt._id}>
                    {lt.name}
                  </option>
                ))}
              </select>
            </div>
            <Input label="From" type="date" {...register('fromDate', { required: true })} />
            <Input label="To" type="date" {...register('toDate', { required: true })} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Reason (optional)</label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Submitting…' : 'Submit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeModal({ open, onOpenChange, leaveType }) {
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
    onError: (err) => setError(err.response?.data?.error || 'Failed to save leave type'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{leaveType ? 'Edit Leave Type' : 'Add Leave Type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
          <div className="flex flex-col gap-4">
            <Input label="Name" {...register('name', { required: true })} />
            <Input
              label="Max Days / Year"
              type="number"
              min="1"
              {...register('maxDaysPerYear', { required: true, valueAsNumber: true })}
            />
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" {...register('isPaid')} />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" {...register('requiresApproval')} />
              Requires approval
            </label>
          </div>

          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

          <DialogFooter className="mt-4">
            <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypesSection({ leaveTypes }) {
  const [modalType, setModalType] = useState(undefined);
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Leave Types</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setModalType(undefined);
            setShowModal(true);
          }}
        >
          Add Leave Type
        </Button>
      </div>
      <div className="flex flex-col gap-2">
        {leaveTypes.map((lt) => (
          <div key={lt._id} className="flex items-center justify-between text-sm py-1">
            <span>
              {lt.name} — {lt.maxDaysPerYear} days/year{lt.isPaid ? '' : ' (unpaid)'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setModalType(lt);
                setShowModal(true);
              }}
            >
              Edit
            </Button>
          </div>
        ))}
        {leaveTypes.length === 0 && (
          <p className="text-sm text-muted-foreground">No leave types configured yet.</p>
        )}
      </div>
      <LeaveTypeModal open={showModal} onOpenChange={setShowModal} leaveType={modalType} />
    </div>
  );
}

function ConflictBadge({ flags }) {
  if (!flags?.length) return null;
  return (
    <Badge variant="warning" title={flags.join(', ')}>
      {flags.length} timetable conflict{flags.length > 1 ? 's' : ''}
    </Badge>
  );
}

export default function LeaveRequestsPage() {
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

  const { data, isLoading, error } = useQuery({
    queryKey: ['leave-requests', tab, statusFilter, from, to, page],
    queryFn: () => {
      const params = new URLSearchParams({ page });
      if (tab === 'pending') params.set('status', 'pending');
      else if (statusFilter) params.set('status', statusFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/staff/leave-requests?${params}`).then((r) => r.data);
    },
  });
  const requests = data?.requests ?? [];

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/staff/leave-requests/${id}/approve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave-requests'] }),
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
        title="Leave Requests"
        action={
          canWrite && (
            <Button onClick={() => setShowApply(true)} disabled={!myStaff}>
              Apply for Leave
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
                {b.total - b.used} / {b.total} days left
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 border-b border-border">
        {['all', 'pending'].map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={[
              'px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t === 'all' ? 'All Requests' : 'Pending Approval'}
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
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Input
            type="date"
            label=""
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            placeholder="From"
          />
          <Input
            type="date"
            label=""
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            placeholder="To"
          />
        </div>
      )}

      {error && <p className="text-destructive">Failed to load leave requests</p>}

      <DataTable
        headers={['Staff', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Actions']}
        isLoading={isLoading}
        isEmpty={requests.length === 0}
        emptyMessage="No leave requests found"
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
                          Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectId(r._id)}>
                          Reject
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
                        Cancel
                      </Button>
                    )}
                  </div>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </DataTable>

      {data && data.pages > 1 && (
        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Previous
          </Button>
          <span className="text-sm self-center text-muted-foreground">
            Page {page} of {data.pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page >= data.pages}
          >
            Next
          </Button>
        </div>
      )}

      <RejectModal
        open={Boolean(rejectId)}
        onOpenChange={(v) => !v && setRejectId(null)}
        requestId={rejectId}
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
