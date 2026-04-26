# Billing UI Audit Remediation PRD

**Status:** Validated against codebase  
**Scope:** `apps/web/src/pages/billing/*`, `apps/web/src/components/UsageBanner.tsx`, `apps/web/src/components/ui/upgrade-prompt.tsx`, `apps/web/src/lib/api.ts`, `apps/web/src/globals.css`  
**Priority:** Bug-fix first (items 1-3), then accessibility/consistency (items 4-8), then polish (items 9-10).

---

## 1. Executive Summary

This PRD addresses **10 validated issues** discovered during a UI/UX audit of the LeadGen billing surface. The top 3 are **functional bugs**, not cosmetic improvements. A silent API failure on `/billing` currently renders the free plan UI, misleading the user about their subscription status. These must ship before any visual polish.

**Scope Note:** Top-up credits and multi-plan complexity are noted in the audit. Post-audit decision: Remove Top-Up credit CTA and relevant hooks as it's excessive for MVP. Keep Free + 1 Paid plan only.

---

## 2. Validated Bugs (Codebase Evidence)

### Bug A — Silent Free-Plan Fallback (index.tsx)

**Location:** `apps/web/src/pages/billing/index.tsx` lines 177-189, 271-274

```tsx
// catch block swallows error, sets loading=false, leaves status=null
catch (err: any) {
  console.error("[Billing] Load failed:", err.message);
} finally {
  setLoading(false);
}

// Render path evaluates isFree from null status:
const isSubscribed = status?.subscription_status === "active" || status?.subscription_status === "trialing";
const isFree = status?.plan === "free" || !isSubscribed;   // !isSubscribed === true when status===null
```

**Impact:** Any API failure (500, network timeout, etc.) causes the page to render as if the user is on the free plan, showing upgrade CTAs and usage bars at 0. This is actively misleading and erodes billing trust.

**Fix:** Track `hasError` as a separate boolean. Guard render with an explicit error state before any plan-conditional logic.

### Bug B — Raw `fetch` Top-Up Without Auth (index.tsx)

**Location:** `apps/web/src/pages/billing/index.tsx` lines 242-261

```tsx
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/billing/topup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ tier, successUrl, cancelUrl }),
});
```

**Impact:** The `fetch` call omits `Authorization: Bearer *** header. In production this returns 401, but the catch block (Bug A's pattern) silently swallows it. The user clicks "Top up", sees no feedback, and may retry multiple times. Even if the endpoint worked, CSRF is possible without origin validation.

**Fix:** Remove top-up CTA from MVP billing page. The raw fetch code and UI block should be stripped as part of the simplification.

### Bug C — Upgrade Page Swallows All Errors (upgrade.tsx)

**Location:** `apps/web/src/pages/billing/upgrade.tsx` lines 70-78

```tsx
catch {
  // not logged in or error — that's fine
} finally {
  setLoading(false);
}
```

**Impact:** 401 (unauthenticated) and 500 (server error) are treated identically. The page silently renders pricing cards with `status === null`, showing "Start Free Trial" even for already-subscribed users. A network failure gives no feedback.

**Fix:** Split catch into 401 redirect vs other error states.

### Bug D — Success Page Silent Failure (success.tsx)

**Location:** `apps/web/src/pages/billing/success.tsx` lines 26-38

Same pattern as Bug A: `console.error` only, no error state. After a Stripe redirect, if the sync fails, the user sees a generic success message with `planName = "your new"`.

### Bug E — Manage Page Error State Has No Retry (manage.tsx)

**Location:** `apps/web/src/pages/billing/manage.tsx` lines 127-138

```tsx
if (!status) {
  return (
    <div ...>
      <p>Unable to load billing information.</p>
      <button onClick={() => router.push("/billing")}>Back to Billing</button>
    </div>
  );
}
```

**Impact:** "Back to Billing" sends the user to `/billing` which may have the same failure. No retry action. This is the *only* page with any error UI, so it becomes the template for the shared component.

---

## 3. Component Inventory & Changes

### 3.1 New: `BillingErrorState`

Shared error boundary for all billing pages. Replaces ad-hoc null checks and silent swallows.

```tsx
// apps/web/src/components/billing/BillingErrorState.tsx
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Try again
          </button>
        )}
        {showBack && onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors"
          >
            Go back
          </button>
        )}
      </div>
    </div>
  );
}
```

**WCAG notes:**
- `focus-visible:ring-2` satisfies WCAG 2.2 2.4.7 Focus Visible.
- `disabled:pointer-events-none` prevents focus on disabled buttons (2.1.1 Keyboard).
- Color contrast: `text-muted-foreground` on `bg-background` must be verified against computed tokens (see §6.1).

### 3.2 New: `ToggleSwitch`

Replaces duplicated inline toggle in `index.tsx` and `upgrade.tsx`. Supports `size` prop.

```tsx
// apps/web/src/components/ui/ToggleSwitch.tsx
"use client";
import { cn } from "@/lib/utils";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  labelLeft?: React.ReactNode;
  labelRight?: React.ReactNode;
  size?: "sm" | "md";
  id?: string;
}

export function ToggleSwitch({
  checked,
  onChange,
  labelLeft,
  labelRight,
  size = "md",
  id,
}: ToggleSwitchProps) {
  const trackSize = size === "sm" ? "w-10 h-5" : "w-11 h-6";
  const thumbSize = size === "sm" ? "w-4 h-4" : "w-4 h-4";
  const thumbOffset = size === "sm" ? "translate-x-5" : "translate-x-5";
  const padding = size === "sm" ? "top-0.5 left-0.5" : "top-1 left-1";

  return (
    <div className="flex items-center gap-3">
      {labelLeft && (
        <span className={cn("text-sm", !checked ? "text-foreground font-medium" : "text-muted-foreground")}>
          {labelLeft}
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        id={id}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          trackSize,
          checked ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "absolute rounded-full bg-white transition-transform",
            thumbSize,
            padding,
            checked ? thumbOffset : "translate-x-0"
          )}
        />
      </button>
      {labelRight && (
        <span className={cn("text-sm", checked ? "text-foreground font-medium" : "text-muted-foreground")}>
          {labelRight}
        </span>
      )}
    </div>
  );
}
```

**WCAG notes:**
- `role="switch"` + `aria-checked` satisfies 4.1.2 Name, Role, Value.
- `focus-visible:ring-2` satisfies 2.4.7.
- Touch target: `w-11 h-6` = 44×24dp, exceeds 2.5.5 minimum 24×24.

### 3.3 New: `ProgressBar` (Accessible)

Extract and ARIA-enhance the existing inline `ProgressBar` from `index.tsx`.

```tsx
// apps/web/src/components/billing/ProgressBar.tsx
"use client";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  used: number;
  limit: number;
  label: string;
  icon?: React.ReactNode;
  labelId?: string;
}

export function ProgressBar({ used, limit, label, icon, labelId }: ProgressBarProps) {
  const isUnlimited = limit < 0;
  const pct = isUnlimited ? 0 : limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const over = !isUnlimited && used > limit;
  const color = over ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-success";
  const labelElemId = labelId || `progress-${label.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span id={labelElemId} className="flex items-center gap-1.5 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className={cn(over && "text-destructive font-medium")}>
          {isUnlimited ? `${used} / ∞` : `${used.toLocaleString()} / ${limit.toLocaleString()}`}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-muted overflow-hidden"
        role="progressbar"
        aria-labelledby={labelElemId}
        aria-valuemin={0}
        aria-valuemax={isUnlimited ? 1 : limit}
        aria-valuenow={isUnlimited ? 0 : used}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-500 ease-out", color, pct === 0 && "opacity-0")}
          // opacity-0 at 0% keeps DOM present (no layout shift) while visually indicating empty usage
          style={{ width: `${Math.max(pct, 0.5)}%` }}
        />
      </div>
    </div>
  );
}
```

**Notes:**
- `0.5%` minimum width (not 1%) — enough to be visible without distorting the bar at low values.
- `aria-labelledby` points to the visible label text, avoiding redundant announcement (per review feedback).
- `opacity-0` at 0% keeps the DOM element present but invisible, avoiding layout shift.

### 3.4 Modified: `api.billing` (add `topup`)

**Location:** `apps/web/src/lib/api.ts` line 768-788

Add inside the `billing` object:

```tsx
topup: (tier: "100" | "500") =>
  request<{ url: string; error?: string }>("/billing/topup", {
    method: "POST",
    body: JSON.stringify({ tier }),
  }),
```

**Rationale:** The typed client attaches `Authorization: Bearer *** header automatically. The raw `fetch` in `index.tsx` omits this, causing 401 in production.

**Post-audit decision:** Remove Top-Up credit CTA and relevant hooks from billing page as it's excessive for MVP.

---

## 4. File-by-File Implementation Plan

### Phase 1 — Critical Bugs (Must Ship First)

#### 4.1.1 `apps/web/src/lib/api.ts` — Add `topup`

**Line:** After `reactivate` in `api.billing` object (~line 788)

```tsx
topup: (tier: "100" | "500") =>
  request<{ url: string; error?: string }>("/billing/topup", {
    method: "POST",
    body: JSON.stringify({ tier }),
  }),
```

**Test:** Verify `api.billing.topup("100")` resolves with `{ url: string }`. No visual change.

#### 4.1.2 `apps/web/src/pages/billing/index.tsx` — Error State + Top-up Migration

**Changes:**

1. Add `hasError` state:
   ```tsx
   const [hasError, setHasError] = useState(false);
   ```

2. Update `fetchAll` catch:
   ```tsx
   } catch (err: any) {
     console.error("[Billing] Load failed:", err.message);
     setHasError(true);
   }
   ```

3. Add error guard before all plan logic:
   ```tsx
   if (loading) {
     return (
       <div className="flex items-center justify-center min-h-[60vh]">
         <Loader2 className="w-8 h-8 animate-spin text-blue" />
       </div>
     );
   }

   if (hasError) {
     return (
       <BillingErrorState
         onRetry={() => {
           setHasError(false);
           setLoading(true);
           fetchAll();
         }}
         isRetrying={loading}
       />
     );
   }
   ```

4. Replace raw `fetch` top-up with typed client:
   ```tsx
   const handleTopUp = async (tier: "100" | "500") => {
     setBusy("topup");   // shared state for both buttons
     try {
       const data = await api.billing.topup(tier);
       if (data.url) {
         window.location.href = data.url;
       } else {
         toast.error(data.error || "Top-up failed");
         setBusy(null);
       }
     } catch (err: any) {
       toast.error(err.message || "Top-up failed");
       setBusy(null);
     }
   };
   ```

   **Note:** `setBusy("topup")` (not `topup-100`/`topup-500`) disables both buttons during any top-up call, preventing parallel requests.

5. Update top-up button disabled states:
   ```tsx
   disabled={busy === "topup"}
   ```

**Lines affected:** ~20 lines changed, ~5 lines added for error guard.

**Post-audit decision:** Remove Top-Up credit CTA and relevant hooks as it's excessive for MVP. Keep Free + 1 Paid plan only.

#### 4.1.3 `apps/web/src/pages/billing/upgrade.tsx` — Error State + 401 Handling

**Changes:**

1. Add states:
   ```tsx
   const [hasError, setHasError] = useState(false);
   const [isRetrying, setIsRetrying] = useState(false);
   ```

2. Update `fetchStatus`:
   ```tsx
   const fetchStatus = useCallback(async () => {
     try {
       const s = (await api.billing.status()) as any;
       setPlan(s.plan);
       setHasError(false);
     } catch (err: any) {
       if (err?.message?.includes("Session expired") || err?.message?.includes("Unauthorized")) {
         // api.ts request() already redirects on 401; this is a safety net
         return;
       }
       setHasError(true);
     } finally {
       setLoading(false);
     }
   }, []);
   ```

3. Add error guard after loading check:
   ```tsx
   if (loading) { ... }

   if (hasError) {
     return (
       <BillingErrorState
         onRetry={() => {
           setIsRetrying(true);
           setLoading(true);
           fetchStatus().finally(() => setIsRetrying(false));
         }}
         isRetrying={isRetrying}
       />
     );
   }
   ```

**Lines affected:** ~15 lines.

#### 4.1.4 `apps/web/src/pages/billing/success.tsx` — Error State

**Changes:**

1. Add state:
   ```tsx
   const [hasError, setHasError] = useState(false);
   ```

2. Update effect catch:
   ```tsx
   } catch (err: any) {
     console.error("[BillingSuccess] Load failed:", err.message);
     setHasError(true);
   }
   ```

3. Add error guard after loading, **and extract the async logic to a `useCallback` so the retry handler can call it directly:**

   First, refactor the effect into a named `useCallback`:
   ```tsx
   const [hasError, setHasError] = useState(false);

   const loadStatus = useCallback(async () => {
     let cancelled = false;
     try {
       setLoading(true);
       setHasError(false);
       await api.billing.sync().catch(() => {});
       const s = (await api.billing.status()) as unknown as BillingStatus;
       if (!cancelled) setStatus(s);
     } catch (err: any) {
       if (!cancelled) {
         console.error("[BillingSuccess] Load failed:", err.message);
         setHasError(true);
       }
     } finally {
       if (!cancelled) setLoading(false);
     }
     return () => { cancelled = true; };
   }, []);

   useEffect(() => {
     const cleanup = loadStatus();
     return () => { cleanup.then((fn) => fn?.()); };
   }, [loadStatus]);
   ```

   Then add the error guard with a retry that reuses `loadStatus`:
   ```tsx
   if (loading) { ... }

   if (hasError) {
     return (
       <BillingErrorState
         title="Couldn't confirm your subscription"
         message="We couldn't verify your plan status. If you completed payment, your subscription is still active."
         onRetry={() => loadStatus()}
       />
     );
   }
   ```

**Lines affected:** ~12 lines.

#### 4.1.5 `apps/web/src/pages/billing/manage.tsx` — Replace Back Button with Retry

**Changes:**

Replace the existing `!status` error state (lines 127-138):

```tsx
if (!status) {
  return (
    <BillingErrorState
      onRetry={() => {
        setLoading(true);
        fetchStatus();
      }}
      isRetrying={loading}
      showBack
      onBack={() => router.push("/billing")}
    />
  );
}
```

**Note:** Preserve the existing `!status` condition — do not add `hasError` here unless refactoring the fetch block too. The retry action re-runs `fetchStatus` which re-sets `status` on success.

### Phase 2 — Accessibility & Consistency

#### 4.2.1 `apps/web/src/globals.css` — Add Focus Utility + Darken `text-faint`

**Add to `@layer utilities`:**

```css
@layer utilities {
  .focus-ring {
    @apply focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background;
  }
}
```

**Darken `--text-faint` for contrast:**

Current (line 52, 103):
```css
--text-faint: hsl(240 3.8% 60%);     /* light */
--text-faint: hsl(240 5% 45%);       /* dark */
```

New:
```css
--text-faint: hsl(240 4% 44%);       /* light — ~4.6:1 on white */
--text-faint: hsl(240 5% 55%);       /* dark — verify against dark bg */
```

**Rationale:** The "Coming soon" section in `index.tsx` uses `text-text-faint` on a near-white surface. 60% lightness is ~3.1:1, failing WCAG AA. 44% is ~4.6:1, passing.

**Dark mode verification note:** Assumed dark background is `hsl(240 3.8% 15%)` (typical shadcn dark `--card`). At 55% lightness on that background, ratio is ~5.2:1 — passes AA. Verify against your actual computed `--card` value during implementation.

#### 4.2.2 `apps/web/src/pages/billing/index.tsx` — Replace Inline Toggle

Replace the inline monthly/annual toggle with `<ToggleSwitch />`:

```tsx
<ToggleSwitch
  checked={annual}
  onChange={setAnnual}
  labelLeft="Monthly"
  labelRight={
    <>
      Annual{" "}
      <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
        Save £{OUTREACH_TIER.annualSavings}
      </span>
    </>
  }
  size="sm"
/>
```

#### 4.2.3 `apps/web/src/pages/billing/upgrade.tsx` — Replace Inline Toggle

Replace the inline toggle with `<ToggleSwitch />`:

```tsx
<ToggleSwitch
  checked={annual}
  onChange={setAnnual}
  labelLeft="Monthly"
  labelRight={
    <>
      Annual{" "}
      {annual && (
        <span className="text-xs font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
          Save £{OUTREACH_TIER.annualSavings}
        </span>
      )}
    </>
  }
  size="md"
/>
```

#### 4.2.4 `apps/web/src/pages/billing/index.tsx` — Replace Inline ProgressBar

Replace the inline `ProgressBar` function with the imported component. Add `labelId` props for ARIA. No visual change.

#### 4.2.5 `apps/web/src/pages/billing/index.tsx` — Fix "Coming Soon" Contrast

Line ~603:
```tsx
<h3 className="text-sm font-medium text-text-muted mb-2">
```
Change items to `text-text-muted` as well. After the `--text-faint` token darkening in §4.2.1, both pass AA.

#### 4.2.6 `apps/web/src/pages/billing/index.tsx`, `upgrade.tsx`, `manage.tsx` — Remove Redundant Page Padding

Remove `pb-20 md:pb-8` from the root `<div>` in all three pages. The `_app.tsx` `<main>` already provides `pb-24 md:pb-6`.

**Exception:** `success.tsx` uses `py-20` for vertical centering — **do not change**.

### Phase 3 — Polish (Skeletons, Motion, Responsive Table)

#### 4.3.1 `apps/web/src/pages/billing/index.tsx` — Skeleton Loading State

Replace the single-spinner loading state with a skeleton matching card shapes:

```tsx
if (loading) {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-7 w-48 bg-muted rounded-lg" />
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="h-6 w-32 bg-muted rounded" />
        <div className="h-2 w-full bg-muted rounded-full" />
        <div className="h-2 w-3/4 bg-muted rounded-full" />
      </div>
    </div>
  );
}
```

#### 4.3.2 `apps/web/src/pages/billing/upgrade.tsx` — Comparison Table Mobile Refactor

Replace the native `<table>` with a responsive stacked layout below `md` breakpoint:

```tsx
{/* Mobile: stacked cards */}
<div className="md:hidden space-y-3">
  {features.map((f) => (
    <div key={f.label} className="rounded-lg border border-border bg-card p-3 flex items-center justify-between">
      <span className="text-sm text-foreground flex items-center gap-2">{f.icon} {f.label}</span>
      <div className="text-right">
        <div className="text-xs text-muted-foreground">Free: {f.free}</div>
        <div className="text-sm font-medium text-foreground">Outreach: {f.outreach}</div>
      </div>
    </div>
  ))}
</div>

{/* Desktop: table */}
<div className="hidden md:block overflow-x-auto">
  <table className="w-full text-sm">...</table>
</div>
```

#### 4.3.3 `apps/web/src/pages/billing/upgrade.tsx` — Card Hover Micro-interaction

Add `whileHover={{ y: -2 }}` from Framer Motion to plan cards (Framer Motion is already a dependency per `sidebar.tsx`):

```tsx
<motion.div
  whileHover={{ y: -2 }}
  transition={{ duration: 0.2 }}
  className="..."
>
```

---

## 5. `isMounted` / Race Condition Guard

All four billing pages use `useEffect` + async functions without unmount guards. In React 18 Strict Mode, this causes warnings and potential state updates after unmount.

**Pattern to apply (all pages):**

```tsx
useEffect(() => {
  let cancelled = false;

  const load = async () => {
    try {
      await api.billing.sync().catch(() => {});
      const [s, u] = await Promise.all([...]);
      if (!cancelled) {
        setStatus(s);
        setUsage(u);
      }
    } catch (err: any) {
      if (!cancelled) {
        console.error("...", err.message);
        setHasError(true);
      }
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  load();
  return () => { cancelled = true; };
}, []);
```

**Priority:** Apply to `index.tsx`, `upgrade.tsx`, `success.tsx`, `manage.tsx`. Low effort, prevents dev-mode warnings and prod edge-case bugs. Note: `success.tsx` requires the same `useCallback` extraction as §4.1.4 so the retry handler can call it directly — the `cancelled` guard and unmount cleanup are the same pattern.

---

## 6. Verification Checklist

### 6.1 Contrast Verification (manual)

After the `--text-faint` token change, run these through a WCAG contrast checker:

| Element | Foreground Token | Background | Target Ratio |
|---------|-----------------|------------|--------------|
| "Coming soon" heading (light) | `--text-faint` (new: 44%) | `--card` | 4.5:1 |
| "Coming soon" heading (dark) | `--text-faint` (new: 55%) | `--card` (~15%) | 4.5:1 |
| "Coming soon" list items | `--text-faint` (new: 44%) | `--card` / 50% opacity | 4.5:1 |
| Progress bar label | `--muted-foreground` | `--background` | 4.5:1 |
| Trial badge text | `--primary` / 10% bg | `--card` | 3:1 (large text OK) |

### 6.2 Keyboard Navigation (manual)

1. Tab through Billing page — every button shows focus ring.
2. Tab to monthly/annual toggle — Space toggles it.
3. Tab to "Try again" on error state — Enter triggers retry.
4. Verify no focus trap on error state.

### 6.3 Screen Reader (manual / axe DevTools)

1. Run axe DevTools on `/billing`, `/billing/upgrade`, `/billing/manage`, `/billing/success`.
2. Verify 0 "critical" or "serious" violations.
3. Verify progress bars announce "Leads usage, 12 of 25" via `aria-labelledby`.
4. Verify toggle announces "Monthly, switch, checked" / "Annual, switch, not checked".

### 6.4 Functional Tests

| Test | Steps | Expected |
|------|-------|----------|
| Error state | Block `/billing/status` via devtools, refresh | Shows "Unable to load" with Try Again |
| Retry | Click Try Again after restoring network | Reloads billing data successfully |
| Silent fail fix | Block API, verify `isFree` is NOT evaluated | Error state renders, no free plan UI shown |
| Toggle size | Verify index.tsx uses `sm`, upgrade.tsx uses `md` | Both render correctly |
| Unmount race | Navigate away from `/billing` while API is in-flight | No state update warnings in console |
| Retry resets error | Trigger error state, restore network, click Try Again | Data loads, error state disappears, plan UI renders correctly |

### 6.5 Responsive Tests

| Viewport | Check |
|----------|-------|
| 375px (iPhone SE) | Plan cards stack, no horizontal scroll except table |
| 768px (iPad) | 2-column plan cards, table visible |
| 1440px+ | max-w-5xl centered, no excessive whitespace |

---

## 7. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| `--text-faint` darkening affects other pages | Low | Search for `text-text-faint` across codebase. Only "Coming soon" and similar teases use it. Darkening improves them all. |
| `focus-ring` utility class conflicts with shadcn Button | Low | Apply manually to billing `<button>` elements only. Do not add global `button, a` selector. |
| Removing page padding causes bottom content to be hidden by bottom nav on mobile | Low | `_app.tsx` `<main>` has `pb-24` which exceeds the removed `pb-20`. Visual check on mobile. |
| Framer Motion `whileHover` on plan cards causes layout shift | Low | `y: -2` is 2px, minimal. Disable if performance issues arise on low-end devices. |

---

## 8. Rollback Plan

All changes are additive or surgical — no database migrations, no API contract changes. Rollback per file:

1. Revert billing page files — restore original catch blocks and inline components.
2. Revert `globals.css` — remove `.focus-ring` utility and `--text-faint` change.

**Recommended:** Stage commits per phase (Phase 1, Phase 2, Phase 3) so rollback is granular.

---

## 9. Appendix: Code Reference

### A. Current Silent Catch Blocks (for diff context)

**index.tsx:**
```tsx
catch (err: any) {
  console.error("[Billing] Load failed:", err.message);
} finally {
  setLoading(false);
}
```

**upgrade.tsx:**
```tsx
catch {
  // not logged in or error — that's fine
} finally {
  setLoading(false);
}
```

**success.tsx:**
```tsx
catch (err: any) {
  console.error("[BillingSuccess] Load failed:", err.message);
} finally {
  setLoading(false);
}
```

**manage.tsx:**
```tsx
catch (err: any) {
  console.error("[BillingManage] Load failed:", err.message);
} finally {
  setLoading(false);
}
```

### B. Current Duplicated Toggle (index.tsx)

```tsx
<div className="flex items-center gap-2">
  <span className={`text-xs ${!annual ? "text-text" : "text-text-faint"}`}>Monthly</span>
  <button
    onClick={() => setAnnual(!annual)}
    className={`relative w-10 h-5 rounded-full transition-colors ${annual ? "bg-blue" : "bg-surface-2"}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${annual ? "translate-x-5" : ""}`} />
  </button>
  <span className={`text-xs ${annual ? "text-text" : "text-text-faint"}`}>
    Annual <span className="text-green font-medium">Save £{OUTREACH_TIER.annualSavings}/yr</span>
  </span>
</div>
```

### C. Current Duplicated Toggle (upgrade.tsx)

```tsx
<div className="flex items-center justify-center gap-3">
  <span className={`text-sm ${!annual ? "text-text font-medium" : "text-text-faint"}`}>Monthly</span>
  <button
    onClick={() => setAnnual(!annual)}
    className={`relative w-11 h-6 rounded-full transition-colors ${annual ? "bg-blue" : "bg-surface-2"}`}
  >
    <span className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform ${annual ? "translate-x-5" : ""}`} />
  </button>
  <span className={`text-sm ${annual ? "text-text font-medium" : "text-text-faint"}`}>
    Annual
  </span>
  {annual && (
    <span className="text-xs font-medium text-green bg-green/10 px-2 py-0.5 rounded-full">
      Save £{OUTREACH_TIER.annualSavings}
    </span>
  )}
</div>
```
