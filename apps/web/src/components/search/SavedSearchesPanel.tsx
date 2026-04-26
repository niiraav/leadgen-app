import { useState, useEffect } from "react";
import { Star, ChevronRight, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import type { SearchFilters } from "./types";

interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
  created_at: string;
}

interface SavedSearchesPanelProps {
  onApply: (filters: SearchFilters) => void;
  refreshToken?: number;
}

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

function compactSummary(filters: Record<string, unknown>): string {
  const parts: string[] = [];
  if (filters.query) parts.push(String(filters.query));
  if (filters.location) parts.push(String(filters.location));
  if (filters.maxResults && filters.maxResults !== 25) {
    parts.push(`${filters.maxResults} results`);
  }
  if (filters.websiteFilter === 'has') {
    parts.push("Has website");
  } else if (filters.websiteFilter === 'no') {
    parts.push("No website");
  } else if (filters.noWebsite === true || filters.no_website === true) {
    parts.push("No website");
  } else if (filters.noWebsite === false || filters.no_website === false) {
    parts.push("Has website");
  }
  return parts.join(" · ") || "All filters";
}

export function SavedSearchesPanel({ onApply, refreshToken }: SavedSearchesPanelProps) {
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    api.filters
      .list()
      .then((data) => {
        if (!mounted) return;
        setSaved(data ?? []);
      })
      .catch(() => {
        if (!mounted) return;
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [refreshToken]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.filters.delete(id);
      setSaved((prev) => prev.filter((f) => f.id !== id));
    } catch {
      // silently fail
    } finally {
      setDeletingId(null);
    }
  };

  const handleApply = (entry: SavedFilter) => {
    const f = entry.filters;
    const filters: SearchFilters = {
      businessType: String(f.query ?? f.businessType ?? ""),
      location: String(f.location ?? ""),
      leadCount: Number(f.maxResults ?? f.leadCount ?? 25),
      websiteFilter: 'any',
    };
    if (f.websiteFilter === 'has' || f.websiteFilter === 'no') {
      filters.websiteFilter = f.websiteFilter as 'has' | 'no';
    } else if (f.noWebsite === true || f.no_website === true) {
      filters.websiteFilter = 'no';
    } else if (f.noWebsite === false || f.no_website === false) {
      filters.websiteFilter = 'has';
    }
    onApply(filters);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card overflow-hidden p-3">
        <div className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1.5">
          <Star className="w-3 h-3" />
          Saved Searches
        </div>
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (saved.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center px-4 pt-3 pb-2">
        <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
          <Star className="w-3 h-3" />
          Saved Searches
        </span>
      </div>

      {/* Content */}
      <div className="px-3 pb-3 space-y-1.5">
        {saved.map((entry) => {
          const isDeleting = deletingId === entry.id;
          return (
            <div
              key={entry.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary transition-colors group/row"
            >
              <button
                onClick={() => {
                  if (isDeleting) return;
                  handleApply(entry);
                }}
                className="flex-1 flex items-center gap-3 min-w-0 text-left"
              >
                <Star className="w-3.5 h-3.5 text-warning shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground font-medium truncate">
                      {entry.name}
                    </span>
                    <span className="text-micro text-muted-foreground shrink-0">
                      {relativeTime(entry.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {compactSummary(entry.filters)}
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-foreground-faint opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
              </button>

              <button
                onClick={() => {
                  if (isDeleting) return;
                  handleDelete(entry.id);
                }}
                className="opacity-0 group-hover/row:opacity-100 text-foreground-faint hover:text-destructive transition-opacity p-1 shrink-0"
                title="Delete saved search"
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
