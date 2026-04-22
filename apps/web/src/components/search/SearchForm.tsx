import { useState, useCallback, useRef, useEffect } from "react";
import { Search, MapPin, Globe, Loader2, X } from "lucide-react";
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

const COUNT_STEPS = [10, 25, 50, 100];

function getDefaultFilters(defaultLocation?: string): SearchFilters {
  return {
    businessType: "",
    location: defaultLocation || "",
    leadCount: 25,
    websiteFilter: 'any',
  };
}

export function SearchForm({
  onSearch,
  loading,
  initialFilters,
  onClearForm,
  defaultLocation,
}: SearchFilterBarProps) {
  const defaults = getDefaultFilters(defaultLocation);
  const [businessType, setBusinessType] = useState(
    initialFilters?.businessType ?? defaults.businessType
  );
  const [location, setLocation] = useState(
    initialFilters?.location ?? defaults.location
  );
  const [leadCount, setLeadCount] = useState(
    initialFilters?.leadCount ?? defaults.leadCount
  );
  const [websiteFilter, setWebsiteFilter] = useState<'any' | 'has' | 'no'>(
    initialFilters?.websiteFilter ?? defaults.websiteFilter ?? 'any'
  );
  const [showQuick, setShowQuick] = useState(false);
  const quickRef = useRef<HTMLDivElement>(null);

  // Sync with initial filters on re-expand
  useEffect(() => {
    if (initialFilters) {
      setBusinessType(initialFilters.businessType ?? defaults.businessType);
      setLocation(initialFilters.location ?? defaults.location);
      setLeadCount(initialFilters.leadCount ?? defaults.leadCount);
      setWebsiteFilter(initialFilters.websiteFilter ?? defaults.websiteFilter ?? 'any');
    }
  }, [initialFilters, defaultLocation]);

  const handleSearch = useCallback(() => {
    if (!businessType.trim() || !location.trim()) return;
    const filters: SearchFilters = {
      businessType: businessType.trim(),
      location: location.trim(),
      leadCount,
      websiteFilter,
    };
    onSearch(filters);
  }, [businessType, location, leadCount, websiteFilter, onSearch]);

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

  const isDirty =
    businessType !== defaults.businessType ||
    location !== defaults.location ||
    leadCount !== defaults.leadCount ||
    websiteFilter !== defaults.websiteFilter;

  const handleClear = useCallback(() => {
    setBusinessType(defaults.businessType);
    setShowQuick(false);
    onClearForm?.();
  }, [defaults.businessType, onClearForm]);

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      {/* Row 1: Business type + Location + Search button */}
      <div className="flex flex-col sm:flex-row gap-3 mb-3">
        {/* Business type */}
        <div className="relative flex-1" ref={quickRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
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
            <div className="absolute top-full left-0 right-0 mt-1 bg-surface border border-border rounded-xl p-3 shadow-md z-20">
              <div className="text-xs text-text-muted mb-2">Quick select</div>
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
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Location"
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

      {/* Row 2: Result count segmented control + Website filter + Clear */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Result count segmented control */}
        <div className="flex items-center gap-0 rounded-lg border border-border overflow-hidden">
          {COUNT_STEPS.map((step) => (
            <button
              key={step}
              onClick={() => setLeadCount(step)}
              className={`text-xs px-3 py-1.5 transition-colors ${
                leadCount === step
                  ? "bg-blue text-accent-text font-medium"
                  : "bg-surface text-text-muted hover:text-text hover:bg-surface-2"
              } ${step !== COUNT_STEPS[0] ? "border-l border-border" : ""}`}
            >
              {step}
            </button>
          ))}
        </div>

        {/* Website filter toggle: any → has → no */}
        <button
          onClick={() =>
            setWebsiteFilter(
              websiteFilter === 'any' ? 'has' : websiteFilter === 'has' ? 'no' : 'any'
            )
          }
          className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5 ${
            websiteFilter === 'has'
              ? "bg-blue/10 border-blue/30 text-blue"
              : websiteFilter === 'no'
              ? "bg-red/10 border-red/30 text-red"
              : "bg-surface-2 border-border text-text-muted"
          }`}
          title="Filter by website presence"
        >
          <Globe className="w-3 h-3" />
          {websiteFilter === 'has'
            ? "Has website"
            : websiteFilter === 'no'
            ? "No website"
            : "Website"}
        </button>

        {/* Clear filters */}
        {isDirty && (
          <button
            onClick={handleClear}
            className="text-xs px-2 py-1.5 text-text-muted hover:text-text transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
