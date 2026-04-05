import { withAuth } from "@/lib/auth";
import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Play, Pause, Eye, ArrowRight, Loader2 } from "lucide-react";
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

  const handleToggleSequence = async (seqId: string, action: "pause" | "resume") => {
    setActionLoading(seqId);
    try {
      await fetch(`/api/sequences/${seqId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      await fetchSequences();
    } catch (err) {
      console.error(`Failed to ${action} sequence:`, err);
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
        <div className="card text-center py-16">
          <div className="mx-auto w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center mb-4">
            <Eye className="w-6 h-6 text-text-faint" />
          </div>
          <p className="text-sm text-text-muted">No sequences yet</p>
          <p className="text-xs text-text-faint mt-1 mb-4">Create your first sequence to start automated outreach</p>
          <Link href="/sequences/new" className="btn btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Create Sequence
          </Link>
        </div>
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

              <Link
                href={`/sequences/${seq.id}/enroll`}
                className="btn btn-primary text-xs py-1.5 h-8 self-center"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                Enroll Leads
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export const getServerSideProps = withAuth();
