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

// Who the organization is, for its members: stored at Tenant.profile. Every key
// is optional so a save can send one field, and '' clears a key. `logoKey` is
// deliberately absent (only the logo upload route sets it) and so is `orgCode`.
// Text is shown through React, never interpreted as HTML.
const profileText = (max) => z.string().trim().max(max);
const optionalProfileValue = (schema) => z.union([z.literal(''), schema]);

export const tenantProfileSchema = z
  .object({
    description: profileText(1000).optional(),
    address: z
      .object({
        line1: profileText(200).optional(),
        line2: profileText(200).optional(),
        city: profileText(120).optional(),
        state: profileText(120).optional(),
        // Lenient on purpose: organizations may be outside India.
        pincode: profileText(12).optional(),
        country: profileText(120).optional(),
      })
      .strict()
      .optional(),
    phone: profileText(20).optional(),
    email: optionalProfileValue(z.string().trim().email().max(120)).optional(),
    website: optionalProfileValue(
      z
        .string()
        .trim()
        .max(200)
        .url()
        .refine((v) => /^https?:\/\//i.test(v), 'Use an http or https address')
    ).optional(),
    registrationNumber: profileText(60).optional(),
  })
  .strict();

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
