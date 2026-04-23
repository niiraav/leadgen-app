export interface PipelineColumnDef {
  id: string;
  title: string;
  color: string;
  value: string;
  field: "engagement_status" | "pipeline_stage";
}

export const PIPELINE_COLUMNS: PipelineColumnDef[] = [
  { id: "new", title: "New Leads", color: "#1d6fa8", value: "new", field: "engagement_status" },
  { id: "contacted", title: "Contacted", color: "#d97706", value: "contacted", field: "engagement_status" },
  { id: "qualified", title: "Qualified", color: "#6b21a8", value: "qualified", field: "pipeline_stage" },
  { id: "proposal_sent", title: "Proposal Sent", color: "#0f0f0e", value: "proposal_sent", field: "pipeline_stage" },
  { id: "converted", title: "Won", color: "#1a7a45", value: "converted", field: "pipeline_stage" },
  { id: "lost", title: "Lost", color: "#b83232", value: "lost", field: "pipeline_stage" },
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
