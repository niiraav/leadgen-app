import { useState } from "react";
import {
  Check,
  Globe,
  Phone,
  Lock,
  Mail,
  Star,
  Loader2,
  Plus,
  Zap,
} from "lucide-react";
import { getScoreTier } from "@leadgen/shared";
import type { SearchResult } from "./types";

interface SearchResultsTableProps {
  results: SearchResult[];
  saving: boolean;
  enrichingId: string | null;
  onSaveOne: (result: SearchResult) => void;
  onEnrichOne: (result: SearchResult) => void;
  onSaveBatch: (results: SearchResult[]) => void;
  userLeadLimit: number;
  currentLeadCount: number;
}

function ScoreBar({ score }: { score: number }) {
  const tier = getScoreTier(score);
  const color =
    tier === "hot" ? "bg-green" : tier === "warm" ? "bg-amber" : "bg-red";
  const width = Math.max(8, score);
  return (
    <div
      className="w-16 h-2 rounded-full bg-surface-2 overflow-hidden"
      title={`Quality score: ${score}/100 (${tier})`}
    >
      <div
        className={`h-full ${color} rounded-full transition-all`}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

export function SearchResultsTable({
  results,
  saving,
  enrichingId,
  onSaveOne,
  onEnrichOne,
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
        <h3 className="text-sm font-medium text-text">
          {results.length} result{results.length !== 1 ? "s" : ""} found
        </h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2">
              <th className="p-2 w-8">
                <input
                  type="checkbox"
                  checked={
                    selected.size === nonDuplicateResults.length &&
                    nonDuplicateResults.length > 0
                  }
                  onChange={toggleAll}
                  className="rounded border-border"
                />
              </th>
              <th className="p-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Business
              </th>
              <th className="p-2 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                Location
              </th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                ★
              </th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                <span title="Website">🌐</span>
              </th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                <span title="Phone">📞</span>
              </th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                <span title="Email status">✉️</span>
              </th>
              <th className="p-2 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                <span title="Quality score">Score</span>
              </th>
              <th className="p-2 w-20 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                Actions
              </th>
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
                    <span className="font-medium text-text truncate max-w-[200px]">
                      {r.name}
                    </span>
                    {r.duplicate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue/10 text-blue shrink-0">
                        Saved
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-text-muted">
                    {r.category}
                  </span>
                </td>

                {/* Location */}
                <td className="p-2 text-text-muted text-xs">{r.city}</td>

                {/* Rating */}
                <td className="p-2 text-center">
                  <span
                    className="inline-flex items-center gap-0.5 text-xs text-text"
                    title={`${r.rating.toFixed(1)} stars (${r.reviews} reviews)`}
                  >
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

                {/* Phone icon */}
                <td className="p-2 text-center">
                  {r.phoneAvailability === "available" ? (
                    <span title="Phone available">
                      <Phone className="w-4 h-4 mx-auto text-green" />
                    </span>
                  ) : (
                    <span title="No phone">
                      <Phone className="w-4 h-4 mx-auto text-text-faint" />
                    </span>
                  )}
                </td>

                {/* Email lock icon */}
                <td className="p-2 text-center">
                  {r.emailState === "locked" || r.emailState === "available" ? (
                    <span title="Email exists — enrich to reveal">
                      <Lock className="w-4 h-4 mx-auto text-amber" />
                    </span>
                  ) : r.emailState === "verified" ? (
                    <span title="Verified email available">
                      <Mail className="w-4 h-4 mx-auto text-green" />
                    </span>
                  ) : r.emailState === "unavailable" ? (
                    <span title="No email found">
                      <Mail className="w-4 h-4 mx-auto text-text-faint" />
                    </span>
                  ) : (
                    <span title="Email unknown — not enriched yet">
                      <Mail className="w-4 h-4 mx-auto text-text-faint opacity-50" />
                    </span>
                  )}
                </td>

                {/* Quality score bar */}
                <td className="p-2 text-center">
                  <ScoreBar score={r.hot_score} />
                </td>

                {/* Actions: Save + Enrich */}
                <td className="p-2">
                  <div className="flex items-center justify-center gap-1">
                    {!r.duplicate ? (
                      <>
                        {/* Save only */}
                        <button
                          onClick={() => onSaveOne(r)}
                          disabled={saving}
                          title="Save lead — 1 credit"
                          className="p-1.5 rounded-lg hover:bg-blue/10 text-text-faint hover:text-blue transition-colors disabled:opacity-50"
                        >
                          {saving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
                        </button>
                        {/* Save & Enrich */}
                        <button
                          onClick={() => onEnrichOne(r)}
                          disabled={saving || enrichingId === r.place_id}
                          title="Save & Enrich — 2 credits"
                          className="p-1.5 rounded-lg hover:bg-amber/10 text-text-faint hover:text-amber transition-colors disabled:opacity-50"
                        >
                          {enrichingId === r.place_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Zap className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    ) : null}
                  </div>
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
            <strong>{selected.size}</strong> selected — {creditsNeeded} credit
            {creditsNeeded > 1 ? "s" : ""}
          </span>
          <div className="flex items-center gap-2">
            {!canAfford && (
              <span className="text-xs text-red">Lead limit exceeded</span>
            )}
            <button
              onClick={() => {
                const toSave = results.filter((r) =>
                  selected.has(r.place_id)
                );
                onSaveBatch(toSave);
                setSelected(new Set());
              }}
              disabled={saving || !canAfford}
              className="btn btn-primary text-xs disabled:opacity-50"
            >
              💾 Save — {creditsNeeded} credit{creditsNeeded > 1 ? "s" : ""}
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
