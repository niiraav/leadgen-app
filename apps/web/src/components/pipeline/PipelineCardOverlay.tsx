import { PipelineLead } from "@/hooks/usePipelineBoard";
import { getColumnDef, getLeadColumn, followUpHealth, formatCompactDealValue } from "@leadgen/shared";

interface PipelineCardOverlayProps {
  lead: PipelineLead;
}

export default function PipelineCardOverlay({ lead }: PipelineCardOverlayProps) {
  const columnId = getLeadColumn(lead);
  const column = getColumnDef(columnId);

  const renderStateSignal = () => {
    if ((lead.unreadReplyCount ?? 0) > 0) {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          {lead.unreadReplyCount} new
        </span>
      );
    }

    if (lead.followUpDate) {
      const health = followUpHealth(lead.followUpDate);
      const colorClass =
        health === "red"
          ? "text-destructive"
          : health === "amber"
          ? "text-warning"
          : "text-muted-foreground";
      const label =
        health === "red"
          ? "Overdue"
          : health === "amber"
          ? "Due today"
          : new Date(lead.followUpDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      return (
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${colorClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${health === "red" ? "bg-destructive" : health === "amber" ? "bg-warning" : "bg-muted-foreground"}`} />
          {label}
        </span>
      );
    }

    if (lead.status === "lost") {
      return (
        <span className="inline-flex items-center text-[10px] font-medium text-muted-foreground">
          Lost
        </span>
      );
    }

    return null;
  };

  const renderContextRow = () => {
    const items: React.ReactNode[] = [];

    if (columnId === "replied" && lead.latestReply?.intent) {
      items.push(
        <span
          key="intent"
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-primary/10 text-primary"
        >
          {String(lead.latestReply.intent).replace(/_/g, " ")}
        </span>
      );
    }

    if (["proposal_sent", "converted"].includes(columnId) && lead.dealValue && lead.dealValue > 0) {
      items.push(
        <span
          key="deal"
          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary"
        >
          {formatCompactDealValue(lead.dealValue)}
        </span>
      );
    }

    if (columnId === "lost" && lead.lossReason) {
      items.push(
        <span
          key="loss"
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 border border-gray-200"
        >
          {lead.lossReason.replace(/_/g, " ")}
        </span>
      );
    }

    if (items.length === 0) return null;
    return <div className="flex items-center gap-1.5 mt-1">{items}</div>;
  };

  return (
    <div
      className="
        w-[280px] rounded-lg border border-primary/30 bg-surface p-3
        shadow-2xl shadow-black/20
        rotate-2 scale-[1.02]
        cursor-grabbing
      "
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h4 className="text-sm font-semibold text-text truncate flex-1 min-w-0">
          {lead.business_name}
        </h4>
      </div>

      <div className="mt-1">
        <span
          className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
          style={{ backgroundColor: column?.color ?? "#6b7280" }}
        >
          {column?.title ?? lead.status}
        </span>
      </div>

      {renderStateSignal() && <div className="mt-1">{renderStateSignal()}</div>}
      {renderContextRow()}
    </div>
  );
}
