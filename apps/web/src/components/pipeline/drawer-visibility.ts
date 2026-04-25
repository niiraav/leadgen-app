import type { PipelineLead } from "@/hooks/usePipelineBoard";

export interface DrawerVisibility {
  showDncBanner: boolean;
  showReplyPreview: boolean;
  showReplyActions: boolean;
  showFollowUp: boolean;
  showDealValue: boolean;
  showComposer: boolean;
  showHealth: boolean;
  showNotes: boolean;
  showContactBlock: boolean;
  expandContactBlock: boolean;
  showEmailVerification: boolean;
  showEnrichmentContact: boolean;
  showAiBio: boolean;
  showReviewSummary: boolean;
  showRating: boolean;
  showCategoryTags: boolean;
  showLossReason: boolean;
  showLastActivity: boolean;
  showFooter: boolean;
}

function stageKey(stage: string | undefined): string {
  return (stage ?? "new").toLowerCase();
}

// ── Default config: safest fallback for unknown/corrupted stages ──
const DEFAULT_VISIBILITY: DrawerVisibility = {
  showDncBanner: true,
  showReplyPreview: false,
  showReplyActions: false,
  showFollowUp: false,
  showDealValue: false,
  showComposer: false,

  showHealth: false,
  showNotes: true,
  showContactBlock: true,
  expandContactBlock: false,
  showEmailVerification: false,
  showEnrichmentContact: false,
  showAiBio: false,
  showReviewSummary: false,
  showRating: false,
  showCategoryTags: false,
  showLossReason: false,
  showLastActivity: true,
  showFooter: true,
};

// ── Interested config: reused by both interested and qualified ──
const INTERESTED_VISIBILITY: DrawerVisibility = {
  showDncBanner: true,
  showReplyPreview: true,
  showReplyActions: true,
  showFollowUp: true,
  showDealValue: true,
  showComposer: true,

  showHealth: true,
  showNotes: true,
  showContactBlock: true,
  expandContactBlock: false,
  showEmailVerification: false,
  showEnrichmentContact: false,
  showAiBio: true,
  showReviewSummary: true,
  showRating: false,
  showCategoryTags: false,
  showLossReason: false,
  showLastActivity: true,
  showFooter: true,
};

const VISIBILITY_CONFIG: Record<string, DrawerVisibility> = {
  new: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: true,
    showDealValue: false,
    showComposer: false,
  
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: true,
    showEnrichmentContact: true,
    showAiBio: true,
    showReviewSummary: true,
    showRating: true,
    showCategoryTags: true,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  contacted: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: false,
    showComposer: true,
  
    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  replied: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: false,
    showComposer: true,

    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  interested: INTERESTED_VISIBILITY,
  qualified: INTERESTED_VISIBILITY,
  proposal_sent: {
    showDncBanner: true,
    showReplyPreview: true,
    showReplyActions: true,
    showFollowUp: true,
    showDealValue: true,
    showComposer: true,
  
    showHealth: true,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: false,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  converted: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
  
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
  lost: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
  
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: true,
    showLastActivity: true,
    showFooter: true,
  },
  archived: {
    showDncBanner: true,
    showReplyPreview: false,
    showReplyActions: false,
    showFollowUp: false,
    showDealValue: true,
    showComposer: false,
  
    showHealth: false,
    showNotes: true,
    showContactBlock: true,
    expandContactBlock: true,
    showEmailVerification: false,
    showEnrichmentContact: false,
    showAiBio: false,
    showReviewSummary: false,
    showRating: false,
    showCategoryTags: false,
    showLossReason: false,
    showLastActivity: true,
    showFooter: true,
  },
};

export function getDrawerVisibility(lead: PipelineLead): DrawerVisibility {
  const stage = stageKey(lead.pipelineStage ?? lead.status);
  const config = VISIBILITY_CONFIG[stage];
  if (!config) {
    console.warn(
      `[DrawerVisibility] Unknown stage "${stage}" for lead ${lead.id}. Falling back to DEFAULT.`
    );
    return DEFAULT_VISIBILITY;
  }
  return config;
}
