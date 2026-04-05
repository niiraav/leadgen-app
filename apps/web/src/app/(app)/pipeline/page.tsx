"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { mockLeads, mockPipelineColumns } from "@/lib/mock-data";
import { HotScoreBadge } from "@/components/ui/badge";
import { Plus, MoreHorizontal } from "lucide-react";
import Link from "next/link";

type ColumnType = {
  id: string;
  title: string;
  color: string;
};

const statusOptions: ColumnType[] = [
  { id: "new", title: "New Leads", color: "#1d6fa8" },
  { id: "contacted", title: "Contacted", color: "#996200" },
  { id: "replied", title: "Replied", color: "#1a7a45" },
  { id: "meeting", title: "Meeting Scheduled", color: "#0f0f0e" },
  { id: "won", title: "Won", color: "#1a7a45" },
  { id: "lost", title: "Lost", color: "#b83232" },
];

export default function PipelinePage() {
  const handleMoveLead = (leadId: string, newStatus: string) => {
    const lead = mockLeads.find((l) => l.id === leadId);
    if (lead) {
      lead.status = newStatus;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Pipeline</h1>
          <p className="text-sm text-text-muted mt-1">
            Manage your leads through the sales pipeline
          </p>
        </div>
        <button className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" />
          Add Lead
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-none">
        {statusOptions.map((col) => {
          const leadsInCol = mockLeads.filter((l) => l.status === col.id);

          return (
            <div
              key={col.id}
              className="min-w-[300px] max-w-[300px] flex-shrink-0"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                  <h3 className="text-sm font-semibold text-text">
                    {col.title}
                  </h3>
                  <span className="text-xs text-text-faint bg-surface-2 px-2 py-0.5 rounded-full">
                    {leadsInCol.length}
                  </span>
                </div>
                <button className="rounded-full p-1 text-text-faint hover:text-text hover:bg-surface-2 transition-colors">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Column Cards */}
              <div className="space-y-2">
                {leadsInCol.map((lead) => (
                  <Card
                    key={lead.id}
                    className="p-4 group cursor-default"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="text-sm font-semibold text-text truncate flex-1 min-w-0">
                        {lead.name}
                      </h4>
                      <HotScoreBadge score={lead.hotScore} />
                    </div>
                    <p className="text-xs text-text-muted mb-0.5 truncate">
                      {lead.title} at {lead.company}
                    </p>
                    <p className="text-xs text-text-faint truncate">
                      {lead.email}
                    </p>

                    {/* Status Dropdown */}
                    <div className="mt-3">
                      <select
                        value={lead.status}
                        onChange={(e) => handleMoveLead(lead.id, e.target.value)}
                        className="w-full h-7 px-2 text-[10px] font-medium rounded-md bg-surface-2 border border-border text-text-muted focus:outline-none focus:ring-1 focus:ring-blue/20 cursor-pointer uppercase tracking-wider"
                      >
                        {statusOptions.map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <span className="text-[10px] text-text-faint">
                        {lead.location}
                      </span>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="text-[10px] text-blue hover:underline"
                      >
                        View profile →
                      </Link>
                    </div>
                  </Card>
                ))}

                {leadsInCol.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-border/40 p-6 text-center">
                    <p className="text-xs text-text-faint">
                      No leads in this stage
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
