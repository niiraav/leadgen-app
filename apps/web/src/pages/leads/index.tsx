import { withAuth } from "@/lib/auth";
import { useState, useCallback, useMemo, useEffect } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { api, UpgradeRequiredError } from "@/lib/api";
import { Search, Download, Plus, UserPlus, X, Mail, MessageSquare, Loader2, Star } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { LeadsTable, type LeadsTableRow } from "@/components/leads/LeadsTable";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import { BulkStatusDropdown } from "@/components/leads/BulkStatusDropdown";
import { resolveStatusPatch, type LeadDomainFields } from "@/lib/lead-domains";

// ── Inline WhatsApp icon (same paths as Frame.svg) ────────────────────────────
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M2.99169 16.3417C3.13873 16.7126 3.17147 17.119 3.08569 17.5087L2.02069 20.7987C1.98638 20.9655 1.99525 21.1384 2.04647 21.3008C2.09769 21.4633 2.18955 21.61 2.31336 21.727C2.43716 21.844 2.5888 21.9274 2.75389 21.9693C2.91898 22.0113 3.09205 22.0104 3.25669 21.9667L6.66969 20.9687C7.03741 20.8958 7.41822 20.9276 7.76869 21.0607C9.90408 22.0579 12.3231 22.2689 14.5988 21.6564C16.8746 21.0439 18.861 19.6473 20.2074 17.7131C21.5538 15.7788 22.1738 13.4311 21.958 11.0842C21.7422 8.73738 20.7044 6.54216 19.0278 4.88589C17.3511 3.22962 15.1434 2.21873 12.7941 2.03159C10.4448 1.84445 8.10483 2.49308 6.18713 3.86303C4.26944 5.23299 2.89722 7.23624 2.31258 9.51933C1.72795 11.8024 1.96846 14.2186 2.99169 16.3417Z"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.3004 16.453C9.60317 15.4492 8.34487 14.0436 7.26764 12.3885C6.75659 11.6033 6.42625 11.0853 6.1385 10.0774C5.76172 8.75759 6.30795 6.83683 7.69747 6.28767C7.88425 6.21383 8.67224 6.25029 8.8627 6.38175C9.28091 6.77017 9.48102 7.72073 9.71566 8.26027C9.83126 8.59292 9.98316 8.89215 10.0757 9.23401C10.1496 9.50753 9.96894 9.67568 9.87235 9.87474C9.74594 10.1352 8.94028 10.7573 9.05542 11.0216C9.6038 12.2805 10.6714 13.4313 11.8002 14.2072C12.2664 14.5224 12.9039 14.9099 13.4418 14.9699C13.8369 14.9513 14.719 13.4091 15.0296 13.4695C15.6838 13.597 17.0862 14.4616 17.7457 14.79C17.8532 14.8434 17.9605 14.954 17.9709 15.0585C18.015 15.502 17.8222 16.3027 17.551 16.6516C17.1259 17.1858 16.3638 17.6055 15.6952 17.7098C14.5464 17.8888 13.3978 17.3754 12.3544 16.9642C12.1389 16.8793 11.528 16.6149 11.3633 16.4745L11.3004 16.453Z"
        fill="currentColor"
      />
    </svg>
  );
}

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "", label: "All Status" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "replied", label: "Replied" },
  { value: "interested", label: "Interested" },
  { value: "not_interested", label: "Lost" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
  { value: "converted", label: "Converted" },
  { value: "out_of_office", label: "Out of Office" },
  { value: "archived", label: "Archived" },
];

// Map UI sort field → API sort field. last_activity is not yet server-side so we proxy via created_at.
function apiSortField(field: string): string {
  if (field === "last_activity") return "created_at";
  if (field === "business_name") return "business_name";
  if (field === "status") return "status";
  return "created_at";
}

export default function LeadsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sortField, setSortField] = useState("last_activity");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [bulkStatusMsg, setBulkStatusMsg] = useState<string | null>(null);

  // Modals
  const [composeLead, setComposeLead] = useState<LeadsTableRow | null>(null);
  const [messagePicker, setMessagePicker] = useState<{ lead: LeadsTableRow; channel: "whatsapp" | "sms" } | null>(null);
  const [sequencePickerOpen, setSequencePickerOpen] = useState(false);
  const [sequencePickerTarget, setSequencePickerTarget] = useState<{ leadId?: string }>({});
  const [noteModalLeadId, setNoteModalLeadId] = useState<string | null>(null);

  // Clear selection when filters / sort change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [statusFilter, sortField, sortOrder, searchTerm]);

  // Sequences
  const sequencesQuery = useQuery({
    queryKey: ["sequences"],
    queryFn: () => api.sequences.list(),
    staleTime: 5 * 60 * 1000,
  });

  // Cursor-based pagination via useInfiniteQuery
  const leadsQuery = useInfiniteQuery({
    queryKey: ["leads", { statusFilter, sortField, sortOrder, searchTerm }],
    queryFn: async ({ pageParam }: { pageParam?: string }) => {
      const result = await api.leads.list({
        limit: PAGE_SIZE,
        cursor: pageParam,
        status: statusFilter || undefined,
        search: searchTerm || undefined,
        sortField: apiSortField(sortField),
        sortOrder,
      });

      const mapped: LeadsTableRow[] = result.data.map((l: any) => ({
        id: String(l.id),
        business_name: l.business_name || "Unknown",
        email: l.email ?? null,
        email_status: l.email_status ?? null,
        phone: l.phone ?? null,
        status: l.status,
        engagementStatus: l.engagement_status ?? null,
        pipelineStage: l.pipeline_stage ?? null,
        doNotContact: l.do_not_contact ?? false,
        category: l.category ?? null,
        lastActivity: l.lastActivity
          ? {
              label: l.lastActivity.label,
              timestamp: new Date(l.lastActivity.timestamp),
              ...(l.lastActivity.replyIntent ? { replyIntent: l.lastActivity.replyIntent } : {}),
            }
          : null,
      }));

      return { rows: mapped, nextCursor: result.nextCursor, total: result.total };
    },
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 30_000,
  });

  const leads = useMemo(() => leadsQuery.data?.pages.flatMap((p) => p.rows) ?? [], [leadsQuery.data]);
  const totalCount = useMemo(() => leadsQuery.data?.pages[0]?.total ?? 0, [leadsQuery.data]);
  const loading = leadsQuery.isLoading || leadsQuery.isFetching;
  const error = leadsQuery.error
    ? `Unable to reach API server. (${(leadsQuery.error as Error).message.split("\n")[0]})`
    : null;

  const triggerRefetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  }, [queryClient]);

  const selectedLeads = useMemo(() => leads.filter((l) => selectedIds.has(l.id)), [leads, selectedIds]);

  // ── Sort ──
  const handleSortChange = useCallback(
    (field: string) => {
      setSortField((prev) => {
        if (prev === field) {
          setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
          return prev;
        }
        setSortOrder(field === "business_name" ? "asc" : "desc");
        return field;
      });
    },
    []
  );

  // ── Row actions ──
  const handleStatusChange = useCallback(
    async (leadId: string, patch: Record<string, unknown>) => {
      try {
        await api.leads.update(leadId, patch);
        triggerRefetch();
      } catch (e: any) {
        alert(e.message || "Failed to update status");
      }
    },
    [triggerRefetch]
  );

  const handleEmailCompose = useCallback((lead: LeadsTableRow) => setComposeLead(lead), []);
  const handleWhatsApp = useCallback((lead: LeadsTableRow) => setMessagePicker({ lead, channel: "whatsapp" }), []);
  const handleSMS = useCallback((lead: LeadsTableRow) => setMessagePicker({ lead, channel: "sms" }), []);

  const handleAddToSequence = useCallback((leadId: string) => {
    setSequencePickerTarget({ leadId });
    setSequencePickerOpen(true);
  }, []);

  const handleExportLead = useCallback((leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const csv = `Business Name,Email,Phone,Status\n"${lead.business_name}","${lead.email || ""}","${lead.phone || ""}","${lead.status}"`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lead.business_name}-lead.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [leads]);

  const handleAddNote = useCallback((leadId: string) => setNoteModalLeadId(leadId), []);

  const handleGlobalExport = useCallback(async () => {
    try {
      const csv = await api.leads.exportCSV();
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "leads-export.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.message || "Export failed");
    }
  }, []);

  const handleToggleDNC = useCallback(
    async (leadId: string, current: boolean) => {
      try {
        await api.leads.update(leadId, { do_not_contact: !current });
        triggerRefetch();
      } catch (e: any) {
        alert(e.message || "Failed to update DNC");
      }
    },
    [triggerRefetch]
  );

  // ── Bulk actions ──
  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkStatusChange = useCallback(
    async (chosenValue: string) => {
      let moved = 0;
      let skipped = 0;

      for (const lead of selectedLeads) {
        const fields: LeadDomainFields = {
          engagementStatus: lead.engagementStatus,
          pipelineStage: lead.pipelineStage,
          lifecycleState: null,
          status: lead.status,
          doNotContact: !!lead.doNotContact,
        };

        const patch = resolveStatusPatch(fields, chosenValue);
        if (!patch) {
          skipped++;
          continue;
        }

        if ("__toggle_dnc__" in patch) {
          try {
            await api.leads.update(lead.id, { do_not_contact: !fields.doNotContact });
            moved++;
          } catch {
            skipped++;
          }
          continue;
        }

        try {
          await api.leads.update(lead.id, patch);
          moved++;
        } catch {
          skipped++;
        }
      }

      const parts: string[] = [];
      if (moved > 0) parts.push(`${moved} lead${moved === 1 ? "" : "s"} updated`);
      if (skipped > 0) parts.push(`${skipped} skipped (wrong domain or error)`);
      setBulkStatusMsg(parts.join(". ") || "No changes made");
      setTimeout(() => setBulkStatusMsg(null), 5000);

      setSelectedIds(new Set());
      triggerRefetch();
    },
    [selectedLeads, triggerRefetch]
  );

  const handleBulkExportSelected = useCallback(() => {
    if (selectedLeads.length === 0) return;
    const csv = [
      "Business Name,Email,Phone,Status",
      ...selectedLeads.map(
        (l) => `"${l.business_name}","${l.email || ""}","${l.phone || ""}","${l.status}"`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "selected-leads.csv";
    a.click();
    URL.revokeObjectURL(url);
    setSelectedIds(new Set());
  }, [selectedLeads]);

  const handleBulkMarkDNC = useCallback(async () => {
    let marked = 0;
    let skipped = 0;
    for (const lead of selectedLeads) {
      if (lead.doNotContact) {
        skipped++;
        continue;
      }
      try {
        await api.leads.update(lead.id, { do_not_contact: true });
        marked++;
      } catch {
        skipped++;
      }
    }
    const parts: string[] = [];
    if (marked > 0) parts.push(`${marked} marked Do Not Contact`);
    if (skipped > 0) parts.push(`${skipped} already DNC`);
    setBulkStatusMsg(parts.join(". ") || "No changes made");
    setTimeout(() => setBulkStatusMsg(null), 5000);
    setSelectedIds(new Set());
    triggerRefetch();
  }, [selectedLeads, triggerRefetch]);

  const handleBulkAddToSequence = useCallback(() => {
    setSequencePickerTarget({});
    setSequencePickerOpen(true);
  }, []);

  const handleSequenceSelect = useCallback(
    (sequenceId: string) => {
      setSequencePickerOpen(false);
      if (sequencePickerTarget.leadId) {
        // Single lead — redirect to enroll page (pre-select in UI not supported by existing enroll page)
        router.push(`/sequences/${sequenceId}/enroll`);
      } else {
        // Bulk — redirect to enroll page
        router.push(`/sequences/${sequenceId}/enroll`);
      }
    },
    [router, sequencePickerTarget.leadId]
  );

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
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
            <button onClick={handleGlobalExport} className="btn btn-secondary text-xs py-1.5 h-9">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
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
              onKeyDown={(e) => {
                if (e.key === "Enter") triggerRefetch();
              }}
              className="input pl-9 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 px-3 text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-blue/20 cursor-pointer min-h-[36px]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red mb-4">
            {error}
            <button onClick={triggerRefetch} className="ml-3 underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {/* Upgrade prompt */}
        <UpgradePrompt error={upgradeError} onDismiss={() => setUpgradeError(null)} compact />

        {/* Table */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="shrink-0 mb-3 p-3 rounded-xl bg-blue/5 border border-blue/20 flex items-center justify-between gap-3 z-20">
              <span className="text-sm text-text whitespace-nowrap">
                <strong>{selectedIds.size}</strong> selected
                {bulkStatusMsg && (
                  <span className="ml-3 text-xs text-blue">{bulkStatusMsg}</span>
                )}
              </span>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <BulkStatusDropdown onApply={handleBulkStatusChange} />
                <button
                  onClick={handleBulkExportSelected}
                  className="btn btn-secondary text-xs py-1.5 h-9"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
                <button
                  onClick={handleBulkMarkDNC}
                  className="btn btn-ghost text-xs py-1.5 h-9 text-red hover:bg-red/5"
                >
                  Mark DNC
                </button>
                <button
                  onClick={handleBulkAddToSequence}
                  className="btn btn-secondary text-xs py-1.5 h-9"
                >
                  Add to sequence
                </button>
                <button onClick={handleClearSelection} className="btn btn-ghost text-xs py-1.5 h-9">
                  Clear
                </button>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-auto">
            {loading && leads.length === 0 ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-xl border border-border/60 bg-surface animate-pulse" />
                ))}
              </div>
            ) : (
              <LeadsTable
                leads={leads}
                loading={leadsQuery.isFetchingNextPage}
                selected={selectedIds}
                onSelectionChange={setSelectedIds}
                onStatusChange={handleStatusChange}
                sortField={sortField}
                sortOrder={sortOrder}
                onSortChange={handleSortChange}
                onEmailCompose={handleEmailCompose}
                onWhatsApp={handleWhatsApp}
                onSMS={handleSMS}
                onAddToSequence={handleAddToSequence}
                onExportLead={handleExportLead}
                onAddNote={handleAddNote}
                onToggleDNC={handleToggleDNC}
              />
            )}
          </div>

        {/* Pagination / Load more */}
        {!loading && leads.length > 0 && (
          <div className="flex items-center justify-between text-xs text-text-faint py-2 mt-1 shrink-0">
            <span>
              Showing {leads.length} of {totalCount} leads
            </span>
            {leadsQuery.hasNextPage && (
              <button
                onClick={() => leadsQuery.fetchNextPage()}
                disabled={leadsQuery.isFetchingNextPage}
                className="btn btn-ghost text-xs h-8 disabled:opacity-50"
              >
                {leadsQuery.isFetchingNextPage ? "Loading..." : "Load more"}
              </button>
            )}
          </div>
        )}

        {!loading && totalCount === 0 && (
          <div className="card text-center py-12">
            <UserPlus className="w-10 h-10 text-text-faint mx-auto mb-3" />
            <p className="text-sm text-text-muted">No leads yet.</p>
            <Link href="/search/google-maps" className="text-sm text-blue hover:underline mt-1 inline-block">
              Search Google Maps →
            </Link>
          </div>
        )}
        </div>
      </div>

      {/* Modals */}
      {showAddModal && (
        <AddLeadModal onClose={() => setShowAddModal(false)} onAdded={() => { triggerRefetch(); setShowAddModal(false); }} />
      )}

      {composeLead && (
        <ComposeModal lead={composeLead} onClose={() => setComposeLead(null)} />
      )}

      {messagePicker && (
        <MessagePickerModal
          lead={messagePicker.lead}
          channel={messagePicker.channel}
          onClose={() => setMessagePicker(null)}
        />
      )}

      {sequencePickerOpen && (
        <SequencePickerModal
          sequences={sequencesQuery.data ?? []}
          onSelect={handleSequenceSelect}
          onClose={() => setSequencePickerOpen(false)}
        />
      )}

      {noteModalLeadId && (
        <NoteModal
          leadId={noteModalLeadId}
          onClose={() => setNoteModalLeadId(null)}
          onSave={async (text) => {
            try {
              await api.leadActions.updateNotes(noteModalLeadId, text);
              triggerRefetch();
            } catch (e: any) {
              alert(e.message || "Failed to save note");
            }
            setNoteModalLeadId(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Compose Email Modal ───────────────────────────────────────────────────

function ComposeModal({ lead, onClose }: { lead: LeadsTableRow; onClose: () => void }) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [fullLead, setFullLead] = useState<any>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setScanError(null);

    api.leads
      .get(lead.id)
      .then((l) => {
        if (cancelled) return;
        setFullLead(l);
        const params: any = {
          tone: "professional",
          purpose: "Introduction and outreach for lead generation automation",
        };
        if (l.ai_bio) params.bio = l.ai_bio;
        if (l.review_summary) params.review_summary = JSON.stringify(l.review_summary);
        if (l.owner_first_name) params.owner_first_name = l.owner_first_name;
        return api.ai.composeEmail(lead.id, params);
      })
      .then((res: any) => {
        if (cancelled) return;
        setSubject(res.email.subject);
        setBody(res.email.body);
      })
      .catch(() => {
        if (cancelled) return;
        setSubject(`Hi ${lead.business_name}`);
        setBody(`Hi ${lead.business_name},\n\nI noticed your business and wanted to reach out about lead generation.\n\nBest regards`);
      })
      .finally(() => setLoading(false));

    return () => { cancelled = true; };
  }, [lead.id]);

  const handleScanReviews = useCallback(async () => {
    if (!lead.id) return;
    setScanning(true);
    setScanError(null);
    try {
      const result = await api.leadActions.fetchReviews(lead.id);
      if (result.success && result.review_summary) {
        const updated = { ...fullLead, review_summary: result.review_summary, reviews_fetched_at: new Date().toISOString() };
        setFullLead(updated);
        const params: any = {
          tone: "professional",
          purpose: "Introduction and outreach for lead generation automation",
        };
        if (updated.ai_bio) params.bio = updated.ai_bio;
        if (updated.review_summary) params.review_summary = JSON.stringify(updated.review_summary);
        if (updated.owner_first_name) params.owner_first_name = updated.owner_first_name;
        const res = await api.ai.composeEmail(lead.id, params);
        setSubject(res.email.subject);
        setBody(res.email.body);
      } else if (result.success) {
        setScanError("No review insights were found for this business.");
      } else {
        setScanError(result.error || "Failed to scan reviews");
      }
    } catch (e: any) {
      setScanError(e.message || "Failed to scan reviews");
    } finally {
      setScanning(false);
    }
  }, [lead.id, fullLead]);

  const mailto = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    : "";

  const showScanPrompt = !loading && !scanning && fullLead && !fullLead.review_summary && (fullLead.place_id || fullLead.business_name);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">Compose Email to {lead.business_name}</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {loading && (
            <div className="text-sm text-text-muted flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating email…
            </div>
          )}

          {/* Review scan prompt */}
          {showScanPrompt && (
            <div className="bg-amber/5 border border-amber/20 rounded-lg p-3 space-y-2">
              <p className="text-xs text-amber">
                Scan customer reviews to discover what makes this business unique and personalize your outreach.
              </p>
              <button
                onClick={handleScanReviews}
                disabled={scanning}
                className="btn btn-primary text-xs py-1.5 h-8 flex items-center gap-1.5"
              >
                <Star className="w-3.5 h-3.5" />
                Scan reviews for insights
              </button>
              {scanError && <p className="text-xs text-red mt-1">{scanError}</p>}
            </div>
          )}

          {scanning && (
            <div className="text-sm text-text-muted flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Scanning reviews…
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Subject</label>
            <input
              className="w-full rounded-md border border-border/60 bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Body</label>
            <textarea
              className="w-full h-40 rounded-md border border-border/60 bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 resize-y"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn btn-ghost text-sm flex-1">
              Close
            </button>
            <a
              href={mailto}
              onClick={onClose}
              className="btn btn-primary text-sm flex-1 text-center inline-flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              Open in Email Client
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Message Picker Modal (WhatsApp / SMS) ──────────────────────────────────

function MessagePickerModal({
  lead,
  channel,
  onClose,
}: {
  lead: LeadsTableRow;
  channel: "whatsapp" | "sms";
  onClose: () => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTpl, setSelectedTpl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [quota, setQuota] = useState({ used: 0, limit: 0 });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const resolvePlaceholders = useCallback(
    (msg: string) => {
      return msg
        .replace(/\{name\}/g, lead.business_name)
        .replace(/\{category\}/g, lead.category || "business")
        .replace(/\{rating\}/g, "great");
    },
    [lead]
  );

  useEffect(() => {
    let cancelled = false;
    api.messagePicker
      .get(lead.id)
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.templates);
        setQuota(res.dailyQuota);
        if (res.templates.length > 0) {
          setSelectedTpl(res.templates[0].id);
          setMessage(resolvePlaceholders(res.templates[0].message));
        }
      })
      .finally(() => setLoading(false));
    return () => { cancelled = true; };
  }, [lead.id, resolvePlaceholders]);

  const handleTemplateChange = (tplId: string) => {
    setSelectedTpl(tplId);
    const tpl = templates.find((t) => t.id === tplId);
    if (tpl) setMessage(resolvePlaceholders(tpl.message));
  };

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      const res = await api.messagePicker.send({
        leadId: lead.id,
        channel,
        message,
        templateId: selectedTpl || undefined,
      });
      if (res.url) window.open(res.url, "_blank");
      onClose();
    } catch (e: any) {
      alert(e.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">
            {channel === "whatsapp" ? "Send WhatsApp" : "Send SMS"} to {lead.business_name}
          </h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {loading && <div className="text-sm text-text-muted">Loading templates…</div>}

          {quota.limit !== -1 && (
            <div className="text-xs text-text-muted">
              Daily quota: {quota.used} / {quota.limit} used
            </div>
          )}

          {templates.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1">Template</label>
              <select
                className="w-full rounded-md border border-border/60 bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
                value={selectedTpl ?? ""}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-text-muted mb-1">Message</label>
            <textarea
              className="w-full h-32 rounded-md border border-border/60 bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 resize-y"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn btn-ghost text-sm flex-1">
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={sending || !message.trim()}
              className="btn btn-primary text-sm flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {channel === "whatsapp" ? <WhatsAppIcon className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sequence Picker Modal ──────────────────────────────────────────────────

function SequencePickerModal({
  sequences,
  onSelect,
  onClose,
}: {
  sequences: any[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">Add to Sequence</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-2 max-h-[320px] overflow-auto">
          {sequences.length === 0 && (
            <p className="text-sm text-text-muted">
              No sequences yet.{" "}
              <Link href="/sequences/new" className="text-blue hover:underline">
                Create one
              </Link>
            </p>
          )}
          {sequences.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full text-left p-3 rounded-lg bg-surface-2 hover:bg-blue/5 border border-border/40 text-sm text-text transition-colors"
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-border/40 flex justify-end">
          <button onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Note Modal ──────────────────────────────────────────────────────────────

function NoteModal({
  leadId,
  onClose,
  onSave,
}: {
  leadId: string;
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">Add Note</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <textarea
            className="input w-full h-32 rounded-md"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write a note…"
          />
        </div>
        <div className="p-4 border-t border-border/40 flex justify-end gap-2">
          <button onClick={onClose} className="btn btn-ghost text-xs">
            Cancel
          </button>
          <button
            onClick={() => onSave(text)}
            disabled={!text.trim()}
            className="btn btn-primary text-xs disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Lead Modal ──────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red/10 border border-red/20 px-4 py-2 text-sm text-red">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-text mb-1">Business name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-focus:outline-none focus:ring-2 focus:ring-blue/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1">Category</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1">City</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1">Website</label>
            <input
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost text-sm flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="btn btn-primary text-sm flex-1 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Add Lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
