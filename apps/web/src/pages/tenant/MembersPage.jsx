import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { useAuth } from '../../contexts/useAuth.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';

const TABS = ['members', 'invites', 'requests'];

function displayName(user) {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return name || user?.email || '—';
}

function RoleChecklist({ roles, selected, onToggle, idPrefix }) {
  return (
    <div className="flex flex-wrap gap-3">
      {roles.map((role) => (
        <label key={role._id} className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            id={`${idPrefix}-${role._id}`}
            checked={selected.includes(role._id)}
            onChange={() => onToggle(role._id)}
          />
          {role.name}
        </label>
      ))}
    </div>
  );
}

export default function MembersPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('members');
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoles, setInviteRoles] = useState([]);
  const [editing, setEditing] = useState(null);

  const canWrite = (user?.permissions ?? []).includes('roles:write');

  const roles = useQuery({
    queryKey: ['tenant-roles'],
    queryFn: () => api.get('/tenant/roles').then((r) => r.data),
  });
  const members = useQuery({
    queryKey: ['tenant-members'],
    queryFn: () => api.get('/tenant/members', { params: { limit: 100 } }).then((r) => r.data),
  });
  const invites = useQuery({
    queryKey: ['tenant-invites'],
    queryFn: () => api.get('/tenant/invites').then((r) => r.data),
    enabled: canWrite,
  });
  const requests = useQuery({
    queryKey: ['tenant-join-requests'],
    queryFn: () => api.get('/tenant/join-requests').then((r) => r.data),
    enabled: canWrite,
  });

  /** Everything here changes who can do what, so refetch all three lists. */
  function invalidate() {
    ['tenant-members', 'tenant-invites', 'tenant-join-requests'].forEach((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    );
  }

  const run = (fn) => ({
    mutationFn: fn,
    onSuccess: () => {
      setError('');
      invalidate();
    },
    onError: (err) => setError(err.response?.data?.error || err.message),
  });

  const invite = useMutation(
    run(() => api.post('/tenant/invites', { email: inviteEmail, roleIds: inviteRoles }))
  );
  const revoke = useMutation(run((id) => api.delete(`/tenant/invites/${id}`)));
  const setRoles = useMutation(
    run(({ id, roleIds }) => api.patch(`/tenant/members/${id}/roles`, { roleIds }))
  );
  const remove = useMutation(run((id) => api.delete(`/tenant/members/${id}`)));
  const approve = useMutation(
    run(({ id, roleIds }) => api.post(`/tenant/join-requests/${id}/approve`, { roleIds }))
  );
  const reject = useMutation(run((id) => api.post(`/tenant/join-requests/${id}/reject`)));

  const roleList = roles.data ?? [];
  const pendingCount = (requests.data ?? []).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('members.title')} description={t('members.description')} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-1 border-b border-border">
        {TABS.map((key) => {
          if (key !== 'members' && !canWrite) return null;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                tab === key
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`members.tab.${key}`)}
              {key === 'requests' && pendingCount > 0 && ` (${pendingCount})`}
            </button>
          );
        })}
      </div>

      {tab === 'members' && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            {members.isLoading && (
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            )}
            {(members.data?.members ?? []).map((m) => (
              <div
                key={m._id}
                className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(m.userId)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.userId?.email} · {m.status} ·{' '}
                    {(m.roleIds ?? []).map((r) => r.name).join(', ') || t('members.noRoles')}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setEditing(
                          editing?.id === m._id
                            ? null
                            : { id: m._id, roleIds: (m.roleIds ?? []).map((r) => r._id) }
                        )
                      }
                    >
                      {t('members.changeRoles')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(m._id)}
                    >
                      {t('members.remove')}
                    </Button>
                  </div>
                )}
                {editing?.id === m._id && (
                  <div className="flex w-full flex-col gap-2 sm:w-auto">
                    <RoleChecklist
                      roles={roleList}
                      selected={editing.roleIds}
                      idPrefix={`member-${m._id}`}
                      onToggle={(roleId) =>
                        setEditing((e) => ({
                          ...e,
                          roleIds: e.roleIds.includes(roleId)
                            ? e.roleIds.filter((r) => r !== roleId)
                            : [...e.roleIds, roleId],
                        }))
                      }
                    />
                    <Button
                      size="sm"
                      disabled={setRoles.isPending || editing.roleIds.length === 0}
                      onClick={() =>
                        setRoles.mutate(
                          { id: m._id, roleIds: editing.roleIds },
                          { onSuccess: () => setEditing(null) }
                        )
                      }
                    >
                      {t('common.save')}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {tab === 'invites' && canWrite && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              <Input
                label={t('members.inviteEmail')}
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <RoleChecklist
                roles={roleList}
                selected={inviteRoles}
                idPrefix="invite"
                onToggle={(roleId) =>
                  setInviteRoles((r) =>
                    r.includes(roleId) ? r.filter((x) => x !== roleId) : [...r, roleId]
                  )
                }
              />
              <div>
                <Button
                  disabled={invite.isPending || !inviteEmail || inviteRoles.length === 0}
                  onClick={() =>
                    invite.mutate(undefined, {
                      onSuccess: () => {
                        setInviteEmail('');
                        setInviteRoles([]);
                      },
                    })
                  }
                >
                  {invite.isPending ? t('auth.sending') : t('members.sendInvite')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-3 pt-4">
              {(invites.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{t('members.noInvites')}</p>
              )}
              {(invites.data ?? []).map((i) => (
                <div
                  key={i._id}
                  className="flex items-center justify-between gap-2 border-b border-border pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm">{i.email}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {(i.roleIds ?? []).map((r) => r.name).join(', ')}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => revoke.mutate(i._id)}>
                    {t('members.revoke')}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'requests' && canWrite && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            {(requests.data ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">{t('members.noRequests')}</p>
            )}
            {(requests.data ?? []).map((r) => (
              <RequestRow
                key={r._id}
                request={r}
                roles={roleList}
                onApprove={(roleIds) => approve.mutate({ id: r._id, roleIds })}
                onReject={() => reject.mutate(r._id)}
                t={t}
              />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RequestRow({ request, roles, onApprove, onReject, t }) {
  const [selected, setSelected] = useState([]);

  return (
    <div className="flex flex-col gap-2 border-b border-border pb-3 last:border-0">
      <div>
        <p className="text-sm font-medium">{displayName(request.userId)}</p>
        <p className="text-xs text-muted-foreground">{request.userId?.email}</p>
        {request.requestNote && <p className="mt-1 text-sm">{request.requestNote}</p>}
      </div>
      <RoleChecklist
        roles={roles}
        selected={selected}
        idPrefix={`request-${request._id}`}
        onToggle={(roleId) =>
          setSelected((s) => (s.includes(roleId) ? s.filter((x) => x !== roleId) : [...s, roleId]))
        }
      />
      <div className="flex gap-2">
        {/* Approval assigns roles explicitly — a request arrives holding none,
            so there is nothing sensible to default to. */}
        <Button size="sm" disabled={selected.length === 0} onClick={() => onApprove(selected)}>
          {t('members.approve')}
        </Button>
        <Button variant="outline" size="sm" onClick={onReject}>
          {t('members.reject')}
        </Button>
      </div>
    </div>
  );
}
