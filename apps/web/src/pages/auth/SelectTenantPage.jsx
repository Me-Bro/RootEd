import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/useAuth.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '../../components/ui/Card.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { LanguageSwitcherTrigger } from '../../components/ui/LanguageSwitcher.jsx';

export default function SelectTenantPage() {
  const { t } = useTranslation();
  const { tenants, selectTenant } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState(null);

  if (!tenants || tenants.length === 0) {
    return <Navigate to="/login" replace />;
  }

  async function handleSelect(tenantId) {
    setError('');
    setPendingId(tenantId);
    try {
      await selectTenant(tenantId);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('auth.couldNotActivateTenant'));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div
      role="main"
      className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden"
    >
      <div className="absolute right-4 top-4 z-20">
        <LanguageSwitcherTrigger />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-6">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="RootEd logo" width={36} height={34} />
          <h1 className="text-xl font-semibold tracking-tight text-foreground">RootEd</h1>
        </div>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('auth.chooseOrganization')}</CardTitle>
            <CardDescription>{t('auth.chooseOrganizationDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {tenants.map((tenant) => (
                <Button
                  key={tenant._id}
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={pendingId !== null}
                  onClick={() => handleSelect(tenant._id)}
                  className="w-full justify-start"
                >
                  {pendingId === tenant._id ? t('auth.entering') : tenant.name}
                </Button>
              ))}
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
