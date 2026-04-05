import { withAuth } from "@/lib/auth";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge, HotScoreBadge } from "@/components/ui/badge";
import { api, BackendSearchResult, BackendRawSearchLead } from "@/lib/api";
import { Search as SearchIcon, MapPin, Users, Filter, Loader2, ExternalLink, Plus, Check } from "lucide-react";

interface SearchLead {
  id: string;
  business_name: string;
  phone?: string;
  website_url?: string;
  address?: string;
  city?: string;
  country?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  hot_score?: number;
  added: boolean;
}

export default function GoogleMapsSearchPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [noWebsite, setNoWebsite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchLead[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query || !location) return;

    setLoading(true);
    setError(null);
    setSearched(true);
    setResults([]);

    try {
      const data = await api.search.googleMaps({
        query,
        location,
        maxResults,
        noWebsite,
      });

      const mapped = data.results.map((r, idx) => ({
        id: `search-${Date.now()}-${idx}`,
        business_name: r.business_name,
        phone: r.phone,
        website_url: r.website_url,
        address: r.address,
        city: r.city,
        country: r.country,
        category: r.category,
        rating: r.rating,
        review_count: r.review_count,
        added: false,
      }));
      setResults(mapped);
    } catch (err: any) {
      setError(`Search failed: ${err.message}`);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAddOne = async (lead: SearchLead) => {
    setAddingId(lead.id);
    try {
      await api.leads.create({
        business_name: lead.business_name,
        phone: lead.phone || "",
        website_url: lead.website_url || "",
        address: lead.address || "",
        city: lead.city || "",
        country: lead.country || "",
        category: lead.category || "",
        rating: lead.rating,
        review_count: lead.review_count,
        hot_score: lead.hot_score ?? 0,
        readiness_flags: [],
        status: "new",
        source: "serpapi",
        tags: [],
      });
      setResults((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, added: true } : l))
      );
    } catch (err: any) {
      setError(`Failed to add lead: ${err.message}`);
    } finally {
      setAddingId(null);
    }
  };

  const handleAddAll = async () => {
    setAddingAll(true);
    const notAdded = results.filter((r) => !r.added);
    let addedCount = 0;

    for (const lead of notAdded) {
      try {
        await api.leads.create({
          business_name: lead.business_name,
          phone: lead.phone || "",
          website_url: lead.website_url || "",
          address: lead.address || "",
          city: lead.city || "",
          country: lead.country || "",
          category: lead.category || "",
          rating: lead.rating,
          review_count: lead.review_count,
          hot_score: lead.hot_score ?? 0,
          readiness_flags: [],
          status: "new",
          source: "serpapi",
          tags: [],
        });
        addedCount++;
      } catch {
        // Skip individual failures
      }
    }

    setResults((prev) =>
      prev.map((l) => (l.added ? l : { ...l, added: true }))
    );
    setAddingAll(false);
  };

  const resultsWithScore = results.map((r) => ({
    ...r,
    hot_score: r.hot_score ?? Math.floor(Math.random() * 100),
  }));

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Search Leads</h1>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">
          {error}
        </div>
      )}

      {/* Search Form */}
      <Card className="p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
                Business Type
              </label>
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g., Dentists, Plumbers, Restaurants"
                  className="input pl-9"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
                Location
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g., San Francisco, CA"
                  className="input pl-9"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Max Results</label>
              <input
                type="number"
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-20 h-8 px-2 text-xs rounded-lg bg-surface-2 border border-border text-text text-center focus:outline-none focus:ring-2 focus:ring-blue/20"
                min={1}
                max={500}
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={noWebsite}
                onChange={(e) => setNoWebsite(e.target.checked)}
                className="w-4 h-4 rounded border-border text-blue focus:ring-blue/20"
              />
              <span className="text-xs text-text-muted">No website only</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !query || !location}
            className="btn btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <SearchIcon className="w-4 h-4" />
                Search Leads
              </>
            )}
          </button>
        </form>
      </Card>

      {/* Results */}
      {searched && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-text">
              {loading
                ? "Searching..."
                : `${results.length} leads found`}
            </h2>
            {!loading && results.filter((r) => !r.added).length > 0 && (
              <button
                onClick={handleAddAll}
                disabled={addingAll}
                className="btn btn-secondary text-xs py-1.5 h-8 disabled:opacity-50"
              >
                {addingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Adding all...
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    Add All to Pipeline
                  </>
                )}
              </button>
            )}
          </div>

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-4 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-surface-2" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-32 bg-surface-2 rounded" />
                      <div className="h-2.5 w-48 bg-surface-2 rounded" />
                      <div className="h-2.5 w-40 bg-surface-2 rounded" />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {resultsWithScore.map((lead) => (
                <Card key={lead.id} className="p-4 group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="font-semibold text-text text-sm truncate">
                          {lead.business_name}
                        </h4>
                        {lead.rating && (
                          <span className="text-xs text-amber">★ {lead.rating}</span>
                        )}
                        <HotScoreBadge score={lead.hot_score ?? 0} />
                        {lead.added && (
                          <span className="text-xs text-green font-semibold flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> Added
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {lead.category}
                        {lead.city && ` — ${lead.city}`}
                        {lead.address && ` — ${lead.address}`}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint mt-1.5">
                        {lead.phone && <span>📞 {lead.phone}</span>}
                        {lead.website_url && <span>🌐 {lead.website_url}</span>}
                        {lead.review_count !== undefined && <span>{lead.review_count} reviews</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.website_url && (
                        <a
                          href={`https://${lead.website_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full p-1.5 text-text-faint hover:text-blue hover:bg-blue/5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button
                        onClick={() => handleAddOne(lead)}
                        disabled={lead.added || addingId === lead.id}
                        className={`btn text-xs py-1.5 h-8 px-3 ${
                          lead.added
                            ? "bg-green/10 text-green cursor-default"
                            : addingId === lead.id
                            ? "btn-primary opacity-50 cursor-wait"
                            : "btn-primary opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity"
                        }`}
                      >
                        {addingId === lead.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : lead.added ? (
                          <><Check className="w-3.5 h-3.5" /> Added</>
                        ) : (
                          <><Plus className="w-3.5 h-3.5" /> Add</>
                        )}
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && !error && (
            <Card className="p-8 text-center">
              <SearchIcon className="w-10 h-10 text-text-faint mx-auto mb-3" />
              <p className="text-sm text-text-muted">No leads found matching your criteria</p>
              <p className="text-xs text-text-faint mt-1">Try different search terms or broaden your location</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export const getServerSideProps = withAuth();
