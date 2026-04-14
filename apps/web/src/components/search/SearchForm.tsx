import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";

interface SearchFormProps {
  onSearch: (query: string, location: string, limit: number) => void;
  loading: boolean;
  recentSearches?: Array<{ query: string; location: string; limit_count: number }>;
  savedFilters?: Array<{ id: string; name: string; filters: Record<string, any> }>;
  onClearForm: () => void;
}

const QUICK_TYPES = [
  { label: "Plumber", emoji: "🔧" },
  { label: "Electrician", emoji: "⚡" },
  { label: "Dentist", emoji: "🦷" },
  { label: "Estate Agent", emoji: "🏠" },
  { label: "Restaurant", emoji: "🍽️" },
  { label: "Accountant", emoji: "📊" },
  { label: "Cleaner", emoji: "🧹" },
  { label: "Hairdresser", emoji: "💇" },
];

export function SearchForm({ onSearch, loading, recentSearches, savedFilters, onClearForm }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(25);
  const [showQuick, setShowQuick] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [showSaved] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  const handleSearch = useCallback(() => {
    if (!query.trim() || !location.trim()) return;
    onSearch(query.trim(), location.trim(), limit);
  }, [query, location, limit, onSearch]);

  const handleRecentClick = useCallback((s: { query: string; location: string; limit_count: number }) => {
    setQuery(s.query);
    setLocation(s.location);
    setLimit(s.limit_count ?? 25);
    setShowRecent(false);
  }, []);

  // Close quick types on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (quickRef.current && !quickRef.current.contains(e.target as Node)) {
        setShowQuick(false);
      }
    };
    if (showQuick) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showQuick]);

  return (
    <div className="space-y-4">
      {/* Business type — with quick chips */}
      <div className="relative" ref={quickRef}>
        <label className="block text-xs font-medium text-text-muted mb-1">Business type</label>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. Plumber, Dentist, Estate Agent..."
          className="input w-full"
          onFocus={() => setShowQuick(true)}
        />
        {showQuick && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl p-3 shadow-xl z-20">
            <div className="text-xs text-text-faint mb-2">Quick select</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TYPES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => { setQuery(t.label); setShowQuick(false); }}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-surface-2 hover:bg-blue/10 text-text transition-colors"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Location */}
      <div>
        <label className="block text-xs font-medium text-text-muted mb-1">Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Manchester, London SE1..."
          className="input w-full"
        />
      </div>

      {/* Leads count slider */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-text-muted">Leads</label>
          <span className="text-xs font-mono text-text">{limit}</span>
        </div>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-text-faint mt-1">
          <span>10</span>
          <span>100</span>
        </div>
      </div>

      {/* Recent searches + Saved filters row */}
      <div className="flex items-center gap-2">
        {recentSearches && recentSearches.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowRecent(!showRecent)}
              className="text-xs text-text-faint hover:text-text transition-colors flex items-center gap-1"
              title="Recent searches"
            >
              🕐 Recent
            </button>
            {showRecent && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-surface border border-border rounded-xl shadow-xl z-20 py-1 max-h-52 overflow-y-auto">
                <div className="px-3 py-1.5 text-xs text-text-muted font-medium">Recent searches</div>
                {recentSearches.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleRecentClick(s)}
                    className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-surface-2 transition-colors"
                  >
                    <span className="font-medium">{s.query}</span>
                    <span className="text-text-muted"> in </span>
                    <span>{s.location}</span>
                    <span className="text-text-muted ml-1">({s.limit_count})</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {savedFilters && savedFilters.length > 0 && (
          <button className="text-xs text-text-muted hover:text-text transition-colors" title="Saved filters">
            ★ Saved filters
          </button>
        )}
      </div>

      {/* Search button */}
      <button
        onClick={handleSearch}
        disabled={loading || !query.trim() || !location.trim()}
        className="btn btn-primary w-full disabled:opacity-50"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        {loading ? "Searching..." : "Search →"}
      </button>
    </div>
  );
}
