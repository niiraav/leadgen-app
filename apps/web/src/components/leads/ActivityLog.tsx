import React from "react";

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 2) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) +
    `, ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}

const TYPE_LABELS: Record<string, string> = {
  created: "Lead created",
  updated: "Lead updated",
  enriched: "Contact enriched",
  email_verified: "Email verified",
  email_drafted: "Email drafted",
  emailed: "Email sent",
  replied: "Reply received",
  status_changed: "Status changed",
  imported: "Lead imported",
  reply_classified: "Reply classified",
  bio_generated: "Bio generated",
};

const FIELD_LABELS: Record<string, string> = {
  engagement_status: "Engagement status changed",
  pipeline_stage: "Pipeline stage changed",
  lifecycle_state: "Lifecycle state changed",
  do_not_contact: "Marked do not contact",
};

export const ActivityLog = React.memo(function ActivityLog({ activities }: { activities: { id: string; type: string; description: string; created_at: string; field?: string | null }[] }) {
  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-text-faint">
        No activity yet
      </div>
    );
  }

  function activityLabel(a: { type: string; field?: string | null; description?: string }): string {
    if (a.type === 'status_changed' && a.field && FIELD_LABELS[a.field]) {
      return FIELD_LABELS[a.field];
    }
    return TYPE_LABELS[a.type] || a.description || a.type;
  }

  return (
    <div className="space-y-3">
      {activities.map((a) => (
        <div key={a.id} className="flex items-start gap-3 text-sm">
          <div className="w-2 h-2 rounded-full bg-blue mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-text">
              {activityLabel(a)}
            </div>
            <div className="text-xs text-text-faint">
              {formatTime(a.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
