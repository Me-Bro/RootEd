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

function CreateYearModal({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', startDate: '', endDate: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/academic/years', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      onOpenChange(false);
      setForm({ name: '', startDate: '', endDate: '' });
      setError('');
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create year'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Academic Year</DialogTitle>
        </DialogHeader>
        <form
          id="create-year"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate(form); }}
          className="flex flex-col gap-4"
        >
          <Input label="Name" value={form.name} onChange={update('name')} required placeholder="2025–26" />
          <Input label="Start Date" type="date" value={form.startDate} onChange={update('startDate')} required />
          <Input label="End Date" type="date" value={form.endDate} onChange={update('endDate')} required />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="create-year" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AcademicYearsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: years = [], isLoading, error } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get('/academic/years').then((r) => r.data),
  });

  const activate = useMutation({
    mutationFn: (id) => api.patch(`/academic/years/${id}/activate`).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['academic-years'] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Academic Years"
        action={<Button onClick={() => setShowCreate(true)}>New Year</Button>}
      />

      {error && <p className="text-destructive">Failed to load academic years</p>}

      <DataTable
        headers={['Name', 'Start Date', 'End Date', 'Status', 'Actions']}
        isLoading={isLoading}
        isEmpty={years.length === 0}
        emptyMessage="No academic years yet"
      >
        {years.map((y) => (
          <TableRow key={y._id} className="bg-card">
            <TableCell className="px-4 py-3 font-medium">{y.name}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{new Date(y.startDate).toLocaleDateString()}</TableCell>
            <TableCell className="px-4 py-3 text-muted-foreground">{new Date(y.endDate).toLocaleDateString()}</TableCell>
            <TableCell className="px-4 py-3">
              {y.isActive
                ? <Badge variant="success">Active</Badge>
                : <Badge variant="default">Inactive</Badge>}
            </TableCell>
            <TableCell className="px-4 py-3">
              {!y.isActive && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activate.mutate(y._id)}
                  disabled={activate.isPending}
                >
                  Activate
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>

      <CreateYearModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
