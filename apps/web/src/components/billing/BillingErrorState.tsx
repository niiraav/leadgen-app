"use client";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

interface BillingErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  showBack?: boolean;
  onBack?: () => void;
}

export function BillingErrorState({
  title = "Unable to load billing information",
  message = "Something went wrong while loading your subscription details. Please try again.",
  onRetry,
  isRetrying,
  showBack,
  onBack,
}: BillingErrorStateProps) {
  return (
    <div className="max-w-md mx-auto py-20 text-center space-y-4">
      <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
        <AlertTriangle className="w-6 h-6 text-destructive" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{message}</p>
      </div>
      <div className="flex items-center justify-center gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Try again
          </button>
        )}
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            Go back
          </button>
        )}
      </div>
    </div>
  );
}
