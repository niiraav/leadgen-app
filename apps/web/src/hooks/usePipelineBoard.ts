import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
  DropAnimation,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  PIPELINE_COLUMNS,
  PipelineColumnDef,
  getOpposingField,
  getColumnDef,
  getLeadColumn,
} from "@leadgen/shared";

// ── Types ─────────────────────────────────────────────────────────

export interface PipelineLead {
  id: string;
  businessName: string;
  email: string;
  category: string;
  city: string;
  country: string;
  hotScore: number;
  status: string;
  engagementStatus: string | null;
  pipelineStage: string | null;
}

export interface SelectModifiers {
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

// Re-export shared symbols for convenience
export { PIPELINE_COLUMNS, getOpposingField, getColumnDef, getLeadColumn };
export type { PipelineColumnDef };

// ── Hook ──────────────────────────────────────────────────────────

export function usePipelineBoard() {
  const queryClient = useQueryClient();
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [recentlyMovedIds, setRecentlyMovedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [isMultiDrag, setIsMultiDrag] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedCount = selectedIds.size;
  const hasSelection = selectedCount > 0;

  // ── Selection helpers ─────────────────────────────────────────

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectLead = useCallback(
    (
      leadId: string,
      columnLeads: PipelineLead[],
      modifiers: SelectModifiers
    ) => {
      const { shiftKey, metaKey, ctrlKey } = modifiers;

      // Shift+click = range select within column
      if (shiftKey && lastSelectedId) {
        const lastIndex = columnLeads.findIndex((l) => l.id === lastSelectedId);
        const currentIndex = columnLeads.findIndex((l) => l.id === leadId);
        if (lastIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(lastIndex, currentIndex);
          const end = Math.max(lastIndex, currentIndex);
          const rangeIds = columnLeads.slice(start, end + 1).map((l) => l.id);
          setSelectedIds((prev) => {
            const next = new Set(prev);
            rangeIds.forEach((id) => next.add(id));
            return next;
          });
        }
        setLastSelectedId(leadId);
        return;
      }

      // Cmd/Ctrl+click = toggle individual
      if (metaKey || ctrlKey) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(leadId)) next.delete(leadId);
          else next.add(leadId);
          return next;
        });
        setLastSelectedId(leadId);
        return;
      }

      // Plain click = single select (replaces previous)
      setSelectedIds(new Set([leadId]));
      setLastSelectedId(leadId);
    },
    [lastSelectedId]
  );

  const selectAllInColumn = useCallback(
    (columnId: string, columnLeads: PipelineLead[]) => {
      const ids = columnLeads.map((l) => l.id);
      setSelectedIds((prev) => {
        // If all already selected, deselect all; otherwise select all
        const allSelected = ids.every((id) => prev.has(id));
        if (allSelected) {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        }
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        return next;
      });
      if (ids.length > 0) setLastSelectedId(ids[ids.length - 1]);
    },
    []
  );

  // Keyboard: Esc clears selection
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearSelection();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clearSelection]);

  // ── DnD sensors ───────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // ── Data queries ──────────────────────────────────────────────

  const { data: leads = [], isLoading: leadsLoading } = useQuery<PipelineLead[]>({
    queryKey: ["leads", { view: "pipeline" }],
    queryFn: async () => {
      const result = await api.pipeline.list();
      return result.map((l: any) => ({
        id: l.id,
        businessName: l.business_name || l.businessName || "",
        email: l.email || "",
        category: l.category || "",
        city: l.city || "",
        country: l.country || "",
        hotScore: l.hot_score ?? l.hotScore ?? 0,
        status: l.status || "new",
        engagementStatus: l.engagement_status ?? l.engagementStatus ?? null,
        pipelineStage: l.pipeline_stage ?? l.pipelineStage ?? null,
      }));
    },
    staleTime: 30_000,
  });

  const { data: positionsData } = useQuery({
    queryKey: ["board", "positions"],
    queryFn: api.board.getPositions,
    staleTime: 30_000,
  });

  // Build a fast lookup map: columnId -> leadId -> position
  const positionMap = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    if (!positionsData?.positions) return map;
    for (const [colId, items] of Object.entries(positionsData.positions)) {
      map[colId] = {};
      for (const item of items) {
        map[colId][item.lead_id] = item.position;
      }
    }
    return map;
  }, [positionsData]);

  // Group leads into columns and sort by position (no position => Infinity, then hot_score DESC)
  const leadsByColumn = useMemo(() => {
    const map: Record<string, PipelineLead[]> = {};
    for (const col of PIPELINE_COLUMNS) {
      map[col.id] = [];
    }
    for (const lead of leads) {
      const colId = getLeadColumn(lead);
      const col = getColumnDef(colId);
      if (col) {
        map[colId].push(lead);
      } else {
        map["new"].push(lead);
      }
    }
    for (const colId of Object.keys(map)) {
      map[colId].sort((a, b) => {
        const posA = positionMap[colId]?.[a.id] ?? Infinity;
        const posB = positionMap[colId]?.[b.id] ?? Infinity;
        if (posA !== posB) return posA - posB;
        return b.hotScore - a.hotScore;
      });
    }
    return map;
  }, [leads, positionMap]);

  // ── Single lead move mutation ─────────────────────────────────

  const moveMutation = useMutation({
    mutationFn: async ({
      leadId,
      targetColumn,
    }: {
      leadId: string;
      targetColumn: PipelineColumnDef;
    }) => {
      const opposingField = getOpposingField(targetColumn.id);
      const patch: Record<string, unknown> = {
        status: targetColumn.value,
        [targetColumn.field]: targetColumn.value,
        [opposingField]: null,
      };
      await api.leads.update(leadId, patch);
    },
    onMutate: async ({ leadId, targetColumn }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData<PipelineLead[]>([
        "leads",
        { view: "pipeline" },
      ]);

      const opposingField = getOpposingField(targetColumn.id);

      queryClient.setQueryData<PipelineLead[]>(
        ["leads", { view: "pipeline" }],
        (old) =>
          old?.map((lead) =>
            lead.id !== leadId
              ? lead
              : {
                  ...lead,
                  status: targetColumn.value,
                  [targetColumn.field === "engagement_status"
                    ? "engagementStatus"
                    : "pipelineStage"]: targetColumn.value,
                  [opposingField === "engagement_status"
                    ? "engagementStatus"
                    : "pipelineStage"]: null,
                }
          ) ?? []
      );

      setRecentlyMovedIds((prev) => {
        const next = new Set(prev);
        next.add(leadId);
        return next;
      });
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setRecentlyMovedIds(new Set());
      }, 1300);

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["leads", { view: "pipeline" }], context.previous);
      }
      toast.error("Failed to move lead");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // ── Bulk move mutation (multi-select drag) ────────────────────

  const bulkMoveMutation = useMutation({
    mutationFn: async ({
      leadIds,
      targetColumn,
    }: {
      leadIds: string[];
      targetColumn: PipelineColumnDef;
    }) => {
      const opposingField = getOpposingField(targetColumn.id);
      const patch: Record<string, unknown> = {
        status: targetColumn.value,
        [targetColumn.field]: targetColumn.value,
        [opposingField]: null,
      };
      // Parallel updates — backend handles each independently
      await Promise.all(leadIds.map((id) => api.leads.update(id, patch)));
    },
    onMutate: async ({ leadIds, targetColumn }) => {
      await queryClient.cancelQueries({ queryKey: ["leads"] });
      const previous = queryClient.getQueryData<PipelineLead[]>([
        "leads",
        { view: "pipeline" },
      ]);

      const opposingField = getOpposingField(targetColumn.id);
      const setKey =
        targetColumn.field === "engagement_status"
          ? "engagementStatus"
          : "pipelineStage";
      const clearKey =
        opposingField === "engagement_status"
          ? "engagementStatus"
          : "pipelineStage";

      queryClient.setQueryData<PipelineLead[]>(
        ["leads", { view: "pipeline" }],
        (old) =>
          old?.map((lead) => {
            if (!leadIds.includes(lead.id)) return lead;
            return {
              ...lead,
              status: targetColumn.value,
              [setKey]: targetColumn.value,
              [clearKey]: null,
            };
          }) ?? []
      );

      setRecentlyMovedIds((prev) => {
        const next = new Set(prev);
        leadIds.forEach((id) => next.add(id));
        return next;
      });
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        setRecentlyMovedIds(new Set());
      }, 1300);

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["leads", { view: "pipeline" }], context.previous);
      }
      toast.error("Failed to move leads");
    },
    onSuccess: (_data, { leadIds, targetColumn }) => {
      toast.success(`${leadIds.length} lead${leadIds.length > 1 ? "s" : ""} moved to ${targetColumn.title}`);
      clearSelection();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  // ── Reorder mutation within a column ──────────────────────────

  const reorderMutation = useMutation({
    mutationFn: async ({
      leadId,
      columnId,
      prevLeadId,
      nextLeadId,
    }: {
      leadId: string;
      columnId: string;
      prevLeadId: string | null;
      nextLeadId: string | null;
    }) => {
      return api.board.reorder(leadId, columnId, prevLeadId, nextLeadId);
    },
    onMutate: async ({ leadId, columnId, prevLeadId, nextLeadId }) => {
      await queryClient.cancelQueries({ queryKey: ["board", "positions"] });
      const previous = queryClient.getQueryData<{
        positions: Record<string, { lead_id: string; position: number }[]>;
      }>(["board", "positions"]);

      queryClient.setQueryData<{
        positions: Record<string, { lead_id: string; position: number }[]>;
      }>(["board", "positions"], (old) => {
        if (!old?.positions) return old;
        const next = { ...old, positions: { ...old.positions } };
        // Remove lead from all columns
        for (const col of Object.keys(next.positions)) {
          next.positions[col] = next.positions[col].filter(
            (p) => p.lead_id !== leadId
          );
        }
        const col = [...(next.positions[columnId] || [])];
        // Determine insertion index from prev/next lead IDs
        let insertIndex = col.length;
        if (prevLeadId) {
          const idx = col.findIndex((p) => p.lead_id === prevLeadId);
          if (idx !== -1) insertIndex = idx + 1;
        } else if (nextLeadId) {
          const idx = col.findIndex((p) => p.lead_id === nextLeadId);
          if (idx !== -1) insertIndex = idx;
        }
        // Assign a temporary fractional position
        let position: number;
        if (col.length === 0) {
          position = 1;
        } else if (insertIndex === 0) {
          position = col[0].position / 2;
        } else if (insertIndex >= col.length) {
          position = col[col.length - 1].position + 1;
        } else {
          position = (col[insertIndex - 1].position + col[insertIndex].position) / 2;
        }
        col.splice(insertIndex, 0, { lead_id: leadId, position });
        next.positions[columnId] = col;
        return next;
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["board", "positions"], context.previous);
      }
      toast.error("Failed to reorder lead");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["board", "positions"] });
    },
  });

  // ── DnD Handlers ──────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const activeId = event.active.id as string;
      setActiveLeadId(activeId);

      // If dragging a non-selected card, clear multi-selection and select just this one
      if (!selectedIds.has(activeId)) {
        setSelectedIds(new Set([activeId]));
        setLastSelectedId(activeId);
        setIsMultiDrag(false);
      } else {
        // Dragging a selected card → multi-drag mode
        setIsMultiDrag(selectedCount > 1);
      }
    },
    [selectedIds, selectedCount]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLeadId(null);
      setIsMultiDrag(false);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeLead = leads.find((l) => l.id === activeId);
      if (!activeLead) return;
      const activeCol = getLeadColumn(activeLead);

      // Check if dropped over a column (droppable ID is column ID)
      const targetColumn = getColumnDef(overId);
      if (targetColumn) {
        if (activeCol === overId) return; // same column — no-op

        // Multi-drag: move all selected cards to target column
        if (selectedIds.has(activeId) && selectedCount > 1) {
          const idsToMove = Array.from(selectedIds);
          bulkMoveMutation.mutate({ leadIds: idsToMove, targetColumn });
        } else {
          // Single card move
          moveMutation.mutate({ leadId: activeId, targetColumn });
        }
        return;
      }

      // Check if dropped over another card
      const overLead = leads.find((l) => l.id === overId);
      if (!overLead) return;
      const overCol = getLeadColumn(overLead);

      if (activeCol !== overCol) {
        // Cross-column card drop
        const colDef = getColumnDef(overCol);
        if (!colDef) return;

        if (selectedIds.has(activeId) && selectedCount > 1) {
          const idsToMove = Array.from(selectedIds);
          bulkMoveMutation.mutate({ leadIds: idsToMove, targetColumn: colDef });
        } else {
          moveMutation.mutate({ leadId: activeId, targetColumn: colDef });
        }
        return;
      }

      // Same column reorder — only applies to the dragged card
      const colLeads = leadsByColumn[activeCol];
      const oldIndex = colLeads.findIndex((l) => l.id === activeId);
      const newIndex = colLeads.findIndex((l) => l.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

      const reordered = arrayMove(colLeads, oldIndex, newIndex);
      const finalIndex = reordered.findIndex((l) => l.id === activeId);
      const prevLeadId = finalIndex === 0 ? null : reordered[finalIndex - 1].id;
      const nextLeadId =
        finalIndex === reordered.length - 1 ? null : reordered[finalIndex + 1].id;

      reorderMutation.mutate({
        leadId: activeId,
        columnId: activeCol,
        prevLeadId,
        nextLeadId,
      });
    },
    [leads, leadsByColumn, selectedIds, selectedCount, moveMutation, bulkMoveMutation, reorderMutation]
  );

  const dropAnimation: DropAnimation = {
    sideEffects: defaultDropAnimationSideEffects({
      styles: { active: { opacity: "0.5" } },
    }),
  };

  const isLoading = leadsLoading;

  return {
    leads,
    leadsByColumn,
    isLoading,
    sensors,
    activeLeadId,
    handleDragStart,
    handleDragEnd,
    dropAnimation,
    moveMutation,
    recentlyMovedIds,
    // Selection
    selectedIds,
    selectedCount,
    hasSelection,
    isMultiDrag,
    selectLead,
    selectAllInColumn,
    clearSelection,
    // Bulk
    bulkMoveMutation,
  };
}
