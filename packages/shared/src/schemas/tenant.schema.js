import { z } from 'zod';

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  subdomain: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']).default('starter'),
  adminEmail: z.string().email(),
  locale: z.string().default('en'),
  timezone: z.string().default('Asia/Kolkata'),
  currency: z.string().length(3).default('INR'),
});
