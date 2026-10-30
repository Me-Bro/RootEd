import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/useAuth.js';
import { homeRoute } from '@/lib/access.js';
import { Button } from '@/components/ui/Button.jsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card.jsx';

export default function SelectCollegePage() {
  const { t } = useTranslation();
  const { user, selectTenant, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingId, setPendingId] = useState(null);
  const [error, setError] = useState('');
  const orgs = user?.orgs ?? [];

  if (orgs.length === 0) return <Navigate to="/no-access" replace />;

  async function choose(tenantId) {
    setError('');
    setPendingId(tenantId);
    try {
      const me = await selectTenant(tenantId);
      navigate(homeRoute(me).path, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || t('auth.couldNotActivate'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <h1 className="text-xl font-semibold tracking-tight">{t('portal.brand')}</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('auth.chooseCollege')}</CardTitle>
          <CardDescription>{t('auth.chooseCollegeDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {orgs.map((org) => (
            <Button
              key={org._id}
              variant="outline"
              size="lg"
              className="w-full justify-start"
              disabled={pendingId !== null}
              onClick={() => choose(org._id)}
            >
              {pendingId === org._id ? t('auth.entering') : org.name}
            </Button>
          ))}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      <Button variant="ghost" onClick={logout}>
        {t('auth.logout')}
      </Button>
    </div>
  );
}
