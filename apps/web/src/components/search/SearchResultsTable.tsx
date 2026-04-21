import { useState, useRef, useEffect } from "react";
import {
  Link,
  Loader2,
  Zap,
  ChevronUp,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import type { SearchResult } from "./types";

interface SearchResultsTableProps {
  results: SearchResult[];
  savingId: string | null;
  enrichingId: string | null;
  onSaveOne: (result: SearchResult) => void;
  onEnrichOne: (result: SearchResult) => void;
  onSaveBatch: (results: SearchResult[]) => void;
  userLeadLimit: number;
  currentLeadCount: number;
}

type SortableColumn = "business" | "location" | "rating" | null;
type SortDirection = "asc" | "desc" | null;

function getSortIcon(
  column: SortableColumn,
  activeColumn: SortableColumn,
  direction: SortDirection
) {
  if (column !== activeColumn) return null;
  if (direction === "asc") return <ChevronUp className="w-4 h-4" />;
  if (direction === "desc") return <ChevronDown className="w-4 h-4" />;
  return null;
}

function OverflowMenu({
  onEnrich,
  disabled,
}: {
  onEnrich: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
        aria-label="More actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-lg border border-gray-200 bg-white p-1 shadow-xl z-50 min-w-[180px]">
          <button
            onClick={() => {
              onEnrich();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Save & Enrich — 2 credits
          </button>
        </div>
      )}
    </div>
  );
}

export function SearchResultsTable({
  results,
  savingId,
  enrichingId,
  onSaveOne,
  onEnrichOne,
  onSaveBatch,
  userLeadLimit,
  currentLeadCount,
}: SearchResultsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortColumn, setSortColumn] = useState<SortableColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const nonDuplicateResults = results.filter((r) => !r.duplicate);
  const creditsNeeded = selected.size;
  const canAfford = currentLeadCount + creditsNeeded <= userLeadLimit;

  // ── Sort logic ─────────────────────────────────────────────────────────────
  const sortedResults = [...results];
  if (sortColumn && sortDirection) {
    sortedResults.sort((a, b) => {
      let cmp = 0;
      if (sortColumn === "business") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortColumn === "location") {
        cmp = a.city.localeCompare(b.city);
      } else if (sortColumn === "rating") {
        cmp = a.rating - b.rating;
        if (cmp === 0) cmp = a.reviews - b.reviews;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }

  const handleSort = (column: SortableColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

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

  const SortableHeader = ({
    label,
    column,
    className = "",
  }: {
    label: React.ReactNode;
    column: SortableColumn;
    className?: string;
  }) => (
    <th
      className={`px-3 py-3 font-medium text-gray-500 text-left cursor-pointer select-none hover:text-gray-700 transition-colors ${className}`}
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center gap-1">
        {label}
        {getSortIcon(column, sortColumn, sortDirection)}
      </div>
    </th>
  );

  return (
    <div>
      {/* Results count */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">
          {results.length} result{results.length !== 1 ? "s" : ""} found
        </h3>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
            <span className="text-sm text-gray-700">
              <strong>{selected.size}</strong> selected
            </span>
            <div className="flex items-center gap-2">
              {!canAfford && (
                <span className="text-xs text-red-600">Lead limit exceeded</span>
              )}
              <button
                onClick={() => {
                  const toSave = results.filter((r) =>
                    selected.has(r.place_id)
                  );
                  onSaveBatch(toSave);
                  setSelected(new Set());
                }}
                disabled={savingId !== null || !canAfford}
                className="inline-flex items-center rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                Save {selected.size} lead{selected.size > 1 ? "s" : ""}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left">
              <th className="w-10 px-2 py-3">
                <input
                  type="checkbox"
                  checked={
                    selected.size === nonDuplicateResults.length &&
                    nonDuplicateResults.length > 0
                  }
                  onChange={toggleAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <SortableHeader label="Business" column="business" />
              <th className="px-3 py-3 font-medium text-gray-500">
                Category
              </th>
              <SortableHeader label="Location" column="location" />
              <SortableHeader label="Rating" column="rating" />
              <th className="px-3 py-3 font-medium text-gray-500">
                Links
              </th>
              <th className="px-3 py-3 font-medium text-gray-500">
                Phone
              </th>
              <th className="px-3 py-3 font-medium text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((r) => (
              <tr
                key={r.place_id}
                className={`group border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${
                  selected.has(r.place_id) ? "bg-blue-50/40" : ""
                } ${r.duplicate ? "opacity-50" : ""}`}
              >
                {/* Checkbox */}
                <td className="px-2 py-3">
                  {!r.duplicate && (
                    <input
                      type="checkbox"
                      checked={selected.has(r.place_id)}
                      onChange={() => toggleSelect(r.place_id)}
                      aria-label="Select lead"
                      className={`rounded border-gray-300 text-blue-600 focus:ring-blue-500 transition-opacity ${
                        selected.has(r.place_id)
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                    />
                  )}
                </td>

                {/* Business name + saved badge */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    {r.duplicate && r.existingLeadId ? (
                      <button
                        onClick={() => {
                          window.location.href = `/leads/${r.existingLeadId}`;
                        }}
                        className="font-medium text-gray-900 truncate max-w-[200px] hover:underline text-left"
                      >
                        {r.name}
                      </button>
                    ) : (
                      <span className="font-medium text-gray-900 truncate max-w-[200px]">
                        {r.name}
                      </span>
                    )}
                    {r.duplicate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                        Saved
                      </span>
                    )}
                  </div>
                </td>

                {/* Category */}
                <td className="px-3 py-3 text-gray-500 text-sm">{r.category}</td>

                {/* Location */}
                <td className="px-3 py-3 text-gray-500 text-sm">{r.city}</td>

                {/* Rating */}
                <td className="px-3 py-3">
                  <span className="text-sm text-gray-900">
                    {r.rating.toFixed(1)}{" "}
                    <span className="text-gray-400">({r.reviews})</span>
                  </span>
                </td>

                {/* Links */}
                <td className="px-3 py-3">
                  {r.has_website && r.site ? (
                    <a
                      href={r.site}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center text-blue-600 hover:text-blue-700"
                      title={r.site}
                    >
                      <Link className="w-5 h-5" />
                    </a>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                {/* Phone */}
                <td className="px-3 py-3 text-sm">
                  {r.phone ? (
                    <span className="text-gray-900">{r.phone}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>

                {/* Actions */}
                <td className="px-3 py-3 w-28">
                  {!r.duplicate ? (
                    <div className="flex items-center gap-1">
                      {/* Save button */}
                      <button
                        onClick={() => onSaveOne(r)}
                        disabled={savingId !== null}
                        className="rounded border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {savingId === r.place_id ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          "Save"
                        )}
                      </button>

                      {/* Overflow menu — Enrich */}
                      <OverflowMenu
                        onEnrich={() => onEnrichOne(r)}
                        disabled={savingId !== null || enrichingId !== null}
                      />
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
