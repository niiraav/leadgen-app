import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ─── Leads ───────────────────────────────────────────────────────────────────

export const leads = sqliteTable('leads', {
  id: text('id').primaryKey(),
  businessName: text('business_name').notNull(),
  email: text('email'),
  phone: text('phone'),
  websiteUrl: text('website_url'),
  address: text('address'),
  city: text('city'),
  country: text('country'),
  category: text('category'),
  rating: real('rating'),
  reviewCount: integer('review_count').default(0),
  hotScore: real('hot_score').default(0),
  readinessFlags: text('readiness_flags').default('[]'),
  status: text('status').default('new'),
  source: text('source').default('manual'),
  notes: text('notes'),
  tags: text('tags').default('[]'),
  metadata: text('metadata').default('{}'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
  lastContacted: text('last_contacted'),
});

// ─── Lead Activities ─────────────────────────────────────────────────────────

export const leadActivities = sqliteTable('lead_activities', {
  id: text('id').primaryKey(),
  leadId: text('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  description: text('description'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ─── Sequences ───────────────────────────────────────────────────────────────

export const sequences = sqliteTable('sequences', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ─── Sequence Steps ──────────────────────────────────────────────────────────

export const sequenceSteps = sqliteTable('sequence_steps', {
  id: text('id').primaryKey(),
  sequenceId: text('sequence_id')
    .notNull()
    .references(() => sequences.id, { onDelete: 'cascade' }),
  subjectTemplate: text('subject_template').notNull(),
  bodyTemplate: text('body_template').notNull(),
  delayDays: integer('delay_days').default(0),
  stepOrder: integer('step_order').notNull(),
});

// ─── Type Exports ────────────────────────────────────────────────────────────

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type LeadActivity = typeof leadActivities.$inferSelect;
export type NewLeadActivity = typeof leadActivities.$inferInsert;
export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;
export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type NewSequenceStep = typeof sequenceSteps.$inferInsert;

// ─── RawLead from SerpAPI ────────────────────────────────────────────────────

export type RawLead = {
  business_name: string;
  email?: string;
  phone?: string;
  website_url?: string;
  address?: string;
  city?: string;
  country?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  source: 'serpapi' | 'manual';
};
