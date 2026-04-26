"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Star, Plus, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SavedFilter {
  id: string;
  name: string;
  filters: Record<string, unknown>;
}

interface SavedFiltersProps {
  filters: SavedFilter[];
  currentFilters: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
  onSave: (name: string, filters: Record<string, unknown>) => void;
}

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function SavedFilters({
  filters,
  currentFilters,
  onApply,
  onSave,
}: SavedFiltersProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use passed filters (parent manages state)
  const displayFilters = filters.length > 0 ? filters : saved;

  useEffect(() => {
    if (open) {
      fetchSaved();
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4,
      left: rect.right - 240, // align right edge (w-60 = 240px)
      width: 240,
    });
  }, [open]);

  useEffect(() => {
    if (showSaveInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showSaveInput]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        buttonRef.current && !buttonRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const handleScrollResize = () => setOpen(false);
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    window.addEventListener("scroll", handleScrollResize, true);
    window.addEventListener("resize", handleScrollResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("scroll", handleScrollResize, true);
      window.removeEventListener("resize", handleScrollResize);
    };
  }, [open]);

  const fetchSaved = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/saved-filters`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSaved(data ?? []);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await onSave(trimmed, currentFilters);
      setNewName("");
      setShowSaveInput(false);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${API}/saved-filters/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      setSaved((prev) => prev.filter((f) => f.id !== id));
    } catch {}
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 rounded-full text-xs border transition-colors",
          open
            ? "bg-warning/10 border-amber text-warning"
            : "bg-secondary border-border text-muted-foreground hover:text-foreground hover:border-border-strong"
        )}
        title="Saved filters"
      >
        <Star className={cn("w-3.5 h-3.5", open && "fill-amber")} />
      </button>

      {open && dropdownPos && createPortal(
        <div
          className="fixed bg-card border border-border rounded-xl shadow-lg z-[100] overflow-hidden"
          style={{
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
          }}
        >
          <div className="p-2 border-b border-border/40">
            <h4 className="text-xs font-semibold text-foreground-faint uppercase tracking-wider px-2 py-1">
              Saved Filters
            </h4>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-7 bg-secondary rounded animate-pulse" />
                ))}
              </div>
            ) : displayFilters.length === 0 ? (
              <p className="p-3 text-xs text-foreground-faint text-center">
                No saved filters yet
              </p>
            ) : (
              displayFilters.map((filter) => (
                <div
                  key={filter.id}
                  className="flex items-center gap-1 px-2 py-1.5 hover:bg-secondary group/row"
                >
                  <button
                    onClick={() => {
                      onApply(filter.filters);
                      setOpen(false);
                    }}
                    className="flex-1 text-left text-sm text-foreground truncate hover:text-primary"
                  >
                    {filter.name}
                  </button>
                  <button
                    onClick={() => handleDelete(filter.id)}
                    className="opacity-0 group-hover/row:opacity-100 text-foreground-faint hover:text-destructive transition-opacity"
                    title="Delete"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border/40 p-2">
            {showSaveInput ? (
              <div className="flex items-center gap-1">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                    if (e.key === "Escape") {
                      setNewName("");
                      setShowSaveInput(false);
                    }
                  }}
                  placeholder="Filter name..."
                  className="flex-1 h-7 text-sm bg-secondary border border-border rounded px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <button
                  onClick={handleSave}
                  disabled={saving || !newName.trim()}
                  className="text-xs p-1 rounded hover:bg-secondary disabled:opacity-40"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5 text-success" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setNewName("");
                    setShowSaveInput(false);
                  }}
                  className="text-xs p-1 rounded hover:bg-secondary text-foreground-faint"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground w-full py-1.5 px-2 rounded"
              >
                <Plus className="w-3.5 h-3.5" />
                Save current filters
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
