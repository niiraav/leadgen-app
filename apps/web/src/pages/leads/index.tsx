import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback, useRef } from "react";
import { LeadCard } from "@/components/ui/card";
import { api } from "@/lib/api";
import { Search, ArrowUpDown, Download, Plus, UserPlus, Loader2, Mail, Check, X, AlertCircle } from "lucide-react";
import Link from "next/link";

const PAGE_SIZE = 20;

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

  const [leads, setLeads] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const loadingRef = useRef(false);
  const filtersRef = useRef({ statusFilter, emailStatusFilter, sortBy, sortOrder, searchTerm });
  const observerRef = useRef<HTMLDivElement>(null);
  const fetchKeyRef = useRef(0);
  const cursorRef = useRef<string | null>(null);

  useEffect(() => {
    filtersRef.current = { statusFilter, emailStatusFilter, sortBy, sortOrder, searchTerm };
  }, [statusFilter, emailStatusFilter, sortBy, sortOrder, searchTerm]);

  // Stable fetch — cursor-based, uses refs, no deps, never recreated
  const doFetch = useCallback(async (reset = false) => {
    if (loadingRef.current) return false;
    loadingRef.current = true;
    const cursor = reset ? null : cursorRef.current;
    const f = filtersRef.current;

    if (reset) {
      setLoading(true);
      setLeads([]);
    } else {
      setLoadingMore(true);
    }
    setError(null);

    try {
      const params: any = {
        limit: PAGE_SIZE,
        status: f.statusFilter || undefined,
        search: f.searchTerm || undefined,
        sortField: f.sortBy === "name" ? "business_name" : f.sortBy === "score" ? "hot_score" : "created_at",
        sortOrder: f.sortOrder,
      };
      if (cursor) params.cursor = cursor;

      const result = await api.leads.list(params);
      const filteredData = result.data.filter((l: any) => {
        if (!f.emailStatusFilter) return true;
        return l.email_status === f.emailStatusFilter;
      });
      const mapped = filteredData.map((l: any) => ({
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

      if (reset) {
        setLeads(mapped);
      } else {
        setLeads((prev) => [...prev, ...mapped]);
      }

      setTotalCount(result.total);
      setHasMore(mapped.length === PAGE_SIZE && result.nextCursor != null);
      cursorRef.current = result.nextCursor || null;
      return true;
    } catch (err: any) {
      setError(`Unable to reach API server. (${err.message.split("\n")[0]})`);
      return false;
    } finally {
      setLoading(false);
      setLoadingMore(false);
      loadingRef.current = false;
    }
  }, []);

  const triggerRefetch = useCallback(() => {
    cursorRef.current = null;
    fetchKeyRef.current += 1;
    doFetch(true);
  }, [doFetch]);

  // Mount: fetch first batch
  useEffect(() => {
    doFetch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refetch on filter change: skip first mount run
  useEffect(() => {
    if (fetchKeyRef.current === 0) {
      fetchKeyRef.current = 1;
      return;
    }
    triggerRefetch();
  }, [statusFilter, emailStatusFilter, sortBy, sortOrder, triggerRefetch]);

  // Intersection observer — attached only after initial mount fetch is done (!loading)
  useEffect(() => {
    if (loading) return;
    if (!observerRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          doFetch();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore]);

  const verifyAllUnverified = async () => {
    if (verifyingAll) return;
    setVerifyingAll(true);
    try {
      const result = await api.leads.list({ limit: 500 });
      const unverified = result.data
        .filter((l: any) => !l.email_status || l.email_status === "unverified")
        .filter((l: any) => l.email);

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
        triggerRefetch();
      }
    } finally {
      setVerifyingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Leads</h1>
          <p className="text-sm text-text-muted mt-1">
            {loading ? "Loading..." : `${totalCount} leads in your database`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/leads/import" className="btn btn-secondary text-xs py-1.5 h-9 min-h-[36px]">
            <Download className="w-3.5 h-3.5" />
            Import
          </Link>
          <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-xs py-1.5 h-9 min-h-[36px]">
            <Plus className="w-3.5 h-3.5" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">
          {error}
          <button onClick={() => triggerRefetch()} className="ml-3 underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Filters: horizontal on desktop, stacked on mobile */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="text"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") triggerRefetch(); }}
            className="input pl-9 w-full"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer min-h-[36px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={emailStatusFilter}
            onChange={(e) => setEmailStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer min-h-[36px]"
          >
            {EMAIL_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <button
            onClick={verifyAllUnverified}
            disabled={verifyingAll}
            className="btn btn-ghost text-xs h-9 min-h-[36px] text-blue disabled:opacity-50"
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
            className="btn btn-ghost text-xs h-9 min-h-[36px]"
          >
            {sortBy === "name" ? "Name" : sortBy === "score" ? "Hot Score" : "Date"}
            <ArrowUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Lead List */}
      <div className="space-y-2">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border border-border/60 bg-surface animate-pulse" />
            ))}
          </div>
        ) : leads.length > 0 ? (
          leads.map((lead) => (
            <div key={lead.id} className="flex items-center gap-2">
              <div className="flex-1">
                <LeadCard lead={lead} />
              </div>
              {lead.email && (
                <div className="shrink-0 py-2 pr-2">
                  {lead.emailStatus === "valid" && (
                    <span className="inline-flex items-center gap-1 text-xs text-green"><Check className="w-3 h-3" /></span>
                  )}
                  {lead.emailStatus === "invalid" && (
                    <span className="inline-flex items-center gap-1 text-xs text-red" title="Invalid email"><AlertCircle className="w-3 h-3" /></span>
                  )}
                  {lead.emailStatus === "catch-all" && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber" title="Catch-all email">⚠️</span>
                  )}
                  {(!lead.emailStatus || lead.emailStatus === "unverified") && (
                    <span className="inline-flex items-center gap-1 text-xs text-text-faint" title="Unverified email"><Mail className="w-3 h-3" /></span>
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

      {/* Loading more indicator */}
      {loadingMore && (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading more...
        </div>
      )}

      {/* Lazy-load sentinel */}
      <div ref={observerRef} className="h-1" />

      {/* Show total count at bottom */}
      {!loading && totalCount > 0 && (
        <div className="text-center text-xs text-text-faint py-2">
          Showing {leads.length} of {totalCount} leads
        </div>
      )}

      {/* ─── Add Lead Modal ─── */}
      {showAddModal && <AddLeadModal onClose={() => setShowAddModal(false)} onAdded={() => { triggerRefetch(); setShowAddModal(false); }} />}
    </div>
  );
}

function AddLeadModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [category, setCategory] = useState("");
  const [city, setCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.leads.create({
        business_name: name,
        email,
        phone,
        website_url: website,
        category,
        city,
        status: "new",
        source: "manual",
      });
      onAdded();
    } catch (err: any) {
      setError(err.message || "Failed to add lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">Add Lead</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <div className="rounded-lg bg-red/10 border border-red/20 px-4 py-2 text-sm text-red">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-text mb-1">Business name *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Phone</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Category</label>
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">City</label>
              <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Website</label>
            <input type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost text-sm flex-1">Cancel</button>
            <button type="submit" disabled={saving || !name.trim()} className="btn btn-primary text-sm flex-1 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Saving...</> : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
