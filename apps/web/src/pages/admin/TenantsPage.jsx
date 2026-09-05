import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ORG_TYPES } from '@rooted/shared/constants';
import api from '../../lib/api.js';
import { buildImpersonateUrl } from '../../lib/impersonation.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../../components/ui/Card.jsx';

const planOptions = ['starter', 'growth', 'pro', 'enterprise'];

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'archived') return 'danger';
  return 'default';
}

function CreateModal({ onClose }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    subdomain: '',
    plan: 'starter',
    orgType: 'school',
    adminEmail: '',
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (data) => api.post('/admin/tenants', data).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
    onError: (err) => setError(err.response?.data?.error || t('admin.tenants.createFailed')),
  });

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('admin.tenants.newTenant')}</CardTitle>
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
            <Input
              label={t('admin.tenants.schoolNameLabel')}
              value={form.name}
              onChange={update('name')}
              required
            />
            <Input
              label={t('admin.tenants.subdomainLabel')}
              value={form.subdomain}
              onChange={update('subdomain')}
              placeholder="acme-school"
            />
            <p className="-mt-2 text-xs text-gray-500">
              {t('admin.tenants.subdomainOptionalHint')}
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('admin.tenants.planLabel')}
              </label>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {t('admin.tenants.orgTypeLabel')}
              </label>
              <select
                value={form.orgType}
                onChange={update('orgType')}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              >
                {ORG_TYPES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label={t('admin.tenants.adminEmailLabel')}
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
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="create-tenant" disabled={mutation.isPending}>
            {mutation.isPending ? t('admin.tenants.creating') : t('common.create')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function TenantsPage() {
  const { t } = useTranslation();
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

  const impersonate = useMutation({
    mutationFn: (id) => api.post(`/admin/tenants/${id}/impersonate`).then((r) => r.data),
    onSuccess: ({ accessToken, subdomain }) => {
      window.location.href = buildImpersonateUrl(subdomain, accessToken);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('nav.tenants')}
        action={
          <Button className="w-full sm:w-auto" onClick={() => setShowCreate(true)}>
            {t('admin.tenants.newTenant')}
          </Button>
        }
      />

      {isLoading && <p className="text-gray-500">{t('common.loading')}</p>}
      {error && <p className="text-red-500">{t('admin.tenants.loadFailed')}</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left">
              <tr>
                {[
                  t('common.name'),
                  t('admin.tenants.tableSubdomain'),
                  t('admin.tenants.tablePlan'),
                  t('admin.tenants.tableOrgType'),
                  t('common.status'),
                  t('admin.tenants.tableCreatedAt'),
                  t('common.actions'),
                ].map((h) => (
                  <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {data.tenants?.map((tenant) => (
                <tr
                  key={tenant._id}
                  className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/tenants/${tenant._id}`}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {tenant.subdomain || (
                      <span className="italic">{t('admin.tenants.portalOnly')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{tenant.plan}</td>
                  <td className="px-4 py-3 capitalize">{tenant.orgType?.replace('_', ' ')}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {tenant.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => impersonate.mutate(tenant._id)}
                          disabled={impersonate.isPending}
                        >
                          {t('admin.tenants.loginToTenant')}
                        </Button>
                      )}
                      {tenant.status === 'active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => suspend.mutate(tenant._id)}
                        >
                          {t('admin.tenants.suspend')}
                        </Button>
                      )}
                      {(tenant.status === 'active' || tenant.status === 'suspended') && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => archive.mutate(tenant._id)}
                        >
                          {t('admin.tenants.archive')}
                        </Button>
                      )}
                      {tenant.status === 'archived' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => restore.mutate(tenant._id)}
                        >
                          {t('admin.tenants.restore')}
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
