import { Search, Edit3, X, MapPin, Hash, Globe } from "lucide-react";
import type { CollapsedSearchBarProps } from "./types";

export function CollapsedSearchBar({
  summary,
  onRefine,
  onClear,
}: CollapsedSearchBarProps) {
  const { filters, resultCount } = summary;

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-secondary/50 transition-all">
      {/* Search icon + core info */}
      <Search className="w-4 h-4 text-primary shrink-0" />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground min-w-0">
        {/* Business type */}
        <span className="font-medium truncate max-w-[180px]">
          {filters.businessType}
        </span>

        {/* Location */}
        <span className="flex items-center gap-1 text-muted-foreground">
          <MapPin className="w-3 h-3" />
          {filters.location}
        </span>

        {/* Count */}
        <span className="flex items-center gap-1 text-muted-foreground">
          <Hash className="w-3 h-3" />
          {filters.leadCount}
        </span>

        {/* Website filter if active */}
        {filters.websiteFilter !== 'any' && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Globe className="w-3 h-3" />
            {filters.websiteFilter === 'has' ? "Has website" : "No website"}
          </span>
        )}

        {/* Result count */}
        <span className="text-primary font-medium">
          {resultCount} result{resultCount !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Refine button */}
      <button
        onClick={onRefine}
        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Edit search filters"
      >
        <Edit3 className="w-3.5 h-3.5" />
        Refine
      </button>

      {/* Clear button */}
      <button
        onClick={onClear}
        className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title="Clear search"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
