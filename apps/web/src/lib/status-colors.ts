/**
 * Single source of truth for status -> Badge variant mappings.
 *
 * Values extracted from a full codebase scan (apps/web). No invented values.
 * Mappings are derived from:
 *   - Explicit <Badge variant="…"> usage
 *   - Phase 4 inline badge colour maps (PIPELINE_BADGE_COLORS, ENGAGEMENT_BADGE_COLORS, LEGACY_BADGE_COLORS)
 *   - Database enum definitions (supabase/types.ts)
 *   - Semantic fallback where no explicit colour exists yet
 *
 * Badge variant contract (Phase 0C) lives in components/ui/badge.tsx.
 */

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "outline"
  | "success"
  | "warning";

// ---------------------------------------------------------------------------
// 1. Legacy umbrella lead status (lead_status column)
//    Source: LEGACY_BADGE_COLORS in components/ui/card.tsx + explicit Badge usages
// ---------------------------------------------------------------------------
export const LEAD_STATUS_VARIANTS = {
  new: "default",           // bg-primary/10 text-primary
  contacted: "warning",       // bg-warning/10 text-warning
  replied: "success",         // bg-success/10 text-success
  interested: "success",      // bg-success/10 text-success
  not_interested: "secondary", // bg-muted/10 text-muted-foreground
  qualified: "default",       // bg-primary/10 text-primary
  proposal_sent: "default",   // bg-primary/10 text-primary
  converted: "success",       // bg-success/10 text-success
  closed: "secondary",        // bg-muted/10 text-muted-foreground
  lost: "destructive",        // bg-destructive/10 text-destructive
  archived: "secondary",      // bg-muted/10 text-muted-foreground
  out_of_office: "warning",   // bg-warning/10 text-warning
  do_not_contact: "destructive", // explicit Badge variant="destructive" (PipelineBoard.tsx)
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 2. Pipeline stage (pipeline_stage column)
//    Source: PIPELINE_BADGE_COLORS in components/ui/card.tsx
// ---------------------------------------------------------------------------
export const PIPELINE_STAGE_VARIANTS = {
  qualified: "default",     // bg-primary/10 text-primary
  proposal_sent: "default", // bg-primary/10 text-primary
  converted: "success",     // bg-success/10 text-success
  lost: "destructive",      // bg-destructive/10 text-destructive
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 3. Engagement status (engagement_status column)
//    Source: ENGAGEMENT_BADGE_COLORS in components/ui/card.tsx
// ---------------------------------------------------------------------------
export const ENGAGEMENT_STATUS_VARIANTS = {
  new: "default",
  contacted: "warning",
  replied: "success",
  interested: "success",
  not_interested: "secondary",
  converted: "success",
  do_not_contact: "destructive",
  out_of_office: "warning",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 4. Lifecycle state (lifecycle_state column)
//    Source: LifecycleBadge component (leads/[id]/page.tsx) + LEGACY map
// ---------------------------------------------------------------------------
export const LIFECYCLE_STATE_VARIANTS = {
  active: "success",        // text-success in UI
  closed: "secondary",      // explicit variant="secondary"
  archived: "secondary",    // text-muted-foreground in UI -> closest to secondary
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 5. Sequence status (sequence_status column)
//    Source: Explicit <Badge> usages in sequences.tsx
// ---------------------------------------------------------------------------
export const SEQUENCE_STATUS_VARIANTS = {
  draft: "secondary",
  active: "default",
  paused: "secondary",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 6. Sequence enrollment status (supabase/types.ts enum)
//    Source: Database enum — not yet rendered as Badge, mapped semantically.
// ---------------------------------------------------------------------------
export const SEQUENCE_ENROLLMENT_STATUS_VARIANTS = {
  active: "default",
  paused: "secondary",
  completed: "success",
  replied: "success",
  failed: "destructive",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 7. Reply status (reply_status column)
//    Source: Pipeline column config (pipeline stage field mapping) + Badge usages
// ---------------------------------------------------------------------------
export const REPLY_STATUS_VARIANTS = {
  new: "default",           // bg-primary/10 text-primary
  read: "secondary",        // text-muted-foreground
  replied: "success",       // bg-success/10 text-success
  snoozed: "warning",       // bg-warning/10 text-warning
  archived: "secondary",    // text-muted-foreground
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 8. Email / deliverability status
//    Source: LEAD_STATUS_TEXT (enrichment.ts) + useEmailDeliverability hook
// ---------------------------------------------------------------------------
export const EMAIL_STATUS_VARIANTS = {
  valid: "success",
  invalid: "destructive",
  "catch-all": "warning",
  accept_all: "warning",
  disposable: "destructive",
  unknown: "secondary",
  unverified: "secondary",
  enriching: "secondary",   // processing state (Loader2 icon)
  verifying: "warning",     // pending state (Clock icon)
  deliverable: "success",
  risky: "warning",
  undeliverable: "destructive",
  none: "outline",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 9. Contact enrichment status (supabase enum)
//    Source: supabase/types.ts + semantic mapping
// ---------------------------------------------------------------------------
export const ENRICHMENT_STATUS_VARIANTS = {
  pending: "warning",
  success: "success",
  partial: "warning",
  failed: "destructive",
  no_data: "outline",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 10. Subscription status (subscription_status column)
//     Source: settings.tsx page + tier helpers
// ---------------------------------------------------------------------------
export const SUBSCRIPTION_STATUS_VARIANTS = {
  active: "success",
  trialing: "default",
  cancelled: "destructive",
  past_due: "destructive",
  none: "outline",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 11. Reply intent (reply_intent column / AI classification)
//     Source: types.ts ReplyIntent + semantic mapping
// ---------------------------------------------------------------------------
export const REPLY_INTENT_VARIANTS = {
  interested: "success",
  not_now: "warning",
  not_interested: "destructive",
  question: "default",
  objection: "warning",
  referral: "success",
  other: "secondary",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 12. Loss reason (loss_reason column)
//     Source: types.ts LossReason — currently plain text, neutral mapping.
// ---------------------------------------------------------------------------
export const LOSS_REASON_VARIANTS = {
  no_response: "secondary",
  wrong_timing: "secondary",
  too_expensive: "secondary",
  competitor: "secondary",
  not_a_fit: "secondary",
  other: "secondary",
  no_budget: "secondary",
  went_silent: "secondary",
  went_with_competitor: "secondary",
  unqualified: "secondary",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 13. Lead source (lead_source column)
//     Source: types.ts LeadSource — neutral labels, not yet colour-coded.
// ---------------------------------------------------------------------------
export const LEAD_SOURCE_VARIANTS = {
  outscraper: "secondary",
  csv: "secondary",
  apollo: "secondary",
  manual: "secondary",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// 14. Priority (priority column)
//     Source: types.ts LeadPriority — semantic mapping (no explicit Badge usage yet).
// ---------------------------------------------------------------------------
export const PRIORITY_VARIANTS = {
  low: "secondary",
  medium: "default",
  high: "warning",
  urgent: "destructive",
} as const satisfies Record<string, BadgeVariant>;

// ---------------------------------------------------------------------------
// OPEN QUESTIONS — values that have no matching Badge variant in Phase 0C.
// ---------------------------------------------------------------------------
// Every status value discovered in the codebase maps to one of the six existing
// Badge variants (default | secondary | destructive | outline | success | warning).
// If new design-system colours (e.g. purple, teal, info-blue) are introduced,
// add them to badgeVariants first, then update the mappings below.
export const OPEN_QUESTIONS: Array<{
  value: string;
  statusType: string;
  reason: string;
}> = [];

// ---------------------------------------------------------------------------
// Reply intent colour tokens (semantic — no legacy aliases)
// ---------------------------------------------------------------------------
import type { ReplyIntent } from "@leadgen/shared";

export const REPLY_INTENT_CLASS: Record<string, string> = {
  interested:     "text-success",
  question:       "text-primary",
  objection:      "text-warning",
  not_now:        "text-warning",
  not_interested: "text-destructive",
  referral:       "text-muted-foreground",
  other:          "text-muted-foreground",
};

export const REPLY_INTENT_CHIP: Record<ReplyIntent, { label: string; className: string }> = {
  interested:     { label: "Interested",     className: "bg-success/10 text-success dark:bg-success/20 dark:text-success" },
  question:       { label: "Question",       className: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary" },
  objection:      { label: "Objection",      className: "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning" },
  not_now:        { label: "Not now",        className: "bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning" },
  not_interested: { label: "Not interested", className: "bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive" },
};
