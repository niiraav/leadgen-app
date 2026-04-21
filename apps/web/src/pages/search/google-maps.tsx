import { withAuth } from "@/lib/auth";
import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/contexts/profile-context";
import { api, UpgradeRequiredError } from "@/lib/api";
import { SearchForm } from "@/components/search/SearchForm";
import { SearchResultsTable } from "@/components/search/SearchResultsTable";
import { CollapsedSearchBar } from "@/components/search/CollapsedSearchBar";
import { SearchHistoryPanel } from "@/components/search/SearchHistoryPanel";
import { SavedSearchesPanel } from "@/components/search/SavedSearchesPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { TargetAreaNudge } from "@/components/nudges/profile-nudges";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import type { SearchResult, SearchFilters, SearchSummary } from "@/components/search/types";
import type { Lead } from "@leadgen/shared";

// ── React Query key ────────────────────────────────────────────────────────────
const SEARCH_QUERY_KEY = "googleMapsSearch";

export default function SearchGoogleMaps() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showNudge, profile, refreshProfile } = useProfile();

  // ── Search state ─────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<SearchFilters>({
    businessType: "",
    location: profile?.target_geography || "",
    leadCount: 25,
  });
  const [savingId, setSavingId] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<Error | string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // ── Collapse state ───────────────────────────────────────────────────────────
  const [hasSearched, setHasSearched] = useState(false);
  const [filtersCollapsed, setFiltersCollapsed] = useState(false);
  const [searchSummary, setSearchSummary] = useState<SearchSummary | null>(null);

  // ── User limits ──────────────────────────────────────────────────────────────
  const [userLeadsCount, setUserLeadsCount] = useState(0);
  const [userLeadLimit, setUserLeadLimit] = useState(50);

  // ── Saved searches + history ─────────────────────────────────────────────────
  const [savedSearchesRefresh, setSavedSearchesRefresh] = useState(0);
  const [historyRecent, setHistoryRecent] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // Save search UI state
  const [saveSearchName, setSaveSearchName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveSearchLoading, setSaveSearchLoading] = useState(false);

  // ── Fetch limits + history on mount ──────────────────────────────────────────
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

  // ── Sync default location when profile loads ─────────────────────────────────
  useEffect(() => {
    if (profile?.target_geography && !hasSearched) {
      setFilters((prev) => ({
        ...prev,
        location: profile.target_geography || "",
      }));
    }
  }, [profile?.target_geography, hasSearched]);

  // ── React Query: search ──────────────────────────────────────────────────────
  const searchQuery = useQuery({
    queryKey: [SEARCH_QUERY_KEY, filters],
    queryFn: async () => {
      const searchResult = await api.search.googleMaps({
        query: filters.businessType,
        location: filters.location,
        maxResults: filters.leadCount,
        websiteFilter: filters.websiteFilter,
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
          duplicate: r.duplicate ?? false,
          existingLeadId: r.existingLeadId ?? undefined,
        })) ?? [];

      return mapped;
    },
    enabled: false, // don't run automatically — only via refetch
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30, // 30 minutes
  });

  const results = searchQuery.data ?? [];
  const loading = searchQuery.isFetching;

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const recent = await api.searchHistory.list();
      setHistoryRecent(recent ?? []);
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

  // ── Save search handler ────────────────────────────────────────────────────
  const handleSaveSearch = useCallback(
    async (name: string) => {
      try {
        await api.filters.save({
          name,
          filters: filters as Record<string, any>,
        });
        showToast(`Saved: ${name}`);
        setShowSaveInput(false);
        setSaveSearchName("");
        setSavedSearchesRefresh((t) => t + 1);
      } catch (err: any) {
        showToast(err.message || "Failed to save search");
      }
    },
    [filters, showToast]
  );

  // ── Search handler ───────────────────────────────────────────────────────────
  const handleSearch = useCallback(
    async (newFilters: SearchFilters) => {
      setError(null);
      setUpgradeError(null);
      setFilters(newFilters);

      try {
        const mapped = await queryClient.fetchQuery({
          queryKey: [SEARCH_QUERY_KEY, newFilters],
          queryFn: async () => {
            const searchResult = await api.search.googleMaps({
              query: newFilters.businessType,
              location: newFilters.location,
              maxResults: newFilters.leadCount,
              websiteFilter: newFilters.websiteFilter,
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
                duplicate: r.duplicate ?? false,
                existingLeadId: r.existingLeadId ?? undefined,
              })) ?? [];

            return mapped;
          },
          staleTime: Infinity,
          gcTime: 1000 * 60 * 30,
        });

        setHasSearched(true);
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
      }
    },
    [queryClient]
  );

  // ── Re-run a recent search ─────────────────────────────────────────────────
  const handleRerunSearch = useCallback(
    (rerunFilters: SearchFilters) => {
      setFilters(rerunFilters);
      handleSearch(rerunFilters);
    },
    [handleSearch]
  );

  // ── Delete recent search ───────────────────────────────────────────────────
  const handleDeleteRecent = useCallback(
    async (id: string) => {
      try {
        await api.searchHistory.delete(id);
        setHistoryRecent((prev) => prev.filter((r) => r.id !== id));
      } catch {
        // silently fail — UI already optimistically removed
      }
    },
    []
  );

  /** Save one lead via single create (returns ID for routing) */
  const handleSaveOne = useCallback(
    async (result: SearchResult) => {
      setSavingId(result.place_id);
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

        // Invalidate search cache so duplicate state refreshes on back-nav
        queryClient.invalidateQueries({ queryKey: [SEARCH_QUERY_KEY] });

        // Also mark locally in current results
        queryClient.setQueryData(
          [SEARCH_QUERY_KEY, filters],
          (old: SearchResult[] | undefined) =>
            old?.map((r) =>
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
        setSavingId(null);
      }
    },
    [showToast, router, queryClient, filters]
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

        // Invalidate search cache
        queryClient.invalidateQueries({ queryKey: [SEARCH_QUERY_KEY] });

        // Also mark locally
        queryClient.setQueryData(
          [SEARCH_QUERY_KEY, filters],
          (old: SearchResult[] | undefined) =>
            old?.map((r) =>
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
    [showToast, router, queryClient, filters]
  );

  const handleSaveBatch = useCallback(
    async (items: SearchResult[]) => {
      setSavingId("batch");
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

        // Invalidate + mark locally
        queryClient.invalidateQueries({ queryKey: [SEARCH_QUERY_KEY] });
        queryClient.setQueryData(
          [SEARCH_QUERY_KEY, filters],
          (old: SearchResult[] | undefined) =>
            old?.map((r) => {
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
        setSavingId(null);
      }
    },
    [showToast, queryClient, filters]
  );

  const handleRefineSearch = useCallback(() => {
    setFiltersCollapsed(false);
  }, []);

  // Clear everything (results + filters + collapse state) — used by CollapsedSearchBar X
  const handleClearSearch = useCallback(() => {
    queryClient.removeQueries({ queryKey: [SEARCH_QUERY_KEY] });
    setFiltersCollapsed(false);
    setHasSearched(false);
    setSearchSummary(null);
    setShowSaveInput(false);
    setSaveSearchName("");
  }, [queryClient]);

  // Reset only text field (business type) — PRD: Clear filters resets only the current text field
  const handleResetFilters = useCallback(() => {
    setFilters((prev) => ({
      ...prev,
      businessType: "",
    }));
  }, []);

  return (
    <div className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8">
      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xl">
            <span className="text-sm text-gray-900 flex-1">{toast}</span>
          </div>
        </div>
      )}

      {/* Profile nudge */}
      {showNudge("on_search") && (
        <div className="mb-4">
          <TargetAreaNudge onDismiss={() => refreshProfile?.()} />
        </div>
      )}

      {/* ── PRE-SEARCH / EXPANDED: centered narrow container ── */}
      {!filtersCollapsed && (
        <div className="max-w-xl mx-auto pt-8 pb-4">
          {/* Centered page title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">
              Find <span className="text-blue-600">B2B Leads</span>
            </h1>
            <p className="text-sm text-gray-500 mt-2">
              Search Google Maps for businesses in your target area
            </p>
          </div>

          {/* Search form card */}
          <div className="card">
            <SearchForm
              onSearch={handleSearch}
              loading={loading}
              initialFilters={filters}
              onClearForm={handleResetFilters}
              defaultLocation={profile?.target_geography || undefined}
            />
          </div>

          {/* Save search + Recent searches — below the card */}
          <div className="mt-4">
            {/* Save search trigger */}
            {hasSearched && (
              <div className="flex items-center justify-end gap-2 mb-3">
                {showSaveInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={saveSearchName}
                      onChange={(e) => setSaveSearchName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && saveSearchName.trim()) {
                          handleSaveSearch(saveSearchName.trim());
                        }
                        if (e.key === "Escape") {
                          setShowSaveInput(false);
                          setSaveSearchName("");
                        }
                      }}
                      placeholder="Search name..."
                      className="h-7 w-40 text-xs bg-surface border border-border rounded-lg px-2 text-text focus:outline-none focus:ring-1 focus:ring-blue/20"
                      autoFocus
                    />
                    <button
                      onClick={() => {
                        if (saveSearchName.trim()) {
                          handleSaveSearch(saveSearchName.trim());
                        }
                      }}
                      disabled={saveSearchLoading || !saveSearchName.trim()}
                      className="text-xs px-2 py-1 rounded-lg bg-blue text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setShowSaveInput(false);
                        setSaveSearchName("");
                      }}
                      className="text-xs px-2 py-1 rounded-lg border border-border text-text-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      const base = `${filters.businessType} in ${filters.location}`;
                      setSaveSearchName(base.length > 40 ? base.slice(0, 40) : base);
                      setShowSaveInput(true);
                    }}
                    className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-text-muted hover:text-text hover:border-border-strong transition-colors"
                  >
                    Save search
                  </button>
                )}
              </div>
            )}

            {/* Saved searches */}
            {!loading && (
              <div className="mt-3">
                <SavedSearchesPanel
                  onApply={handleRerunSearch}
                  refreshToken={savedSearchesRefresh}
                />
              </div>
            )}

            {/* Recent searches */}
            {!loading && (
              <div className="mt-3">
                <SearchHistoryPanel
                  recent={historyRecent}
                  loading={historyLoading}
                  onRerun={handleRerunSearch}
                  onDeleteRecent={handleDeleteRecent}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── COLLAPSED / RESULTS: full width ── */}
      {filtersCollapsed && (
        <div className="max-w-7xl mx-auto">
          {/* Collapsed search summary bar */}
          {searchSummary && (
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
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 mb-4">
                {error}
                <button
                  onClick={() =>
                    handleSearch({
                      businessType: filters.businessType,
                      location: filters.location,
                      leadCount: filters.leadCount,
                      websiteFilter: filters.websiteFilter,
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
                savingId={savingId}
                enrichingId={enrichingId}
                onSaveOne={handleSaveOne}
                onEnrichOne={handleEnrichOne}
                onSaveBatch={handleSaveBatch}
                userLeadLimit={userLeadLimit}
                currentLeadCount={userLeadsCount}
              />
            )}

            {/* No results state — only after a zero-result search */}
            {!loading && results.length === 0 && hasSearched && !error && (
              <div className="card text-center py-16">
                <p className="text-sm text-gray-500">No leads found</p>
                <p className="text-xs text-gray-400 mt-1">
                  Try different search terms or location
                </p>
              </div>
            )}

            {loading && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="w-10 px-2 py-3" />
                      <th className="px-3 py-3 font-medium text-gray-500">Business</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Category</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Location</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Rating</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Links</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Phone</th>
                      <th className="px-3 py-3 font-medium text-gray-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i} className="border-b border-gray-100 animate-pulse">
                        <td className="px-2 py-3"><div className="h-4 w-4 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-32 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-20 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-12 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-5 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-24 rounded bg-gray-200" /></td>
                        <td className="px-3 py-3"><div className="h-4 w-16 rounded bg-gray-200" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = withAuth();
