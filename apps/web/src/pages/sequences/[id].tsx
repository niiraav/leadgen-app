import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Pencil, Check, X, ArrowUp, ArrowDown, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

interface SequenceStep {
  id: string;
  step_order: number;
  subject: string;
  body: string;
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

      const res = await fetch(`/api/sequencedetail/${seqId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ steps: updatedSteps }),
      });

      if (res.ok) {
        setEditing(null);
        setEditForm(null);
        await fetchSequence();
      }
    } catch (err) {
      console.error("Failed to save step:", err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-surface-2 rounded animate-pulse" />
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="text-center py-12">
        <p className="text-text-muted">Sequence not found</p>
        <Link href="/sequences" className="text-sm text-blue hover:underline">
          ← Back to sequences
        </Link>
      </div>
    );
  }

  const sortedSteps = [...(sequence.steps ?? [])].sort((a, b) => a.step_order - b.step_order);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/sequences" className="p-2 hover:bg-surface-2 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-text-muted" />
        </Link>
        <div className="flex-1 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text tracking-tight">{sequence.name}</h1>
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
        <div className="rounded-xl border border-red/20 bg-red/5 p-4 text-sm text-red">{error}</div>
      )}

      <div className="space-y-4">
        {sortedSteps.length === 0 && (
          <div className="card text-center py-12">
            <p className="text-sm text-text-muted">No steps yet</p>
          </div>
        )}

        {sortedSteps.map((step, idx) => (
          <div key={step.id} className="rounded-xl border border-border/60 bg-surface p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text">Step {step.step_order}</h3>
              {editing === step.id ? (
                <div className="flex items-center gap-1">
                  <button onClick={saveStep} disabled={saving} className="rounded-full p-1 text-green hover:bg-green/5">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  </button>
                  <button onClick={cancelEdit} className="rounded-full p-1 text-text-faint hover:text-red hover:bg-red/5">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button onClick={() => startEdit(step)} className="rounded-full p-1 text-text-faint hover:text-blue hover:bg-blue/5">
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>

            {editing === step.id && editForm ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Subject</label>
                  <input
                    type="text"
                    value={editForm.subject}
                    onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    className="input"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-muted mb-1">Body</label>
                  <textarea
                    value={editForm.body}
                    onChange={(e) => setEditForm({ ...editForm, body: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-blue/20 resize-none"
                    rows={5}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-muted">Send after</label>
                  <input
                    type="number"
                    value={editForm.delay_days}
                    onChange={(e) => setEditForm({ ...editForm, delay_days: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="w-20 h-8 px-2 text-center text-xs rounded-lg bg-surface-2 border border-border text-text"
                    min={0}
                  />
                  <span className="text-xs text-text-muted">day(s) after enrollment</span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-text mb-1">{step.subject}</p>
                <p className="text-sm text-text-muted whitespace-pre-wrap">{step.body}</p>
                <p className="text-xs text-text-faint mt-2">
                  Send {step.delay_days === 0 ? "immediately" : `after ${step.delay_days} day(s)`}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Link href={`/sequences/${seqId}/enroll`} className="btn btn-primary">
          <ArrowRight className="w-4 h-4" />
          Enroll Leads
        </Link>
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
