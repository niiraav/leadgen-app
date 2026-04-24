"use client";

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import {
  Mail, Phone, MapPin, Globe, ExternalLink, Sparkles, Pencil, Check, X,
  Linkedin, Search, Info, Loader2, Building2, Tag, AlertTriangle, Frown,
} from "lucide-react";
import { api } from "@/lib/api";
import { ChannelButtons } from "./ChannelButtons";
import type { Lead } from "@leadgen/shared";

// ─── Email status config ───────────────────────────────────────────────────
const EMAIL_STATUS_CONFIG: Record<string, { label: string; className: string; tooltip: string }> = {
  valid:       { label: "Valid",       className: "text-green",       tooltip: "Email address verified and deliverable" },
  invalid:     { label: "Invalid",     className: "text-red",         tooltip: "Email address does not exist" },
  "catch-all": { label: "Catch-all",   className: "text-amber",       tooltip: "Domain accepts all emails, deliverability uncertain" },
  accept_all:  { label: "Accept-all",  className: "text-amber",       tooltip: "Domain accepts all emails, deliverability uncertain" },
  disposable:  { label: "Disposable",  className: "text-orange",      tooltip: "Disposable/temporary email provider" },
  unknown:     { label: "Unknown",     className: "text-text-faint",  tooltip: "Could not verify email" },
};

// ─── Tooltip wrapper (native title for WCAG, styled hover for visual) ────────
function TooltipButton({
  children, label, onClick, disabled = false, className = "",
}: {
  children: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${className}`}
    >
      {children}
    </button>
  );
}

// ─── Info row ────────────────────────────────────────────────────────────────
function InfoRow({
  icon: Icon, label, children, action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="w-4 h-4 text-text-faint shrink-0" />
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="text-text truncate">{children}</span>
        {action}
      </div>
    </div>
  );
}

// ─── Social link row ─────────────────────────────────────────────────────────
function SocialRow({
  icon, label, href, onAdd, editing, editValue, onEditChange, onSave, onCancel, saving,
}: {
  icon: React.ReactNode;
  label: string;
  href?: string | null;
  onAdd?: () => void;
  editing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onSave?: () => void;
  onCancel?: () => void;
  saving?: boolean;
}) {
  if (editing) {
    return (
      <div className="col-span-2 flex items-center gap-1.5">
        <input
          value={editValue || ""}
          onChange={(e) => onEditChange?.(e.target.value)}
          placeholder={`https://${label.toLowerCase().replace(/\s+/g, "")}...`}
          className="flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs text-text focus:outline-none min-h-[28px]"
        />
        <TooltipButton label="Save" onClick={onSave} className="text-green hover:bg-green/5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </TooltipButton>
        <TooltipButton label="Cancel" onClick={onCancel} className="text-text-faint hover:text-text hover:bg-surface-2">
          <X className="w-3.5 h-3.5" />
        </TooltipButton>
      </div>
    );
  }
  if (href) {
    return (
      <a
        href={href.startsWith("http") ? href : `https://${href}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-xs text-blue hover:underline"
      >
        {icon}
        <span>{label}</span>
        <ExternalLink className="w-2.5 h-2.5" />
      </a>
    );
  }
  return (
    <button
      onClick={onAdd}
      className="flex items-center gap-1.5 text-xs text-text-faint hover:text-blue transition-colors"
    >
      <span className="text-text-faint">+</span>
      <span>Add {label}</span>
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ContactProfileCard
// ═════════════════════════════════════════════════════════════════════════════

interface ContactProfileCardProps {
  lead: Lead;
  leadId: string;
  onEmailCompose: () => void;
  repliesCount?: number;
}

export default function ContactProfileCard({
  lead, leadId, onEmailCompose, repliesCount = 0,
}: ContactProfileCardProps) {
  const queryClient = useQueryClient();

  // ── Edit mode ──
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    email: "", phone: "", website_url: "", city: "", category: "", address: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  // ── Owner ──
  const [showOwnerEdit, setShowOwnerEdit] = useState(false);
  const [ownerName, setOwnerName] = useState(lead.owner_name || "");
  const [ownerFirstName, setOwnerFirstName] = useState(lead.owner_first_name || "");

  // ── Social ──
  const [socialEditing, setSocialEditing] = useState<string | null>(null);
  const [socialValues, setSocialValues] = useState({
    facebook_url: lead.facebook_url || "",
    linkedin_url: lead.linkedin_url || "",
    instagram_url: lead.instagram_url || "",
    twitter_handle: lead.twitter_handle || "",
  });
  const [savingSocial, setSavingSocial] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);

  // ── Email verify ──
  const [verifying, setVerifying] = useState(false);
  const [confirmVerify, setConfirmVerify] = useState(false);

  // ── Enrichment ──
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [enrichingContact, setEnrichingContact] = useState(false);
  const [confirmEnrich, setConfirmEnrich] = useState(false);
  const [enrichResult, setEnrichResult] = useState<string | null>(null);
  const [enrichmentVisible, setEnrichmentVisible] = useState(false);

  // ── Derived ──
  const emailBadge = useMemo(() =>
    lead.email_status ? EMAIL_STATUS_CONFIG[lead.email_status] : undefined
  , [lead.email_status]);

  const hasEmail = !!(lead.email && lead.email.trim().length > 0);

  // ── Enrichment preview query ──
  const contactPreviewQuery = useQuery({
    queryKey: ["contact-preview", leadId],
    queryFn: () => api.contactPreview.get(leadId),
    enabled: !!leadId && enrichmentVisible && !lead.contact_enriched_at,
    staleTime: 60_000,
  });
  const contactPreview = contactPreviewQuery.data ?? null;
  const previewLoading = contactPreviewQuery.isLoading && enrichmentVisible;

  // ── Handlers ──
  const startEditing = () => {
    setEditForm({
      email: lead.email ?? "",
      phone: lead.phone ?? "",
      website_url: lead.website_url ?? "",
      city: lead.city ?? "",
      category: lead.category ?? "",
      address: lead.address ?? "",
      notes: lead.notes ?? "",
    });
    setEditing(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {};
      const fields = ["email", "phone", "website_url", "city", "category", "address", "notes"] as const;
      for (const key of fields) {
        const val = editForm[key as keyof typeof editForm].trim();
        if (val !== (lead[key as keyof Lead] ?? "")) updates[key] = val || undefined;
      }
      if (Object.keys(updates).length > 0) {
        await api.leads.update(leadId, updates);
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
          prev ? { ...prev, ...updates } : undefined
        );
        toast.success("Changes saved");
      }
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveOwner = async () => {
    try {
      await api.enrich.updateSocialLinks(leadId, {
        owner_name: ownerName || undefined,
        owner_first_name: ownerFirstName || undefined,
      });
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
        prev ? { ...prev, owner_name: ownerName || undefined, owner_first_name: ownerFirstName || undefined, owner_name_source: "manual" } : undefined
      );
      setShowOwnerEdit(false);
      toast.success("Owner saved");
    } catch (err: any) {
      toast.error("Failed to save owner");
    }
  };

  const handleSaveSocial = async () => {
    if (!socialEditing) return;
    setSavingSocial(true);
    setSocialError(null);
    try {
      const payload: Record<string, unknown> = { [socialEditing]: socialValues[socialEditing as keyof typeof socialValues] || null };
      await api.enrich.updateSocialLinks(leadId, payload);
      queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
        prev ? { ...prev, [socialEditing]: socialValues[socialEditing as keyof typeof socialValues] || undefined } : undefined
      );
      setSocialEditing(null);
      toast.success("Social link saved");
    } catch (err: any) {
      setSocialError(err?.message || "Failed to save. Check the URL format.");
      setTimeout(() => setSocialError(null), 5000);
    } finally {
      setSavingSocial(false);
    }
  };

  const verifyEmail = async () => {
    if (!lead.email) return;
    setVerifying(true);
    try {
      const res = await fetch(`/api/leads/${leadId}/verify-email`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        const status = data.email_status ?? data.status ?? "unknown";
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
          prev ? { ...prev, email_status: status } : undefined
        );
        toast.success("Email verified");
      } else {
        toast.error("Verification failed");
      }
    } catch (err) {
      toast.error("Failed to verify email");
    } finally {
      setVerifying(false);
    }
  };

  const handleEnrichContact = async () => {
    setConfirmEnrich(false);
    setEnrichingContact(true);
    try {
      const result = await api.contactPreview.unlock(leadId);
      if (result?.enriched && result.lead) {
        queryClient.setQueryData(["lead", leadId], result.lead);
        queryClient.invalidateQueries({ queryKey: ["leads"] });
        queryClient.setQueryData(["contact-preview", leadId], null);
        setEnrichmentVisible(false);
        setEnrichResult(`Contact enriched — ${result.contacts?.length ?? 0} contact(s) found`);
        toast.success("Contact enriched");
      } else if (result?.enrichment_status === "no_data") {
        toast("No public contacts found");
        setEnrichResult("No public contacts found");
      } else {
        toast.error(result?.message || "Enrichment failed");
        setEnrichResult(result?.message || "Enrichment failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Enrichment failed");
      setEnrichResult(err.message || "Enrichment failed");
    } finally {
      setEnrichingContact(false);
      setTimeout(() => setEnrichResult(null), 5000);
    }
  };

  const handleEnrich = async () => {
    setEnrichLoading(true);
    try {
      const result = await api.enrich.enrichLead(leadId);
      if (result.success) {
        toast.success("Bio enriched");
        setOwnerName(result.owner_name || "");
        setOwnerFirstName(result.owner_first_name || "");
        queryClient.setQueryData(["lead", leadId], (prev: Lead | undefined) =>
          prev ? { ...prev, owner_name: result.owner_name || prev.owner_name, owner_first_name: result.owner_first_name || prev.owner_first_name } : undefined
        );
      }
    } catch (err: any) {
      toast.error(err.message || "Enrichment failed");
    } finally {
      setEnrichLoading(false);
    }
  };

  // ── Determine which email to display ──
  const displayEmail = lead.contact_email || lead.email || undefined;
  const displayPhone = lead.contact_phone || lead.phone || undefined;
  const displayWebsite = lead.website_url || undefined;

  // ── Render ──
  return (
    <Card>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Contact & Profile</h3>
          {!editing ? (
            <TooltipButton label="Edit contact info" onClick={startEditing} className="text-text-faint hover:text-blue hover:bg-blue/5">
              <Pencil className="w-3.5 h-3.5" />
            </TooltipButton>
          ) : (
            <div className="flex items-center gap-1">
              <TooltipButton label="Save changes" onClick={saveEdit} disabled={saving} className="text-green hover:bg-green/5">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </TooltipButton>
              <TooltipButton label="Cancel editing" onClick={() => setEditing(false)} className="text-text-faint hover:text-red hover:bg-red/5">
                <X className="w-3.5 h-3.5" />
              </TooltipButton>
            </div>
          )}
        </div>

        {/* Edit form */}
        {editing ? (
          <div className="space-y-3">
            {[
              { key: "email", label: "Email", type: "email" },
              { key: "phone", label: "Phone", type: "tel" },
              { key: "website_url", label: "Website", type: "url" },
              { key: "city", label: "City", type: "text" },
              { key: "category", label: "Category", type: "text" },
              { key: "address", label: "Address", type: "text" },
            ].map((field) => (
              <div key={field.key}>
                <label className="text-xs text-text-muted mb-1 block">{field.label}</label>
                <input
                  type={field.type}
                  value={editForm[field.key as keyof typeof editForm]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  placeholder={`Add ${field.label.toLowerCase()}...`}
                  className="input text-sm w-full"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-text-muted mb-1 block">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Add notes..."
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                rows={3}
              />
            </div>
          </div>
        ) : (
          <>
            {/* ── Stacked contact rows ── */}
            <div className="space-y-2.5">
              {displayEmail && (
                <InfoRow icon={Mail} label="Email">
                  {displayEmail}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Status badge */}
                    {lead.email_status === "valid" && (
                      <span className="text-green text-xs" title="Verified deliverable">✓</span>
                    )}
                    {lead.email_status === "catch-all" && (
                      <span className="text-amber text-xs" title="Catch-all domain">⚠</span>
                    )}
                    {lead.email_status === "invalid" && (
                      <span className="text-red text-xs" title="Invalid email">✗</span>
                    )}
                    {lead.contact_email_type && (
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md ${
                        lead.contact_email_type === "direct" ? "bg-green/10 text-green" : "bg-surface-2 text-text-muted"
                      }`}>
                        {lead.contact_email_type === "direct" ? "Direct" : "Generic"}
                      </span>
                    )}
                    {/* Verify button */}
                    {hasEmail && !confirmVerify && (
                      <TooltipButton
                        label="Verify email deliverability"
                        onClick={() => setConfirmVerify(true)}
                        disabled={verifying}
                        className="text-blue hover:bg-blue/5"
                      >
                        {verifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
                      </TooltipButton>
                    )}
                  </div>
                </InfoRow>
              )}

              {/* Verify confirmation */}
              {confirmVerify && (
                <div className="rounded-lg bg-surface-2 p-2 text-xs space-y-2 ml-7">
                  <p className="text-text">Use 1 verification credit?</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setConfirmVerify(false); verifyEmail(); }} disabled={verifying}
                      className="btn btn-primary text-xs flex-1 disabled:opacity-50">
                      {verifying ? "Verifying..." : "Confirm"}
                    </button>
                    <button onClick={() => setConfirmVerify(false)}
                      className="btn btn-ghost text-xs flex-1">Cancel</button>
                  </div>
                </div>
              )}

              {displayPhone && (
                <InfoRow icon={Phone} label="Phone">
                  {displayPhone}
                </InfoRow>
              )}

              {displayWebsite && (
                <InfoRow icon={Globe} label="Website">
                  <a
                    href={displayWebsite.startsWith("http") ? displayWebsite : `https://${displayWebsite}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue hover:underline flex items-center gap-1"
                  >
                    {displayWebsite.replace(/^https?:\/\//, "")}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </InfoRow>
              )}

              {lead.city && (
                <InfoRow icon={MapPin} label="City">
                  {lead.city}{lead.country ? `, ${lead.country}` : ""}
                </InfoRow>
              )}

              {lead.address && (
                <InfoRow icon={Building2} label="Address">
                  {lead.address}
                </InfoRow>
              )}

              {lead.category && (
                <InfoRow icon={Tag} label="Category">
                  {lead.category}
                </InfoRow>
              )}

              {/* Loss Reason — only shown for lost leads */}
              {(lead.status === "lost" || lead.pipelineStage === "lost") && lead.lossReason && (
                <InfoRow icon={Frown} label="Lost reason">
                  <span className="text-red font-medium">
                    {({
                      no_response: "No response",
                      wrong_timing: "Wrong timing",
                      too_expensive: "Too expensive",
                      competitor: "Chose competitor",
                      not_a_fit: "Not a fit",
                      other: "Other",
                    } as Record<string, string>)[lead.lossReason] ?? lead.lossReason}
                  </span>
                </InfoRow>
              )}

              {lead.contact_full_name && (
                <InfoRow icon={Sparkles} label="Contact name">
                  {lead.contact_full_name}
                  {lead.contact_title && <span className="text-text-muted text-xs"> · {lead.contact_title}</span>}
                </InfoRow>
              )}

              {lead.company_size && (
                <InfoRow icon={Building2} label="Company size">
                  {lead.company_size}
                </InfoRow>
              )}

              {/* Empty state */}
              {!displayEmail && !displayPhone && !displayWebsite && !lead.city && !lead.address && !lead.category && !lead.contact_full_name && (
                <div className="text-xs text-text-muted py-1">
                  No contact details yet.
                </div>
              )}
            </div>

            {/* ── Enrichment CTA (only when not yet enriched) ── */}
            {!(lead.contact_enrichment_status === "success" || lead.contact_enrichment_status === "partial" || lead.contact_enrichment_status === "no_data")
              && !lead.contact_enriched_at && (
              <div className="mt-4 pt-4 border-t border-border/40">
                {lead.contact_enrichment_status === "failed" && (
                  <div className="rounded-lg bg-red/5 border border-red/20 p-2.5 mb-2 text-xs text-red space-y-1">
                    <p className="font-medium">Enrichment failed</p>
                    {lead.contact_enrichment_error && <p className="text-text-muted">{lead.contact_enrichment_error}</p>}
                  </div>
                )}

                {previewLoading ? (
                  <div className="flex items-center gap-2 text-xs text-text-muted">
                    <Loader2 className="w-3 h-3 animate-spin" /> Checking for contacts...
                  </div>
                ) : contactPreview && contactPreview.total_contacts > 0 && !contactPreview.already_enriched ? (
                  <div className="rounded-lg bg-blue/5 border border-blue/20 p-3 mb-2 space-y-2">
                    <div className="flex items-center gap-1.5 text-sm text-text font-medium">
                      <Sparkles className="w-3.5 h-3.5 text-blue" />
                      {contactPreview.total_contacts} contact{contactPreview.total_contacts > 1 ? "s" : ""} found
                    </div>
                    <div className="text-xs text-text-muted italic">Unlock to view all contact details</div>
                  </div>
                ) : null}

                {(!lead.contact_enrichment_status || lead.contact_enrichment_status === "failed")
                  && (lead.place_id || lead.data_id || lead.website_url) && (
                  <div className="space-y-1.5">
                    {!confirmEnrich ? (
                      <button
                        onClick={() => { setEnrichmentVisible(true); setConfirmEnrich(true); }}
                        disabled={enrichingContact}
                        className="btn btn-ghost text-xs w-full text-blue"
                      >
                        {enrichingContact ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1 inline" /> : <Search className="w-3.5 h-3.5 mr-1 inline" />}
                        Unlock contact details
                      </button>
                    ) : (
                      <div className="rounded-lg bg-surface-2 p-2 text-xs space-y-2">
                        <p className="text-text">Use 1 enrichment credit to unlock?</p>
                        <div className="flex gap-2">
                          <button onClick={handleEnrichContact} disabled={enrichingContact}
                            className="btn btn-primary text-xs flex-1 disabled:opacity-50">
                            {enrichingContact ? "Enriching..." : "Confirm"}
                          </button>
                          <button onClick={() => setConfirmEnrich(false)}
                            className="btn btn-ghost text-xs flex-1">Cancel</button>
                        </div>
                      </div>
                    )}
                    <p className="text-[10px] text-text-faint text-center">
                      Finds direct email, phone, LinkedIn and owner name · Uses 1 credit
                    </p>
                  </div>
                )}
              </div>
            )}

            {enrichResult && <p className="text-xs text-text-muted mt-2">{enrichResult}</p>}

            {/* ── Owner ── */}
            <div className="mt-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-text-faint uppercase tracking-wider">Owner</span>
                <TooltipButton
                  label={lead.owner_name ? "Edit owner" : "Add owner"}
                  onClick={() => setShowOwnerEdit(true)}
                  className="text-text-faint hover:text-blue hover:bg-blue/5"
                >
                  <Pencil className="w-3 h-3" />
                </TooltipButton>
              </div>

              {showOwnerEdit ? (
                <div className="space-y-2">
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">Full name</label>
                    <input
                      value={ownerName}
                      onChange={(e) => setOwnerName(e.target.value)}
                      placeholder="e.g. John Smith"
                      className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text focus:outline-none min-h-[28px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-text-muted mb-1 block">First name</label>
                    <input
                      value={ownerFirstName}
                      onChange={(e) => setOwnerFirstName(e.target.value)}
                      placeholder="e.g. John"
                      className="w-full rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text focus:outline-none min-h-[28px]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleSaveOwner} className="btn btn-primary text-xs py-0.5 h-6 min-h-[24px]">Save</button>
                    <button onClick={() => setShowOwnerEdit(false)} className="text-xs text-text-muted hover:text-text underline">Cancel</button>
                  </div>
                </div>
              ) : lead.owner_name || lead.owner_first_name ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-text font-medium">
                    {lead.owner_first_name || lead.owner_name}
                  </span>
                  {lead.owner_name_source && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-surface-2 text-text-muted">
                      {lead.owner_name_source === "gmb_reviews" || lead.owner_name_source === "reviews" ? "from reviews" : "manual"}
                    </span>
                  )}
                  {lead.owner_name_source === "reviews" && (
                    <span className="text-text-faint" title="AI-extracted from reviews — please verify">
                      <Info className="w-3 h-3" />
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-sm text-text-faint italic">Unknown</span>
              )}
            </div>

            {/* ── Social & Web ── */}
            <div className="mt-4 pt-4 border-t border-border/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold text-text-faint uppercase tracking-wider">Social & Web</span>
                {socialError && <span className="text-xs text-red">{socialError}</span>}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {/* Google Maps */}
                {lead.gmb_url ? (
                  <a href={lead.gmb_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-blue hover:underline">
                    <MapPin className="w-3 h-3" />
                    Google Maps <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ) : null}

                {/* Website (if not already shown in contact rows) */}
                {displayWebsite && !lead.website_url ? null : null /* website shown above */}

                {/* Facebook */}
                <SocialRow
                  icon={<span className="text-[#1877F2] font-bold text-xs">f</span>}
                  label="Facebook"
                  href={lead.facebook_url}
                  onAdd={() => { setSocialEditing("facebook_url"); setSocialValues((v) => ({ ...v, facebook_url: "" })); }}
                  editing={socialEditing === "facebook_url"}
                  editValue={socialValues.facebook_url}
                  onEditChange={(v) => setSocialValues((s) => ({ ...s, facebook_url: v }))}
                  onSave={handleSaveSocial}
                  onCancel={() => setSocialEditing(null)}
                  saving={savingSocial}
                />

                {/* LinkedIn */}
                <SocialRow
                  icon={<Linkedin className="w-3 h-3 text-[#0a66c2]" />}
                  label="LinkedIn"
                  href={lead.linkedin_url}
                  onAdd={() => { setSocialEditing("linkedin_url"); setSocialValues((v) => ({ ...v, linkedin_url: "" })); }}
                  editing={socialEditing === "linkedin_url"}
                  editValue={socialValues.linkedin_url}
                  onEditChange={(v) => setSocialValues((s) => ({ ...s, linkedin_url: v }))}
                  onSave={handleSaveSocial}
                  onCancel={() => setSocialEditing(null)}
                  saving={savingSocial}
                />

                {/* Instagram */}
                <SocialRow
                  icon={<span className="text-[#E1306C] font-bold text-xs">ig</span>}
                  label="Instagram"
                  href={lead.instagram_url}
                  onAdd={() => { setSocialEditing("instagram_url"); setSocialValues((v) => ({ ...v, instagram_url: "" })); }}
                  editing={socialEditing === "instagram_url"}
                  editValue={socialValues.instagram_url}
                  onEditChange={(v) => setSocialValues((s) => ({ ...s, instagram_url: v }))}
                  onSave={handleSaveSocial}
                  onCancel={() => setSocialEditing(null)}
                  saving={savingSocial}
                />

                {/* Twitter / X */}
                <SocialRow
                  icon={<span className="text-text font-bold text-xs">𝕏</span>}
                  label="Twitter / X"
                  href={lead.twitter_handle}
                  onAdd={() => { setSocialEditing("twitter_handle"); setSocialValues((v) => ({ ...v, twitter_handle: "" })); }}
                  editing={socialEditing === "twitter_handle"}
                  editValue={socialValues.twitter_handle}
                  onEditChange={(v) => setSocialValues((s) => ({ ...s, twitter_handle: v }))}
                  onSave={handleSaveSocial}
                  onCancel={() => setSocialEditing(null)}
                  saving={savingSocial}
                />
              </div>
            </div>

            {/* ── Channel buttons ── */}
            <div className="mt-4 pt-4 border-t border-border/40">
              <ChannelButtons
                contactEmail={lead.contact_email || lead.email || undefined}
                contactLinkedin={lead.contact_linkedin || lead.linkedin_url || undefined}
                phone={lead.contact_phone || lead.phone || undefined}
                lead={{
                  id: lead.id,
                  business_name: lead.business_name,
                  category: lead.category,
                  rating: lead.rating,
                  phone: lead.phone,
                  contact_phone: lead.contact_phone,
                }}
                onEmailCompose={onEmailCompose}
                doNotContact={!!lead.doNotContact}
              />
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
