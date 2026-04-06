"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import { Search, MapPin, Loader2, Check, Plus, X } from "lucide-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import Link from "next/link";
import { useProfile } from "@/contexts/profile-context";
import { TargetAreaNudge } from "@/components/nudges/profile-nudges";

/* ------------------------------------------------------------------ */
/*  Quick Types – emoji chips that populate the business type input    */
/* ------------------------------------------------------------------ */
const QUICK_TYPES = [
  { label: "Window Cleaning", emoji: "🪟" },
  { label: "Plumber", emoji: "🔧" },
  { label: "Electrician", emoji: "⚡" },
  { label: "Roofer", emoji: "🏠" },
  { label: "Cleaning Service", emoji: "🧹" },
  { label: "Landscaping", emoji: "🌿" },
  { label: "Locksmith", emoji: "🔒" },
  { label: "Painter", emoji: "🎨" },
  { label: "Auto Repair", emoji: "🚗" },
  { label: "Hair & Beauty", emoji: "💈" },
  { label: "Restaurant", emoji: "🍽️" },
  { label: "Personal Trainer", emoji: "💪" },
  { label: "Accountant", emoji: "📊" },
  { label: "Solicitor", emoji: "⚖️" },
  { label: "Driving Instructor", emoji: "🚙" },
  { label: "Pest Control", emoji: "🐛" },
];

/* ------------------------------------------------------------------ */
/*  Quick Play – pre-built search cards the user can tap to fill form  */
/* ------------------------------------------------------------------ */
const QUICK_PLAY = [
  { label: "Roofers near me", type: "Roofer", loc: "London" },
  { label: "Window cleaners nearby", type: "Window Cleaning", loc: "Birmingham" },
  { label: "Plumbers in my area", type: "Plumber", loc: "Manchester" },
];

/* ------------------------------------------------------------------ */
/*  Filter toggle chips                                                */
/* ------------------------------------------------------------------ */
const FILTER_OPTIONS = [
  { key: "hasWebsite", label: "Has Website" },
  { key: "hasPhone", label: "Has Phone" },
  { key: "minRating", label: "Good Rating" },
];

/* ------------------------------------------------------------------ */
/*  Interfaces                                                         */
/* ------------------------------------------------------------------ */
interface RecentSearch {
  businessType: string;
  location: string;
  radiusKm: number;
  filters: Record<string, boolean | number>;
  timestamp: number;
}

interface SearchResult {
  title: string;
  address: string;
  rating?: number | null;
  reviews?: number | null;
  website?: string | null;
  phone?: string | null;
  category?: string | null;
  hot_score: number;
  added?: boolean;
  id?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function SearchGoogleMaps() {
  const router = useRouter();
  const { showNudge, profile, refreshProfile, markNudgeSeen } = useProfile();
  const [showGeoNudge, setShowGeoNudge] = useState(true);

  /* ---------- state ----------- */
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, boolean | number>>({});
  const [geoLoading, setGeoLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [resultsHeader, setResultsHeader] = useState<{ count: number; hotCount: number } | null>(null);
  const [selectedQuickPlay, setSelectedQuickPlay] = useState<number | null>(null);
  const [addingAll, setAddingAll] = useState<"none" | "hot" | "all">("none");
  const [toast, setToast] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  const resultsRef = useRef<HTMLDivElement>(null);
  const canSearch = businessType.trim().length > 0 && location.trim().length > 0;

  /** Show a toast message that auto-dismisses after 4 seconds */
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  /** Toggle a filter chip on / off */
  const toggleFilter = (key: string) => {
    setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  /** Select / deselect a quick-type chip */
  const handleTypeSelect = useCallback(
    (label: string) => {
      if (selectedType === label) {
        setSelectedType(null);
        setBusinessType("");
      } else {
        setSelectedType(label);
        setBusinessType(label);
      }
    },
    [selectedType],
  );

  /** Fill the form from a Quick Play card */
  const handleQuickPlay = useCallback((qp: typeof QUICK_PLAY[number], index: number) => {
    setSelectedQuickPlay(index);
    setBusinessType(qp.type);
    setLocation(qp.loc);
    setSelectedType(null);
  }, []);

  /** Reverse-geocode the user's position via Nominatim */
  const handleGeolocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const resp = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
            { headers: { "User-Agent": "LeadGenApp/1.0" } },
          );
          const data = await resp.json();
          const city =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.postcode ||
            "Unknown";
          setLocation(city);
        } catch {
          /* silently fail */
        }
        setGeoLoading(false);
      },
      () => setGeoLoading(false),
      { enableHighAccuracy: false, timeout: 8000 },
    );
  };

  /** Call the backend directly with auth token */
  const handleSearch = async () => {
    if (!canSearch) return;
    setLoading(true);
    setResults([]);
    setResultsHeader(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const res = await fetch("http://localhost:3001/search/google-maps", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({
          query: businessType,
          location,
          maxResults: 50,
          ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v])),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || `Search failed (${res.status})`);
      }

      const resJson = await res.json();
      const items = resJson.results || resJson.leads || resJson.data || [];
      const scored = items.map((r: any) => ({
        title: r.business_name || "Unknown",
        address: r.address || "",
        rating: r.rating ?? null,
        reviews: r.reviews_count ?? null,
        website: r.website_url ?? null,
        phone: r.phone ?? null,
        category: r.category ?? null,
        hot_score: r.hot_score || 0,
        added: false,
      }));
      const sorted = scored.sort(
        (a: SearchResult, b: SearchResult) => b.hot_score - a.hot_score,
      );

      setResults(sorted);
      setResultsHeader({
        count: sorted.length,
        hotCount: sorted.filter((r: SearchResult) => r.hot_score >= 70).length,
      });
      setShowResults(true);

      // Save to recent searches
      setRecentSearches((prev) => {
        const entry: RecentSearch = {
          businessType,
          location,
          radiusKm,
          filters: { ...filters },
          timestamp: Date.now(),
        };
        const filtered = prev.filter(
          (s) => s.businessType !== businessType || s.location !== location,
        );
        return [entry, ...filtered].slice(0, 5);
      });

      setTimeout(
        () => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        200,
      );
    } catch {
      showToast("Search failed — please try again");
    }

    setLoading(false);
  };

  /** Add one result as a lead — calls backend directly */
  const handleAddSingle = async (result: SearchResult, index: number) => {
    if (result.added) return;
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const res = await fetch("http://localhost:3001/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({
          business_name: result.title,
          address: result.address,
          phone: result.phone || "",
          email: "",
          website_url: result.website || "",
          category: result.category || result.title,
          city: location,
          country: "UK",
          status: "new",
          source: "google-maps",
        }),
      });
      if (!res.ok) throw new Error("Failed to add lead");
      const lead = await res.json();
      setResults((prev) =>
        prev.map((r, i) => (i === index ? { ...r, added: true, id: lead.id } : r)),
      );
      showToast("Added to pipeline");
    } catch {
      showToast("Failed to add lead");
    }
  };

  /** Add all (or all hot) results as leads — calls backend directly */
  const handleAddAll = async (hotOnly: boolean) => {
    const leads = hotOnly
      ? results.filter((r) => r.hot_score >= 70 && !r.added)
      : results.filter((r) => !r.added);
    if (leads.length === 0) return;

    setAddingAll(hotOnly ? "hot" : "all");
    let added = 0;

    for (const r of leads) {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const accessToken = session?.access_token;
        if (!accessToken) throw new Error("Not authenticated");

        const res = await fetch("http://localhost:3001/leads", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + accessToken,
          },
          body: JSON.stringify({
            business_name: r.title,
            address: r.address,
            phone: r.phone || "",
            email: "",
            website_url: r.website || "",
            category: r.category || r.title,
            city: location,
            country: "UK",
            status: "new",
            source: "google-maps",
          }),
        });
        if (!res.ok) throw new Error("Failed");
        const lead = await res.json();
        setResults((prev) =>
          prev.map((res2) => (res2.title === r.title ? { ...res2, added: true, id: lead.id } : res2)),
        );
        added++;
      } catch {
        /* skip failed items */
      }
    }

    setAddingAll("none");
    showToast(`✓ ${added} leads added — view in pipeline`);
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <>
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xl">
            <span className="text-sm text-text flex-1">{toast}</span>
            <button
              onClick={() => setToast(null)}
              className="text-text-faint hover:text-text"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-xl mx-auto pb-20 md:pb-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <Search className="w-5 h-5 text-blue" />
            Search Leads
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Find local businesses on Google Maps
          </p>
        </div>

        {/* Business type input */}
        <div className="mb-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue/20">
            <span className="text-lg">🏢</span>
            <input
              type="text"
              value={businessType}
              onChange={(e) => {
                setBusinessType(e.target.value);
                setSelectedType(null);
              }}
              placeholder="Business or industry type"
              autoFocus
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]"
            />
          </div>
        </div>

        {/* Quick Types chips */}
        <div className="mb-4 -mx-4 px-4">
          <p className="text-xs text-text-muted mb-2">Quick types</p>
          <div
            className="flex gap-2 overflow-x-auto pb-2"
            style={{ scrollbarWidth: "none" }}
          >
            {QUICK_TYPES.map((qt) => (
              <button
                key={qt.label}
                onClick={() => handleTypeSelect(qt.label)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium whitespace-nowrap snap-start shrink-0 min-h-[36px] active:scale-95 transition-transform ${
                  selectedType === qt.label
                    ? "border-blue/50 bg-blue/10 text-blue"
                    : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                }`}
              >
                <span>{qt.emoji}</span>
                <span className="truncate max-w-[80px]">{qt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Location */}
        <div className="mb-4">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 focus-within:ring-2 focus-within:ring-blue/20">
            <MapPin
              className={`w-4 h-4 ${geoLoading ? "animate-pulse text-blue" : "text-text-faint"}`}
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="City or postcode"
              className="flex-1 bg-transparent text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]"
            />
          </div>
          <button
            onClick={handleGeolocation}
            disabled={geoLoading}
            className="mt-2 text-xs text-blue hover:underline flex items-center gap-1 min-h-[44px] px-0 active:scale-95"
          >
            <MapPin className="w-3 h-3" />
            {geoLoading ? "Getting location..." : "Use my location"}
          </button>
        </div>

        {/* Radius slider */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-text-muted">Radius</label>
            <span className="text-xs text-text-muted font-medium">
              {radiusKm} km
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={50}
            value={radiusKm}
            onChange={(e) => setRadiusKm(parseInt(e.target.value))}
            className="w-full accent-blue h-1"
          />
        </div>

        {/* Filter chips */}
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Filters</p>
          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((f) => {
              const active = !!filters[f.key];
              return (
                <button
                  key={f.key}
                  onClick={() => toggleFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium active:scale-95 transition-transform ${
                    active
                      ? "border-blue/50 bg-blue/10 text-blue"
                      : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                  }`}
                >
                  {active && <Check className="w-3 h-3" />}
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent searches */}
        {recentSearches.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-text-muted mb-2">Recent searches</p>
            <div className="space-y-1">
              {recentSearches.map((s, i) => (
                <div
                  key={i}
                  onClick={() => {
                    setBusinessType(s.businessType);
                    setLocation(s.location);
                    setRadiusKm(s.radiusKm);
                    setFilters(s.filters || {});
                    setSelectedType(null);
                  }}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-text-muted hover:bg-surface-2 hover:text-text cursor-pointer active:scale-[0.98] transition-transform"
                >
                  <span>🕐</span>
                  <span className="flex-1 truncate">
                    {s.businessType} · {s.location} · {s.radiusKm}km
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRecentSearches((prev) =>
                        prev.filter((_, idx) => idx !== i),
                      );
                    }}
                    className="p-1 text-text-faint hover:text-text active:scale-90"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Quick Play cards */}
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Quick Play</p>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_PLAY.map((qp, i) => (
              <button
                key={i}
                onClick={() => handleQuickPlay(qp, i)}
                className={`text-left rounded-lg border px-3 py-2.5 text-sm active:scale-[0.98] transition-all ${
                  selectedQuickPlay === i
                    ? "border-blue/50 bg-blue/10 text-blue"
                    : "border-border/60 bg-surface-2 text-text-muted hover:text-text hover:border-border"
                }`}
              >
                <span className="font-medium">{qp.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Search button — disabled until businessType AND location filled */}
        <button
          onClick={handleSearch}
          disabled={!canSearch || loading}
          className={`w-full md:max-w-[400px] md:mx-auto rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98] ${
            canSearch && !loading
              ? "bg-blue text-white shadow-lg shadow-blue/20"
              : "bg-surface-2 text-text-faint cursor-not-allowed"
          }`}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Search className="w-4 h-4" />
              Search Leads
            </span>
          )}
        </button>

        {/* Results */}
        {showResults && results.length > 0 && resultsHeader && (
          <div
            ref={resultsRef}
            className="mt-8 pt-6 border-t border-border/40"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-text">
                {resultsHeader.count} results · {resultsHeader.hotCount}{" "}
                🔥 hot leads
              </p>
              <div className="flex gap-2">
                {resultsHeader.hotCount > 0 && (
                  <button
                    onClick={() => handleAddAll(true)}
                    disabled={addingAll !== "none"}
                    className="text-xs text-amber hover:underline flex items-center gap-1 min-h-[44px] px-1 active:scale-95 transition-transform"
                  >
                    {addingAll === "hot" ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Add All Hot
                  </button>
                )}
                <button
                  onClick={() => handleAddAll(false)}
                  disabled={addingAll !== "none"}
                  className="text-xs text-blue hover:underline flex items-center gap-1 min-h-[44px] px-1 active:scale-95 transition-transform"
                >
                  {addingAll === "all" ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : null}
                  Add All
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-border/60 bg-surface p-3 active:scale-[0.995] transition-transform"
                >
                  <div className="flex items-start gap-3">
                    {/* Hot score badge */}
                    <div
                      className={`rounded-md px-2 py-1 text-xs font-bold shrink-0 ${
                        r.hot_score >= 80
                          ? "bg-red/10 text-red"
                          : r.hot_score >= 50
                            ? "bg-amber/10 text-amber"
                            : "bg-surface-2 text-text-muted"
                      }`}
                    >
                      🔥 {r.hot_score}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-text truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5 truncate">
                        📍 {r.address || "No address"}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-text-muted">
                        {r.rating != null && (
                          <span>⭐ {r.rating}</span>
                        )}
                        {r.reviews != null && (
                          <span>({r.reviews} reviews)</span>
                        )}
                        {r.website ? (
                          <span className="text-green">🌐 Has site</span>
                        ) : (
                          <span className="text-red">🌐 No site</span>
                        )}
                      </div>
                      {r.phone && (
                        <p className="text-xs text-text-muted mt-1">
                          📞 {r.phone}
                        </p>
                      )}
                    </div>

                    {/* Add button */}
                    <button
                      onClick={() => handleAddSingle(r, i)}
                      disabled={r.added}
                      className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all active:scale-90 ${
                        r.added
                          ? "bg-green/10 text-green"
                          : "bg-blue/10 text-blue hover:bg-blue/20"
                      } `}
                    >
                      {r.added ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Plus className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
