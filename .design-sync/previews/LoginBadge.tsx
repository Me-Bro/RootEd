import { LoginBadge } from 'rooted';

export function States() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <LoginBadge state="none" />
      <LoginBadge state="pending" />
      <LoginBadge state="active" />
      <LoginBadge state="suspended" />
    </div>
  );
}
