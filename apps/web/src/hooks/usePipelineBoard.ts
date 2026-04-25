import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  business_name: string;
  email: string;
  category: string;
  city: string;
  country: string;
  hot_score: number;
  status: string;
  engagementStatus: string | null;
  pipelineStage: string | null;
  followUpDate: string | null;
  dealValue: number | null;
  latestReply?: any | null;
  unreadReplyCount?: number;
  sequencePaused?: boolean;
  updated_at?: string;
  lossReason?: string | null;
  lossReasonNotes?: string | null;
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
  const [recentlyMovedIds, setRecentlyMovedIds] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
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

  // ── Data queries ──────────────────────────────────────────────

  const { data: leads = [], isLoading: leadsLoading } = useQuery<PipelineLead[]>({
    queryKey: ["leads", { view: "pipeline" }],
    queryFn: async () => {
      const result = await api.pipeline.list();
      return result.map((l: any) => ({
        id: l.id,
        business_name: l.business_name || "",
        email: l.email || "",
        category: l.category || "",
        city: l.city || "",
        country: l.country || "",
        hot_score: l.hot_score ?? 0,
        status: l.status || "new",
        engagementStatus: l.engagementStatus ?? l.engagement_status ?? null,
        pipelineStage: l.pipelineStage ?? l.pipeline_stage ?? null,
        followUpDate: l.followUpDate ?? l.follow_up_date ?? null,
        dealValue: l.dealValue ?? l.deal_value ?? null,
        latestReply: l.latestReply ?? l.latest_reply ?? null,
        unreadReplyCount: l.unreadReplyCount ?? l.unread_reply_count ?? 0,
        sequencePaused: l.sequencePaused ?? l.sequence_paused ?? false,
        updated_at: l.updated_at ?? undefined,
        lossReason: l.lossReason ?? l.loss_reason ?? null,
        lossReasonNotes: l.lossReasonNotes ?? l.loss_reason_notes ?? null,
      }));
    },
    staleTime: 30_000,
  });

  const { data: positionsData } = useQuery<{
    positions: Record<string, { lead_id: string; position: number }[]>;
  }>({
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

  // ── Move mutation (cross-column) ──────────────────────────────

  const moveMutation = useMutation({
    mutationFn: async ({
      leadId,
      targetColumn,
    }: {
      leadId: string;
      targetColumn: PipelineColumnDef;
    }) => {
      const patch: Record<string, unknown> = {
        status: targetColumn.value,
        ...(targetColumn.field === "engagement_status"
          ? { engagementStatus: targetColumn.value }
          : { pipelineStage: targetColumn.value }),
        ...(targetColumn.field === "engagement_status"
          ? { pipelineStage: null }
          : { engagementStatus: null }),
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
          old?.map((lead) =>
            lead.id !== leadId
              ? lead
              : {
                  ...lead,
                  status: targetColumn.value,
                  [setKey]: targetColumn.value,
                  [clearKey]: null,
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

  // ── Bulk move mutation ────────────────────────────────────────

  const bulkMoveMutation = useMutation({
    mutationFn: async ({
      leadIds,
      targetColumn,
    }: {
      leadIds: string[];
      targetColumn: PipelineColumnDef;
    }) => {
      const patch: Record<string, unknown> = {
        status: targetColumn.value,
        ...(targetColumn.field === "engagement_status"
          ? { engagementStatus: targetColumn.value }
          : { pipelineStage: targetColumn.value }),
        ...(targetColumn.field === "engagement_status"
          ? { pipelineStage: null }
          : { engagementStatus: null }),
      };
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

  // ── Reorder mutation (within column) ──────────────────────────

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
        for (const col of Object.keys(next.positions)) {
          next.positions[col] = next.positions[col].filter(
            (p) => p.lead_id !== leadId
          );
        }
        const col = [...(next.positions[columnId] || [])];
        let insertIndex = col.length;
        if (prevLeadId) {
          const idx = col.findIndex((p) => p.lead_id === prevLeadId);
          if (idx !== -1) insertIndex = idx + 1;
        } else if (nextLeadId) {
          const idx = col.findIndex((p) => p.lead_id === nextLeadId);
          if (idx !== -1) insertIndex = idx;
        }
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

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["board", "positions"] });
  }, [queryClient]);

  const isLoading = leadsLoading;

  return {
    leads,
    isLoading,
    positionMap,
    moveMutation,
    bulkMoveMutation,
    reorderMutation,
    recentlyMovedIds,
    // Selection
    selectedIds,
    selectedCount,
    hasSelection,
    selectLead,
    selectAllInColumn,
    clearSelection,
    refresh,
  };
}
