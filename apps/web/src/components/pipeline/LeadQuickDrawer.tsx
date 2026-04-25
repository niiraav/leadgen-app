import { useState, useEffect } from "react";
import { X, Save, Calendar, PoundSterling, Clock } from "lucide-react";
import { daysFromNow, followUpHealth, formatCompactDealValue } from "@leadgen/shared";
import { Lead } from "@/lib/api";

interface LeadQuickDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
}

export default function LeadQuickDrawer({ lead, isOpen, onClose, onUpdate }: LeadQuickDrawerProps) {
  const [dealValue, setDealValue] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (lead) {
      setDealValue(lead.dealValue ? String(lead.dealValue / 100) : "");
      setFollowUpDate(lead.followUpDate ? lead.followUpDate.slice(0, 10) : "");
    }
  }, [lead]);

  if (!isOpen || !lead) return null;

  const health = followUpHealth(lead.followUpDate || null);
  const healthColor = health === "red" ? "text-destructive" : health === "amber" ? "text-warning" : "text-success";
  const healthLabel = health === "red" ? "Overdue" : health === "amber" ? "Due today" : health === "green" ? "On track" : "No follow-up";

  const quickOptions = [
    { label: "Tomorrow", days: 1 },
    { label: "3 days", days: 3 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
  ];

  const handleQuick = (days: number) => {
    const d = daysFromNow(days);
    setFollowUpDate(d.toISOString().slice(0, 10));
    handleSave({ followUpDate: d.toISOString() });
  };

  const handleSave = async (override?: Record<string, unknown>) => {
    if (!lead) return;
    setSaving(true);
    try {
      const data: Record<string, unknown> = override || {};
      if (!override) {
        const val = dealValue ? Math.round(parseFloat(dealValue) * 100) : null;
        data.dealValue = val;
        if (followUpDate) {
          const d = new Date(followUpDate);
          d.setUTCHours(0, 0, 0, 0);
          data.followUpDate = d.toISOString();
        } else {
          data.followUpDate = null;
        }
      }
      await onUpdate(lead.id, data);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("Save failed", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer */}
      <div className="relative bg-surface border-l border-border w-full max-w-md h-full overflow-y-auto animate-slide-in-right">
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text">{lead.business_name}</h3>
            <p className="text-xs text-text-muted mt-0.5">{lead.email || lead.phone || "No contact"}</p>
          </div>
          <button onClick={onClose} className="text-text-faint hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* Deal Value */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
              <PoundSterling className="w-3.5 h-3.5" />
              Deal value
            </label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-faint">£</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                onBlur={() => handleSave()}
                className="input pl-6 text-sm"
                placeholder="0.00"
              />
            </div>
            {lead.dealValue && lead.dealValue > 0 && (
              <p className="text-[11px] text-text-faint mt-1">
                Current: {formatCompactDealValue(lead.dealValue)}
              </p>
            )}
          </div>

          {/* Follow-up */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-text-muted mb-2">
              <Calendar className="w-3.5 h-3.5" />
              Follow-up date
            </label>

            {health && (
              <div className={`flex items-center gap-1.5 text-[11px] font-medium mb-2 ${healthColor}`}>
                <Clock className="w-3 h-3" />
                {healthLabel}
              </div>
            )}

            <div className="relative mb-3">
              <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint" />
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                onBlur={() => handleSave()}
                className="input pl-9 text-sm"
              />
            </div>

            <div className="flex gap-2">
              {quickOptions.map((opt) => (
                <button
                  key={opt.days}
                  onClick={() => handleQuick(opt.days)}
                  className="flex-1 py-1.5 px-1 rounded-md text-[11px] font-medium bg-surface-2 border border-border text-text-muted hover:bg-secondary transition-colors"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Save indicator */}
          {saved && (
            <div className="flex items-center gap-1.5 text-[11px] text-success">
              <Save className="w-3 h-3" />
              Saved
            </div>
          )}
          {saving && (
            <div className="flex items-center gap-1.5 text-[11px] text-text-faint">
              <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Saving...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
