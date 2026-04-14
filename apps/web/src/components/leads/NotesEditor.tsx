import React, { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";

interface NotesEditorProps {
  leadId: string;
  initialNotes?: string;
}

export const NotesEditor = React.memo(function NotesEditor({ leadId, initialNotes = "" }: NotesEditorProps) {
  const [notes, setNotes] = useState(initialNotes);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const savingRef = useRef(false);
  const [saved, setSaved] = useState(false);

  const saveNotes = useCallback(async (val: string) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      await api.leadActions.updateNotes(leadId, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      console.error("Failed to save notes:", e);
    } finally {
      savingRef.current = false;
    }
  }, [leadId]);

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    setSaved(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveNotes(val);
    }, 1000);
  };

  return (
    <div className="relative">
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Notes</label>
        {saved && <span className="text-xs text-green">✓ Saved</span>}
      </div>
      <textarea
        value={notes}
        onChange={handleChange}
        placeholder="Add notes about this lead..."
        rows={3}
        className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none focus:ring-2 focus:ring-blue/20 resize-y"
      />
    </div>
  );
});
