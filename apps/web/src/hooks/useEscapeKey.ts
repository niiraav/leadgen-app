import { useEffect, useCallback } from "react";

export function useEscapeKey(enabled: boolean, onEscape: () => void) {
  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    },
    [onEscape]
  );

  useEffect(() => {
    if (!enabled) return;
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled, handler]);
}
