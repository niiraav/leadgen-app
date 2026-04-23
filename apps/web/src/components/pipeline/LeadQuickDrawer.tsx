import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { api, type Lead } from "@/lib/api";
import { X, Mail, Phone, MapPin, Globe, Star, Tag, Calendar, ArrowRight, Flame } from "lucide-react";
import Link from "next/link";
import { PIPELINE_COLUMNS, getColumnDef } from "@leadgen/shared";

interface LeadQuickDrawerProps {
  leadId: string | null;
  onClose: () => void;
}

export function LeadQuickDrawer({ leadId, onClose }: LeadQuickDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: ["lead", leadId],
    queryFn: async () => {
      if (!leadId) throw new Error("No lead ID");
      return api.leads.get(leadId);
    },
    enabled: !!leadId,
    staleTime: 30_000,
  });

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && leadId) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [leadId, onClose]);

  // Close on click outside
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    if (leadId) {
      // Delay slightly to avoid closing immediately on the click that opened it
      const timer = setTimeout(() => {
        window.addEventListener("mousedown", onClick);
      }, 100);
      return () => {
        clearTimeout(timer);
        window.removeEventListener("mousedown", onClick);
      };
    }
  }, [leadId, onClose]);

  const columnDef = lead ? getColumnDef(lead.status) : undefined;
  const columnTitle = columnDef?.title ?? lead?.status ?? "";

  return (
    <AnimatePresence>
      {leadId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            ref={drawerRef}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 350, damping: 32 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-surface border-l border-border shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <h2 className="text-base font-semibold text-text truncate pr-4">
                {isLoading ? "Loading…" : lead?.business_name ?? "Lead Details"}
              </h2>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {isLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-6 bg-surface-2 rounded-lg w-3/4" />
                  <div className="h-4 bg-surface-2 rounded-lg w-1/2" />
                  <div className="h-20 bg-surface-2 rounded-xl" />
                  <div className="h-32 bg-surface-2 rounded-xl" />
                </div>
              ) : lead ? (
                <>
                  {/* Status & Score */}
                  <div className="flex items-center gap-3">
                    {columnDef && (
                      <span
                        className="text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-md"
                        style={{
                          color: columnDef.color,
                          backgroundColor: `${columnDef.color}18`,
                        }}
                      >
                        {columnTitle}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-orange-500/10 text-orange-500">
                      <Flame className="w-3 h-3" />
                      Hot Score {lead.hot_score ?? 0}
                    </span>
                  </div>

                  {/* Contact */}
                  <div className="space-y-2.5">
                    {lead.email && (
                      <div className="flex items-center gap-2.5 text-sm text-text">
                        <Mail className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    {lead.phone && (
                      <div className="flex items-center gap-2.5 text-sm text-text">
                        <Phone className="w-4 h-4 text-text-muted shrink-0" />
                        <span>{lead.phone}</span>
                      </div>
                    )}
                    {(lead.address || lead.city || lead.country) && (
                      <div className="flex items-center gap-2.5 text-sm text-text">
                        <MapPin className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="truncate">
                          {[lead.address, lead.city, lead.country].filter(Boolean).join(", ")}
                        </span>
                      </div>
                    )}
                    {lead.website_url && (
                      <a
                        href={lead.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 text-sm text-blue hover:underline"
                      >
                        <Globe className="w-4 h-4 text-text-muted shrink-0" />
                        <span className="truncate">{lead.website_url}</span>
                      </a>
                    )}
                  </div>

                  {/* Rating */}
                  {lead.rating !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                      <span className="font-medium text-text">{lead.rating}</span>
                      <span className="text-text-muted">
                        {lead.review_count ? `(${lead.review_count} reviews)` : ""}
                      </span>
                    </div>
                  )}

                  {/* Category & Tags */}
                  <div className="flex flex-wrap gap-2">
                    {lead.category && (
                      <span className="text-xs px-2 py-1 rounded-md bg-surface-2 text-text-muted border border-border flex items-center gap-1">
                        <Tag className="w-3 h-3" />
                        {lead.category}
                      </span>
                    )}
                    {lead.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded-md bg-surface-2 text-text-muted border border-border"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Created */}
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Calendar className="w-3.5 h-3.5" />
                    Added {lead.created_at ? new Date(lead.created_at).toLocaleDateString() : "—"}
                  </div>

                  {/* Notes */}
                  {lead.notes && (
                    <div className="bg-surface-2 rounded-xl p-4 border border-border">
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                        Notes
                      </h3>
                      <p className="text-sm text-text whitespace-pre-line line-clamp-6">
                        {lead.notes}
                      </p>
                    </div>
                  )}

                  {/* Contact Enrichment */}
                  {lead.contact_full_name && (
                    <div className="bg-surface-2 rounded-xl p-4 border border-border">
                      <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
                        Contact
                      </h3>
                      <div className="space-y-1.5 text-sm">
                        <p className="text-text font-medium">{lead.contact_full_name}</p>
                        {lead.contact_title && <p className="text-text-muted">{lead.contact_title}</p>}
                        {lead.contact_email && <p className="text-blue">{lead.contact_email}</p>}
                        {lead.contact_phone && <p className="text-text-muted">{lead.contact_phone}</p>}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-sm text-text-muted text-center py-8">
                  Lead not found.
                </div>
              )}
            </div>

            {/* Footer */}
            {lead && (
              <div className="px-5 py-4 border-t border-border shrink-0 bg-surface">
                <Link
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-surface-2 border border-border text-sm font-medium text-text hover:bg-surface-3 transition-colors"
                  onClick={onClose}
                >
                  Open full profile
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
