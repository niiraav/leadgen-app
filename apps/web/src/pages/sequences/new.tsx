import { withAuth } from "@/lib/auth";
import { useState } from "react";
import { useRouter } from "next/router";
import { ArrowLeft, Plus, Trash2, ArrowUp, ArrowDown, Loader2, Check, Play } from "lucide-react";
import Link from "next/link";
import UpgradePrompt from "@/components/ui/upgrade-prompt";

interface Step {
  step_order: number;
  subject_template: string;
  body_template: string;
  delay_days: number;
}

export default function NewSequencePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([
    { step_order: 1, subject_template: "", body_template: "", delay_days: 0 },
  ]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  const addStep = () => {
    setSteps((prev) => [
      ...prev,
      { step_order: prev.length + 1, subject_template: "", body_template: "", delay_days: 1 },
    ]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_order: i + 1 })));
  };

  const moveStep = (idx: number, dir: "up" | "down") => {
    setSteps((prev) => {
      const newSteps = [...prev];
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= newSteps.length) return prev;
      [newSteps[idx], newSteps[swapIdx]] = [newSteps[swapIdx], newSteps[idx]];
      return newSteps.map((s, i) => ({ ...s, step_order: i + 1 }));
    });
  };

  const updateStep = (idx: number, field: keyof Step, value: string | number) => {
    setSteps((prev) => prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  };

  const saveSequence = async () => {
    if (!name.trim()) {
      setError("Sequence name is required");
      return;
    }
    if (steps.some((s) => !s.subject_template.trim() || !s.body_template.trim())) {
      setError("Each step needs a subject and body");
      return;
    }

    setSaving(true);
    setError("");
    setUpgradeError(null);
    try {
      const res = await fetch("/api/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), steps }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 402 && data.upgrade_required) {
          setUpgradeError(data.error || "Upgrade required to create sequences");
        } else {
          throw new Error(data.error || "Failed to create sequence");
        }
        return;
      }

      const data = await res.json();
      setSavedId(data.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (savedId) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div className="card text-center py-16">
          <div className="mx-auto w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mb-4">
            <Check className="w-6 h-6 text-green" />
          </div>
          <h2 className="text-lg font-bold text-text mb-2">Sequence created!</h2>
          <p className="text-sm text-text-muted mb-6">
            &quot;{name}&quot; is ready. Enroll leads to start automated outreach.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href={`/sequences/${savedId}`}
              className="btn btn-primary"
            >
              <Play className="w-4 h-4" />
              Activate &amp; Enroll
            </Link>
            <Link href="/sequences" className="btn btn-secondary">
              Back to Sequences
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/sequences" className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">New Sequence</h1>
          <p className="text-sm text-text-muted mt-1">Build your automated outreach flow</p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>
      )}

      <UpgradePrompt error={upgradeError} onDismiss={() => setUpgradeError(null)} compact />

      <div className="rounded-xl border border-border/60 bg-surface p-5">
        <label className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wider">
          Sequence Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Cold Outreach — SaaS"
          className="input"
        />
      </div>

      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text">Step {step.step_order}</h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveStep(idx, "up")}
                  disabled={idx === 0}
                  className="rounded-full p-1 text-text-faint hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => moveStep(idx, "down")}
                  disabled={idx === steps.length - 1}
                  className="rounded-full p-1 text-text-faint hover:text-text hover:bg-surface-2 transition-colors disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => removeStep(idx)}
                  disabled={steps.length <= 1}
                  className="rounded-full p-1 text-text-faint hover:text-red hover:bg-red/5 transition-colors disabled:opacity-30"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">Subject</label>
                <input
                  type="text"
                  value={step.subject_template}
                  onChange={(e) => updateStep(idx, "subject_template", e.target.value)}
                  placeholder="Email subject line..."
                  className="input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted mb-1.5">Body</label>
                <textarea
                  value={step.body_template}
                  onChange={(e) => updateStep(idx, "body_template", e.target.value)}
                  placeholder="Email body..."
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                  rows={6}
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-text-muted whitespace-nowrap">Send after</label>
                <input
                  type="number"
                  value={step.delay_days}
                  onChange={(e) => updateStep(idx, "delay_days", Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 h-8 px-2 text-center text-xs rounded-lg bg-surface-2 border border-border text-text focus:outline-none focus:ring-2 focus:ring-primary/20"
                  min={0}
                />
                <span className="text-xs text-text-muted">day(s) after enrollment</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addStep} className="btn btn-secondary w-full">
        <Plus className="w-4 h-4" />
        Add Step
      </button>

      <button
        onClick={saveSequence}
        disabled={saving}
        className="btn btn-primary w-full disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating...
          </>
        ) : (
          "Create Sequence"
        )}
      </button>
    </div>
  );
}

export const getServerSideProps = withAuth();
