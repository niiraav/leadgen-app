import { useState, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * SSR-safe portal that mounts children into document.body.
 * Use for overlays, modals, and drawers so position:fixed is always
 * relative to the viewport and never clipped by a parent layout wrapper.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
