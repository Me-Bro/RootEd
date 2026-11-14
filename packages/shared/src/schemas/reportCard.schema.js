import { z } from 'zod';
import { REPORT_CARD_PRESETS } from '../constants/index.js';

// Branding and layout for a school's report cards, stored at
// Tenant.settings.reportCard. Every key is optional so a save can send one field;
// logoKey is deliberately absent — only the logo upload route may set it.
// Text is drawn by pdfkit as plain strings, never interpreted as HTML.
export const reportCardSettingsSchema = z
  .object({
    preset: z.enum(REPORT_CARD_PRESETS).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Use a six-digit hex color like #1A5C1A')
      .optional(),
    schoolName: z.string().trim().max(80).optional(),
    subtitle: z.string().trim().max(120).optional(),
    footerText: z.string().trim().max(200).optional(),
    signatories: z.array(z.string().trim().min(1).max(40)).min(1).max(3).optional(),
    gradingLegend: z.string().trim().max(160).optional(),
    showRank: z.boolean().optional(),
    showAttendance: z.boolean().optional(),
  })
  .strict();

// One sample card for the settings page. `config` is an unsaved draft laid over
// the saved settings; `sectionId` borrows a real student's name and admission
// number (grades are always sample data).
export const reportCardPreviewSchema = z
  .object({
    sectionId: z
      .string()
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id')
      .optional(),
    config: reportCardSettingsSchema.optional(),
  })
  .strict();
