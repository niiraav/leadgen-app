import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback, useMemo } from "react";
import { LeadCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, BackendPaginatedLeads } from "@/lib/api";
import { Search, ArrowUpDown, Download, Plus, UserPlus, Loader2, Mail } from "lucide-react";
import Link from "next/link";

interface FrontendLead {
  id: string;
  name: string;
  title: string;
  company: string;
  email: string;
  emailStatus: string;
  location: string;
  hotScore: number;
  status: string;
  addedAt: string;
}

const EMAIL_STATUS_OPTIONS = [
  { value: "", label: "All Emails" },
  { value: "valid", label: "✓ Verified" },
  { value: "invalid", label: "✗ Invalid" },
  { value: "catch-all", label: "⚠️ Catch-all" },
  { value: "unverified", label: "Unverified" },
];

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
  const [emailStatusFilter, setEmailStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "score" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const [leads, setLeads] = useState<FrontendLead[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);

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

      const filteredData = result.data.filter((l) => {
        if (!emailStatusFilter) return true;
        return l.email_status === emailStatusFilter;
      });

      const mapped = filteredData.map((l) => ({
        id: String(l.id),
        name: l.business_name || "Unknown",
        title: l.category || "",
        company: l.city || l.country || "",
        email: l.email || "",
        emailStatus: l.email_status || "unverified",
        location: [l.city, l.country].filter(Boolean).join(", "),
        hotScore: l.hot_score,
        status: l.status,
        addedAt: new Date(l.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }));

      setLeads(mapped);
      setTotalCount(result.total);
      setCurrentPage(1);
      setLoading(false);
    } catch (err: any) {
      console.warn("[Leads] API unreachable:", err.message);
    console.warn("[Leads] API unreachable:", err.message);
      setLeads([]);
      setTotalCount(0);
      setLoading(false);
      setError(`Unable to reach API server. Is the backend running? (${err.message})`);
    }
  }, [statusFilter, searchTerm, sortBy, sortOrder, emailStatusFilter]);

  const verifyAllUnverified = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    try {
      const result = await api.leads.list({ limit: 500 });
      const unverified = result.data
        .filter((l) => !l.email_status || l.email_status === "unverified")
        .filter((l) => l.email);

      if (unverified.length === 0) {
        setVerifyingAll(false);
        return;
      }

      const res = await fetch("/api/leads/verify-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lead_ids: unverified.map((l: any) => l.id) }),
      });

      if (res.ok) {
        const data = await res.json();
        console.log(`Verification: ${data.queued} leads, skipped: ${data.skipped}`);
        fetchLeads();
      }
    } catch (err) {
      console.error("Failed to verify all:", err);
    } finally {
      setVerifyingAll(false);
    }
  };

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
      <div className="flex flex-col gap-3">
        <div className="relative w-full">
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

        <select
          value={emailStatusFilter}
          onChange={(e) => {
            setEmailStatusFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="h-10 px-3 text-xs rounded-full bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer"
        >
          {EMAIL_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <button
          onClick={verifyAllUnverified}
          disabled={verifyingAll}
          className="btn btn-ghost text-xs py-1.5 h-10 text-blue disabled:opacity-50"
          title="Verify all unverified lead emails"
        >
          {verifyingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          Verify All
        </button>

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
            <div key={lead.id} className="flex items-center gap-2">
              <LeadCard lead={lead} />
              {lead.email && (
                <div className="shrink-0 py-2 pr-2">
                  {lead.emailStatus === "valid" && (
                    <span className="inline-flex items-center gap-1 text-xs text-green">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                  {lead.emailStatus === "invalid" && (
                    <span className="inline-flex items-center gap-1 text-xs text-red" title="Invalid email">
                      <AlertCircle className="w-3 h-3" />
                    </span>
                  )}
                  {lead.emailStatus === "catch-all" && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber" title="Catch-all email">
                      ⚠️
                    </span>
                  )}
                  {(!lead.emailStatus || lead.emailStatus === "unverified") && (
                    <span className="inline-flex items-center gap-1 text-xs text-text-faint" title="Unverified email">
                      <Mail className="w-3 h-3" />
                    </span>
                  )}
                </div>
              )}
            </div>
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

export const getServerSideProps = withAuth();
