import { z } from 'zod';
import { JOIN_POLICY_MODES } from '../constants/index.js';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

export const createInviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleIds: z.array(objectId).min(1, 'Pick at least one role'),
});

// The token travels in the body, not the path: RequestLog persists request
// paths, so a token in the URL would be written to the database (and to any
// proxy log in front of it).
export const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

export const updateMemberRolesSchema = z.object({
  roleIds: z.array(objectId).min(1, 'A member needs at least one role'),
});

// A login for one roster student.
export const studentAccountSchema = z
  .object({ email: z.string().trim().toLowerCase().email() })
  .strict();

// A staff member added straight away, with a login they claim by email.
export const addMemberSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    roleIds: z.array(objectId).min(1, 'Pick at least one role'),
  })
  .strict();

// 'active' | 'suspended' only: the other membership states belong to the join flows.
export const updateMemberStatusSchema = z
  .object({ status: z.enum(['active', 'suspended']) })
  .strict();

export const submitJoinRequestSchema = z.object({
  joinCode: z.string().trim().min(4),
  note: z.string().trim().max(500).optional(),
});

export const approveJoinRequestSchema = z.object({
  roleIds: z.array(objectId).min(1, 'Pick at least one role'),
});

export const updateJoinPolicySchema = z.object({
  mode: z.enum(JOIN_POLICY_MODES),
  requireApproval: z.boolean().optional(),
  defaultRoleIds: z.array(objectId).optional(),
  codeExpiresAt: z.coerce.date().nullish(),
});
