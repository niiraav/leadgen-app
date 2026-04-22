"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Trash2, X, Check } from "lucide-react";

// --- Types ---

export interface List {
  id: string;
  name: string;
  count: number;
  color?: string;
}

interface ListsSidebarProps {
  lists: List[];
  activeListId: string | null;
  onListSelect: (listId: string | null) => void;
  onCreateList: (name: string) => void;
  onDeleteList: (listId: string) => void;
  onRenameList: (listId: string, name: string) => void;
}

const LIST_COLORS = [
  "border-blue",
  "border-green",
  "border-amber",
  "border-red",
  "border-purple",
  "border-pink",
];

// --- Component ---

export function ListsSidebar({
  lists,
  activeListId,
  onListSelect,
  onCreateList,
  onDeleteList,
  onRenameList,
}: ListsSidebarProps) {
  const [showNewInput, setShowNewInput] = useState(false);
  const [newName, setNewName] = useState("");

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewInput && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [showNewInput]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
    }
  }, [renamingId]);

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateList(trimmed);
    setNewName("");
    setShowNewInput(false);
  };

  const startRename = (list: List) => {
    setRenamingId(list.id);
    setRenameValue(list.name);
  };

  const finishRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      onRenameList(renamingId, trimmed);
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDelete = (listId: string) => {
    onDeleteList(listId);
  };

  return (
    <aside className="w-56 shrink-0 border-r border-border/60 bg-surface h-full flex flex-col">
      <div className="p-3 border-b border-border/40">
        <h3 className="text-xs font-semibold text-text-faint uppercase tracking-wider mb-2">
          Lists
        </h3>

        {/* All row */}
        <div
          onClick={() => onListSelect(null)}
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer text-sm transition-colors group",
            activeListId === null
              ? "bg-surface-2 text-text"
              : "text-text-muted hover:bg-surface-2"
          )}
        >
          <span className="font-medium">All</span>
          <span className="ml-auto text-xs text-text-faint bg-surface rounded-full px-1.5 py-px">
            {lists.reduce((sum, l) => sum + l.count, 0)}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {lists.map((list) => (
          <div
            key={list.id}
            onClick={() => {
              if (renamingId !== list.id) onListSelect(list.id);
            }}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 cursor-pointer text-sm transition-colors border-l-2 group",
              activeListId === list.id
                ? "bg-surface-2 text-text border-blue"
                : "text-text-muted hover:bg-surface-2 border-transparent",
              list.color ?? LIST_COLORS[Math.abs(list.id.charCodeAt(0)) % LIST_COLORS.length]
            )}
          >
            {renamingId === list.id ? (
              <div className="flex items-center gap-1 w-full" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") finishRename();
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  className="flex-1 h-6 text-sm bg-surface border border-border rounded px-1.5 text-text focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <button
                  onClick={finishRename}
                  className="text-green hover:text-green/80"
                  title="Save"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setRenamingId(null)}
                  className="text-text-faint hover:text-text"
                  title="Cancel"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <span className="truncate flex-1 text-sm">{list.name}</span>
                <span className="text-xs text-text-faint bg-surface rounded-full px-1.5 py-px shrink-0">
                  {list.count}
                </span>
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(list);
                    }}
                    className="p-0.5 text-text-faint hover:text-text rounded"
                    title="Rename"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(list.id);
                    }}
                    className="p-0.5 text-text-faint hover:text-red rounded"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-border/40">
        {showNewInput ? (
          <div className="flex items-center gap-1">
            <input
              ref={newInputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") {
                  setNewName("");
                  setShowNewInput(false);
                }
              }}
              placeholder="List name..."
              className="flex-1 h-7 text-sm bg-surface-2 border border-border rounded-lg px-2 text-text focus:outline-none focus:ring-1 focus:ring-primary/20"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim()}
              className="btn btn-primary text-xs h-7 px-2 disabled:opacity-40"
              title="Create"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setNewName("");
                setShowNewInput(false);
              }}
              className="btn btn-ghost text-xs h-7 px-2"
              title="Cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewInput(true)}
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text transition-colors w-full py-1"
          >
            <Plus className="w-3.5 h-3.5" />
            New list
          </button>
        )}
      </div>
    </aside>
  );
}
