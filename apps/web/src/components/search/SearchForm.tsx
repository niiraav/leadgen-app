import { useState, useCallback, useRef, useEffect } from "react";
import { Search, MapPin, Hash, Globe, Star, MessageSquare, Loader2, X } from "lucide-react";
import type { SearchFilterBarProps, SearchFilters } from "./types";

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

export function SearchForm({
  onSearch,
  loading,
  initialFilters,
  onClearForm,
}: SearchFilterBarProps) {
  const [businessType, setBusinessType] = useState(
    initialFilters?.businessType ?? ""
  );
  const [location, setLocation] = useState(initialFilters?.location ?? "");
  const [leadCount, setLeadCount] = useState(
    initialFilters?.leadCount ?? 25
  );
  const [hasWebsite, setHasWebsite] = useState<boolean | undefined>(
    initialFilters?.hasWebsite
  );
  const [minRating, setMinRating] = useState<number | undefined>(
    initialFilters?.minRating
  );
  const [maxReviews, setMaxReviews] = useState<number | undefined>(
    initialFilters?.maxReviews
  );
  const [showQuick, setShowQuick] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  // Sync with initial filters on re-expand
  useEffect(() => {
    if (initialFilters) {
      setBusinessType(initialFilters.businessType ?? "");
      setLocation(initialFilters.location ?? "");
      setLeadCount(initialFilters.leadCount ?? 25);
      setHasWebsite(initialFilters.hasWebsite);
      setMinRating(initialFilters.minRating);
      setMaxReviews(initialFilters.maxReviews);
    }
  }, [initialFilters]);

  const handleSearch = useCallback(() => {
    if (!businessType.trim() || !location.trim()) return;
    const filters: SearchFilters = {
      businessType: businessType.trim(),
      location: location.trim(),
      leadCount,
    };
    if (hasWebsite !== undefined) filters.hasWebsite = hasWebsite;
    if (minRating !== undefined) filters.minRating = minRating;
    if (maxReviews !== undefined) filters.maxReviews = maxReviews;
    onSearch(filters);
  }, [businessType, location, leadCount, hasWebsite, minRating, maxReviews, onSearch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSearch();
    },
    [handleSearch]
  );

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
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Row 1: Business type + Location + Search button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        {/* Business type */}
        <div className="relative flex-1" ref={quickRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
            <input
              type="text"
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              onFocus={() => setShowQuick(true)}
              onKeyDown={handleKeyDown}
              placeholder="Business type"
              className="input w-full pl-9"
            />
          </div>
          {showQuick && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl p-3 shadow-xl z-20">
              <div className="text-xs text-text-faint mb-2">Quick select</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TYPES.map((t) => (
                  <button
                    key={t.label}
                    onClick={() => {
                      setBusinessType(t.label);
                      setShowQuick(false);
                    }}
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
        <div className="relative sm:w-48">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Location"
            className="input w-full pl-9"
          />
        </div>

        {/* Lead count */}
        <div className="relative sm:w-24">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
          <input
            type="number"
            min={10}
            max={100}
            step={5}
            value={leadCount}
            onChange={(e) => setLeadCount(Number(e.target.value))}
            onKeyDown={handleKeyDown}
            placeholder="Count"
            className="input w-full pl-9"
          />
        </div>

        {/* Search button */}
        <button
          onClick={handleSearch}
          disabled={loading || !businessType.trim() || !location.trim()}
          className="btn btn-primary shrink-0 disabled:opacity-50 sm:w-auto w-full"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <Search className="w-4 h-4 mr-2" />
          )}
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Row 2: Optional filters — compact toggles */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Has website toggle */}
        <button
          onClick={() =>
            setHasWebsite(
              hasWebsite === undefined ? true : hasWebsite ? false : undefined
            )
          }
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
            hasWebsite === true
              ? "bg-blue/10 border-blue/30 text-blue"
              : hasWebsite === false
              ? "bg-red/10 border-red/30 text-red"
              : "bg-surface-2 border-border text-text-muted"
          }`}
          title="Filter by website presence"
        >
          <Globe className="w-3 h-3" />
          {hasWebsite === true
            ? "Has website"
            : hasWebsite === false
            ? "No website"
            : "Website"}
        </button>

        {/* Min rating */}
        <div className="flex items-center gap-1">
          <Star className="w-3 h-3 text-text-faint" />
          <select
            value={minRating ?? ""}
            onChange={(e) =>
              setMinRating(e.target.value ? Number(e.target.value) : undefined)
            }
            className="text-xs bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-text-muted"
          >
            <option value="">Any rating</option>
            <option value="3">3+</option>
            <option value="3.5">3.5+</option>
            <option value="4">4+</option>
            <option value="4.5">4.5+</option>
          </select>
        </div>

        {/* Max reviews */}
        <div className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3 text-text-faint" />
          <select
            value={maxReviews ?? ""}
            onChange={(e) =>
              setMaxReviews(
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            className="text-xs bg-surface-2 border border-border rounded-lg px-2 py-1.5 text-text-muted"
          >
            <option value="">Any reviews</option>
            <option value="10">≤10</option>
            <option value="30">≤30</option>
            <option value="100">≤100</option>
          </select>
        </div>

        {/* Clear all filters */}
        {(hasWebsite !== undefined ||
          minRating !== undefined ||
          maxReviews !== undefined ||
          businessType ||
          location) && (
          <button
            onClick={onClearForm}
            className="text-xs px-2 py-1.5 text-text-faint hover:text-text transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
