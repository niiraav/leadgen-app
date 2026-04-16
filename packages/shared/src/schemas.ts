import { z } from 'zod';
import type { LeadStatus, LeadSource, EmailTone } from './types';

export const leadStatusSchema = z.enum([
  'new', 'contacted', 'replied', 'interested', 'closed', 'not_interested', 'archived'
]) satisfies z.ZodSchema<LeadStatus>;

export const leadSourceSchema = z.enum(['outscraper', 'csv', 'apollo', 'manual']) satisfies z.ZodSchema<LeadSource>;
export const emailToneSchema = z.enum(['professional', 'friendly', 'direct']) satisfies z.ZodSchema<EmailTone>;

export const searchParamsSchema = z.object({
  businessType: z.string().min(1, 'Business type is required'),
  location: z.string().min(1, 'Location is required'),
  maxResults: z.coerce.number().min(1).max(50).default(25),
  noWebsiteOnly: z.coerce.boolean().default(false),
});

export const leadCreateSchema = z.object({
  business_name: z.string().min(1, 'Business name is required'),
  contact_name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  website_url: z.string().url().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().default('GB'),
  category: z.string().optional(),
  industry: z.string().optional(),
  rating: z.coerce.number().min(0).max(5).optional(),
  review_count: z.coerce.number().int().min(0).optional(),
  source: leadSourceSchema.default('outscraper'),
  notes: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: leadStatusSchema.optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const aiEmailSchema = z.object({
  tone: emailToneSchema.default('professional'),
});

export const statusChangeSchema = z.object({
  status: leadStatusSchema,
});

export const csvImportSchema = z.object({
  mappings: z.array(z.object({
    csvColumn: z.string(),
    leadField: z.string(),
  })),
  leads: z.array(z.record(z.string(), z.unknown())),
});

export const sequenceStepSchema = z.object({
  id: z.string(),
  subject_template: z.string().min(1, 'Subject is required'),
  body_template: z.string().min(1, 'Body is required'),
  delay_days: z.coerce.number().int().min(1).max(30),
});

export const sequenceCreateSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  steps: z.array(sequenceStepSchema).min(1, 'At least one step is required'),
});

export const sequenceEnrollSchema = z.object({
  lead_ids: z.array(z.string()).min(1, 'At least one lead is required'),
});

// Re-export inferred types
export type SearchParamsInput = z.infer<typeof searchParamsSchema>;
export type LeadCreate = z.infer<typeof leadCreateSchema>;
export type LeadUpdate = z.infer<typeof leadUpdateSchema>;
export type AIEmailRequest = z.infer<typeof aiEmailSchema>;
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type CSVImport = z.infer<typeof csvImportSchema>;
export type SequenceCreate = z.infer<typeof sequenceCreateSchema>;
export type SequenceEnroll = z.infer<typeof sequenceEnrollSchema>;
