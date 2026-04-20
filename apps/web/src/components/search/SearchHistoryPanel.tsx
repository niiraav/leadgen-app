import { useState, useCallback } from "react";
import { Search, Star, ChevronRight, X, Loader2, Check } from "lucide-react";
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

interface SavedEntry {
  id: string;
  name: string;
  filters: Record<string, any>;
  created_at: string;
}

interface SearchHistoryPanelProps {
  recent: HistoryEntry[];
  saved: SavedEntry[];
  loading: boolean;
  onRerun: (filters: SearchFilters) => void;
  onDeleteSaved: (id: string) => void;
  onSaveCurrent?: (name: string) => void;
  hasCurrentSearch?: boolean;
  currentFilters?: SearchFilters | null;
  /** Hide recent tab after a search has been executed */
  hideRecent?: boolean;
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
  // Count non-empty filter values (exclude businessType/location which are always present)
  let count = 0;
  if (filters.hasWebsite !== undefined) count++;
  if (filters.minRating !== undefined) count++;
  if (filters.maxReviews !== undefined) count++;
  if (filters.leadCount && filters.leadCount !== 25) count++;
  return count;
}

function filterSummary(filters: Record<string, any>): string[] {
  const parts: string[] = [];
  if (filters.businessType) parts.push(`Type: ${filters.businessType}`);
  if (filters.location) parts.push(`Location: ${filters.location}`);
  if (filters.hasWebsite === true) parts.push("Has website");
  if (filters.hasWebsite === false) parts.push("No website");
  if (filters.minRating) parts.push(`Rating: ${filters.minRating}+`);
  if (filters.maxReviews) parts.push(`Reviews: ≤${filters.maxReviews}`);
  return parts;
}

// ─── Component ───────────────────────────────────────────────────────────────

type Tab = "recent" | "saved";

export function SearchHistoryPanel({
  recent,
  saved,
  loading,
  onRerun,
  onDeleteSaved,
  onSaveCurrent,
  hasCurrentSearch,
  currentFilters,
  hideRecent,
}: SearchHistoryPanelProps) {
  const [tab, setTab] = useState<Tab>(hideRecent ? "saved" : "recent");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    const trimmed = saveName.trim();
    if (!trimmed || !onSaveCurrent) return;
    setSaving(true);
    try {
      await onSaveCurrent(trimmed);
      setSaveName("");
      setShowSaveInput(false);
      setTab("saved");
    } finally {
      setSaving(false);
    }
  }, [saveName, onSaveCurrent]);

  const displayRecent = recent.slice(0, 5);
  const displaySaved = saved;

  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        {!hideRecent && (
          <button
            onClick={() => setTab("recent")}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              tab === "recent"
                ? "bg-text text-surface"
                : "bg-transparent border border-border text-text-muted hover:text-text"
            }`}
          >
            Recently Searched
          </button>
        )}
        <button
          onClick={() => setTab("saved")}
          className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors flex items-center gap-1 ${
            tab === "saved"
              ? "bg-text text-surface"
              : "bg-transparent border border-border text-text-muted hover:text-text"
          }`}
        >
          Recently Saved
          {displaySaved.length > 0 && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === "saved" ? "bg-surface/20 text-surface" : "bg-surface-2 text-text-faint"
            }`}>
              {displaySaved.length}
            </span>
          )}
        </button>

        {/* Save current search button — only if a search has been run */}
        {hasCurrentSearch && onSaveCurrent && (
          <div className="ml-auto">
            {showSaveInput ? (
              <div className="flex items-center gap-1">
                <input
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") {
                      setSaveName("");
                      setShowSaveInput(false);
                    }
                  }}
                  placeholder="Search name..."
                  className="h-7 w-32 text-xs bg-surface-2 border border-border rounded-lg px-2 text-text focus:outline-none focus:ring-1 focus:ring-blue/20"
                  autoFocus
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !saveName.trim()}
                  className="p-1 rounded hover:bg-surface-2 disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-green" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setSaveName("");
                    setShowSaveInput(false);
                  }}
                  className="p-1 rounded hover:bg-surface-2 text-text-faint"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  // Pre-fill name from current filters
                  if (currentFilters) {
                    const base = `${currentFilters.businessType} in ${currentFilters.location}`;
                    setSaveName(base.length > 30 ? base.slice(0, 30) : base);
                  }
                  setShowSaveInput(true);
                }}
                className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-border-strong transition-colors flex items-center gap-1"
              >
                <Star className="w-3 h-3" />
                Save
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="px-3 pb-3">
        {loading ? (
          <div className="space-y-2 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 bg-surface-2 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : tab === "recent" ? (
          displayRecent.length === 0 ? (
            <p className="text-xs text-text-faint text-center py-6">
              No recent searches yet
            </p>
          ) : (
            <div className="space-y-1.5">
              {displayRecent.map((entry) => {
                const filters = entry.params ?? {};
                const fCount = filterCount(filters);
                return (
                  <button
                    key={entry.id}
                    onClick={() => {
                      const sf: SearchFilters = {
                        businessType: entry.query,
                        location: entry.location,
                        leadCount: entry.limit_count ?? 25,
                        ...(filters.hasWebsite !== undefined && {
                          hasWebsite: filters.hasWebsite,
                        }),
                        ...(filters.minRating !== undefined && {
                          minRating: filters.minRating,
                        }),
                        ...(filters.maxReviews !== undefined && {
                          maxReviews: filters.maxReviews,
                        }),
                      };
                      onRerun(sf);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors group/row text-left"
                  >
                    <Search className="w-3.5 h-3.5 text-text-faint shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-text font-medium truncate">
                          {entry.query}
                        </span>
                        {fCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-2 text-text-faint shrink-0">
                            {fCount} Filter{fCount > 1 ? "s" : ""}
                          </span>
                        )}
                        <span className="text-[10px] text-text-faint shrink-0">
                          {relativeTime(entry.created_at)}
                        </span>
                      </div>
                      <p className="text-xs text-text-faint truncate mt-0.5">
                        {filterSummary({ ...filters, businessType: entry.query, location: entry.location }).join(" · ")}
                      </p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-text-faint opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
                  </button>
                );
              })}
            </div>
          )
        ) : displaySaved.length === 0 ? (
            <p className="text-xs text-text-faint text-center py-6">
              No saved searches yet
            </p>
          ) : (
            <div className="space-y-1.5">
              {displaySaved.map((entry) => {
                const f = entry.filters ?? {};
                const fCount = filterCount(f);
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-2 transition-colors group/row"
                  >
                    <button
                      onClick={() => {
                        const sf: SearchFilters = {
                          businessType: f.businessType ?? "",
                          location: f.location ?? "",
                          leadCount: f.leadCount ?? 25,
                          ...(f.hasWebsite !== undefined && {
                            hasWebsite: f.hasWebsite,
                          }),
                          ...(f.minRating !== undefined && {
                            minRating: f.minRating,
                          }),
                          ...(f.maxReviews !== undefined && {
                            maxReviews: f.maxReviews,
                          }),
                        };
                        onRerun(sf);
                      }}
                      className="flex-1 flex items-center gap-3 min-w-0 text-left"
                    >
                      <Star className="w-3.5 h-3.5 text-amber shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-text font-medium truncate">
                            {entry.name}
                          </span>
                          {fCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber/10 text-amber shrink-0">
                              {fCount} Filter{fCount > 1 ? "s" : ""}
                            </span>
                          )}
                          <span className="text-[10px] text-text-faint shrink-0">
                            {relativeTime(entry.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-text-faint truncate mt-0.5">
                          {filterSummary(f).join(" · ")}
                        </p>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-text-faint opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0" />
                    </button>
                    <button
                      onClick={() => onDeleteSaved(entry.id)}
                      className="opacity-0 group-hover/row:opacity-100 text-text-faint hover:text-red transition-opacity p-1 shrink-0"
                      title="Delete saved search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
