import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../ui/Card.jsx';
import { LanguageSwitcherTrigger } from '../ui/LanguageSwitcher.jsx';

/**
 * The chrome every full-page auth screen shares: centred card, brand mark and
 * the language switcher. Registration, verification, password reset and invite
 * acceptance all sit inside it, so the layout is defined once rather than
 * copied five times.
 */
export default function AuthShell({ title, description, children }) {
  return (
    <div
      role="main"
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10"
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
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
