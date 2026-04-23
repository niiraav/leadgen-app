export interface PipelineColumnDef {
  id: string;
  title: string;
  color: string;
  value: string;
  field: "engagement_status" | "pipeline_stage";
  /** Default days until follow-up when a card is dropped here (null = no auto follow-up) */
  defaultFollowUpDays?: number | null;
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { id: "new", title: "New Leads", color: "#1d6fa8", value: "new", field: "engagement_status", defaultFollowUpDays: 7 },
  { id: "contacted", title: "Contacted", color: "#d97706", value: "contacted", field: "engagement_status", defaultFollowUpDays: 5 },
  { id: "qualified", title: "Qualified", color: "#6b21a8", value: "qualified", field: "pipeline_stage", defaultFollowUpDays: 7 },
  { id: "proposal_sent", title: "Proposal Sent", color: "#0f0f0e", value: "proposal_sent", field: "pipeline_stage", defaultFollowUpDays: 3 },
  { id: "converted", title: "Won", color: "#1a7a45", value: "converted", field: "pipeline_stage", defaultFollowUpDays: null },
  { id: "lost", title: "Lost", color: "#b83232", value: "lost", field: "pipeline_stage", defaultFollowUpDays: null },
] as const;

export const ENGAGEMENT_COLUMNS = new Set(["new", "contacted"]);

export function getOpposingField(columnId: string): "engagement_status" | "pipeline_stage" {
  return ENGAGEMENT_COLUMNS.has(columnId) ? "pipeline_stage" : "engagement_status";
}

export function getColumnDef(columnId: string): PipelineColumnDef | undefined {
  return PIPELINE_COLUMNS.find((c) => c.id === columnId);
}

export function getLeadColumn(lead: { pipelineStage?: string | null; engagementStatus?: string | null; status?: string }): string {
  if (lead.pipelineStage) return lead.pipelineStage;
  return lead.engagementStatus ?? lead.status ?? "new";
}
