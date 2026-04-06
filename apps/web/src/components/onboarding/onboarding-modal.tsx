import { useState } from "react";
import { useProfile } from "@/contexts/profile-context";
import { Loader2, Check, X, Sparkles, RotateCw } from "lucide-react";
import {
  SERVICE_CATEGORIES,
  ROLE_OPTIONS,
  TONE_OPTIONS,
  SIGNOFF_OPTIONS,
  CTA_OPTIONS,
} from "@/lib/services";

interface Props {
  initialProfile: Record<string, unknown>;
  onComplete: () => void;
  onSkip: () => void;
}

export default function OnboardingModal({ initialProfile, onComplete, onSkip }: Props) {
  const { updateProfile, generateUsp } = useProfile();
  const [step, setStep] = useState(() => {
    const s = (initialProfile.onboarding_step || 0) as number;
    return s > 0 && s < 3 ? s : 1;
  });

  // Step 1 state
  const [fullName, setFullName] = useState(initialProfile.full_name as string || "");
  const [companyName, setCompanyName] = useState(initialProfile.company_name as string || "");
  const [role, setRole] = useState(initialProfile.role as string || "");

  // Step 2 state
  const [selectedServices, setSelectedServices] = useState<string[]>(
    (initialProfile.services as string[]) || []
  );
  const [customServices, setCustomServices] = useState<string[]>(
    (initialProfile.custom_services as string[]) || []
  );
  const [customInput, setCustomInput] = useState("");

  // Step 3 state
  const [tone, setTone] = useState(initialProfile.tone as string || "professional");
  const [usp, setUsp] = useState(initialProfile.usp as string || "");
  const [signoffStyle, setSignoffStyle] = useState(
    initialProfile.signoff_style as string || "Best regards"
  );
  const [ctaPreference, setCtaPreference] = useState(
    initialProfile.cta_preference as string || "reply_email"
  );
  const [uspGenerating, setUspGenerating] = useState(false);
  const [uspPitches, setUspPitches] = useState<string[]>([]);
  const [uspGenerated, setUspGenerated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleNextStep1 = async () => {
    if (!fullName.trim() || !companyName.trim() || !role) return;
    setSubmitting(true);
    await updateProfile({ full_name: fullName.trim(), company_name: companyName.trim(), role });
    setSubmitting(false);
    setStep(2);
  };

  const handleNextStep2 = async () => {
    if (selectedServices.length === 0 && customServices.length === 0) return;
    setSubmitting(true);
    await updateProfile({ services: selectedServices, custom_services: customServices, onboarding_step: 2 });
    setSubmitting(false);
    setStep(3);
  };

  const handleComplete = async () => {
    setSubmitting(true);
    await updateProfile({
      usp, tone, signoff_style: signoffStyle,
      cta_preference: ctaPreference,
      onboarding_step: 3,
    });
    setSubmitting(false);
    setDone(true);
    setTimeout(onComplete, 2000);
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
      });
      setUspPitches(result.pitches || []);
      setUspGenerated(true);
    } catch {
      // silent fail
    } finally {
      setUspGenerating(false);
    }
  };

  const toggleService = (key: string) => {
    setSelectedServices((prev) =>
      prev.includes(key) ? prev.filter((s) => s !== key) : [...prev, key]
    );
  };

  const addCustomService = () => {
    const trimmed = customInput.trim();
    if (trimmed && customServices.length < 5) {
      setCustomServices((prev) => [...prev, trimmed]);
      setCustomInput("");
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-surface border border-border/60 rounded-2xl w-full max-w-lg p-10 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold text-text mb-2">You&apos;re all set!</h2>
          <p className="text-text-muted">Redirecting to search...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-border/60 rounded-2xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Progress */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-text">
                {step === 1 && "Welcome to LeadFinder 👋"}
                {step === 2 && "What do you offer?"}
                {step === 3 && "How do you like to write?"}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                {step === 1 && "Let's set up your profile so emails sound like you."}
                {step === 2 && "Select your services — multi-select supported."}
                {step === 3 && "Choose your tone, pitch, and sign-off style."}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${s <= step ? "bg-blue" : "bg-surface-2"}`}
                />
              ))}
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Your name</label>
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sarah Johnson"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Company name</label>
                <input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Bright Digital Agency"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text mb-2">Your role</label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRole(r.key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all min-h-[44px] active:scale-[0.98] ${
                        role === r.key
                          ? "border-blue bg-blue/10 text-blue"
                          : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      <span className="text-base">{r.emoji}</span>
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <button onClick={async () => { await updateProfile({ onboarding_step: -1 }); onSkip(); }} className="text-sm text-text-muted hover:text-text underline min-h-[44px] px-2">
                  Skip for now
                </button>
                <button
                  onClick={handleNextStep1}
                  disabled={!fullName.trim() || !companyName.trim() || !role || submitting}
                  className="btn btn-primary text-sm disabled:opacity-50 min-h-[44px] px-6"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Next →"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2">
                {SERVICE_CATEGORIES.map((s) => {
                  const selected = selectedServices.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggleService(s.key)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all min-h-[44px] active:scale-[0.98] ${
                        selected
                          ? "border-blue bg-blue/10 text-blue"
                          : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      <span className="text-base">{s.emoji}</span>
                      <span className="truncate">{s.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div>
                <label className="block text-sm font-medium text-text mb-1.5">+ Add your own service</label>
                <div className="flex gap-2">
                  <input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomService()}
                    placeholder="e.g. Drone Photography"
                    className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 min-h-[44px]"
                  />
                  <button onClick={addCustomService} disabled={!customInput.trim()} className="btn btn-primary text-sm disabled:opacity-50 min-h-[44px]">
                    Add
                  </button>
                </div>
                {customServices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {customServices.map((cs, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-blue/10 text-blue px-2.5 py-1 text-xs">
                        {cs}
                        <button onClick={() => setCustomServices((p) => p.filter((_, j) => j !== i))} className="hover:text-red/70"><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <button onClick={() => setStep(1)} className="text-sm text-text-muted hover:text-text underline min-h-[44px] px-2">
                  ← Back
                </button>
                <button
                  onClick={handleNextStep2}
                  disabled={submitting || (selectedServices.length === 0 && customServices.length === 0)}
                  className="btn btn-primary text-sm disabled:opacity-50 min-h-[44px] px-6"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Next →"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Tone */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">Email tone</label>
                <div className="space-y-1.5">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTone(t.key)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all min-h-[44px] active:scale-[0.98] ${
                        tone === t.key
                          ? "border-blue bg-blue/10"
                          : "border-border/60 bg-surface-2 hover:border-border"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${tone === t.key ? "text-blue" : "text-text"}`}>
                        {tone === t.key ? "●" : "○"} {t.label}
                      </span>
                      <p className="text-xs text-text-muted mt-0.5">
                        {t.preview}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* USP */}
              <div>
                <label className="block text-sm font-medium text-text mb-1.5">Your one-liner pitch</label>
                <textarea
                  value={usp}
                  onChange={(e) => setUsp(e.target.value)}
                  placeholder="e.g. I build websites for tradespeople who lose jobs to better-looking competitors."
                  className="w-full h-24 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 resize-none"
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-xs ${usp.length > 150 ? "text-red" : "text-text-faint"}`}>
                    {usp.length}/150
                  </span>
                  {!uspGenerated ? (
                    <button
                      onClick={handleGenerateUsp}
                      disabled={uspGenerating}
                      className="text-xs text-blue hover:underline flex items-center gap-1 min-h-[32px]"
                    >
                      {uspGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      Generate with AI
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerateUsp}
                      className="text-xs text-blue hover:underline flex items-center gap-1 min-h-[32px]"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Regenerate
                    </button>
                  )}
                </div>

                {/* AI-generated pitches */}
                {uspGenerated && uspPitches.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {uspPitches.map((p, i) => (
                      <div key={i} className="rounded-lg border border-border/40 bg-surface-2 p-3">
                        <p className="text-xs font-medium text-text-faint mb-1">
                          Option {i + 1} — {i === 0 ? "Problem-led" : i === 1 ? "Outcome-led" : "Bold claim"}
                        </p>
                        <p className="text-sm text-text mb-2">{p}</p>
                        <button
                          onClick={() => setUsp(p)}
                          className="text-xs text-blue hover:underline"
                        >
                          Use this
                        </button>
                      </div>
                    ))}
                    <button
                      onClick={() => setUspGenerated(false)}
                      className="text-xs text-text-muted hover:text-text underline"
                    >
                      Write my own instead
                    </button>
                  </div>
                )}
              </div>

              {/* Sign-off */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">Sign off emails with:</label>
                <div className="flex flex-wrap gap-2">
                  {SIGNOFF_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSignoffStyle(s)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all min-h-[36px] ${
                        signoffStyle === s
                          ? "border-blue bg-blue/10 text-blue"
                          : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div>
                <label className="block text-sm font-medium text-text mb-2">Preferred call to action:</label>
                <div className="space-y-1">
                  {CTA_OPTIONS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCtaPreference(c.key)}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-all min-h-[44px] active:scale-[0.98] ${
                        ctaPreference === c.key
                          ? "border-blue bg-blue/10 text-blue"
                          : "border-border/60 bg-surface-2 text-text-muted hover:text-text"
                      }`}
                    >
                      {ctaPreference === c.key ? "●" : "○"} {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button onClick={() => setStep(2)} className="text-sm text-text-muted hover:text-text underline min-h-[44px] px-2">
                  ← Back
                </button>
                <button
                  onClick={handleComplete}
                  disabled={submitting || !usp.trim()}
                  className="btn btn-primary text-sm disabled:opacity-50 min-h-[44px] px-6"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete Setup ✓"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
