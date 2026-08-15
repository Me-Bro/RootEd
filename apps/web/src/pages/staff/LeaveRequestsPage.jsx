import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { DataTable, TableRow, TableCell } from '../../components/ui/DataTable.jsx';

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
    mutationFn: () => api.patch(`/staff/leave-requests/${requestId}/reject`, { comment }).then((r) => r.data),
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function LeaveRequestsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rejectId, setRejectId] = useState(null);

  const { data: requests = [], isLoading, error } = useQuery({
    queryKey: ['leave-requests', tab, statusFilter, from, to],
    queryFn: () => {
      const params = new URLSearchParams();
      if (tab === 'pending') params.set('status', 'pending');
      else if (statusFilter) params.set('status', statusFilter);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      return api.get(`/staff/leave-requests?${params}`).then((r) => r.data);
    },
  });

  const approveMutation = useMutation({
    mutationFn: (id) => api.patch(`/staff/leave-requests/${id}/approve`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leave-requests'] }),
  });

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Leave Requests" />

      <div className="flex gap-2 border-b border-border">
        {['all', 'pending'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Input type="date" label="" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="From" />
          <Input type="date" label="" value={to} onChange={(e) => setTo(e.target.value)} placeholder="To" />
        </div>
      )}

      {error && <p className="text-destructive">Failed to load leave requests</p>}

      <DataTable
        headers={['Staff', 'Leave Type', 'From', 'To', 'Days', 'Status', 'Actions']}
        isLoading={isLoading}
        isEmpty={requests.length === 0}
        emptyMessage="No leave requests found"
      >
        {requests.map((r) => (
          <TableRow key={r._id} className="bg-card">
            <TableCell className="px-4 py-3">
              {r.staffId?.firstName} {r.staffId?.lastName}
            </TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{r.leaveTypeId?.name || '—'}</TableCell>
            <TableCell className="px-4 py-3">{formatDate(r.fromDate)}</TableCell>
            <TableCell className="px-4 py-3">{formatDate(r.toDate)}</TableCell>
            <TableCell className="px-4 py-3">{r.totalDays}</TableCell>
            <TableCell className="px-4 py-3">
              <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
            </TableCell>
            <TableCell className="px-4 py-3">
              {r.status === 'pending' && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => approveMutation.mutate(r._id)}
                    disabled={approveMutation.isPending}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setRejectId(r._id)}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <RejectModal
        open={Boolean(rejectId)}
        onOpenChange={(v) => !v && setRejectId(null)}
        requestId={rejectId}
      />
    </div>
  );
}
