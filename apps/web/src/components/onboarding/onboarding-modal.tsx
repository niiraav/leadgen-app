import { useState } from "react";
import { useProfile } from "@/contexts/profile-context";
import { Loader2, Check, X, Sparkles, RotateCw } from "lucide-react";
import FocusTrap from "focus-trap-react";
import { Portal } from "@/components/ui/portal";
import { useScrollLock } from "@/hooks/useScrollLock";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  useScrollLock(true);
  useEscapeKey(true, onSkip);

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
      <Portal>
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true" aria-label="Setup complete">
          <FocusTrap focusTrapOptions={{ returnFocusOnDeactivate: true }}>
            <div className="bg-card border border-border/60 rounded-lg w-full max-w-lg p-10 text-center">
              <div className="text-5xl mb-4" aria-hidden="true">🎉</div>
              <h2 className="text-2xl font-bold text-foreground mb-2">You&apos;re all set!</h2>
              <p className="text-muted-foreground">Redirecting to search...</p>
            </div>
          </FocusTrap>
        </div>
      </Portal>
    );
  }

  return (
    <Portal>
      <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[100] p-4">
        <FocusTrap focusTrapOptions={{ returnFocusOnDeactivate: true }}>
          <div className="bg-card border border-border/60 rounded-lg w-full max-w-xl max-h-[90vh] overflow-y-auto" role="dialog" aria-modal="true" aria-label="Onboarding" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
          {/* Progress */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-foreground" aria-live="polite" aria-atomic="true">
                {step === 1 && "Welcome to LeadFinder 👋"}
                {step === 2 && "What do you offer?"}
                {step === 3 && "How do you like to write?"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 1 && "Let's set up your profile so emails sound like you."}
                {step === 2 && "Select your services — multi-select supported."}
                {step === 3 && "Choose your tone, pitch, and sign-off style."}
              </p>
            </div>
            <div className="flex items-center gap-1.5" aria-label={`Step ${step} of 3`}>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`w-2.5 h-2.5 rounded-full transition-colors ${s <= step ? "bg-primary" : "bg-secondary"}`}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label htmlFor="onboarding-name" className="block text-sm font-medium text-foreground mb-1.5">Your name</label>
                <Input
                  id="onboarding-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sarah Johnson"
                />
              </div>
              <div>
                <label htmlFor="onboarding-company" className="block text-sm font-medium text-foreground mb-1.5">Company name</label>
                <Input
                  id="onboarding-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Bright Digital Agency"
                />
              </div>
              <div>
                <span className="block text-sm font-medium text-foreground mb-2">Your role</span>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Your role">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.key}
                      onClick={() => setRole(r.key)}
                      role="radio"
                      aria-checked={role === r.key}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${
                        role === r.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="text-base" aria-hidden="true">{r.emoji}</span>
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between pt-4">
                <Button variant="link" size="sm" noMotion className="underline" onClick={async () => { await updateProfile({ onboarding_step: -1 }); onSkip(); }}>
                  Skip for now
                </Button>
                <Button size="lg" onClick={handleNextStep1} disabled={!fullName.trim() || !companyName.trim() || !role || submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-label="Next step">Next <span aria-hidden="true">→</span></span>}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Select your services">
                {SERVICE_CATEGORIES.map((s) => {
                  const selected = selectedServices.includes(s.key);
                  return (
                    <button
                      key={s.key}
                      onClick={() => toggleService(s.key)}
                      role="checkbox"
                      aria-checked={selected}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${
                        selected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span className="text-base" aria-hidden="true">{s.emoji}</span>
                      <span className="truncate">{s.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 ml-auto shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>

              <div>
                <label htmlFor="onboarding-custom-service" className="block text-sm font-medium text-foreground mb-1.5">+ Add your own service</label>
                <div className="flex gap-2">
                  <Input
                    id="onboarding-custom-service"
                    className="flex-1"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomService()}
                    placeholder="e.g. Drone Photography"
                  />
                  <Button size="sm" onClick={addCustomService} disabled={!customInput.trim()}>
                    Add
                  </Button>
                </div>
                {customServices.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {customServices.map((cs, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-1 text-xs">
                        {cs}
                        <button
                          onClick={() => setCustomServices((p) => p.filter((_, j) => j !== i))}
                          aria-label={`Remove ${cs}`}
                          className="hover:text-destructive/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button variant="link" size="sm" noMotion className="underline" onClick={() => setStep(1)}>
                  <span aria-label="Previous step"><span aria-hidden="true">←</span> Back</span>
                </Button>
                <Button
                  size="lg"
                  onClick={handleNextStep2}
                  disabled={submitting || (selectedServices.length === 0 && customServices.length === 0)}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-label="Next step">Next <span aria-hidden="true">→</span></span>}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-5">
              {/* Tone */}
              <div>
                <span className="block text-sm font-medium text-foreground mb-2">Email tone</span>
                <div className="space-y-1.5" role="radiogroup" aria-label="Email tone">
                  {TONE_OPTIONS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTone(t.key)}
                      role="radio"
                      aria-checked={tone === t.key}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${
                        tone === t.key
                          ? "border-primary bg-primary/10"
                          : "border-border/60 bg-secondary hover:border-border"
                      }`}
                    >
                      <span className={`text-sm font-semibold ${tone === t.key ? "text-primary" : "text-foreground"}`}>
                        <span aria-hidden="true">{tone === t.key ? "●" : "○"}</span> {t.label}
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t.preview}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* USP */}
              <div>
                <label htmlFor="onboarding-usp" className="block text-sm font-medium text-foreground mb-1.5">Your one-liner pitch</label>
                <Textarea
                  id="onboarding-usp"
                  className="h-24 resize-none"
                  value={usp}
                  onChange={(e) => setUsp(e.target.value)}
                  placeholder="e.g. I build websites for tradespeople who lose jobs to better-looking competitors."
                />
                <div className="flex items-center justify-between mt-1.5">
                  <span className={`text-xs ${usp.length > 150 ? "text-destructive" : "text-muted-foreground"}`}>
                    {usp.length}/150
                  </span>
                  {!uspGenerated ? (
                    <Button
                      variant="link"
                      size="sm"
                      noMotion
                      className="text-xs gap-1"
                      onClick={handleGenerateUsp}
                      disabled={uspGenerating}
                    >
                      {uspGenerating ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      Generate with AI
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      size="sm"
                      noMotion
                      className="text-xs gap-1"
                      onClick={handleGenerateUsp}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      Regenerate
                    </Button>
                  )}
                </div>

                {/* AI-generated pitches */}
                {uspGenerated && uspPitches.length > 0 && (
                  <div className="space-y-2 mt-3">
                    {uspPitches.map((p, i) => (
                      <div key={i} className="rounded-lg border border-border/40 bg-secondary p-3">
                        <p className="text-xs font-medium text-muted-foreground mb-1">
                          Option {i + 1} — {i === 0 ? "Problem-led" : i === 1 ? "Outcome-led" : "Bold claim"}
                        </p>
                        <p className="text-sm text-foreground mb-2">{p}</p>
                        <Button
                          variant="link"
                          size="sm"
                          noMotion
                          className="text-xs"
                          onClick={() => setUsp(p)}
                        >
                          Use this
                        </Button>
                      </div>
                    ))}
                    <Button variant="link" size="sm" noMotion className="underline text-xs" onClick={() => setUspGenerated(false)}>
                      Write my own instead
                    </Button>
                  </div>
                )}
              </div>

              {/* Sign-off */}
              <div>
                <span className="block text-sm font-medium text-foreground mb-2">Sign off emails with:</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sign off emails with">
                  {SIGNOFF_OPTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setSignoffStyle(s)}
                      role="radio"
                      aria-checked={signoffStyle === s}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${
                        signoffStyle === s
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div>
                <span className="block text-sm font-medium text-foreground mb-2">Preferred call to action:</span>
                <div className="space-y-1" role="radiogroup" aria-label="Preferred call to action">
                  {CTA_OPTIONS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setCtaPreference(c.key)}
                      role="radio"
                      aria-checked={ctaPreference === c.key}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] ${
                        ctaPreference === c.key
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/60 bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span aria-hidden="true">{ctaPreference === c.key ? "●" : "○"}</span> {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <Button variant="link" size="sm" noMotion className="underline" onClick={() => setStep(2)}>
                  <span aria-label="Previous step"><span aria-hidden="true">←</span> Back</span>
                </Button>
                <Button
                  size="lg"
                  onClick={handleComplete}
                  disabled={submitting || !usp.trim()}
                >
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <span aria-label="Complete setup">Complete Setup <span aria-hidden="true">✓</span></span>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
        </FocusTrap>
      </div>
    </Portal>
  );
}
