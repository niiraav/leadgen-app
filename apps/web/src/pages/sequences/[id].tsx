import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Check, X, ArrowUp, ArrowDown, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface SequenceStep {
  id: string;
  step_order: number;
  subject_template: string;
  body_template: string;
  delay_days: number;
}

interface Sequence {
  id: string;
  name: string;
  status: string;
  steps: SequenceStep[];
}

export default function SequenceDetailPage() {
  const router = useRouter();
  const seqId = router.query.id as string;

  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<SequenceStep | null>(null);
  const [enrollModal, setEnrollModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [activating, setActivating] = useState(false);
  const [resuming, setResuming] = useState(false);

  const fetchSequence = useCallback(async () => {
    if (!seqId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sequences/${seqId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSequence(data);
      }
    } catch (err) {
      console.error("Failed to fetch sequence:", err);
    } finally {
      setLoading(false);
    }
  }, [seqId]);

  useEffect(() => { fetchSequence(); }, [fetchSequence]);

  const startEdit = (step: SequenceStep) => {
    setEditing(step.id);
    setEditForm({ ...step });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(null);
  };

  const saveStep = async () => {
    if (!editForm || !seqId) return;
    setSaving(true);
    try {
      // Update sequence with modified step
      if (!sequence) return;
      const updatedSteps = sequence.steps.map((s) =>
        s.id === editing && editForm ? { ...editForm } : s
      );

      const res = await fetch(`/api/sequences/${seqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ steps: updatedSteps }),
      });

      if (res.ok) {
        setEditing(null);
        setEditForm(null);
        await fetchSequence();
      } else if (res.status === 409) {
        const data = await res.json();
        toast.error(data.error || "Cannot edit steps while the sequence has active enrollments. Create a new sequence instead.");
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to save step");
      }
    } catch (err) {
      console.error("Failed to save step:", err);
      toast.error("Failed to save step");
    } finally {
      setSaving(false);
    }
  };

  const activateSequence = async () => {
    if (!seqId) return;
    setActivating(true);
    setError("");
    try {
      const res = await fetch(`/api/sequences/${seqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to activate sequence");
      } else {
        await fetchSequence();
      }
    } catch (err) {
      setError("Failed to activate sequence");
    } finally {
      setActivating(false);
    }
  };

  const resumeSequence = async () => {
    if (!seqId) return;
    setResuming(true);
    setError("");
    try {
      const res = await fetch(`/api/sequences/${seqId}/resume`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to resume sequence");
      } else {
        await fetchSequence();
      }
    } catch (err) {
      setError("Failed to resume sequence");
    } finally {
      setResuming(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-secondary rounded animate-pulse" />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-secondary rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Sequence not found</p>
        <Link href="/sequences" className="text-sm text-primary hover:underline">
          ← Back to sequences
        </Link>
      </div>
    );
  }

  const sortedSteps = [...(sequence.steps ?? [])].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sequences" className="p-2 hover:bg-secondary rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </Link>
        <div className="flex-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{sequence.name}</h1>
            <Badge
              variant={sequence.status === "active" ? "default" : "secondary"}
              className="mt-1"
            >
              {sequence.status}
            </Badge>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-4">
        {sortedSteps.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-sm text-muted-foreground">No steps yet</p>
          </div>
        )}

        {sortedSteps.map((step, idx) => (
          <div key={step.id} className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Step {step.step_order}</h3>
              {editing === step.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={saveStep} disabled={saving} className="rounded-full p-1 text-success hover:bg-success/5">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={cancelEdit} className="rounded-full p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => startEdit(step)} className="rounded-full p-1 text-muted-foreground hover:text-primary hover:bg-primary/5">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>

            {editing === step.id && editForm ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Subject</label>
                  <input
                    type="text"
                    value={editForm.subject_template}
                    onChange={(e) => setEditForm({ ...editForm, subject_template: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Body</label>
                  <textarea
                    value={editForm.body_template}
                    onChange={(e) => setEditForm({ ...editForm, body_template: e.target.value })}
                    className="w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                    rows={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Send after</label>
                  <input
                    type="number"
                    value={editForm.delay_days}
                    onChange={(e) => setEditForm({ ...editForm, delay_days: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-20 h-8 px-2 text-center text-xs rounded-lg bg-secondary border border-border text-foreground"
                    min={0}
                  />
                  <span className="text-xs text-muted-foreground">day(s) after enrollment</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-foreground mb-1">{step.subject_template}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{step.body_template}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Send {step.delay_days === 0 ? "immediately" : `after ${step.delay_days} day(s)`}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {sequence.status === "draft" && (
          <button
            onClick={activateSequence}
            disabled={activating}
            className="btn btn-primary"
          >
            {activating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Activate
          </button>
        )}
        {sequence.status === "active" && (
          <Link href={`/sequences/${seqId}/enroll`} className="btn btn-primary">
            <ArrowRight className="w-4 h-4" />
            Enroll Leads
          </Link>
        )}
        {sequence.status === "paused" && (
          <button
            onClick={resumeSequence}
            disabled={resuming}
            className="btn btn-primary"
          >
            {resuming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            Resume
          </button>
        )}
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
