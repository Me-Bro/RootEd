import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api.js';
import { Card, CardContent } from '../../components/ui/Card.jsx';
import { PageHeader } from '../../components/ui/PageHeader.jsx';
import { Button } from '../../components/ui/Button.jsx';

export default function JoinPolicyPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  // Local edits layered over the server's answer rather than copied into state
  // by an effect: syncing them would mean the form silently reverting whenever
  // the query refetched, and a refetch mid-edit discarding what was typed.
  const [edits, setEdits] = useState({});

  const policy = useQuery({
    queryKey: ['join-policy'],
    queryFn: () => api.get('/tenant/join-policy').then((r) => r.data),
  });
  const roles = useQuery({
    queryKey: ['tenant-roles'],
    queryFn: () => api.get('/tenant/roles').then((r) => r.data),
  });

  const saved = policy.data ?? {};
  const mode = edits.mode ?? saved.mode ?? 'closed';
  const requireApproval = edits.requireApproval ?? saved.requireApproval ?? true;
  const defaultRoleIds = edits.defaultRoleIds ?? (saved.defaultRoleIds ?? []).map(String);
  const setMode = (value) => setEdits((e) => ({ ...e, mode: value }));
  const setRequireApproval = (value) => setEdits((e) => ({ ...e, requireApproval: value }));
  const setDefaultRoleIds = (fn) =>
    setEdits((e) => ({
      ...e,
      defaultRoleIds: typeof fn === 'function' ? fn(defaultRoleIds) : fn,
    }));

  const mutation = (fn) => ({
    mutationFn: fn,
    onSuccess: () => {
      setError('');
      // Drop the local overlay so the refetched policy is what shows.
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ['join-policy'] });
    },
    onError: (err) => setError(err.response?.data?.error || err.message),
  });

  const save = useMutation(
    mutation(() => api.put('/tenant/join-policy', { mode, requireApproval, defaultRoleIds }))
  );
  const rotate = useMutation(mutation(() => api.post('/tenant/join-policy/rotate-code')));

  const code = policy.data?.code;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('joinPolicy.title')} description={t('joinPolicy.description')} />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">{t('joinPolicy.mode')}</legend>
            {['closed', 'code'].map((value) => (
              <label key={value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name="join-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-1"
                />
                <span>
                  {t(`joinPolicy.mode_${value}`)}
                  <span className="block text-xs text-muted-foreground">
                    {t(`joinPolicy.modeHint_${value}`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {mode === 'code' && (
            <>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!requireApproval}
                  onChange={(e) => setRequireApproval(!e.target.checked)}
                  className="mt-1"
                />
                <span>
                  {t('joinPolicy.autoApprove')}
                  {/* Auto-approval grants roles with nobody in the loop, so the
                      API refuses to enable it without naming them. */}
                  <span className="block text-xs text-muted-foreground">
                    {t('joinPolicy.autoApproveHint')}
                  </span>
                </span>
              </label>

              {!requireApproval && (
                <div className="flex flex-wrap gap-3">
                  {(roles.data ?? []).map((role) => (
                    <label key={role._id} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={defaultRoleIds.includes(String(role._id))}
                        onChange={() =>
                          setDefaultRoleIds((ids) =>
                            ids.includes(String(role._id))
                              ? ids.filter((id) => id !== String(role._id))
                              : [...ids, String(role._id)]
                          )
                        }
                      />
                      {role.name}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}

          <div>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('auth.saving') : t('common.save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {mode === 'code' && code && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-4">
            <p className="text-sm font-medium">{t('joinPolicy.currentCode')}</p>
            <p className="font-mono text-lg tracking-wider">{code}</p>
            <p className="text-xs text-muted-foreground">{t('joinPolicy.codeHint')}</p>
            <div>
              <Button variant="outline" disabled={rotate.isPending} onClick={() => rotate.mutate()}>
                {t('joinPolicy.rotateCode')}
              </Button>
            </div>
            {/* Rotation is immediate and irreversible: anyone holding the old
                code can no longer use it. */}
            <p className="text-xs text-muted-foreground">{t('joinPolicy.rotateHint')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
