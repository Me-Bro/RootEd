import { z } from 'zod';
import { ORG_TYPES } from '../constants/index.js';

// Self-serve creation takes no subdomain: tenant hostnames need a manual DNS
// route in the deployment that actually runs, so an API-allocated one would
// resolve to nothing. See ADR 005 §12.1.
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  orgType: z.enum(ORG_TYPES),
  locale: z.string().trim().max(10).optional(),
  timezone: z.string().trim().max(60).optional(),
  currency: z.string().trim().length(3).optional(),
});

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  subdomain: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .min(2)
      .max(50)
      .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only')
      .optional()
  ),
  plan: z.enum(['starter', 'growth', 'pro', 'enterprise']).default('starter'),
  adminEmail: z.string().email(),
  locale: z.string().default('en'),
  timezone: z.string().default('Asia/Kolkata'),
  currency: z.string().length(3).default('INR'),
});
