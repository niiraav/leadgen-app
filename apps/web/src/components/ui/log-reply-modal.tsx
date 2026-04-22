import { useState } from "react";
import { X, Loader2, Send, Check } from "lucide-react";

const CLASSIFICATION_STYLE: Record<string, { emoji: string; color: string; bg: string }> = {
  INTERESTED: { emoji: "🟢", color: "text-green", bg: "bg-green/10 border-green/30" },
  NOT_NOW: { emoji: "🟡", color: "text-amber", bg: "bg-amber/10 border-amber/30" },
  UNSUBSCRIBE: { emoji: "🔴", color: "text-red", bg: "bg-red/10 border-red/30" },
  WARM: { emoji: "🔵", color: "text-blue", bg: "bg-blue/10 border-blue/30" },
  NEUTRAL: { emoji: "⚪", color: "text-text-muted", bg: "bg-surface-2 border-border" },
};

const SUGGESTED_ACTION: Record<string, string> = {
  INTERESTED: "Move to Interested stage",
  NOT_NOW: "Keep current stage, re-engage in 60 days",
  UNSUBSCRIBE: "Mark unsubscribed, pause all sequences",
  WARM: "Move to Replied stage",
  NEUTRAL: "Move to Replied stage",
};

interface ReplyResult {
  classification: string;
  suggested_stage: string;
  reasoning: string;
  previous_status: string;
  auto_moved: boolean;
  re_engage_after?: string;
}

interface Props {
  leadId: string;
  leadName: string;
  onReplyLogged: (result: ReplyResult, isManual: boolean) => void;
  onClose: () => void;
}

export default function LogReplyModal({ leadId, leadName, onReplyLogged, onClose }: Props) {
  const [step, setStep] = useState<"input" | "loading" | "result">("input");
  const [replyText, setReplyText] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReplyResult | null>(null);

  const handleAnalyze = async () => {
    if (!replyText.trim()) return;
    setStep("loading");
    setError("");
    try {
      const res = await fetch(`/api/leads/${leadId}/classify-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reply_text: replyText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to classify reply");
      setResult(data);
      setStep("result");
    } catch (err: any) {
      setError(err.message);
      setStep("input");
    }
  };

  const handleSkip = () => {
    onReplyLogged({
      classification: "NEUTRAL", suggested_stage: "replied", reasoning: "",
      previous_status: "", auto_moved: false,
    }, true);
    onClose();
  };

  const handleApply = () => {
    if (!result) return;
    onReplyLogged(result, false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-surface border border-border/60 rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-border/40">
          <h2 className="text-base font-semibold text-text">Log Reply — {leadName}</h2>
          <button onClick={onClose} className="text-text-faint hover:text-text"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          {step === "input" && (
            <>
              <p className="text-sm text-text-muted mb-3">Paste their reply or summarize it below.</p>
              {error && <div className="mb-3 rounded-lg bg-red/10 border border-red/20 px-4 py-2 text-sm text-red">{error}</div>}
              <textarea
                value={replyText} onChange={(e) => setReplyText(e.target.value)}
                placeholder="e.g. Thanks for reaching out. Can you send me pricing details?"
                className="w-full h-40 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none mb-4"
              />
              <div className="flex items-center justify-between">
                <button onClick={handleSkip} className="text-xs text-text-muted hover:text-text underline">
                  Skip — just mark as replied
                </button>
                <button onClick={handleAnalyze} disabled={!replyText.trim()} className="btn btn-primary text-sm py-1.5 h-8 disabled:opacity-50">
                  <Send className="w-3.5 h-3.5 mr-1.5" />
                  Analyse Reply
                </button>
              </div>
            </>
          )}
          {step === "loading" && (
            <div className="flex items-center justify-center gap-3 py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue" />
              <span className="text-text-muted">Analysing reply sentiment...</span>
            </div>
          )}
          {step === "result" && result && (
            <>
              {(() => {
                const style = CLASSIFICATION_STYLE[result.classification] || CLASSIFICATION_STYLE.NEUTRAL;
                return (
                  <>
                    <div className={`rounded-lg border ${style.bg} p-4 mb-4`}>
                      <div className="flex items-center gap-2 mb-2"><span className="text-lg">{style.emoji}</span><span className={`text-sm font-semibold ${style.color}`}>{result.classification}</span></div>
                      <p className="text-xs text-text-muted">{result.reasoning}</p>
                    </div>
                    <div className="mb-4">
                      <p className="text-xs text-text-muted mb-1">Suggested action:</p>
                      <p className="text-sm text-text font-medium">{SUGGESTED_ACTION[result.classification] || "No change"}</p>
                      {result.re_engage_after && <p className="text-xs text-amber mt-1">💤 Re-engage after: {new Date(result.re_engage_after).toLocaleDateString()}</p>}
                    </div>
                    <div className="flex gap-3">
                      <button onClick={handleSkip} className="btn btn-ghost text-sm flex-1">Ignore — just log</button>
                      <button onClick={handleApply} className="btn btn-primary text-sm flex-1"><Check className="w-3.5 h-3.5 mr-1.5" />Apply & Close</button>
                    </div>
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
