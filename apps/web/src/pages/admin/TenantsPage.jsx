import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card.jsx';

const planOptions = ['starter', 'growth', 'pro', 'enterprise'];

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'archived') return 'danger';
  return 'default';
}

function CreateModal({ onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', subdomain: '', plan: 'starter', adminEmail: '' });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/admin/tenants', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error || 'Failed to create tenant'),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>New Tenant</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            id="create-tenant"
            onSubmit={(e) => {
              e.preventDefault();
              mutation.mutate(form);
            }}
            className="flex flex-col gap-4"
          >
            <Input label="School Name" value={form.name} onChange={update('name')} required />
            <Input
              label="Subdomain"
              value={form.subdomain}
              onChange={update('subdomain')}
              required
              placeholder="acme-school"
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
              <select
                value={form.plan}
                onChange={update('plan')}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {planOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Admin Email"
              type="email"
              value={form.adminEmail}
              onChange={update('adminEmail')}
              required
            />
            {error && <p className="text-sm text-red-500">{error}</p>}
          </form>
        </CardContent>
        <CardFooter className="gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-tenant" disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function TenantsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['tenants'],
    queryFn: () => api.get('/admin/tenants').then((r) => r.data),
  });

  function useTenantAction(action) {
    return useMutation({
      mutationFn: (id) => api.patch(`/admin/tenants/${id}/${action}`).then((r) => r.data),
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenants'] }),
    });
  }

  const suspend = useTenantAction('suspend');
  const archive = useTenantAction('archive');
  const restore = useTenantAction('restore');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <Button onClick={() => setShowCreate(true)}>New Tenant</Button>
      </div>

      {isLoading && <p className="text-gray-500">Loading…</p>}
      {error && <p className="text-red-500">Failed to load tenants</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left">
              <tr>
                {['Name', 'Subdomain', 'Plan', 'Status', 'Created At', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.tenants?.map((t) => (
                <tr
                  key={t._id}
                  className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/tenants/${t._id}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{t.subdomain}</td>
                  <td className="px-4 py-3 capitalize">{t.plan}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {t.status === 'active' && (
                        <Button variant="outline" size="sm" onClick={() => suspend.mutate(t._id)}>
                          Suspend
                        </Button>
                      )}
                      {(t.status === 'active' || t.status === 'suspended') && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => archive.mutate(t._id)}
                        >
                          Archive
                        </Button>
                      )}
                      {t.status === 'archived' && (
                        <Button variant="outline" size="sm" onClick={() => restore.mutate(t._id)}>
                          Restore
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
