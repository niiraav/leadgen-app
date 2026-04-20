/**
 * Shared domain-resolution logic for leads.
 *
 * Three domains: engagement, pipeline, lifecycle.
 * "do_not_contact" is a boolean flag — not a domain.
 *
 * This module is the single source of truth for:
 *   - Which statuses belong to which domain
 *   - How to determine a lead's current domain
 *   - What options to show in a status dropdown
 *   - How to build a PATCH payload for a status change
 */

// ── Domain membership ────────────────────────────────────────────────────────

export const ENGAGEMENT_STATUSES = [
  'new', 'contacted', 'replied', 'interested', 'not_interested', 'out_of_office',
] as const;

export const PIPELINE_STAGES = [
  'qualified', 'proposal_sent', 'converted', 'lost',
] as const;

export const LIFECYCLE_STATES = [
  'active', 'closed', 'archived',
] as const;

export type Domain = 'engagement' | 'pipeline' | 'lifecycle' | 'none';

export function getDomainOf(status: string): Domain {
  if ((ENGAGEMENT_STATUSES as readonly string[]).includes(status)) return 'engagement';
  if ((PIPELINE_STAGES as readonly string[]).includes(status)) return 'pipeline';
  if ((LIFECYCLE_STATES as readonly string[]).includes(status)) return 'lifecycle';
  return 'none';
}

// ── Resolve a lead's current (primary) domain ────────────────────────────────
// Priority: pipeline > engagement > lifecycle > none

export interface LeadDomainFields {
  engagementStatus?: string | null;
  pipelineStage?: string | null;
  lifecycleState?: string | null;
  status?: string | null;
  doNotContact?: boolean;
}

export function getLeadDomain(lead: LeadDomainFields): Domain {
  if (lead.pipelineStage) return 'pipeline';
  if (lead.engagementStatus) return 'engagement';
  if (lead.lifecycleState) return 'lifecycle';
  // Fallback: infer from legacy status
  if (lead.status) return getDomainOf(lead.status);
  return 'none';
}

// ── Current status value per domain ──────────────────────────────────────────

export function getCurrentEngagement(lead: LeadDomainFields): string | null {
  return lead.engagementStatus ?? (
    lead.status && getDomainOf(lead.status) === 'engagement' ? lead.status : null
  );
}

export function getCurrentPipeline(lead: LeadDomainFields): string | null {
  return lead.pipelineStage ?? (
    lead.status && getDomainOf(lead.status) === 'pipeline' ? lead.status : null
  );
}

export function getCurrentLifecycle(lead: LeadDomainFields): string | null {
  return lead.lifecycleState ?? (
    lead.status && getDomainOf(lead.status) === 'lifecycle' ? lead.status : null
  );
}

// ── Dropdown options for a lead's current domain ─────────────────────────────

export interface StatusOption {
  value: string;
  label: string;
  domain: Domain;
  /** Bridge action = moving between domains */
  isBridge?: boolean;
}

export const ENGAGEMENT_OPTIONS: StatusOption[] = ENGAGEMENT_STATUSES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  domain: 'engagement',
}));

export const PIPELINE_OPTIONS: StatusOption[] = PIPELINE_STAGES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  domain: 'pipeline',
}));

export const LIFECYCLE_OPTIONS: StatusOption[] = LIFECYCLE_STATES.map((s) => ({
  value: s,
  label: s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  domain: 'lifecycle',
}));

export function getDropdownOptions(lead: LeadDomainFields): StatusOption[] {
  const domain = getLeadDomain(lead);
  const opts: StatusOption[] = [];

  // Current-domain statuses first
  if (domain === 'engagement') opts.push(...ENGAGEMENT_OPTIONS);
  else if (domain === 'pipeline') opts.push(...PIPELINE_OPTIONS);
  else if (domain === 'lifecycle') opts.push(...LIFECYCLE_OPTIONS);
  else {
    // No domain yet — show engagement (new leads start here)
    opts.push(...ENGAGEMENT_OPTIONS);
  }

  // Bridge actions to other domains
  if (domain !== 'pipeline') {
    opts.push({
      value: '__move_to_pipeline__',
      label: 'Move to Pipeline',
      domain: 'pipeline',
      isBridge: true,
    });
  }
  if (domain !== 'engagement') {
    opts.push({
      value: '__move_to_engagement__',
      label: 'Move to Engagement',
      domain: 'engagement',
      isBridge: true,
    });
  }
  if (domain !== 'lifecycle') {
    opts.push({
      value: '__close_lead__',
      label: 'Close Lead',
      domain: 'lifecycle',
      isBridge: true,
    });
  }

  // Do-not-contact toggle
  opts.push({
    value: '__toggle_dnc__',
    label: 'Toggle Do Not Contact',
    domain: 'none',
    isBridge: true,
  });

  return opts;
}

// ── Build PATCH payload for a status change ─────────────────────────────────

export interface StatusPatchPayload {
  /** Raw snake_case keys for the API (engagement_status, pipeline_stage, etc.) */
  [key: string]: unknown;
}

/**
 * Given a lead and a chosen dropdown value, return the PATCH payload.
 * Handles bridge actions by setting the entry-point value of the target domain.
 */
export function buildStatusPatch(
  lead: LeadDomainFields,
  chosenValue: string,
): StatusPatchPayload | null {
  // Bridge: move to pipeline → set pipeline_stage = 'qualified', clear other domains
  if (chosenValue === '__move_to_pipeline__') {
    return {
      pipeline_stage: 'qualified',
      engagement_status: null,
      lifecycle_state: null,
      status: 'qualified',
    };
  }

  // Bridge: move to engagement → set engagement_status, clear other domains
  if (chosenValue === '__move_to_engagement__') {
    const eng = getCurrentEngagement(lead) ?? 'contacted';
    return {
      engagement_status: eng,
      pipeline_stage: null,
      lifecycle_state: null,
      status: eng,
    };
  }

  // Bridge: close lead → set lifecycle_state = 'closed', clear other domains
  if (chosenValue === '__close_lead__') {
    return {
      lifecycle_state: 'closed',
      engagement_status: null,
      pipeline_stage: null,
      status: 'closed',
    };
  }

  // Bridge: toggle DNC — caller must supply current doNotContact value
  // We return a sentinel; the caller resolves the actual boolean.
  if (chosenValue === '__toggle_dnc__') {
    return { __toggle_dnc__: true };
  }

  // Normal status change — route to correct domain column + legacy dual-write
  const targetDomain = getDomainOf(chosenValue);
  const currentDomain = getLeadDomain(lead);

  // Cross-domain mismatch: skip (bulk caller counts these as "skipped")
  if (targetDomain !== currentDomain) {
    return null;
  }

  const patch: StatusPatchPayload = { status: chosenValue };

  if (targetDomain === 'engagement') {
    patch.engagement_status = chosenValue;
  } else if (targetDomain === 'pipeline') {
    patch.pipeline_stage = chosenValue;
  } else if (targetDomain === 'lifecycle') {
    patch.lifecycle_state = chosenValue;
  }

  return patch;
}

/** Alias used by consumers that resolve a chosen dropdown value to a PATCH payload */
export const resolveStatusPatch = buildStatusPatch;

/**
 * Simpler version: build the patch given a direct status value
 * (no bridge actions). Used by bulk status change.
 */
export function buildDirectStatusPatch(status: string): StatusPatchPayload {
  const patch: StatusPatchPayload = { status };
  const domain = getDomainOf(status);
  if (domain === 'engagement') patch.engagement_status = status;
  else if (domain === 'pipeline') patch.pipeline_stage = status;
  else if (domain === 'lifecycle') patch.lifecycle_state = status;
  return patch;
}

// ── Domain label for display ────────────────────────────────────────────────

export const DOMAIN_LABELS: Record<Domain, string> = {
  engagement: 'Engagement',
  pipeline: 'Pipeline',
  lifecycle: 'Lifecycle',
  none: 'Unset',
};

// ── Bulk domain check ────────────────────────────────────────────────────────

export interface BulkDomainCheck {
  canApply: boolean;
  skipReason?: string;
}

/**
 * Check whether a specific status value can be applied to a lead
 * based on the lead's current domain.
 *
 * Rules (per spec — no transition validation, just domain-aware):
 * - If the lead's current domain matches the target domain → can apply
 * - If the lead has NO domain (new lead) → can apply any engagement status
 * - If the target domain differs → it's a bridge action, which requires
 *   the explicit bridge action (not a bulk-set). Skip in bulk.
 */
export function canBulkApplyStatus(
  lead: LeadDomainFields,
  targetStatus: string,
): BulkDomainCheck {
  const currentDomain = getLeadDomain(lead);
  const targetDomain = getDomainOf(targetStatus);

  // Same domain — always OK
  if (currentDomain === targetDomain) return { canApply: true };

  // No domain yet — allow engagement statuses (default triage)
  if (currentDomain === 'none' && targetDomain === 'engagement') return { canApply: true };

  // Cross-domain — skip
  const currentLabel = DOMAIN_LABELS[currentDomain];
  const targetLabel = DOMAIN_LABELS[targetDomain];
  return {
    canApply: false,
    skipReason: `${currentLabel} lead — can't set ${targetLabel} status in bulk`,
  };
}
