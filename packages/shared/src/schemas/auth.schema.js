import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '../constants/index.js';

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH);

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN, 'Use letters, digits, dot, dash or underscore; start and end with one')
  .refine((v) => !RESERVED_USERNAMES.includes(v), 'That username is reserved');

// The login identifier is either an email or a username. '@' is what tells them
// apart — usernames cannot contain it (see USERNAME_PATTERN) — so the endpoint
// never has to guess or probe both collections.
export const loginIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (v) => (v.includes('@') ? z.string().email().safeParse(v).success : true),
    'Enter a valid email address or username'
  );

export const loginSchema = z.object({
  identifier: loginIdentifierSchema,
  password: passwordSchema,
  totpCode: z.string().optional(),
});

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: usernameSchema,
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone: z.string().trim().max(30).optional(),
    username: usernameSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const changeEmailSchema = z.object({
  newEmail: z.string().trim().toLowerCase().email(),
  currentPassword: passwordSchema,
});

export const confirmEmailChangeSchema = z.object({
  token: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: passwordSchema,
  newPassword: passwordSchema,
});
