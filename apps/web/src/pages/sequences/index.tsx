import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import {
  Plus,
  Mail,
  Users,
  MessageSquare,
  Play,
  Pause,
  Pencil,
  Trash2,
  BarChart3,
  Zap,
  Clock,
} from "lucide-react";

// Since backend may not have a fully-featured sequences API,
// we keep local state backed by mock fallback
interface SequenceCard {
  id: string;
  name: string;
  status: "active" | "paused" | "draft";
  leadsCount: number;
  sentCount: number;
  replyCount: number;
  createdAt: string;
  steps: number;
}

const mockSequences: SequenceCard[] = [
  { id: "seq-1", name: "Tech SaaS Outreach", status: "active", leadsCount: 45, sentCount: 38, replyCount: 14, createdAt: "2025-01-05", steps: 4 },
  { id: "seq-2", name: "Consulting Follow-up", status: "active", leadsCount: 22, sentCount: 15, replyCount: 6, createdAt: "2025-01-10", steps: 3 },
  { id: "seq-3", name: "Real Estate Cold", status: "draft", leadsCount: 0, sentCount: 0, replyCount: 0, createdAt: "2025-01-14", steps: 5 },
];

export default function SequencesPage() {
  const [sequences, setSequences] = useState<SequenceCard[]>(mockSequences);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newSequence, setNewSequence] = useState({ name: "", steps: 3 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.sequences.list();
        if (!cancelled && data.length > 0) {
          setSequences(
            data.map((s: any) => ({
              id: s.id,
              name: s.name,
              status: "draft" as const,
              leadsCount: 0,
              sentCount: 0,
              replyCount: 0,
              createdAt: s.created_at ?? new Date().toISOString().split("T")[0],
              steps: 3,
            }))
          );
        }
      } catch {
        // Use mock fallback
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const toggleStatus = async (id: string) => {
    setSequences((prev) =>
      prev.map((seq) => {
        if (seq.id !== id) return seq;
        const newStatus = seq.status === "active" ? "paused" : seq.status === "paused" ? "active" : seq.status;
        return { ...seq, status: newStatus as any };
      })
    );
  };

  const createSequence = async () => {
    if (!newSequence.name) return;
    setLoading(true);
    try {
      await api.sequences.create({ name: newSequence.name, steps: newSequence.steps });
      // Optimistic update
      setSequences((prev) => [
        ...prev,
        {
          id: `seq-${Date.now()}`,
          name: newSequence.name,
          status: "draft",
          leadsCount: 0,
          sentCount: 0,
          replyCount: 0,
          createdAt: new Date().toISOString().split("T")[0],
          steps: newSequence.steps,
        },
      ]);
    } catch (err: any) {
      console.warn("[Sequences] Could not create sequence on server:", err.message);
      // Still add locally
      setSequences((prev) => [
        ...prev,
        {
          id: `seq-${Date.now()}`,
          name: newSequence.name,
          status: "draft",
          leadsCount: 0,
          sentCount: 0,
          replyCount: 0,
          createdAt: new Date().toISOString().split("T")[0],
          steps: newSequence.steps,
        },
      ]);
    } finally {
      setLoading(false);
      setNewSequence({ name: "", steps: 3 });
      setShowCreateForm(false);
    }
  };

  const deleteSequence = async (id: string) => {
    setSequences((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Sequences</h1>
          <p className="text-sm text-text-muted mt-1">
            Automate your outreach with multi-step email sequences
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="btn btn-primary text-sm"
        >
          <Plus className="w-4 h-4" />
          New Sequence
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-text mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-blue" />
            Create New Sequence
          </h3>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Sequence Name
              </label>
              <input
                type="text"
                value={newSequence.name}
                onChange={(e) => setNewSequence((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Tech Outreach Q1"
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-muted mb-1.5">
                Number of Steps
              </label>
              <input
                type="number"
                value={newSequence.steps}
                onChange={(e) => setNewSequence((p) => ({ ...p, steps: Number(e.target.value) }))}
                className="w-20 h-10 px-3 text-xs rounded-full bg-surface-2 border border-border text-text text-center focus:outline-none focus:ring-2 focus:ring-blue/20"
                min={1}
                max={10}
              />
            </div>
            <div className="flex gap-2">
              <button onClick={createSequence} disabled={loading} className="btn btn-primary text-sm disabled:opacity-50">
                {loading ? <><Clock className="w-4 h-4 animate-spin" /> Creating...</> : "Create"}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="btn btn-ghost text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Sequences List */}
      <div className="space-y-3">
        {sequences.map((seq) => {
          const replyRate = seq.sentCount > 0 ? Math.round((seq.replyCount / seq.sentCount) * 100) : 0;
          return (
            <Card key={seq.id} className="p-5 group hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-text truncate">{seq.name}</h3>
                    <Badge
                      variant={
                        seq.status === "active" ? "default" : seq.status === "paused" ? "secondary" : "outline"
                      }
                      className="text-[10px]"
                    >
                      {seq.status === "active" ? (
                        <Play className="w-2.5 h-2.5 mr-1" />
                      ) : seq.status === "paused" ? (
                        <Pause className="w-2.5 h-2.5 mr-1" />
                      ) : (
                        <Clock className="w-2.5 h-2.5 mr-1" />
                      )}
                      {seq.status}
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-text-muted mt-2">
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-text-faint" />
                      {seq.leadsCount} leads
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-text-faint" />
                      {seq.sentCount} sent
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-text-faint" />
                      {seq.replyCount} replies ({replyRate}%)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5 text-text-faint" />
                      {seq.steps} steps
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-text-faint" />
                      {seq.createdAt}
                    </span>
                  </div>

                  {/* Reply Rate Bar */}
                  {seq.sentCount > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green rounded-full transition-all duration-500"
                          style={{ width: `${replyRate}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-green">{replyRate}% reply rate</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {seq.status !== "draft" && (
                    <button
                      onClick={() => toggleStatus(seq.id)}
                      className="rounded-full p-2 text-text-faint hover:text-text hover:bg-surface-2 transition-colors"
                    >
                      {seq.status === "active" ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                    </button>
                  )}
                  <button className="rounded-full p-2 text-text-faint hover:text-text hover:bg-surface-2 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteSequence(seq.id)}
                    className="rounded-full p-2 text-text-faint hover:text-red hover:bg-red/5 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </Card>
          );
        })}

        {sequences.length === 0 && (
          <Card className="p-12 text-center">
            <Mail className="w-10 h-10 text-text-faint mx-auto mb-3" />
            <p className="text-sm text-text-muted">No sequences yet</p>
            <p className="text-xs text-text-faint mt-1">
              Create your first sequence to start automated outreach
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
