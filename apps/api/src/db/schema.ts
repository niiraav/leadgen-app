// ─── Type Exports for compatibility ───────────────────────────────────────────

import {
  pgTable,
  uuid,
  text,
  real,
  integer,
  boolean,
  timestamp,
  numeric,
  jsonb,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ─── Leads Table ──────────────────────────────────────────────────────────────

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
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
  readinessFlags: jsonb('readiness_flags').$type<string[]>().default([]),
  status: text('status').default('new'),
  source: text('source').default('manual'),
  notes: text('notes'),
  tags: jsonb('tags').$type<string[]>().default([]),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  lastContacted: timestamp('last_contacted', { withTimezone: true }),

  // Sprint 8 – new columns
  fullAddress: text('full_address'),
  street: text('street'),
  postalCode: text('postal_code'),
  site: text('site'),
  subtypes: text('subtypes').array(),
  description: text('description'),
  businessStatus: text('business_status'),
  verified: boolean('verified'),
  priceRange: text('price_range'),
  workingHours: jsonb('working_hours').$type<Record<string, unknown>>(),
  photoCount: integer('photo_count'),
  latitude: numeric('latitude', { precision: 10, scale: 7 }),
  longitude: numeric('longitude', { precision: 10, scale: 7 }),
  listId: uuid('list_id'),
  contactFullName: text('contact_full_name'),
  contactTitle: text('contact_title'),
  contactEmail: text('contact_email'),
  contactEmailType: text('contact_email_type'),
  contactPhone: text('contact_phone'),
  contactLinkedin: text('contact_linkedin'),
  companyLinkedin: text('company_linkedin'),
  domain: text('domain'),
  companySize: text('company_size'),
  technologies: text('technologies').array(),
  contactEnrichedAt: timestamp('contact_enriched_at', { withTimezone: true }),
  contactEnrichmentAttemptedAt: timestamp(
    'contact_enrichment_attempted_at',
    { withTimezone: true }
  ),
  contactEnrichmentStatus: text('contact_enrichment_status'),
  contactEnrichmentProvider: text('contact_enrichment_provider').default('outscraper'),
  contactEnrichmentError: text('contact_enrichment_error'),
  emailStatus: text('email_status'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  aiBio: text('ai_bio'),
  aiBioGeneratedAt: timestamp('ai_bio_generated_at', { withTimezone: true }),

  // Sprint 7: Reply tracking token — opaque token for reply-to addresses
  replyToken: text('reply_token').unique(),

  // Sprint 8: Enrichment social links & owner info
  ownerName: text('owner_name'),
  ownerFirstName: text('owner_first_name'),
  ownerNameSource: text('owner_name_source'),
  enrichedAt: timestamp('enriched_at', { withTimezone: true }),
  enrichmentAttemptedAt: timestamp('enrichment_attempted_at', { withTimezone: true }),
  gmbUrl: text('gmb_url'),
  gmbReviewsUrl: text('gmb_reviews_url'),
  linkedinUrl: text('linkedin_url'),
  facebookUrl: text('facebook_url'),
  instagramUrl: text('instagram_url'),
  twitterHandle: text('twitter_handle'),
  contacts: jsonb('contacts'), // cached array of enriched contacts
  companySocials: jsonb('company_socials').$type<Record<string, unknown>>(),
});

export const leadsRelations = relations(leads, ({ one }) => ({
  list: one(leadLists, {
    fields: [leads.listId],
    references: [leadLists.id],
  }),
}));

// ─── Lead Activities ──────────────────────────────────────────────────────────

export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  type: text('type').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Sequences ────────────────────────────────────────────────────────────────

export const sequences = pgTable('sequences', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id'),
  name: text('name').notNull(),
  status: text('status').default('draft'),
  leadsCount: integer('leads_count').default(0),
  sentCount: integer('sent_count').default(0),
  replyCount: integer('reply_count').default(0),
  steps: integer('steps').default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─── Sequence Steps ───────────────────────────────────────────────────────────

export const sequenceSteps = pgTable('sequence_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  sequenceId: uuid('sequence_id')
    .notNull()
    .references(() => sequences.id, { onDelete: 'cascade' }),
  subjectTemplate: text('subject_template').notNull(),
  bodyTemplate: text('body_template').notNull(),
  delayDays: integer('delay_days').default(1),
  stepOrder: integer('step_order').notNull(),
});

// ─── Lead Lists (Sprint 8) ────────────────────────────────────────────────────

export const leadLists = pgTable('lead_lists', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').default('#6366f1'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const leadListsRelations = relations(leadLists, ({ many }) => ({
  leads: many(leads),
}));

// ─── Saved Filters (Sprint 8) ─────────────────────────────────────────────────

export const savedFilters = pgTable('saved_filters', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Search History (Sprint 8) ────────────────────────────────────────────────

export const searchHistory = pgTable('search_history', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  query: text('query').notNull(),
  location: text('location').notNull(),
  limitCount: integer('limit_count').default(25),
  resultCount: integer('result_count'),
  params: jsonb('params').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Usage Tracking (with Sprint 8 enrichment_count) ──────────────────────────

export const usageTracking = pgTable('usage_tracking', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  month: text('month').notNull(), // YYYY-MM format
  searchCount: integer('search_count').default(0),
  creditsUsed: integer('credits_used').default(0),
  enrichmentCount: integer('enrichment_count').default(0),
  messageSendsCount: integer('message_sends_count').default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull(),
  stripeCustomerId: text('stripe_customer_id'),
  planId: text('plan_id').notNull(), // outreach / growth
  status: text('status').notNull(), // active / trialing / past_due / canceled / ended
  trialStartsAt: timestamp('trial_starts_at', { withTimezone: true }),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  leadCreditsUsed: integer('lead_credits_used').default(0),
  leadCreditsLimit: integer('lead_credits_limit').notNull(),
  searchCreditsUsed: integer('search_credits_used').default(0),
  searchCreditsLimit: integer('search_credits_limit').notNull(),
  emailVerificationCreditsUsed: integer('email_verification_credits_used').default(0),
  emailVerificationCreditsLimit: integer('email_verification_credits_limit').notNull(),
  aiEmailCreditsUsed: integer('ai_email_credits_used').default(0),
  aiEmailCreditsLimit: integer('ai_email_credits_limit').notNull(),
  sequenceContactCreditsUsed: integer('sequence_contact_credits_used').default(0),
  sequenceContactCreditsLimit: integer('sequence_contact_credits_limit').default(0),
  creditsResetAt: timestamp('credits_reset_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  user: one(usageTracking, {
    fields: [subscriptions.userId],
    references: [usageTracking.userId],
  }),
}));

// ─── Credit Transactions ──────────────────────────────────────────────────────

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id),
  action: text('action').notNull(), // lead_add / search_run / email_verify / ai_email_generate / sequence_enroll / topup_credits / grace_period_downgrade
  creditType: text('credit_type').notNull(), // leads / searches / email_verifications / ai_emails / sequence_contacts
  amount: integer('amount').notNull(), // positive = consumed, negative = refunded
  balanceAfter: integer('balance_after').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const creditTransactionsRelations = relations(creditTransactions, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [creditTransactions.subscriptionId],
    references: [subscriptions.id],
  }),
}));

// ─── Message Templates ────────────────────────────────────────────────────────

export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  name: text('name').notNull(),
  message: text('message').notNull(),
  isDefault: boolean('is_default').notNull().default(false),
  usageCount: integer('usage_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const messageTemplatesRelations = relations(messageTemplates, ({ one }) => ({
  lead: one(leads, {
    fields: [messageTemplates.userId],
    references: [leads.userId],
  }),
}));

// ─── Message Sends ─────────────────────────────────────────────────────────────

export const messageSends = pgTable('message_sends', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  leadId: uuid('lead_id')
    .notNull()
    .references(() => leads.id, { onDelete: 'cascade' }),
  templateId: uuid('template_id').references(() => messageTemplates.id, {
    onDelete: 'set null',
  }),
  channel: text('channel').notNull(),
  messageText: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const messageSendsRelations = relations(messageSends, ({ one }) => ({
  lead: one(leads, {
    fields: [messageSends.leadId],
    references: [leads.id],
  }),
  template: one(messageTemplates, {
    fields: [messageSends.templateId],
    references: [messageTemplates.id],
  }),
}));

// ─── Notifications (Sprint 7) ──────────────────────────────────────────────

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  type: text('type').notNull(),           // reply_received | reply_classified | lead_moved
  title: text('title').notNull(),
  body: text('body'),
  leadId: uuid('lead_id'),
  read: boolean('read').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ─── Type Exports ─────────────────────────────────────────────────────────────

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;

export type LeadActivity = typeof leadActivities.$inferSelect;
export type NewLeadActivity = typeof leadActivities.$inferInsert;

export type Sequence = typeof sequences.$inferSelect;
export type NewSequence = typeof sequences.$inferInsert;

export type SequenceStep = typeof sequenceSteps.$inferSelect;
export type NewSequenceStep = typeof sequenceSteps.$inferInsert;

export type LeadList = typeof leadLists.$inferSelect;
export type NewLeadList = typeof leadLists.$inferInsert;

export type SavedFilter = typeof savedFilters.$inferSelect;
export type NewSavedFilter = typeof savedFilters.$inferInsert;

export type SearchHistoryEntry = typeof searchHistory.$inferSelect;
export type NewSearchHistoryEntry = typeof searchHistory.$inferInsert;

export type UsageTracking = typeof usageTracking.$inferSelect;
export type NewUsageTracking = typeof usageTracking.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type NewCreditTransaction = typeof creditTransactions.$inferInsert;

export type MessageTemplate = typeof messageTemplates.$inferSelect;
export type NewMessageTemplate = typeof messageTemplates.$inferInsert;

export type MessageSend = typeof messageSends.$inferSelect;
export type NewMessageSend = typeof messageSends.$inferInsert;

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
  source: 'serpapi' | 'outscraper' | 'manual';
};
