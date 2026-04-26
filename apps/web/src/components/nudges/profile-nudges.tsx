import { useState } from "react";
import { X, Check, Clock, MapPin, Mail } from "lucide-react";
import { useProfile } from "@/contexts/profile-context";

/**
 * NUDGE 1 — On first visit to search page when target_geography is not set.
 * Inline mini-form to set default location.
 */
export function TargetAreaNudge({ onDismiss }: { onDismiss: () => void }) {
  const { profile, updateProfile, markNudgeSeen } = useProfile();
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!location.trim()) return;
    setSaving(true);
    await updateProfile({ target_geography: location.trim() });
    markNudgeSeen("on_search");
    onDismiss();
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <MapPin className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-foreground">Set your target area</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            We'll use this as your default location on every search.
          </p>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder={profile?.target_geography || "City or postcode"}
            className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-9"
          />
          <div className="flex items-center gap-2 mt-2">
            <button onClick={handleSave} disabled={saving || !location.trim()} className="btn btn-primary text-xs py-1 h-7 disabled:opacity-50">
              {saving ? <Check className="w-3 h-3" /> : "Save"}
            </button>
            <button onClick={() => { markNudgeSeen("on_search"); onDismiss(); }} className="text-xs text-muted-foreground hover:text-foreground underline">
              Later
            </button>
          </div>
        </div>
        <button onClick={() => { markNudgeSeen("on_search"); onDismiss(); }} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * NUDGE 2 — In sequence step scheduler when working hours are default.
 */
export function WorkingHoursNudge({ onDone }: { onDone: () => void }) {
  const { updateProfile, markNudgeSeen, profile } = useProfile();
  const [start, setStart] = useState(profile?.working_hours_start || "09:00");
  const [end, setEnd] = useState(profile?.working_hours_end || "18:00");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await updateProfile({ working_hours_start: start, working_hours_end: end });
    markNudgeSeen("on_sequence");
    onDone();
  };

  return (
    <div className="rounded-xl border border-amber/30 bg-warning/5 p-4 mb-4">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-foreground">Set your working hours</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sequence steps will only send during your active hours.
          </p>
          <div className="flex items-center gap-2 mt-2">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground min-h-8" />
            <span className="text-xs text-muted-foreground">to</span>
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground min-h-8" />
            <button onClick={handleSave} disabled={saving} className="btn btn-primary text-xs py-1 h-7 disabled:opacity-50 ml-1">
              {saving ? <Check className="w-3 h-3" /> : "Save"}
            </button>
          </div>
        </div>
        <button onClick={() => { markNudgeSeen("on_sequence"); onDone(); }} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * NUDGE 3 — After first AI email when signoff is default.
 */
export function SignoffNudge({ onDone }: { onDone: () => void }) {
  const SIGNOFF_OPTIONS = ['Cheers', 'Best', 'Best regards', 'Kind regards', 'Thanks', 'Speak soon'];
  const { profile, updateProfile, markNudgeSeen } = useProfile();
  const [chosen, setChosen] = useState(profile?.signoff_style || "Best regards");
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    await updateProfile({ signoff_style: chosen });
    markNudgeSeen("on_email");
    setSaved(true);
    setTimeout(onDone, 800);
  };

  return (
    <div className="rounded-xl border border-purple/30 bg-purple/5 p-4 mt-4">
      <div className="flex items-start gap-3">
        <Mail className="w-5 h-5 text-purple shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-foreground">Is this how you sign off?</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            We defaulted to &ldquo;Best regards&rdquo; — change to match your style.
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {SIGNOFF_OPTIONS.map((s) => (
              <button key={s} onClick={() => setChosen(s)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-all min-h-8 ${
                  chosen === s ? "border-purple bg-purple/10 text-purple" : "border-border/60 bg-card text-muted-foreground"
                }`}>{s}</button>
            ))}
          </div>
          <button onClick={handleSave} disabled={saved}
            className="btn btn-primary text-xs py-1 h-7 disabled:opacity-50 mt-2">
            {saved ? <><Check className="w-3 h-3 mr-1" />Saved</> : "Save"}
          </button>
        </div>
        <button onClick={() => { markNudgeSeen("on_email"); onDone(); }} className="text-muted-foreground hover:text-foreground shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * NUDGE 4 — After first lead marked Won/Closed (used via AutoActionBanner).
 */
export function SalesCycleNudge({ onDone, onComplete }: { onDone: () => void; onComplete: (days: number) => void }) {
  const { updateProfile } = useProfile();
  const [saved, setSaved] = useState(false);

  const handleSelect = async (days: number) => {
    await updateProfile({ sales_cycle_days: days });
    setSaved(true);
    onComplete(days);
  };

  return (
    <div className="rounded-xl border border-green/30 bg-success/5 p-4">
      <div className="flex items-start gap-3">
        <div className="text-xl shrink-0">🎉</div>
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-foreground">First win! How long did that take?</h4>
          <div className="flex gap-2 mt-2">
            {[7, 14, 30, 60].map((d) => (
              <button key={d} onClick={() => handleSelect(d)} disabled={saved}
                className={`flex-1 h-10 rounded-lg text-sm font-medium transition-all active:scale-90 disabled:opacity-50 ${
                  saved ? "bg-success/20 text-success" : "bg-success/10 text-success hover:bg-success/20"
                }`}>{d}d</button>
            ))}
          </div>
          <button onClick={onDone} className="text-xs text-muted-foreground hover:text-foreground underline mt-2">
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
