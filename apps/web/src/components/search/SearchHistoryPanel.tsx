import { useState } from "react";
import { Search, ChevronRight, X, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchFilters } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  id: string;
  query: string;
  location: string;
  limit_count: number;
  result_count: number | null;
  params: Record<string, any> | null;
  created_at: string;
}

interface SearchHistoryPanelProps {
  recent: HistoryEntry[];
  loading: boolean;
  onRerun: (filters: SearchFilters) => void;
  onDeleteRecent: (id: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

function filterCount(filters: Record<string, any>): number {
  let count = 0;
  if (filters.websiteFilter && filters.websiteFilter !== 'any') count++;
  // Backward compat: legacy entries used hasWebsite/noWebsite
  if (filters.hasWebsite !== undefined || filters.noWebsite !== undefined || filters.no_website !== undefined) count++;
  if (filters.leadCount && filters.leadCount !== 25) count++;
  return count;
}

function filterSummary(entry: HistoryEntry): string[] {
  const parts: string[] = [];
  const filters = entry.params ?? {};
  parts.push(`${entry.query} in ${entry.location}`);
  if (filters.maxResults && filters.maxResults !== 25) {
    parts.push(`${filters.maxResults} results`);
  }
  // New format
  if (filters.websiteFilter === 'has') {
    parts.push("Has website");
  } else if (filters.websiteFilter === 'no') {
    parts.push("No website");
  }
  // Legacy format
  else if (filters.noWebsite === true || filters.no_website === true) {
    parts.push("No website");
  } else if (filters.noWebsite === false || filters.no_website === false) {
    parts.push("Has website");
  }
  return parts;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SearchHistoryPanel({
  recent,
  loading,
  onRerun,
  onDeleteRecent,
}: SearchHistoryPanelProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const displayRecent = recent.slice(0, 5);

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden p-3">
        <div className="text-xs text-gray-400 mb-2 font-medium">Recently Searched</div>
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (displayRecent.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 pt-3 pb-2">
        <span className="text-xs font-medium text-gray-900">Recently Searched</span>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 space-y-1.5">
        {displayRecent.map((entry) => {
          const filters = entry.params ?? {};
          const fCount = filterCount(filters);
          const isDeleting = deletingId === entry.id;

          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors group/row"
            >
              <button
                onClick={() => {
                  if (isDeleting) return;
                  // Re-run from structured params, not concatenated string
                  const params = entry.params ?? {};
                  const sf: SearchFilters = {
                    businessType: params.query ?? entry.query,
                    location: params.location ?? entry.location,
                    leadCount: params.maxResults ?? entry.limit_count ?? 25,
                    websiteFilter: 'any',
                  };
                  if (params.websiteFilter === 'has' || params.websiteFilter === 'no') {
                    sf.websiteFilter = params.websiteFilter;
                  } else if (
                    params.noWebsite === true ||
                    params.no_website === true
                  ) {
                    sf.websiteFilter = 'no';
                  } else if (
                    params.noWebsite === false ||
                    params.no_website === false
                  ) {
                    sf.websiteFilter = 'has';
                  }
                  onRerun(sf);
                }}
                className="flex-1 flex items-center gap-3 min-w-0 text-left"
              >
                <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-900 font-medium truncate">
                      {entry.query}
                    </span>
                    {fCount > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 shrink-0">
                        {fCount} Filter{fCount > 1 ? "s" : ""}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {relativeTime(entry.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 truncate mt-0.5">
                    {filterSummary(entry).join(" · ")}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-gray-400 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
              </button>

              <button
                onClick={() => {
                  if (isDeleting) return;
                  setDeletingId(entry.id);
                  onDeleteRecent(entry.id);
                }}
                className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-red-600 transition-opacity p-1 shrink-0"
                title="Delete recent search"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
