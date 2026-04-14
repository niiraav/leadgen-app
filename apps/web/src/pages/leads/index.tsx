import { withAuth } from "@/lib/auth";
import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, UpgradeRequiredError, mapBackendLead } from "@/lib/api";
import { Search, ArrowUpDown, Download, Plus, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { LeadsTable, type LeadsTableRow } from "@/components/leads/LeadsTable";
import UpgradePrompt from "@/components/ui/upgrade-prompt";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "closed", label: "Won" },
  { value: "not_interested", label: "Lost" },
  { value: "archived", label: "Archived" },
];

export default function LeadsPage() {

  const queryClient = useQueryClient();

  // Sprint 8: Bulk selection

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "score" | "date">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [lists, setLists] = useState<{ id: string; name: string; count: number; color: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeListId, setActiveListId] = useState<string | null>(null);

  // React Query: leads list — cached, deduplicated, no double-fetch
  const leadsQueryKey = useMemo(() => ["leads", { statusFilter, sortBy, sortOrder, searchTerm, activeListId }],
    [statusFilter, sortBy, sortOrder, searchTerm, activeListId]);

  const leadsQuery = useQuery({
    queryKey: leadsQueryKey,
    queryFn: async () => {
      const params: any = {
        limit: PAGE_SIZE,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        sortField: sortBy === "name" ? "business_name" : sortBy === "score" ? "hot_score" : "created_at",
        sortOrder,
      };

      const result = await api.leads.list(params);

      // Pre-populate individual lead caches so detail page doesn't re-fetch
      for (const raw of result.data) {
        const mapped = mapBackendLead(raw);
        queryClient.setQueryData(["lead", String(raw.id)], mapped);
      }
      let data = result.data;

      // Filter by list if active
      if (activeListId) {
        data = data.filter((l: any) => l.list_id === activeListId);
      }

      const mapped: LeadsTableRow[] = data.map((l: any) => ({
        id: String(l.id),
        business_name: l.business_name || "Unknown",
        category: l.category || null,
        city: l.city || null,
        country: l.country || "GB",
        rating: l.rating ?? null,
        review_count: l.review_count ?? 0,
        website_url: l.website_url ?? null,
        phone: l.phone ?? null,
        email: l.email ?? null,
        email_status: l.email_status ?? null,
        contact_email: l.contact_email ?? null,
        contact_full_name: l.contact_full_name ?? null,
        contact_enrichment_status: l.contact_enrichment_status ?? null,
        domain: l.domain ?? null,
        linkedin_url: l.linkedin_url ?? null,
        facebook_url: l.facebook_url ?? null,
        instagram_url: l.instagram_url ?? null,
        twitter_handle: l.twitter_handle ?? null,
        status: l.status,
        hot_score: l.hot_score ?? 0,
        list_id: l.list_id ?? null,
        source: l.source ?? "outscraper",
        notes: l.notes ?? null,
        created_at: l.created_at,
      }));

      return { leads: mapped, total: result.total };
    },
    staleTime: 30_000,
  });

  const leads = leadsQuery.data?.leads ?? [];
  const totalCount = leadsQuery.data?.total ?? 0;
  const loading = leadsQuery.isLoading;
  const error = leadsQuery.error
    ? `Unable to reach API server. (${(leadsQuery.error as Error).message.split("\n")[0]})`
    : null;

  const triggerRefetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [queryClient]);

  // List operations
  const handleListSelect = useCallback((listId: string | null) => {
    setActiveListId(listId);
  }, []);

  const handleCreateList = useCallback(async (name: string) => {
    try {
      const newList = await api.lists.create({ name, color: "#6366f1" });
      setLists((prev) => [...prev, { id: newList.id, name, count: 0, color: "#6366f1" }]);
    } catch { /* */ }
  }, []);

  const handleDeleteList = useCallback(async (listId: string) => {
    try {
      await api.lists.delete(listId);
      setLists((prev) => prev.filter((l) => l.id !== listId));
      if (activeListId === listId) setActiveListId(null);
    } catch { /* */ }
  }, [activeListId]);

  const handleRenameList = useCallback(async (listId: string, name: string) => {
    try {
      await api.lists.update(listId, { name });
      setLists((prev) => prev.map((l) => (l.id === listId ? { ...l, name } : l)));
    } catch { /* */ }
  }, []);

  const handleFilterApply = useCallback((f: Record<string, any>) => {
    if (f.status) setStatusFilter(f.status);
    if (f.search) setSearchTerm(f.search);
  }, []);

  // Stable callbacks for LeadsTable — avoids new fn refs each render
  const handleRowClick = useCallback((id: string) => {
    window.location.href = `/leads/${id}`;
  }, []);

  const handleEnrich = useCallback(async (id: string) => {
    try {
      await api.leadActions.enrichContact(id);
      triggerRefetch();
    } catch (e: any) {
      if (e instanceof UpgradeRequiredError) { setUpgradeError(e); }
      else { alert(e.message); }
    }
  }, [triggerRefetch]);

  const handleVerify = useCallback(async (id: string) => {
    try {
      await api.leadActions.verifyEmail(id);
      triggerRefetch();
    } catch (e: any) {
      if (e instanceof UpgradeRequiredError) { setUpgradeError(e); }
      else { alert(e.message); }
    }
  }, [triggerRefetch]);

  // Bulk actions
  const selectedLeads = useMemo(() => leads.filter((l) => selectedIds.has(l.id)), [leads, selectedIds]);

  const handleBulkEnrich = useCallback(async () => {
    for (const id of selectedIds) {
      try { await api.leadActions.enrichContact(id); } catch (e: any) {
        if (e instanceof UpgradeRequiredError) { setUpgradeError(e); break; }
      }
    }
    setSelectedIds(new Set());
    triggerRefetch();
  }, [selectedIds, triggerRefetch]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">My Leads</h1>
            <p className="text-sm text-text-muted mt-1">
              {loading ? "Loading..." : `${totalCount} leads`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a href="http://localhost:3001/leads/export" className="btn btn-secondary text-xs py-1.5 h-9">
              <Download className="w-3.5 h-3.5" />
              Export
            </a>
            <Link href="/leads/import" className="btn btn-secondary text-xs py-1.5 h-9">
              <Plus className="w-3.5 h-3.5" />
              Import
            </Link>
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary text-xs py-1.5 h-9">
              <Plus className="w-3.5 h-3.5" />
              Add Lead
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
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
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer min-h-[36px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red mb-4">
            {error}
            <button onClick={triggerRefetch} className="ml-3 underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Upgrade prompt */}
        <UpgradePrompt error={upgradeError} onDismiss={() => setUpgradeError(null)} compact />

        {/* Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl border border-border/60 bg-surface animate-pulse" />
            ))}
          </div>
        ) : (
          <LeadsTable
            leads={leads}
            selected={selectedIds}
            onSelectionChange={setSelectedIds}
            onRowClick={handleRowClick}
            onEnrich={handleEnrich}
            onVerify={handleVerify}
          />
        )}

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between mt-3 p-3 rounded-xl bg-blue/5 border border-blue/20">
            <span className="text-sm text-text">
              <strong>{selectedIds.size}</strong> selected
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkEnrich}
                className="btn btn-primary text-xs"
              >
                🔍 Enrich — {selectedIds.size} credits
              </button>
              <button onClick={handleClearSelection} className="btn btn-ghost text-xs">Clear</button>
            </div>
          </div>
        )}



        {!loading && totalCount > 0 && (
          <div className="text-center text-xs text-text-faint py-2">
            Showing {leads.length} of {totalCount} leads
          </div>
        )}

        {!loading && totalCount === 0 && (
          <div className="card text-center py-12">
            <UserPlus className="w-10 h-10 text-text-faint mx-auto mb-3" />
            <p className="text-sm text-text-muted">No leads yet.</p>
            <Link href="/search/google-maps" className="text-sm text-blue hover:underline mt-1 inline-block">Search Google Maps →</Link>
          </div>
        )}
      </div>

      {/* Add Lead Modal */}
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
              {saving ? "Saving..." : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
