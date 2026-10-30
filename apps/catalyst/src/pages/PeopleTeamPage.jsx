import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import api from '@/lib/api.js';
import { useAuth } from '@/contexts/useAuth.js';
import { currentCollege, hasPermission } from '@/lib/access.js';
import { pushToast } from '@/lib/toast.js';
import { BADGE_VARIANT, memberLoginState, memberName } from '@/lib/people.js';
import { ConfirmAction } from '@/components/ConfirmAction.jsx';
import { PageHeader } from '@/components/ui/PageHeader.jsx';
import { Button } from '@/components/ui/Button.jsx';
import { Badge } from '@/components/ui/Badge.jsx';
import { Input, Select } from '@/components/ui/Input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card.jsx';
import { EmptyState, ErrorNote, ListSkeleton } from '@/components/ui/Feedback.jsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table.jsx';

const refresh = (qc) => qc.invalidateQueries({ queryKey: ['people-team'] });

/** The roles a person can be given here. Students sign in through their roster entry, not this page. */
function useAssignableRoles() {
  const query = useQuery({
    queryKey: ['people-roles'],
    queryFn: () => api.get('/tenant/roles').then((r) => r.data),
  });
  return (query.data ?? []).filter((r) => r.templateKey !== 'student');
}

function AddPerson({ roles, onDone }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', roleId: '' });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const roleId = form.roleId || roles[0]?._id || '';

  const add = useMutation({
    mutationFn: () =>
      api.post('/tenant/members', {
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        roleIds: [roleId],
      }),
    onSuccess: () => {
      refresh(qc);
      onDone();
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('people.team.add.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('people.team.add.hint')}</p>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label={t('people.team.add.title')}
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            label={t('people.team.add.firstName')}
            value={form.firstName}
            onChange={set('firstName')}
            required
          />
          <Input
            label={t('people.team.add.lastName')}
            value={form.lastName}
            onChange={set('lastName')}
            required
          />
          <Input
            type="email"
            label={t('people.team.add.email')}
            value={form.email}
            onChange={set('email')}
            required
          />
          <Select label={t('people.team.add.role')} value={roleId} onChange={set('roleId')}>
            {roles.map((r) => (
              <option key={r._id} value={r._id}>
                {r.name}
              </option>
            ))}
          </Select>
          <div>
            <Button type="submit" disabled={add.isPending || !roleId}>
              {t('people.team.add.submit')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function MemberRow({ member, roles, canWrite, isSelf }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const name = memberName(member);
  const state = memberLoginState(member);
  const ownRoles = member.roleIds ?? [];
  // One role is editable here; someone holding several is managed in the main app.
  const editable = canWrite && !isSelf && ownRoles.length === 1;
  const current = String(ownRoles[0]?._id ?? '');
  const [picked, setPicked] = useState('');
  const roleId = picked || current;

  const changeRole = useMutation({
    mutationFn: () => api.patch(`/tenant/members/${member._id}/roles`, { roleIds: [roleId] }),
    onSuccess: () => {
      setPicked('');
      refresh(qc);
    },
  });
  const setStatus = useMutation({
    mutationFn: (status) => api.patch(`/tenant/members/${member._id}/status`, { status }),
    onSuccess: () => refresh(qc),
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/tenant/members/${member._id}`),
    onSuccess: () => refresh(qc),
  });
  const resend = useMutation({
    mutationFn: () => api.post(`/tenant/members/${member._id}/resend-claim`),
    meta: { silent: true },
    onSuccess: () => pushToast(t('people.linkSent')),
    onError: (err) => pushToast(err.response?.data?.error || t('common.error'), 'error'),
  });

  return (
    <TableRow data-testid={`person-row-${member.userId?.email}`}>
      <TableCell>
        <div className="font-medium">
          {name}
          {isSelf && (
            <Badge variant="info" className="ml-2">
              {t('people.team.you')}
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">{member.userId?.email}</div>
      </TableCell>
      <TableCell>
        {editable ? (
          <div className="flex items-end gap-2">
            <Select
              label={t('people.team.roleFor', { name })}
              value={roleId}
              onChange={(e) => setPicked(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r._id} value={r._id}>
                  {r.name}
                </option>
              ))}
            </Select>
            <Button
              size="sm"
              variant="outline"
              aria-label={t('people.team.saveRoleFor', { name })}
              disabled={!picked || picked === current || changeRole.isPending}
              onClick={() => changeRole.mutate()}
            >
              {t('common.save')}
            </Button>
          </div>
        ) : (
          ownRoles.map((r) => r.name).join(', ')
        )}
      </TableCell>
      <TableCell>
        <Badge variant={BADGE_VARIANT[state]} data-testid="login-state">
          {t(`people.state.${state}`)}
        </Badge>
      </TableCell>
      {canWrite && (
        <TableCell>
          {!isSelf && (
            <div className="flex flex-wrap gap-1">
              {state === 'pending' && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('people.students.resendFor', { name })}
                  disabled={resend.isPending}
                  onClick={() => resend.mutate()}
                >
                  {t('people.students.resend')}
                </Button>
              )}
              {state === 'suspended' ? (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label={t('people.students.reactivateFor', { name })}
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate('active')}
                >
                  {t('people.students.reactivate')}
                </Button>
              ) : (
                <ConfirmAction
                  label={t('people.students.suspend')}
                  confirmLabel={t('people.students.confirmSuspend')}
                  ariaLabel={t('people.students.suspendFor', { name })}
                  confirmAriaLabel={t('people.students.confirmSuspendFor', { name })}
                  pending={setStatus.isPending}
                  onConfirm={() => setStatus.mutate('suspended')}
                />
              )}
              <ConfirmAction
                label={t('people.team.remove')}
                confirmLabel={t('people.team.confirmRemove')}
                ariaLabel={t('people.team.removeFor', { name })}
                confirmAriaLabel={t('people.team.confirmRemoveFor', { name })}
                pending={remove.isPending}
                onConfirm={() => remove.mutate()}
              />
            </div>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

/** People who asked to join (with a code, from the main app) and wait for a decision. */
function JoinRequests({ roles }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ['people-team', 'join-requests'],
    queryFn: () => api.get('/tenant/join-requests').then((r) => r.data),
  });
  const [picked, setPicked] = useState({});

  const approve = useMutation({
    mutationFn: ({ id, roleId }) =>
      api.post(`/tenant/join-requests/${id}/approve`, { roleIds: [roleId] }),
    onSuccess: () => refresh(qc),
  });
  const reject = useMutation({
    mutationFn: (id) => api.post(`/tenant/join-requests/${id}/reject`),
    onSuccess: () => refresh(qc),
  });

  const rows = requests.data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card data-testid="join-requests">
      <CardHeader>
        <CardTitle>{t('people.requests.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((r) => {
          const name = memberName(r);
          const roleId = picked[r._id] || roles[0]?._id || '';
          return (
            <div key={r._id} className="flex flex-wrap items-end gap-3">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{name}</div>
                <div className="text-xs text-muted-foreground">{r.userId?.email}</div>
                {r.requestNote && <div className="text-xs">{r.requestNote}</div>}
              </div>
              <Select
                label={t('people.requests.roleFor', { name })}
                value={roleId}
                onChange={(e) => setPicked((p) => ({ ...p, [r._id]: e.target.value }))}
              >
                {roles.map((role) => (
                  <option key={role._id} value={role._id}>
                    {role.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                aria-label={t('people.requests.approveFor', { name })}
                disabled={!roleId || approve.isPending}
                onClick={() => approve.mutate({ id: r._id, roleId })}
              >
                {t('people.requests.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                aria-label={t('people.requests.rejectFor', { name })}
                disabled={reject.isPending}
                onClick={() => reject.mutate(r._id)}
              >
                {t('people.requests.reject')}
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function PeopleTeamPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = hasPermission(user, 'roles:write');
  const roles = useAssignableRoles();
  const [adding, setAdding] = useState(false);

  const list = useQuery({
    queryKey: ['people-team'],
    queryFn: () =>
      api.get('/tenant/members', { params: { audience: 'staff', limit: 100 } }).then((r) => r.data),
  });
  const members = (list.data?.members ?? []).filter((m) =>
    ['active', 'suspended'].includes(m.status)
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('people.team.title')}
        description={t('people.team.description', { college: currentCollege(user)?.name ?? '' })}
        action={
          canWrite && (
            <Button onClick={() => setAdding((v) => !v)}>
              <UserPlus className="size-4" aria-hidden="true" />
              {t('people.team.add.open')}
            </Button>
          )
        }
      />

      {adding && <AddPerson roles={roles} onDone={() => setAdding(false)} />}
      {canWrite && <JoinRequests roles={roles} />}

      {list.isLoading && <ListSkeleton />}
      {list.error && <ErrorNote error={list.error} onRetry={() => list.refetch()} />}
      {list.data && members.length === 0 && <EmptyState title={t('people.team.empty')} />}
      {members.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('people.team.person')}</TableHead>
                  <TableHead>{t('people.team.role')}</TableHead>
                  <TableHead>{t('people.team.status')}</TableHead>
                  {canWrite && <TableHead>{t('people.students.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <MemberRow
                    key={m._id}
                    member={m}
                    roles={roles}
                    canWrite={canWrite}
                    isSelf={String(m.userId?._id) === String(user?._id)}
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
