import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card.jsx';
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher.jsx';

/** The centred brand + card the sign-in style pages share. */
export function AuthCard({ title, description, children }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <div className="text-center">
        <img src="/favicon.svg" alt="" width="44" height="44" className="mx-auto mb-3" />
        <h1 className="text-2xl font-semibold tracking-tight">{t('portal.brand')}</h1>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle as="h2">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
