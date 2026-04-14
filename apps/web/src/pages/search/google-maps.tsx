import { withAuth } from "@/lib/auth";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useProfile } from "@/contexts/profile-context";
import { api, UpgradeRequiredError } from "@/lib/api";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResultsTable } from "@/components/search/SearchResultsTable";
import { TargetAreaNudge } from "@/components/nudges/profile-nudges";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import type { Lead } from "@leadgen/shared";

interface SearchResult {
  place_id: string;
  data_id?: string;
  name: string;
  city: string;
  category: string;
  subtypes: string[];
  rating: number;
  reviews: number;
  has_website: boolean;
  business_status: string;
  hot_score: number;
  phone?: string;
  site?: string;
  full_address?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
  source?: string;
  gmb_reviews_url?: string;
  description?: string;
  duplicate?: boolean;
  existingLeadId?: string;
}

export default function SearchGoogleMaps() {
  const router = useRouter();
  const { showNudge, profile, refreshProfile } = useProfile();

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [limit, setLimit] = useState(25);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Recent searches + saved filters
  const [recentSearches, setRecentSearches] = useState<any[]>([]);
  const [savedFilters, setSavedFilters] = useState<any[]>([]);

  // User limits
  const [userLeadsCount, setUserLeadsCount] = useState(0);
  const [userLeadLimit, setUserLeadLimit] = useState(50);

  // Fetch recent searches and limits on mount
  useEffect(() => {
    (async () => {
      try {
        const status = await api.billing.status() as any;
        setUserLeadLimit(status?.limit ?? 50);
      } catch {
        setUserLeadLimit(50);
      }
    })();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleSearch = useCallback(async (q: string, loc: string, lim: number) => {
    setLoading(true);
    setError(null);
    setResults([]);

    try {
      const searchResult = await api.search.googleMaps({
        query: q,
        location: loc,
        maxResults: lim,
      });

      const mapped = (searchResult as any).results?.map((r: any) => ({
        place_id: r.place_id ?? `temp-${Math.random().toString(36).slice(2)}`,
        data_id: r.data_id ?? undefined,
        name: r.business_name,
        city: r.city ?? "",
        category: r.category ?? "",
        subtypes: r.subtypes ?? [],
        rating: r.rating ?? 0,
        reviews: r.review_count ?? 0,
        has_website: !!r.website_url,
        business_status: r.business_status ?? "OPERATIONAL",
        hot_score: r.hot_score ?? 0,
        phone: r.phone ?? undefined,
        site: r.website_url ?? undefined,
        full_address: r.address ?? undefined,
        postal_code: r.postal_code ?? undefined,
        latitude: r.latitude ?? undefined,
        longitude: r.longitude ?? undefined,
        source: r.source ?? undefined,
        gmb_reviews_url: r.gmb_reviews_url ?? undefined,
        description: r.description ?? "",
        duplicate: false,
      })) ?? [];

      setResults(mapped);
      setQuery(q);
      setLocation(loc);
      setLimit(lim);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
        setError(null);
      } else {
        setError(err.message || "Search failed");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSaveOne = useCallback(async (result: SearchResult) => {
    setSaving(true);
    try {
      await api.leads.batchCreate([{
        business_name: result.name,
        phone: result.phone ?? null,
        website_url: result.site ?? null,
        address: result.full_address ?? null,
        city: result.city,
        country: "GB",
        category: result.category,
        rating: result.rating || null,
        review_count: result.reviews,
        hot_score: result.hot_score,
        readiness_flags: [],
        status: "new",
        source: result.source ?? "outscraper",
        tags: [],
        metadata: { place_id: result.place_id },
        place_id: result.place_id,
        data_id: result.data_id ?? null,
        gmb_reviews_url: result.gmb_reviews_url ?? null,
        latitude: result.latitude ?? null,
        longitude: result.longitude ?? null,
      }]);

      // Mark as duplicate
      setResults((prev) =>
        prev.map((r) =>
          r.place_id === result.place_id ? { ...r, duplicate: true } : r
        )
      );
      showToast(`Saved ${result.name}`);
      setUserLeadsCount((c) => c + 1);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
      } else {
        showToast(err.message || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const handleSaveBatch = useCallback(async (items: SearchResult[]) => {
    setSaving(true);
    try {
      const leads = items.map((r) => ({
        business_name: r.name,
        phone: r.phone ?? null,
        website_url: r.site ?? null,
        address: r.full_address ?? null,
        city: r.city,
        country: "GB",
        category: r.category,
        rating: r.rating || null,
        review_count: r.reviews,
        hot_score: r.hot_score,
        readiness_flags: [],
        status: "new",
        source: r.source ?? "outscraper",
        tags: [],
        metadata: { place_id: r.place_id },
        place_id: r.place_id,
        data_id: r.data_id ?? null,
        gmb_reviews_url: r.gmb_reviews_url ?? null,
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
      }));

      const result = await api.leads.batchCreate(leads);
      const imported = (result as any).imported ?? items.length;

      setResults((prev) =>
        prev.map((r) => {
          const match = items.find((i) => i.place_id === r.place_id);
          return match ? { ...r, duplicate: true } : r;
        })
      );

      showToast(`Saved ${imported} lead${imported > 1 ? "s" : ""}`);
      setUserLeadsCount((c) => c + imported);
    } catch (err: any) {
      if (err instanceof UpgradeRequiredError) {
        setUpgradeError(err);
      } else {
        showToast(err.message || "Batch save failed");
      }
    } finally {
      setSaving(false);
    }
  }, [showToast]);

  const handleClearForm = useCallback(() => {
    setResults([]);
  }, []);

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-xl">
            <span className="text-sm text-text flex-1">{toast}</span>
          </div>
        </div>
      )}

      {/* Profile nudge */}
      {showNudge('on_search') && (
        <div className="mb-4">
          <TargetAreaNudge
            onDismiss={() => refreshProfile?.()}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <span className="text-blue">Search</span> Leads
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Find and save B2B leads
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left panel — Search Form */}
          <div className="w-full lg:w-80 shrink-0">
            <SearchForm
              onSearch={handleSearch}
              loading={loading}
              recentSearches={recentSearches.map((s) => ({
                query: s.query ?? "",
                location: s.location ?? "",
                limit_count: s.limit_count ?? 25,
              }))}
              savedFilters={savedFilters}
              onClearForm={handleClearForm}
            />
          </div>

          {/* Right panel — Results */}
          <div className="flex-1 min-w-0">
            {error && (
              <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red mb-4">
                {error}
                <button onClick={() => handleSearch(query, location, limit)} className="ml-3 underline hover:no-underline">
                  Retry
                </button>
              </div>
            )}

            <UpgradePrompt error={upgradeError} onDismiss={() => setUpgradeError(null)} compact />

            {results.length > 0 && (
              <SearchResultsTable
                results={results}
                saving={saving}
                onSaveOne={handleSaveOne}
                onSaveBatch={handleSaveBatch}
                userLeadLimit={userLeadLimit}
                currentLeadCount={userLeadsCount}
              />
            )}

            {!loading && results.length === 0 && !error && (
              <div className="card text-center py-16">
                <p className="text-sm text-text-muted">No results yet</p>
                <p className="text-xs text-text-faint mt-1">
                  Enter a search to find leads on Google Maps
                </p>
              </div>
            )}

            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-xl border border-border/60 bg-surface animate-pulse" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
