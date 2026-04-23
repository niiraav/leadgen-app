import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Pause, Eye, ArrowRight, Loader2, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import Link from "next/link";

interface Sequence {
  id: string;
  name: string;
  status: string;
  step_count: number;
  enrolled_count: number;
  created_at: string;
}

export default function SequencesPage({ user }: { user?: { id: string; email: string } }) {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchSequences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sequences", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSequences(data);
      }
    } catch (err) {
      console.error("Failed to fetch sequences:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSequences(); }, [fetchSequences]);

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await fetch(`/api/sequences/${deleteId}`, { method: "DELETE", credentials: "include" });
      setDeleteId(null);
      await fetchSequences();
      toast.success("Sequence deleted");
    } catch (err) {
      console.error("Failed to delete sequence:", err);
      toast.error("Failed to delete sequence");
    }
  };

  const handleToggleSequence = async (seqId: string, action: "pause" | "resume") => {
    setActionLoading(seqId);
    try {
      await fetch(`/api/sequences/${seqId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      await fetchSequences();
      toast.success(action === "pause" ? "Sequence paused" : "Sequence resumed");
    } catch (err) {
      console.error(`Failed to ${action} sequence:`, err);
      toast.error(`Failed to ${action} sequence`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-40 bg-surface-2 rounded animate-pulse" />
        <div className="grid gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text tracking-tight">Sequences</h1>
          <p className="text-sm text-text-muted mt-1">
            Automate your outreach with multi-step email sequences
          </p>
        </div>
        <Link href="/sequences/new" className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" />
          New Sequence
        </Link>
      </div>

      {sequences.length === 0 && (
        <EmptyState
          icon={Eye}
          title="No sequences yet"
          description="Create your first email sequence to start automated outreach."
          action={{ label: "Create Sequence", href: "/sequences/new" }}
          className="card py-16"
        />
      )}

      <div className="space-y-3">
        {sequences.map((seq) => (
          <Card key={seq.id} className="p-5 group hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-text truncate">{seq.name}</h3>
                  <Badge
                    variant={seq.status === "active" ? "default" : "secondary"}
                    className="text-[10px]"
                  >
                    {seq.status}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted mt-2">
                  <span>{seq.step_count} steps</span>
                  <span>{seq.enrolled_count} leads enrolled</span>
                  <span>Created {new Date(seq.created_at).toLocaleDateString()}</span>
                </div>

                <div className="flex flex-wrap gap-2 mt-3">
                  <Link
                    href={`/sequences/${seq.id}`}
                    className="btn btn-ghost text-xs py-1 h-7"
                  >
                    <Eye className="w-3 h-3" />
                    View Details
                  </Link>
                  {seq.status !== "active" && (
                    <button
                      onClick={() => handleToggleSequence(seq.id, "resume")}
                      disabled={actionLoading === seq.id}
                      className="btn btn-ghost text-xs py-1 h-7 text-green"
                    >
                      {actionLoading === seq.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Play className="w-3 h-3" />
                      )}
                      Resume
                    </button>
                  )}
                  {seq.status === "active" && (
                    <button
                      onClick={() => handleToggleSequence(seq.id, "pause")}
                      disabled={actionLoading === seq.id}
                      className="btn btn-ghost text-xs py-1 h-7 text-amber"
                    >
                      {actionLoading === seq.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Pause className="w-3 h-3" />
                      )}
                      Pause
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/sequences/${seq.id}/enroll`}
                  className="btn btn-secondary text-xs py-1.5 h-8 self-center"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  Enroll Leads
                </Link>
                <button
                  onClick={() => setDeleteId(seq.id)}
                  className="rounded-full p-2 text-red/60 hover:text-red hover:bg-red/5 transition-colors"
                  title="Delete sequence"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-xl border border-border/60 p-6 w-full max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red/10 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red" />
              </div>
              <div>
                <h3 className="font-semibold text-text">Delete sequence?</h3>
                <p className="text-xs text-text-muted mt-0.5">This will also delete all steps and enrollments.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setDeleteId(null)}
                className="btn btn-secondary text-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="btn bg-red hover:bg-red/90 text-white text-sm"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export const getServerSideProps = withAuth();
