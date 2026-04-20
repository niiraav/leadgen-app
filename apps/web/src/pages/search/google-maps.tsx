import { withAuth } from "@/lib/auth";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useProfile } from "@/contexts/profile-context";
import { api, UpgradeRequiredError } from "@/lib/api";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResultsTable } from "@/components/search/SearchResultsTable";
import { CollapsedSearchBar } from "@/components/search/CollapsedSearchBar";
import { SearchHistoryPanel } from "@/components/search/SearchHistoryPanel";
import { TargetAreaNudge } from "@/components/nudges/profile-nudges";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import type { SearchResult, SearchFilters, SearchSummary } from "@/components/search/types";
import type { Lead } from "@leadgen/shared";

export default function SearchGoogleMaps() {
  const router = useRouter();
  const { showNudge, profile, refreshProfile } = useProfile();

  // Search state
  const [filters, setFilters] = useState<SearchFilters>({
    businessType: "",
    location: "",
    leadCount: 25,
  });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Collapse state
  const [hasSearched, setHasSearched] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [searchSummary, setSearchSummary] = useState<SearchSummary | null>(null);

  // User limits
  const [userLeadsCount, setUserLeadsCount] = useState(0);
  const [userLeadLimit, setUserLeadLimit] = useState(50);

  // Search history & saved searches
  const [historyRecent, setHistoryRecent] = useState<any[]>([]);
  const [historySaved, setHistorySaved] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Fetch limits + history on mount
  useEffect(() => {
    (async () => {
      try {
        const status = (await api.billing.status()) as any;
        setUserLeadLimit(status?.limit ?? 50);
      } catch {
        setUserLeadLimit(50);
      }
    })();
    fetchHistory();
  }, []);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const [recent, saved] = await Promise.all([
        api.searchHistory.list(),
        api.filters.list(),
      ]);
      setHistoryRecent(recent ?? []);
      setHistorySaved(saved ?? []);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Saved search handlers ──────────────────────────────────────────────

  const handleSaveSearch = useCallback(
    async (name: string) => {
      try {
        const saved = await api.filters.save({
          name,
          filters: filters as Record<string, any>,
        });
        setHistorySaved((prev) => [saved, ...prev]);
        // Remove matching entries from recent (by query+location match)
        setHistoryRecent((prev) =>
          prev.filter(
            (r) =>
              !(r.query === filters.businessType && r.location === filters.location)
          )
        );
        showToast(`Saved: ${name}`);
      } catch (err: any) {
        showToast(err.message || "Failed to save search");
      }
    },
    [filters, showToast]
  );

  const handleDeleteSaved = useCallback(
    async (id: string) => {
      try {
        await api.filters.delete(id);
        setHistorySaved((prev) => prev.filter((s) => s.id !== id));
      } catch {
        // silently fail
      }
    },
    []
  );

  const handleSearch = useCallback(
    async (newFilters: SearchFilters) => {
      setLoading(true);
      setError(null);
      setFilters(newFilters);

      try {
        const searchResult = await api.search.googleMaps({
          query: newFilters.businessType,
          location: newFilters.location,
          maxResults: newFilters.leadCount,
          noWebsite: newFilters.hasWebsite,
        });

        const mapped: SearchResult[] =
          (searchResult as any).results?.map((r: any) => ({
            place_id:
              r.place_id ?? `temp-${Math.random().toString(36).slice(2)}`,
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
            // Email is unknown at search time — not enriched yet
            emailState: "unknown" as const,
            // Phone availability from Outscraper data
            phoneAvailability: r.phone
              ? ("available" as const)
              : ("unavailable" as const),
          })) ?? [];

        setResults(mapped);
        setHasSearched(true);

        // Collapse filters after successful search
        setSearchSummary({
          filters: newFilters,
          resultCount: mapped.length,
          searchedAt: Date.now(),
        });
        setFiltersCollapsed(true);
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
    },
    []
  );

  // ── Re-run a saved/recent search ─────────────────────────────────────
  const handleRerunSearch = useCallback(
    (rerunFilters: SearchFilters) => {
      setFilters(rerunFilters);
      handleSearch(rerunFilters);
    },
    [handleSearch]
  );

  /** Save one lead via single create (returns ID for routing) */
  const handleSaveOne = useCallback(
    async (result: SearchResult) => {
      setSaving(true);
      try {
        const lead: Lead = await api.leads.create({
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
        });

        // Mark as duplicate in table
        setResults((prev) =>
          prev.map((r) =>
            r.place_id === result.place_id
              ? { ...r, duplicate: true, existingLeadId: lead.id }
              : r
          )
        );
        showToast(`Saved ${result.name}`);
        setUserLeadsCount((c) => c + 1);

        // Route to lead detail page
        router.push(`/leads/${lead.id}`);
      } catch (err: any) {
        if (err instanceof UpgradeRequiredError) {
          setUpgradeError(err);
        } else {
          showToast(err.message || "Failed to save");
        }
      } finally {
        setSaving(false);
      }
    },
    [showToast, router]
  );

  /** Save + Enrich in one action, then route to lead page */
  const handleEnrichOne = useCallback(
    async (result: SearchResult) => {
      setEnrichingId(result.place_id);
      try {
        // Step 1: Save the lead
        const lead: Lead = await api.leads.create({
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
        });

        // Step 2: Enrich the saved lead
        await api.enrich.enrichLead(lead.id);

        // Mark as duplicate in table
        setResults((prev) =>
          prev.map((r) =>
            r.place_id === result.place_id
              ? { ...r, duplicate: true, existingLeadId: lead.id }
              : r
          )
        );
        showToast(`Saved & enriched ${result.name}`);
        setUserLeadsCount((c) => c + 1);

        // Route to lead detail page (enrichment will complete async)
        router.push(`/leads/${lead.id}`);
      } catch (err: any) {
        if (err instanceof UpgradeRequiredError) {
          setUpgradeError(err);
        } else {
          showToast(err.message || "Save & enrich failed");
        }
      } finally {
        setEnrichingId(null);
      }
    },
    [showToast, router]
  );

  const handleSaveBatch = useCallback(
    async (items: SearchResult[]) => {
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
    },
    [showToast]
  );

  const handleRefineSearch = useCallback(() => {
    setFiltersCollapsed(false);
  }, []);

  const handleClearSearch = useCallback(() => {
    setResults([]);
    setFiltersCollapsed(false);
    setHasSearched(false);
    setSearchSummary(null);
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
      {showNudge("on_search") && (
        <div className="mb-4">
          <TargetAreaNudge onDismiss={() => refreshProfile?.()} />
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-text flex items-center gap-2">
            <span className="text-blue">Search</span> Leads
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Find and save B2B leads
          </p>
        </div>

        {/* Filters — top section, collapsible */}
        {!filtersCollapsed && (
          <div className="mb-6">
            <SearchForm
              onSearch={handleSearch}
              loading={loading}
              initialFilters={filters}
              onClearForm={handleClearSearch}
            />

            {/* Search history panel — visible when form is expanded, hidden when collapsed */}
            {!loading && (
              <div className="mt-3">
                <SearchHistoryPanel
                  recent={historyRecent}
                  saved={historySaved}
                  loading={historyLoading}
                  onRerun={handleRerunSearch}
                  onDeleteSaved={handleDeleteSaved}
                  onSaveCurrent={hasSearched ? handleSaveSearch : undefined}
                  hasCurrentSearch={hasSearched}
                  currentFilters={hasSearched ? filters : null}
                  hideRecent={hasSearched}
                />
              </div>
            )}
          </div>
        )}

        {/* Collapsed search summary bar */}
        {filtersCollapsed && searchSummary && (
          <div className="mb-4">
            <CollapsedSearchBar
              summary={searchSummary}
              onRefine={handleRefineSearch}
              onClear={handleClearSearch}
            />
          </div>
        )}

        {/* Results area */}
        <div>
          {error && (
            <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red mb-4">
              {error}
              <button
                onClick={() =>
                  handleSearch({
                    businessType: filters.businessType,
                    location: filters.location,
                    leadCount: filters.leadCount,
                  })
                }
                className="ml-3 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          <UpgradePrompt
            error={upgradeError}
            onDismiss={() => setUpgradeError(null)}
            compact
          />

          {results.length > 0 && (
            <SearchResultsTable
              results={results}
              saving={saving}
              enrichingId={enrichingId}
              onSaveOne={handleSaveOne}
              onEnrichOne={handleEnrichOne}
              onSaveBatch={handleSaveBatch}
              userLeadLimit={userLeadLimit}
              currentLeadCount={userLeadsCount}
            />
          )}

          {!loading && results.length === 0 && !error && !hasSearched && (
            <div className="card text-center py-16">
              <p className="text-sm text-text-muted">No results yet</p>
              <p className="text-xs text-text-faint mt-1">
                Enter a search to find leads on Google Maps
              </p>
            </div>
          )}

          {!loading && results.length === 0 && hasSearched && !error && (
            <div className="card text-center py-16">
              <p className="text-sm text-text-muted">No leads found</p>
              <p className="text-xs text-text-faint mt-1">
                Try different search terms or location
              </p>
            </div>
          )}

          {loading && (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-xl border border-border/60 bg-surface animate-pulse"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
