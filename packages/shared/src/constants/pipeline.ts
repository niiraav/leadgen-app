// ─── Shared pipeline column definition ───────────────────────────────────────
// Source of truth for BOTH backend API shape and frontend UI columns.
// Keep this file synced with any DB enum or validation schema.

export interface PipelineColumn {
  id: string;
  label: string;
  title: string;
  value: string;
  field: 'engagement_status' | 'pipeline_stage';
  status: string[];
  color: string;
  /** Default days until follow-up when a card is dropped here (null = no auto follow-up) */
  defaultFollowUpDays?: number | null;
}

export type PipelineColumnDef = PipelineColumn;

export const PIPELINE_COLUMNS: PipelineColumn[] = [
  { id: 'new',               label: 'New Leads',      title: 'New Leads',      value: 'new',               field: 'engagement_status', status: ['new'],               color: '#1d6fa8', defaultFollowUpDays: null },
  { id: 'contacted',         label: 'Contacted',      title: 'Contacted',      value: 'contacted',         field: 'engagement_status', status: ['contacted'],         color: '#d97706', defaultFollowUpDays: 3 },
  { id: 'replied',           label: 'Replied',        title: 'Replied',        value: 'replied',           field: 'engagement_status', status: ['replied'],           color: '#16a34a', defaultFollowUpDays: 2 },
  { id: 'interested',        label: 'Interested',      title: 'Interested',      value: 'interested',        field: 'engagement_status', status: ['interested', 'qualified'], color: '#16a34a', defaultFollowUpDays: 2 },
  { id: 'not_interested',    label: 'Not Interested',  title: 'Not Interested',  value: 'not_interested',    field: 'engagement_status', status: ['not_interested', 'out_of_office'], color: '#dc2626', defaultFollowUpDays: null },
  { id: 'proposal_sent',     label: 'Proposal Sent',   title: 'Proposal Sent',   value: 'proposal_sent',     field: 'pipeline_stage',    status: ['proposal_sent'],      color: '#9333ea', defaultFollowUpDays: 5 },
  { id: 'converted',         label: 'Converted',      title: 'Converted',      value: 'converted',         field: 'pipeline_stage',    status: ['converted'],          color: '#059669', defaultFollowUpDays: null },
  { id: 'lost',              label: 'Lost',            title: 'Lost',            value: 'lost',              field: 'pipeline_stage',    status: ['lost'],                 color: '#6b7280', defaultFollowUpDays: null },
];

export function getColumnIdForStatus(status: string): string | undefined {
  return PIPELINE_COLUMNS.find((col) => col.status.includes(status))?.id;
}

export function getColumnDef(id: string): PipelineColumnDef | undefined {
  return PIPELINE_COLUMNS.find((c) => c.id === id);
}

export function getOpposingField(columnId: string): 'engagement_status' | 'pipeline_stage' {
  const col = getColumnDef(columnId);
  if (!col) return 'pipeline_stage';
  return col.field === 'engagement_status' ? 'pipeline_stage' : 'engagement_status';
}

export function getLeadColumn(lead: { pipelineStage?: string | null; engagementStatus?: string | null; status?: string }): string {
  const s = lead.pipelineStage || lead.engagementStatus || lead.status || 'new';
  return getColumnIdForStatus(s) ?? 'new';
}
