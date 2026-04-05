"use client";

import { useState, useMemo } from "react";
import { LeadCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { mockLeads } from "@/lib/mock-data";
import { Search, Filter, ArrowUpDown, Download, Plus, UserPlus } from "lucide-react";
import Link from "next/link";

const STATUS_OPTIONS = [
  { value: "all", label: "All Status" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "meeting", label: "Meeting" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"name" | "score" | "date">("score");
  const [currentPage, setCurrentPage] = useState(1);

  const pageSize = 5;

  const filteredLeads = useMemo(() => {
    let filtered = mockLeads.filter((lead) => {
      const matchesSearch =
        !searchTerm ||
        lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        statusFilter === "all" || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    filtered.sort((a, b) => {
      if (sortBy === "score") return b.hotScore - a.hotScore;
      if (sortBy === "name") return a.name.localeCompare(b.name);
      return 0;
    });

    return filtered;
  }, [searchTerm, statusFilter, sortBy]);

  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Leads</h1>
          <p className="text-sm text-text-muted mt-1">
            {filteredLeads.length} leads in your database
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/leads/import"
            className="btn btn-secondary text-xs py-1.5 h-8"
          >
            <Download className="w-3.5 h-3.5" />
            Import
          </Link>
          <button className="btn btn-primary text-xs py-1.5 h-8">
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="input pl-9"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="h-10 px-3 text-xs rounded-full bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={() => setSortBy(sortBy === "name" ? "score" : sortBy === "score" ? "date" : "name")}
          className="btn btn-ghost text-xs py-1.5 h-10"
        >
          {sortBy === "name" ? "Name" : sortBy === "score" ? "Hot Score" : "Date"}
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lead List */}
      <div className="space-y-2">
        {paginatedLeads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
        {paginatedLeads.length === 0 && (
          <div className="card text-center py-12">
            <UserPlus className="w-10 h-10 text-text-faint mx-auto mb-3" />
            <p className="text-sm text-text-muted">No leads found</p>
            <p className="text-xs text-text-faint mt-1">
              Try adjusting your filters or add a new lead
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filteredLeads.length)} of{" "}
            {filteredLeads.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`w-8 h-8 text-xs rounded-lg font-medium transition-colors ${
                  page === currentPage
                    ? "bg-accent text-accent-text"
                    : "text-text-muted hover:bg-surface-2"
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-text-muted hover:text-text hover:bg-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
