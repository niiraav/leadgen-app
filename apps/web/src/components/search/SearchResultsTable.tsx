import { useState } from "react";
import { Check, Globe, Phone, Lock, Star, Loader2, Plus } from "lucide-react";

interface SearchResult {
  place_id: string;
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
  description?: string;
  duplicate?: boolean;
  existingLeadId?: string;
}

interface SearchResultsTableProps {
  results: SearchResult[];
  saving: boolean;
  onSaveOne: (result: SearchResult) => void;
  onSaveBatch: (results: SearchResult[]) => void;
  userLeadLimit: number;
  currentLeadCount: number;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green" : score >= 50 ? "bg-amber" : "bg-red";
  const width = Math.max(8, score);
  return (
    <div className="w-16 h-2 rounded-full bg-surface-2 overflow-hidden">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${width}%` }} />
    </div>
  );
}

export function SearchResultsTable({
  results,
  saving,
  onSaveOne,
  onSaveBatch,
  userLeadLimit,
  currentLeadCount,
}: SearchResultsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const nonDuplicateResults = results.filter((r) => !r.duplicate);
  const creditsNeeded = selected.size;
  const canAfford = currentLeadCount + creditsNeeded <= userLeadLimit;

  const toggleSelect = (placeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(placeId)) next.delete(placeId);
      else next.add(placeId);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === nonDuplicateResults.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(nonDuplicateResults.map((r) => r.place_id)));
    }
  };

  return (
    <div>
      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-text">{results.length} results found</h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={selected.size === nonDuplicateResults.length && nonDuplicateResults.length > 0}
                  onChange={toggleAll}
                  className="rounded border-border"
                />
              </th>
              <th className="p-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Business</th>
              <th className="p-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">City</th>
              <th className="p-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">Rating</th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">🌐</th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">📞</th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">Score</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr
                key={r.place_id}
                className={`border-b border-border/40 hover:bg-surface-2/50 transition-colors ${
                  r.duplicate ? "opacity-50" : ""
                }`}
              >
                {/* Checkbox */}
                <td className="p-2">
                  {!r.duplicate && (
                    <input
                      type="checkbox"
                      checked={selected.has(r.place_id)}
                      onChange={() => toggleSelect(r.place_id)}
                      className="rounded border-border"
                    />
                  )}
                </td>

                {/* Business name + category */}
                <td className="p-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text truncate max-w-[200px]">{r.name}</span>
                    {r.duplicate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue/10 text-blue shrink-0">
                        In Leads
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted">{r.category}</span>
                </td>

                {/* City */}
                <td className="p-2 text-text-muted">{r.city}</td>

                {/* Rating */}
                <td className="p-2">
                  <span className="inline-flex items-center gap-0.5 text-text">
                    <Star className="w-3 h-3 fill-amber text-amber" />
                    {r.rating.toFixed(1)}
                    <span className="text-text-faint">({r.reviews})</span>
                  </span>
                </td>

                {/* Website icon */}
                <td className="p-2 text-center">
                  {r.has_website ? (
                    <span title="Has website">
                      <Globe className="w-4 h-4 mx-auto text-green" />
                    </span>
                  ) : (
                    <span title="No website">
                      <Globe className="w-4 h-4 mx-auto text-text-faint" />
                    </span>
                  )}
                </td>

                {/* Phone icon (locked until saved) */}
                <td className="p-2 text-center">
                  <span title="Save to reveal phone">
                    <Lock className="w-3.5 h-3.5 mx-auto text-text-faint" />
                  </span>
                </td>

                {/* Hot score bar */}
                <td className="p-2 text-center">
                  <ScoreBar score={r.hot_score} />
                </td>

                {/* Save button */}
                <td className="p-2">
                  {!r.duplicate ? (
                    <button
                      onClick={() => onSaveOne(r)}
                      disabled={saving}
                      title="Save lead — 1 credit"
                      className="p-1.5 rounded-lg hover:bg-blue/10 text-text-faint hover:text-blue transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between mt-3 p-3 rounded-xl bg-blue/5 border border-blue/20">
          <span className="text-sm text-text">
            <strong>{selected.size}</strong> selected — {creditsNeeded} credit{creditsNeeded > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            {!canAfford && (
              <span className="text-xs text-red">Lead limit exceeded</span>
            )}
            <button
              onClick={() => {
                const toSave = results.filter((r) => selected.has(r.place_id));
                onSaveBatch(toSave);
                setSelected(new Set());
              }}
              disabled={saving || !canAfford}
              className="btn btn-primary text-xs disabled:opacity-50"
            >
              💾 Save — {creditsNeeded} credits
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="btn btn-ghost text-xs"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
