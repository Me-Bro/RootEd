import { hasSeats } from '@rooted/shared/utils';

// Defaults for a centre that has not saved any settings. Study centers start
// owner-only for discounts; every other org type keeps today's rule (anyone with
// fees:write may apply one), so schools see no change.
export function resolveCentreSettings(tenant) {
  const saved = tenant?.settings?.centre ?? {};
  return {
    openTime: saved.openTime ?? '06:00',
    closeTime: saved.closeTime ?? '22:00',
    open24h: saved.open24h ?? false,
    discountPolicy: saved.discountPolicy ?? (hasSeats(tenant?.orgType) ? 'owner' : 'staff'),
  };
}
