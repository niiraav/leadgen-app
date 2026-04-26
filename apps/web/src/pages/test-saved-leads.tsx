import React from 'react';
import {
  SavedLeadsTable,
  MOCK_SAVED_LEADS,
  type SavedLead,
  type ActivityLogEntry,
} from '@/components/leads/SavedLeadsTable';
import type { LeadStatus, EngagementStatus, PipelineStage } from '@leadgen/shared';

export default function SavedLeadsTestPage() {
  const [leads, setLeads] = React.useState<SavedLead[]>(MOCK_SAVED_LEADS);

  const handlers = {
    onWhatsAppClick: (lead: SavedLead) => console.log('WhatsApp:', lead.businessName),
    onEmailClick: (lead: SavedLead) => console.log('Email:', lead.businessName),
    onSequenceClick: (lead: SavedLead) => console.log('Sequence:', lead.businessName),
    onEnrichClick: (lead: SavedLead) => console.log('Enrich:', lead.businessName),
    onOpenLead: (lead: SavedLead) => console.log('Open:', lead.businessName),
    onRemoveLead: (leadId: string) => {
      console.log('Remove:', leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    },
    onStatusChange: (leadId: string, newStatus: LeadStatus, field?: 'engagement_status' | 'pipeline_stage') => {
      console.log('Status change:', leadId, newStatus, field);
      setLeads((prev) =>
        prev.map((l) => {
          if (l.id !== leadId) return l;
          // Phase 4: update domain field + legacy status for compat
          return {
            ...l,
            status: newStatus,
            ...(field === 'engagement_status' ? { engagementStatus: newStatus as EngagementStatus } : {}),
            ...(field === 'pipeline_stage' ? { pipelineStage: newStatus as PipelineStage } : {}),
          };
        }),
      );
    },
    onLogActivity: (leadId: string, entry: ActivityLogEntry) => {
      console.log('Log activity:', leadId, entry);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? { ...l, lastActivity: { label: entry.label, timestamp: entry.timestamp, replyIntent: entry.replyIntent } }
            : l,
        ),
      );
    },
    onSearchClick: () => console.log('Search clicked'),
  };

  return (
      <div className="min-h-dvh bg-white p-6">
      <h1 className="text-xl font-bold mb-4">Saved Leads Table — Sprint 2 QA</h1>
      <SavedLeadsTable leads={leads} {...handlers} />

      <hr className="my-8" />

      <h2 className="text-lg font-semibold mb-2">Empty state</h2>
      <SavedLeadsTable leads={[]} {...handlers} />
    </div>
  );
}
