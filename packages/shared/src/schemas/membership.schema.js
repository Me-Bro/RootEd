import { z } from 'zod';

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
