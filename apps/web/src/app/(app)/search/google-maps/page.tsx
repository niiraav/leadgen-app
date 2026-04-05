"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge, HotScoreBadge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { mockLeads } from "@/lib/mock-data";
import { Search, MapPin, Users, Filter, Loader2, ExternalLink, Plus } from "lucide-react";

export default function GoogleMapsSearchPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [noWebsite, setNoWebsite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<typeof mockLeads>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query || !location) return;

    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      const data = await api.search.googleMaps({
        query,
        location,
        maxResults,
        noWebsite,
      });
      setResults((data as any).leads || []);
    } catch (err: any) {
      // If API is not available, show mock results
      const mockFiltered = mockLeads.filter((l) =>
        l.location.toLowerCase().includes(location.toLowerCase()) ||
        l.company.toLowerCase().includes(query.toLowerCase()) ||
        l.industry.toLowerCase().includes(query.toLowerCase())
      );
      setResults(mockFiltered.length > 0 ? mockFiltered : mockLeads.slice(0, 5));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Google Maps Search</h1>
        <p className="text-sm text-text-muted mt-1">
          Find leads by searching Google Maps for businesses in specific locations
        </p>
      </div>

      {/* Search Form */}
      <Card className="p-5">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
                Business Type
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
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
                <Search className="w-4 h-4" />
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
              {loading ? "Searching..." : `${results.length} leads found`}
            </h2>
            {!loading && results.length > 0 && (
              <button className="btn btn-secondary text-xs py-1.5 h-8">
                <Plus className="w-3.5 h-3.5" />
                Add All to Pipeline
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
              {results.map((lead) => (
                <Card key={lead.id} className="p-4 group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h4 className="font-semibold text-text text-sm truncate">
                          {lead.company}
                        </h4>
                        <HotScoreBadge score={lead.hotScore} />
                      </div>
                      <p className="text-xs text-text-muted">{lead.name} – {lead.title}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-faint mt-1.5">
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{lead.location}
                        </span>
                        <span>{lead.industry}</span>
                        <span>{lead.employees} employees</span>
                        <span>Rev: {lead.revenue}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.website && (
                        <a
                          href={`https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-full p-1.5 text-text-faint hover:text-blue hover:bg-blue/5 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                      <button className="btn btn-primary text-xs py-1.5 h-8 px-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Plus className="w-3.5 h-3.5" />
                        Add
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}

          {!loading && results.length === 0 && (
            <Card className="p-8 text-center">
              <Search className="w-10 h-10 text-text-faint mx-auto mb-3" />
              <p className="text-sm text-text-muted">No leads found matching your criteria</p>
              <p className="text-xs text-text-faint mt-1">Try different search terms or broaden your location</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
