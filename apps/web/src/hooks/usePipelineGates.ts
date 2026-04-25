import { useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { PipelineLead } from "./usePipelineBoard";
import { getColumnDef } from "@leadgen/shared";

// ── Types ─────────────────────────────────────────────────────────

export interface PendingGate {
  type: "follow_up" | "loss";
  leads: PipelineLead[];
  targetColumn: string;
}

export interface GateController {
  pendingGate: PendingGate | null;
  requestMove: (leadIds: string[], targetColumnId: string, allLeads: PipelineLead[]) => void;
  confirmGate: (data: { followUpDate?: string; lossReason?: string; lossNotes?: string }) => Promise<void>;
  skipGate: () => void;
  cancelGate: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────

export function usePipelineGates(
  moveMutation: {
    mutate: (vars: { leadId: string; targetColumn: any }) => void;
  },
  bulkMoveMutation: {
    mutate: (vars: { leadIds: string[]; targetColumn: any }) => void;
  }
): GateController {
  const [pendingGate, setPendingGate] = useState<PendingGate | null>(null);

  // ── Helpers ───────────────────────────────────────────────────

  const doMoves = useCallback(
    (leadIds: string[], targetColumnId: string) => {
      const targetColumn = getColumnDef(targetColumnId);
      if (!targetColumn) return;
      if (leadIds.length === 1) {
        moveMutation.mutate({ leadId: leadIds[0], targetColumn });
      } else {
        bulkMoveMutation.mutate({ leadIds, targetColumn });
      }
    },
    [moveMutation, bulkMoveMutation]
  );

  // ── Request move (entry point) ──────────────────────────────────

  const requestMove = useCallback(
    (leadIds: string[], targetColumnId: string, allLeads: PipelineLead[]) => {
      const leads = allLeads.filter((l) => leadIds.includes(l.id));
      const targetColumn = getColumnDef(targetColumnId);
      if (!targetColumn) return;

      // Follow-up gate: commitment stages without followUpDate
      if (["qualified", "proposal_sent"].includes(targetColumnId)) {
        const missing = leads.filter((l) => !l.followUpDate);
        if (missing.length > 0) {
          setPendingGate({ type: "follow_up", leads: missing, targetColumn: targetColumnId });
          // Move leads that already have follow-up immediately
          const okIds = leads.filter((l) => l.followUpDate).map((l) => l.id);
          if (okIds.length > 0) doMoves(okIds, targetColumnId);
          return;
        }
      }

      // Loss gate
      if (targetColumnId === "lost") {
        setPendingGate({ type: "loss", leads, targetColumn: targetColumnId });
        return;
      }

      // No gate needed — proceed immediately
      doMoves(leadIds, targetColumnId);
    },
    [doMoves]
  );

  // ── Confirm gate (apply data, then move) ────────────────────────

  const confirmGate = useCallback(
    async (data: { followUpDate?: string; lossReason?: string; lossNotes?: string }) => {
      if (!pendingGate) return;

      try {
        await Promise.all(
          pendingGate.leads.map(async (lead) => {
            if (pendingGate.type === "follow_up" && data.followUpDate) {
              await api.leads.update(lead.id, {
                followUpDate: data.followUpDate,
                followUpSource: "manual",
              });
            }
            if (pendingGate.type === "loss" && data.lossReason) {
              await api.leads.update(lead.id, {
                status: "lost",
                lossReason: data.lossReason,
                lossReasonNotes: data.lossNotes,
              });
            }
          })
        );
      } catch (err) {
        console.error("Gate data save failed:", err);
        // Abort: do not proceed with the move if gate data could not be saved
        return;
      }

      // Now proceed with the moves
      const ids = pendingGate.leads.map((l) => l.id);
      doMoves(ids, pendingGate.targetColumn);
      setPendingGate(null);
    },
    [pendingGate, doMoves]
  );

  // ── Skip gate (move without saving data) ────────────────────────

  const skipGate = useCallback(() => {
    if (!pendingGate) return;
    const ids = pendingGate.leads.map((l) => l.id);
    doMoves(ids, pendingGate.targetColumn);
    setPendingGate(null);
  }, [pendingGate, doMoves]);

  // ── Cancel gate (abort move entirely) ─────────────────────────

  const cancelGate = useCallback(() => {
    setPendingGate(null);
  }, []);

  return { pendingGate, requestMove, confirmGate, skipGate, cancelGate };
}
