import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { buildImpersonateUrl } from '../../lib/impersonation.js';
import { Badge } from '../../components/ui/Badge.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Card, CardContent } from '../../components/ui/Card.jsx';

const PLAN_OPTIONS = ['starter', 'growth', 'pro', 'enterprise'];
const DISCOUNT_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'annual_prepay', label: 'Annual prepay (15%)' },
  { value: 'nonprofit', label: 'Nonprofit (30%)' },
  { value: 'government', label: 'Government (30%)' },
];

function statusVariant(status) {
  if (status === 'active') return 'success';
  if (status === 'suspended') return 'warning';
  if (status === 'archived') return 'danger';
  return 'default';
}

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value ?? '—'}</span>
    </div>
  );
}

function OverviewTab({ tenant }) {
  return (
    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
      <InfoRow label="Name" value={tenant.name} />
      <InfoRow label="Subdomain" value={tenant.subdomain} />
      <InfoRow label="Plan" value={tenant.plan} />
      <InfoRow
        label="Status"
        value={<Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>}
      />
      <InfoRow label="Locale" value={tenant.locale} />
      <InfoRow label="Timezone" value={tenant.timezone} />
      <InfoRow label="Currency" value={tenant.currency} />
      <InfoRow label="Created" value={new Date(tenant.createdAt).toLocaleString()} />
    </div>
  );
}

function MembersTab({ tenantId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-members', tenantId],
    queryFn: () => api.get(`/admin/tenants/${tenantId}/members`).then((r) => r.data),
  });

  if (isLoading) return <p className="text-gray-500 text-sm">Loading members…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left">
          <tr>
            {['Email', 'Name', 'Roles', 'Status'].map((h) => (
              <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data?.members?.map((m) => (
            <tr key={m._id} className="bg-white dark:bg-gray-900">
              <td className="px-4 py-3">{m.userId?.email ?? '—'}</td>
              <td className="px-4 py-3">
                {[m.userId?.firstName, m.userId?.lastName].filter(Boolean).join(' ') || '—'}
              </td>
              <td className="px-4 py-3">{m.roleIds?.map((r) => r.name).join(', ') || '—'}</td>
              <td className="px-4 py-3">
                <Badge variant={m.status === 'active' ? 'success' : 'warning'}>{m.status}</Badge>
              </td>
            </tr>
          ))}
          {!data?.members?.length && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                No members found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab({ tenantId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-audit', tenantId],
    queryFn: () => api.get(`/admin/tenants/${tenantId}/audit`).then((r) => r.data),
  });

  if (isLoading) return <p className="text-gray-500 text-sm">Loading audit log…</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left">
          <tr>
            {['Action', 'Actor', 'Target', 'At'].map((h) => (
              <th key={h} className="px-4 py-3 font-medium text-gray-600 dark:text-gray-300">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {data?.logs?.map((l) => (
            <tr key={l._id} className="bg-white dark:bg-gray-900">
              <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
              <td className="px-4 py-3 text-gray-500">{l.actorId}</td>
              <td className="px-4 py-3 text-gray-500">{l.target?.model ?? '—'}</td>
              <td className="px-4 py-3 text-gray-500">{new Date(l.at).toLocaleString()}</td>
            </tr>
          ))}
          {!data?.logs?.length && (
            <tr>
              <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                No audit entries
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BillingTab({ tenant, tenantId }) {
  const queryClient = useQueryClient();
  const [plan, setPlan] = useState(tenant.plan);
  const [discountType, setDiscountType] = useState(tenant.discountType ?? 'none');
  const [studentCount, setStudentCount] = useState(100);
  const [pricing, setPricing] = useState(null);

  const discountMutation = useMutation({
    mutationFn: () =>
      api
        .patch(`/admin/tenants/${tenantId}/discount`, {
          discountType,
          studentCount: Number(studentCount),
        })
        .then((r) => r.data),
    onSuccess: (data) => {
      setPricing(data.pricing);
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: () => api.post('/billing/subscribe', { tenantId, plan }).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant', tenantId] });
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Current plan
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {PLAN_OPTIONS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => subscribeMutation.mutate()} disabled={subscribeMutation.isPending}>
            {subscribeMutation.isPending ? 'Subscribing…' : 'Subscribe / Change plan'}
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Current plan on record: <span className="font-medium">{tenant.plan}</span>. Subscribing
          creates a Razorpay subscription; the tenant&apos;s plan updates when the webhook confirms
          activation.
        </p>
        {subscribeMutation.isSuccess && (
          <p className="mt-1 text-sm text-green-600">
            {subscribeMutation.data?.status === 'mock'
              ? 'Subscription created (mock — Razorpay not configured)'
              : 'Subscription created'}
          </p>
        )}
        {subscribeMutation.isError && (
          <p className="mt-1 text-sm text-red-500">Failed to create subscription</p>
        )}
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
          Discount &amp; pricing
        </h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Discount type
            </label>
            <select
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            >
              {DISCOUNT_OPTIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Student count
            </label>
            <input
              type="number"
              min={1}
              value={studentCount}
              onChange={(e) => setStudentCount(e.target.value)}
              className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => discountMutation.mutate()}
            disabled={discountMutation.isPending}
          >
            {discountMutation.isPending ? 'Saving…' : 'Save & calculate'}
          </Button>
        </div>

        {discountMutation.isError && (
          <p className="mt-1 text-sm text-red-500">Failed to update discount</p>
        )}

        {tenant.discountType && tenant.discountType !== 'none' && (
          <p className="mt-2 text-xs text-gray-400">
            Discount on record: <span className="font-medium">{tenant.discountType}</span> (
            {tenant.discountPct}%)
          </p>
        )}

        {pricing && (
          <div className="mt-4 grid grid-cols-3 gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700 sm:w-fit sm:grid-cols-3">
            <InfoRow label="Base amount" value={`₹${pricing.baseAmount.toLocaleString('en-IN')}`} />
            <InfoRow label="Discount" value={`${pricing.discountPct}%`} />
            <InfoRow
              label="Final amount"
              value={`₹${pricing.finalAmount.toLocaleString('en-IN')}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Overview', 'Members', 'Billing', 'Audit Log'];

export default function TenantDetailPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('Overview');

  const {
    data: tenant,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['tenant', id],
    queryFn: () => api.get(`/admin/tenants/${id}`).then((r) => r.data),
  });

  function useAction(action) {
    return useMutation({
      mutationFn: () => api.patch(`/admin/tenants/${id}/${action}`).then((r) => r.data),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['tenant', id] });
        queryClient.invalidateQueries({ queryKey: ['tenants'] });
      },
    });
  }

  const suspend = useAction('suspend');
  const archive = useAction('archive');
  const restore = useAction('restore');

  const impersonate = useMutation({
    mutationFn: () => api.post(`/admin/tenants/${id}/impersonate`).then((r) => r.data),
    onSuccess: ({ accessToken, subdomain }) => {
      window.location.href = buildImpersonateUrl(subdomain, accessToken);
    },
  });

  if (isLoading) return <p className="text-gray-500">Loading…</p>;
  if (error) return <p className="text-red-500">Failed to load tenant</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{tenant.name}</h1>
          <Badge variant={statusVariant(tenant.status)}>{tenant.status}</Badge>
        </div>
        <div className="flex gap-2">
          {tenant.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => impersonate.mutate()}
              disabled={impersonate.isPending}
            >
              {impersonate.isPending ? 'Signing in…' : 'Login as tenant admin'}
            </Button>
          )}
          {tenant.status === 'active' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => suspend.mutate()}
              disabled={suspend.isPending}
            >
              Suspend
            </Button>
          )}
          {(tenant.status === 'active' || tenant.status === 'suspended') && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => archive.mutate()}
              disabled={archive.isPending}
            >
              Archive
            </Button>
          )}
          {tenant.status === 'archived' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => restore.mutate()}
              disabled={restore.isPending}
            >
              Restore
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={[
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          {activeTab === 'Overview' && <OverviewTab tenant={tenant} />}
          {activeTab === 'Members' && <MembersTab tenantId={id} />}
          {activeTab === 'Billing' && <BillingTab tenant={tenant} tenantId={id} />}
          {activeTab === 'Audit Log' && <AuditTab tenantId={id} />}
        </CardContent>
      </Card>
    </div>
  );
}
