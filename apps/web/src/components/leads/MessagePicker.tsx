"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Loader2,
  Pencil,
  Save,
  Circle,
  CheckCircle2,
} from "lucide-react";
import { api, UpgradeRequiredError } from "@/lib/api";
import UpgradePrompt from "@/components/ui/upgrade-prompt";
import { Portal } from "@/components/ui/portal";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MessagePickerProps {
  lead: {
    id: string;
    business_name: string;
    category?: string;
    rating?: number;
    phone?: string;
    contact_phone?: string;
  };
  open: boolean;
  onClose: () => void;
  channel?: "whatsapp" | "sms";
}

interface Template {
  id: string;
  name: string;
  message: string;
  is_default?: boolean;
}

interface DailyQuota {
  used: number;
  limit: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function resolvePersonalization(
  text: string,
  lead: MessagePickerProps["lead"]
): string {
  return text
    .replace(/\{name\}/g, lead.business_name)
    .replace(/\{rating\}/g, lead.rating?.toFixed(1) ?? "N/A")
    .replace(/\{category\}/g, lead.category ?? "N/A");
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MessagePicker({
  lead,
  open,
  onClose,
  channel,
}: MessagePickerProps) {
  const [loading, setLoading] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [quota, setQuota] = useState<DailyQuota>({ used: 0, limit: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<Error | string | null>(null);
  const [sending, setSending] = useState(false);

  // Custom message state
  const [showCustom, setShowCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Derived
  const cleanPhone =
    lead.contact_phone?.replace(/\D/g, "") ??
    lead.phone?.replace(/\D/g, "") ??
    "";
  const waPhone = cleanPhone.startsWith("44")
    ? cleanPhone
    : `44${cleanPhone}`;
  const hasPhone = cleanPhone.length > 0;
  const quotaExceeded = quota.limit !== -1 && quota.used >= quota.limit;
  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const activeMessage = showCustom
    ? customMessage
    : selectedTemplate?.message ?? "";
  const resolvedMessage = resolvePersonalization(activeMessage, lead);

  /* ---- Fetch templates on open ---- */

  const fetchPicker = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.messagePicker.get(lead.id);
      setTemplates(data.templates ?? []);
      setQuota(data.dailyQuota ?? { used: 0, limit: 0 });
      // Auto-select the first default template
      const defaultTpl = data.templates?.find((t) => t.is_default);
      if (defaultTpl) {
        setSelectedId(defaultTpl.id);
      } else if (data.templates?.length > 0) {
        setSelectedId(data.templates[0].id);
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err
          : new Error((err as Error).message || "Failed to load templates")
      );
    } finally {
      setLoading(false);
    }
  }, [open, lead.id]);

  useEffect(() => {
    fetchPicker();
  }, [fetchPicker]);

  /* ---- Reset state on close ---- */

  useEffect(() => {
    if (!open) {
      setShowCustom(false);
      setCustomMessage("");
      setCustomLabel("");
      setError(null);
      setSending(false);
    }
  }, [open]);

  /* ---- Validate custom message ---- */

  const customHasPersonalization =
    /\{name\}|\{rating\}|\{category\}/.test(customMessage);

  /* ---- Send handler ---- */

  const handleSend = async (channel: "whatsapp" | "sms") => {
    if (quotaExceeded) return;
    if (showCustom && !customMessage.trim()) return;
    if (showCustom && !customHasPersonalization) {
      setError(
        "Custom message must include at least one personalization tag ({name}, {rating}, or {category})"
      );
      return;
    }

    setSending(true);
    setError(null);

    try {
      const payload: {
        leadId: string;
        templateId?: string;
        channel: string;
        message: string;
      } = {
        leadId: lead.id,
        channel,
        message: resolvedMessage,
      };
      if (!showCustom && selectedId) {
        payload.templateId = selectedId;
      }

      const res = await api.messagePicker.send(payload);

      if (channel === "whatsapp") {
        const url =
          res.url ??
          `https://wa.me/${waPhone}?text=${encodeURIComponent(resolvedMessage)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        const url =
          res.url ??
          `sms:${cleanPhone}?body=${encodeURIComponent(resolvedMessage)}`;
        window.location.href = url;
      }

      onClose();
    } catch (err: unknown) {
      if (err instanceof UpgradeRequiredError) {
        setError(err);
      } else {
        setError(
          err instanceof Error ? err : new Error((err as Error).message || "Send failed")
        );
      }
    } finally {
      setSending(false);
    }
  };

  /* ---- Save custom template ---- */

  const handleSaveTemplate = async () => {
    if (!customMessage.trim() || !customLabel.trim()) return;
    setSavingTemplate(true);
    setError(null);
    try {
      const saved = await api.messagePicker.saveTemplate({
        name: customLabel.trim(),
        message: customMessage.trim(),
      });
      setTemplates((prev) => [...prev, saved]);
      setSelectedId(saved.id);
      setShowCustom(false);
      setCustomMessage("");
      setCustomLabel("");
    } catch (err: unknown) {
      if (err instanceof UpgradeRequiredError) {
        setError(err);
      } else {
        setError(
          err instanceof Error
            ? err
            : new Error((err as Error).message || "Failed to save template")
        );
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  /* ---- Render ---- */

  if (!open) return null;

  return (
    <Portal>
    <div
      className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border/60 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {channel === "whatsapp"
                ? "Send WhatsApp"
                : channel === "sms"
                ? "Send SMS"
                : "Send Message"}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lead.business_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-foreground-faint hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Loading state */}
          {loading && (
            <div className="flex items-center justify-center gap-3 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading templates...
              </span>
            </div>
          )}

          {/* Error / Upgrade prompt */}
          {error && !loading && (
            <UpgradePrompt
              error={error}
              onDismiss={() => setError(null)}
              compact
            />
          )}

          {/* Template list */}
          {!loading && !showCustom && templates.length > 0 && (
            <div>
              <p className="text-sm font-medium text-foreground mb-2">
                Quick Messages
              </p>
              <div className="space-y-1.5">
                {templates.map((tpl) => {
                  const isSelected = selectedId === tpl.id;
                  const preview = resolvePersonalization(tpl.message, lead);
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        setSelectedId(tpl.id);
                        setShowCustom(false);
                      }}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all min-h-[44px] active:scale-[0.98] ${
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-secondary hover:border-border"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        {isSelected ? (
                          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-foreground-faint shrink-0" />
                        )}
                        <span
                          className={`text-sm font-semibold ${
                            isSelected ? "text-primary" : "text-foreground"
                          }`}
                        >
                          {tpl.name}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6 line-clamp-2">
                        {preview}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No templates fallback */}
          {!loading && !showCustom && templates.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No templates available. Write a custom message below.
            </p>
          )}

          {/* Custom message area */}
          {showCustom && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Template name
                </label>
                <input
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. First outreach"
                  className="w-full rounded-lg border border-border bg-secondary px-3 py-2.5 text-sm text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Message
                </label>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Hi {name}, I noticed your {rating}-rated business in {category}..."
                  className="w-full h-32 rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-foreground-faint focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <span
                    className={`text-xs ${
                      customMessage.trim() && !customHasPersonalization
                        ? "text-destructive"
                        : "text-foreground-faint"
                    }`}
                  >
                    {customMessage.trim() && !customHasPersonalization
                      ? "Include at least one tag: {name}, {rating}, or {category}"
                      : "Use {name}, {rating}, {category} for personalization"}
                  </span>
                  {customLabel.trim() &&
                    customMessage.trim() &&
                    customHasPersonalization && (
                      <button
                        onClick={handleSaveTemplate}
                        disabled={savingTemplate}
                        className="text-xs text-primary hover:underline flex items-center gap-1 min-h-[32px] disabled:opacity-50"
                      >
                        {savingTemplate ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        Save as template
                      </button>
                    )}
                </div>
              </div>
              {/* Preview */}
              {customMessage.trim() && customHasPersonalization && (
                <div className="rounded-lg border border-border/40 bg-secondary p-3">
                  <p className="text-xs font-medium text-foreground-faint mb-1">
                    Preview
                  </p>
                  <p className="text-sm text-foreground">
                    {resolvePersonalization(customMessage, lead)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quota display */}
          {!loading && (
            <div className="flex items-center justify-between text-xs">
              <span
                className={
                  quotaExceeded ? "text-destructive font-medium" : "text-muted-foreground"
                }
              >
                {quota.limit === -1
                  ? `${quota.used} sends today (unlimited)`
                  : `${quota.used}/${quota.limit} sends today`}
              </span>
              {quotaExceeded && (
                <span className="text-destructive font-medium">Quota reached</span>
              )}
            </div>
          )}

          {/* Action buttons */}
          {!loading && (
            <div className="space-y-2">
              <div className="flex gap-2">
                {/* WhatsApp — only if no channel filter or whatsapp */}
                {(!channel || channel === "whatsapp") && (
                  <button
                    onClick={() => handleSend("whatsapp")}
                    disabled={
                      quotaExceeded ||
                      sending ||
                      (!selectedId && !showCustom) ||
                      (showCustom &&
                        (!customMessage.trim() || !customHasPersonalization))
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>&#10024;</span>
                        Send WhatsApp
                        <span>&#128241;</span>
                      </>
                    )}
                  </button>
                )}

                {/* SMS — only if no channel filter or sms */}
                {(!channel || channel === "sms") && (
                  <button
                    onClick={() => handleSend("sms")}
                    disabled={
                      quotaExceeded ||
                      sending ||
                      (!selectedId && !showCustom) ||
                      (showCustom &&
                        (!customMessage.trim() || !customHasPersonalization)) ||
                      !hasPhone
                    }
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>&#128241;</span>
                        Send SMS
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Custom toggle + Cancel */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setShowCustom((prev) => !prev);
                    if (!showCustom) setSelectedId(null);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                >
                  <Pencil className="w-4 h-4" />
                  {showCustom ? "Use Template" : "Custom"}
                </button>

                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg border border-border/60 bg-secondary px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    </Portal>
  );
}
