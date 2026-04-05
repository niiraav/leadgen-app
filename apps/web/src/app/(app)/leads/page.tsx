"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { LeadCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, BackendPaginatedLeads } from "@/lib/api";
import { Search, ArrowUpDown, Download, Plus, UserPlus, Loader2 } from "lucide-react";
import Link from "next/link";

interface FrontendLead {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  location: string;
  hotScore: number;
  status: string;
  addedAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "converted", label: "Won" },
  { value: "lost", label: "Lost" },
  { value: "archived", label: "Archived" },
];

export default function LeadsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "score" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [leads, setLeads] = useState<FrontendLead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 5;

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.leads.list({
        limit: pageSize,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        sortField: sortBy === "name" ? "business_name" : sortBy === "score" ? "hot_score" : "created_at",
        sortOrder,
      });

      const mapped = result.data.map((l) => ({
        id: String(l.id),
        name: l.businessName || "Unknown",
        title: l.category || "",
        company: l.city || l.country || "",
        email: l.email || "",
        location: [l.city, l.country].filter(Boolean).join(", "),
        hotScore: l.hotScore,
        status: l.status,
        addedAt: new Date(l.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));

      setLeads(mapped);
      setTotalCount(result.pagination.total);
      setCurrentPage(1);
      setLoading(false);
    } catch (err: any) {
      console.warn("[Leads] API unreachable:", err.message);
      // Mock fallback via mockLeads — do nothing, show empty with hint
      setLeads([]);
      setTotalCount(0);
      setLoading(false);
      setError(`Unable to reach API server. Is the backend running? (${err.message})`);
    }
  }, [statusFilter, searchTerm, sortBy, sortOrder]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Leads</h1>
          <p className="text-sm text-text-muted mt-1">
            {loading ? "Loading..." : `${totalCount} leads in your database`}
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

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">
          {error}
        </div>
      )}

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
            onKeyDown={(e) => e.key === "Enter" && fetchLeads()}
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
          onClick={() => {
            if (sortBy === "name") { setSortBy("date"); setSortOrder("desc"); }
            else if (sortBy === "date") { setSortBy("score"); setSortOrder("desc"); }
            else { setSortBy("name"); setSortOrder("asc"); }
          }}
          className="btn btn-ghost text-xs py-1.5 h-10"
        >
          {sortBy === "name" ? "Name" : sortBy === "score" ? "Hot Score" : "Date"}
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lead List */}
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-xl border border-border/60 bg-surface animate-pulse" />
            ))}
          </div>
        ) : leads.length > 0 ? (
          leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))
        ) : (
          <div className="card text-center py-12">
            <UserPlus className="w-10 h-10 text-text-faint mx-auto mb-3" />
            <p className="text-sm text-text-muted">No leads found</p>
            <p className="text-xs text-text-faint mt-1">
              Try adjusting your filters, search Google Maps, or import a CSV
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-text-muted">
            Showing {totalCount > 0 ? (currentPage - 1) * pageSize + 1 : 0}–
            {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
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
