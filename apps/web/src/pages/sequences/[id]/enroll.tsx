import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { api } from "@/lib/api";
import { ArrowLeft, Check, Loader2, Search as SearchIcon, UserPlus } from "lucide-react";
import Link from "next/link";

interface Lead {
  id: string;
  business_name: string;
  email: string | null;
  city: string | null;
  category: string | null;
  status: string;
  // Phase 4: domain-specific fields (preferred)
  engagement_status?: string | null;
  pipeline_stage?: string | null;
  do_not_contact?: boolean | null;
}

export default function EnrollPage() {
  const router = useRouter();
  const seqId = router.query.id as string;

  const [seqName, setSeqName] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [enrolling, setEnrolling] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!seqId) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/sequences/${seqId}`, { credentials: "include" }).then((r) => r.json()),
      api.leads.list({ limit: 500 }),
    ]).then(([seq, leadsRes]) => {
      setSeqName(seq.name);
      const available = (leadsRes.data ?? []).filter(
        // Phase 4: use engagement_status first, fallback to legacy status
        // do_not_contact blocks enrollment; pipeline_stage does not affect eligibility
        (l: Lead) =>
          !l.do_not_contact &&
          ((l.engagement_status ?? l.status) === "new" || (l.engagement_status ?? l.status) === "contacted")
      );
      setAllLeads(available);
      setLeads(available);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [seqId]);

  const filterLeads = useCallback(
    (term: string) => {
      const t = term.toLowerCase();
      setLeads(
        allLeads.filter(
          (l) =>
            l.business_name.toLowerCase().includes(t) ||
            (l.city ?? "").toLowerCase().includes(t) ||
            (l.category ?? "").toLowerCase().includes(t) ||
            (l.email ?? "").toLowerCase().includes(t)
        )
      );
    },
    [allLeads]
  );

  const handleSearch = (term: string) => {
    setSearch(term);
    filterLeads(term);
  };

  const toggleLead = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id]
    );
  };

  const enrollSelected = async () => {
    if (selected.length === 0 || !seqId) return;
    setEnrolling(true);
    try {
      const res = await fetch(`/api/sequences/${seqId}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ lead_ids: selected }),
      });
      if (res.ok) {
        setDone(true);
      }
    } catch (err) {
      console.error("Failed to enroll:", err);
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return <div className="space-y-4">
      {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-2 rounded-xl animate-pulse" />)}
    </div>;
  }

  if (done) {
    return (
      <div className="space-y-6">
        <div className="card text-center py-16">
          <div className="mx-auto w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mb-4">
            <Check className="w-6 h-6 text-green" />
          </div>
          <h2 className="text-lg font-bold text-text mb-2">
            {selected.length} lead{selected.length > 1 ? "s" : ""} enrolled!
          </h2>
          <p className="text-sm text-text-muted mb-6">
            Lead{selected.length > 1 ? "s have" : " has"} been added to &quot;{seqName}&quot;
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/leads" className="btn btn-secondary">
              View Leads
            </Link>
            <Link href="/sequences" className="btn btn-ghost">
              Back to Sequences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href={`/sequences/${seqId}`} className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Enroll Leads</h1>
          <p className="text-sm text-text-muted mt-1">Select leads to add to &quot;{seqName}&quot;</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search leads..."
            className="input pl-9"
          />
        </div>
        {selected.length > 0 && (
          <span className="text-xs text-text-muted">{selected.length} selected</span>
        )}
      </div>

      <div className="space-y-2">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => toggleLead(lead.id)}
            className={`rounded-xl border p-4 cursor-pointer transition-all ${
              selected.includes(lead.id)
                ? "border-blue bg-blue/5"
                : "border-border/60 bg-surface hover:bg-surface-2"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                  selected.includes(lead.id)
                    ? "border-blue bg-blue"
                    : "border-border"
                }`}
              >
                {selected.includes(lead.id) && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{lead.business_name}</p>
                <p className="text-xs text-text-muted">
                  {lead.email ?? "No email"}{lead.city ? ` · ${lead.city}` : ""}
                </p>
              </div>
              <span className="text-xs text-text-faint capitalize">
                {lead.do_not_contact ? 'DNC' : (lead.engagement_status ?? lead.status)}
              </span>
            </div>
          </div>
        ))}
        {leads.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-sm text-text-muted">No leads match your search</p>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setSelected([])}
          className="btn btn-ghost text-sm"
        >
          Clear Selection
        </button>
        <button
          onClick={enrollSelected}
          disabled={enrolling || selected.length === 0}
          className="btn btn-primary disabled:opacity-50"
        >
          {enrolling ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Enrolling...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Enroll {selected.length} lead{selected.length !== 1 ? "s" : ""}
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
