import { useState, useCallback, useMemo, useRef } from "react";
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

// Re-export shared symbols for convenience
export { PIPELINE_COLUMNS, getOpposingField, getColumnDef, getLeadColumn };
export type { PipelineColumnDef };

// ── Hook ──────────────────────────────────────────────────────────

export function usePipelineBoard() {
  const queryClient = useQueryClient();
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [recentlyMovedIds, setRecentlyMovedIds] = useState<Set<string>>(new Set());
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // DnD sensors — activation constraint prevents accidental drags on touch
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  // Fetch leads via api.pipeline.list() which wraps api.leads.list + mapBackendLead
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

  // Fetch board positions for persistent ordering
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

  // Move mutation — optimistic update must mirror PATCH body exactly
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

      // Track as recently moved for highlight flash
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

  // Reorder mutation within a column — now persisted via /board/reorder
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
        // Assign a temporary fractional position to preserve order
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

  // ── DnD Handlers ────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveLeadId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveLeadId(null);

      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeLead = leads.find((l) => l.id === activeId);
      if (!activeLead) return;
      const activeCol = getLeadColumn(activeLead);

      // Check if dropped over a column (droppable ID is column ID)
      const targetColumn = getColumnDef(overId);
      if (targetColumn) {
        // Dropped on a different column
        if (activeCol === overId) return;
        moveMutation.mutate({ leadId: activeId, targetColumn });
        return;
      }

      // Check if dropped over another card
      const overLead = leads.find((l) => l.id === overId);
      if (!overLead) return;
      const overCol = getLeadColumn(overLead);

      if (activeCol !== overCol) {
        // Cross-column card drop — treat as column move
        const colDef = getColumnDef(overCol);
        if (colDef) moveMutation.mutate({ leadId: activeId, targetColumn: colDef });
        return;
      }

      // Same column reorder
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
    [leads, leadsByColumn, moveMutation, reorderMutation]
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
  };
}
