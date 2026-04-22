"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { withAuth } from "@/lib/auth";
import { useProfile } from "@/contexts/profile-context";
import { Check, Sparkles, Loader2, X } from "lucide-react";
import {
  SERVICE_CATEGORIES,
  ROLE_OPTIONS,
  TONE_OPTIONS,
  SIGNOFF_OPTIONS,
  CTA_OPTIONS,
  DAYS_OF_WEEK,
  type ServiceKey,
} from "@/lib/services";

function SettingsProfilePage() {
  const { profile, loading, updateProfile, generateUsp, refreshProfile } = useProfile();

  // Identity
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [role, setRole] = useState("");

  // Services
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  // Pitch
  const [usp, setUsp] = useState("");
  const [uspGenerating, setUspGenerating] = useState(false);
  const [uspPitches, setUspPitches] = useState<string[]>([]);

  // Outreach style
  const [tone, setTone] = useState("professional");
  const [signoffStyle, setSignoffStyle] = useState("Best regards");
  const [ctaPreference, setCtaPreference] = useState("reply_email");

  // Target market
  const [targetGeography, setTargetGeography] = useState("");
  const [targetCategories, setTargetCategories] = useState<string[]>([]);

  // Work schedule
  const [workingDays, setWorkingDays] = useState<string[]>(["mon","tue","wed","thu","fri"]);
  const [workingStart, setWorkingStart] = useState("09:00");
  const [workingEnd, setWorkingEnd] = useState("18:00");
  const [salesCycle, setSalesCycle] = useState(14);

  // Optional links
  const [calendlyLink, setCalendlyLink] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");

  // Per-section save state
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load profile into state
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setCompanyName(profile.company_name || "");
      setRole(profile.role || "");
      setSelectedServices(profile.services || []);
      setCustomServices(profile.custom_services || []);
      setUsp(profile.usp || "");
      setTone(profile.tone || "professional");
      setSignoffStyle(profile.signoff_style || "Best regards");
      setCtaPreference(profile.cta_preference || "reply_email");
      setTargetGeography(profile.target_geography || "");
      setTargetCategories(profile.target_categories || []);
      setWorkingDays(profile.working_days || ["mon","tue","wed","thu","fri"]);
      setWorkingStart(profile.working_hours_start || "09:00");
      setWorkingEnd(profile.working_hours_end || "18:00");
      setSalesCycle(profile.sales_cycle_days || 14);
      setCalendlyLink(profile.calendly_link || "");
      setLinkedinUrl(profile.linkedin_url || "");
    }
  }, [profile]);

  // Auto-save debounced
  const autoSave = useCallback((key: string, value: unknown) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSavingSection(key);
      updateProfile({ [key]: value } as Record<string, unknown>).then(() => {
        setTimeout(() => setSavingSection(null), 1500);
      });
    }, 500);
  }, [updateProfile]);

  // Identity save (manual button, not auto-save to avoid noise)
  const handleSaveIdentity = () => {
    updateProfile({ full_name: fullName, company_name: companyName, role });
    setSavingSection("identity");
    setTimeout(() => setSavingSection(null), 1500);
  };

  const toggleService = (key: string) => {
    const next = selectedServices.includes(key)
      ? selectedServices.filter((s) => s !== key)
      : [...selectedServices, key];
    setSelectedServices(next);
    autoSave("services", next);
  };

  const addCustomService = () => {
    const trimmed = customInput.trim();
    if (trimmed && customServices.length < 5) {
      const next = [...customServices, trimmed];
      setCustomServices(next);
      autoSave("custom_services", next);
      setCustomInput("");
    }
  };

  const handleGenerateUsp = async () => {
    setUspGenerating(true);
    try {
      const result = await generateUsp({
        company_name: companyName,
        role,
        services: selectedServices,
        custom_services: customServices,
        tone,
        target_categories: targetCategories,
        target_geography: targetGeography,
      });
      setUspPitches(result.pitches || []);
    } catch { /* fail silently */ } 
    finally { setUspGenerating(false); }
  };

  const toggleDay = (day: string) => {
    const next = workingDays.includes(day)
      ? workingDays.filter((d) => d !== day)
      : [...workingDays, day];
    setWorkingDays(next);
    autoSave("working_days", next);
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-surface-2 rounded w-48" />
        <div className="h-40 bg-surface-2 rounded" />
        <div className="h-40 bg-surface-2 rounded" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text tracking-tight">Profile &amp; Settings</h1>
        <p className="text-sm text-text-muted mt-1">Customise your AI outreach and target market</p>
      </div>

      {/* Section 1: Identity */}
      <Section title="Identity" saving={savingSection === "identity"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Full name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Company name</label>
            <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[44px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Your role</label>
            <div className="grid grid-cols-2 gap-2">
              {ROLE_OPTIONS.map((r) => (
                <button key={r.key} onClick={() => setRole(r.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all min-h-[44px] active:scale-[0.98] ${
                    role === r.key ? "border-blue bg-blue/10 text-blue" : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                  }`}>
                  <span className="text-base">{r.emoji}</span>
                  <span>{r.label}</span>
                  {role === r.key && <Check className="w-3.5 h-3.5 ml-auto" />}
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleSaveIdentity} className="btn btn-primary text-sm">
            Save changes
          </button>
        </div>
      </Section>

      {/* Section 2: Services */}
      <Section title="Services" saving={savingSection === "services"}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_CATEGORIES.map((s) => {
              const selected = selectedServices.includes(s.key);
              return (
                <button key={s.key} onClick={() => toggleService(s.key)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all min-h-[44px] active:scale-[0.98] ${
                    selected ? "border-blue bg-blue/10 text-blue" : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                  }`}>
                  <span className="text-base">{s.emoji}</span>
                  <span className="truncate">{s.label}</span>
                  {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input value={customInput} onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustomService()}
              placeholder="Add custom service..."
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]" />
            <button onClick={addCustomService} disabled={!customInput.trim()} className="btn btn-primary text-sm disabled:opacity-50 min-h-[44px]">Add</button>
          </div>
          {customServices.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customServices.map((cs, i) => (
                <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue/10 text-blue px-2.5 py-1 text-xs">
                  {cs}
                  <button onClick={() => { const next = customServices.filter((_, j) => j !== i); setCustomServices(next); autoSave("custom_services", next); }} className="hover:text-red/70"><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* Section 3: Your Pitch */}
      <Section title="Your Pitch" saving={savingSection === "usp"}>
        <div className="space-y-4">
          <textarea
            value={usp}
            onChange={(e) => setUsp(e.target.value)}
            onBlur={() => autoSave("usp", usp)}
            placeholder="Your one-liner pitch..."
            className="w-full h-24 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className={`text-xs ${usp.length > 150 ? "text-red" : "text-text-faint"}`}>
              {usp.length}/150
            </span>
            <button onClick={handleGenerateUsp} disabled={uspGenerating} className="text-xs text-blue hover:underline flex items-center gap-1 min-h-[32px]">
              {uspGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {uspGenerating ? "Generating..." : "Generate with AI"}
            </button>
          </div>
          {uspPitches.length > 0 && (
            <div className="space-y-2">
              {uspPitches.map((p, i) => (
                <div key={i} className="rounded-lg border border-border/40 bg-surface-2 p-3">
                  <p className="text-xs text-text-faint mb-1">Option {i + 1}</p>
                  <p className="text-sm text-text mb-2">{p}</p>
                  <button onClick={() => { setUsp(p); autoSave("usp", p); setUspPitches([]); }} className="text-xs text-blue hover:underline">Use this</button>
                </div>
              ))}
              <button onClick={() => setUspPitches([])} className="text-xs text-text-muted hover:text-text underline">Write my own instead</button>
            </div>
          )}
        </div>
      </Section>

      {/* Section 4: Outreach Style */}
      <Section title="Outreach Style" saving={savingSection === "tone" || savingSection === "signoff" || savingSection === "cta"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Email tone</label>
            <div className="space-y-1.5">
              {TONE_OPTIONS.map((t) => (
                <button key={t.key} onClick={() => { setTone(t.key); autoSave("tone", t.key); }}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all min-h-[44px] active:scale-[0.98] ${tone === t.key ? "border-blue bg-blue/10" : "border-border/60 bg-surface-2 hover:border-border"}`}>
                  <span className={`text-sm font-semibold ${tone === t.key ? "text-blue" : "text-text"}`}>
                    {tone === t.key ? "●" : "○"} {t.label}
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">{t.preview}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Sign off with:</label>
            <div className="flex flex-wrap gap-2">
              {SIGNOFF_OPTIONS.map((s) => (
                <button key={s} onClick={() => { setSignoffStyle(s); autoSave("signoff_style", s); }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${
                    signoffStyle === s ? "border-blue bg-blue/10 text-blue" : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                  }`}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Preferred CTA:</label>
            <div className="space-y-1">
              {CTA_OPTIONS.map((c) => (
                <button key={c.key} onClick={() => { setCtaPreference(c.key); autoSave("cta_preference", c.key); }}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-all min-h-[44px] active:scale-[0.98] ${
                    ctaPreference === c.key ? "border-blue bg-blue/10 text-blue" : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                  }`}>
                  {ctaPreference === c.key ? "●" : "○"} {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Section 5: Target Market */}
      <Section title="Target Market" saving={savingSection === "target_geography" || savingSection === "target_categories"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Target geography</label>
            <input value={targetGeography} onChange={(e) => setTargetGeography(e.target.value)}
              onBlur={() => autoSave("target_geography", targetGeography)}
              placeholder="e.g. Manchester, M1 1AA"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Target business categories</label>
            <div className="flex flex-wrap gap-2">
              {SERVICE_CATEGORIES.map((s) => {
                const selected = targetCategories.includes(s.key);
                return (
                  <button key={s.key} onClick={() => {
                    const next = targetCategories.includes(s.key)
                      ? targetCategories.filter((t) => t !== s.key)
                      : [...targetCategories, s.key];
                    setTargetCategories(next);
                    autoSave("target_categories", next);
                  }}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${
                      selected ? "border-blue bg-blue/10 text-blue" : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                    }`}>
                    <span>{s.emoji}</span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Section>

      {/* Section 6: Work Schedule */}
      <Section title="Work Schedule" saving={savingSection === "schedule" || savingSection === "sales_cycle"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">Working days</label>
            <div className="flex gap-2">
              {DAYS_OF_WEEK.map((d) => {
                const active = workingDays.includes(d.key);
                return (
                  <button key={d.key} onClick={() => toggleDay(d.key)}
                    className={`w-10 h-10 rounded-lg text-sm font-medium transition-all active:scale-90 ${
                      active ? "bg-blue text-white" : "bg-surface-2 text-text-muted"
                    }`}>{d.label}</button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">Start time</label>
              <input type="time" value={workingStart} onChange={(e) => { setWorkingStart(e.target.value); autoSave("working_hours_start", e.target.value); }}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text min-h-[44px]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-1.5">End time</label>
              <input type="time" value={workingEnd} onChange={(e) => { setWorkingEnd(e.target.value); autoSave("working_hours_end", e.target.value); }}
                className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text min-h-[44px]" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-2">Average sales cycle</label>
            <div className="flex gap-2">
              {[7, 14, 30, 60].map((d) => (
                <button key={d} onClick={() => { setSalesCycle(d); autoSave("sales_cycle_days", d); }}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all active:scale-90 ${
                    salesCycle === d ? "bg-blue text-white" : "bg-surface-2 text-text-muted"
                  }`}>{d}d</button>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* Section 7: Optional Links */}
      <Section title="Optional Links" saving={savingSection === "calendly" || savingSection === "linkedin"}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Calendly link</label>
            <input type="url" value={calendlyLink} onChange={(e) => setCalendlyLink(e.target.value)}
              onBlur={() => autoSave("calendly_link", calendlyLink)}
              placeholder="https://calendly.com/your-link"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">LinkedIn URL</label>
            <input type="url" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)}
              onBlur={() => autoSave("linkedin_url", linkedinUrl)}
              placeholder="https://linkedin.com/in/your-profile"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none min-h-[44px]" />
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, saving, children }: { title: string; saving?: boolean; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        {saving && (
          <span className="text-xs text-green flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

export const getServerSideProps = withAuth();
export default SettingsProfilePage;
