# UI Polish & Micro-Animations PRD

**Status:** Draft → Ready for implementation  
**Scope:** `apps/web/src` — design system rebuild + Framer Motion micro-animations  
**Dependencies:** `framer-motion` (not yet installed — see §9)

---

## 1. Philosophy

The current UI is functionally complete but visually "stitched together." Five different border radii, three color systems, no spacing rhythm, and zero motion make the app feel static and cheap. This PRD defines a single coherent design system and injects subtle, purposeful motion that makes the dashboard feel alive — not flashy.

**Principles:**
- Motion should be invisible on first use, noticeable on second use, delightful on third.
- Every animation must have a semantic purpose (entrance = new content, hover = interactivity, exit = removal).
- No `active:scale-95` tap-feedback on desktop. Scale transforms are for mobile only.
- Duration standard: `0.15s` for micro-interactions, `0.3s` for layout transitions, `0.5s` for page entrances.
- Easing standard: `ease-out` for entrances, `ease-in-out` for layout, spring (`stiffness: 300, damping: 30`) for interactive elements.

---

## 2. Token Rebuild

### 2.1 Color System (Single Source of Truth)

Replace the warm cream `(--bg: #f5f5f3)` with true neutral. Move to HSL for consistency with shadcn and predictable dark-mode inversion. The warm tint currently clashes with the cool blue accent; neutrality fixes this.

**New `globals.css` root block:**

```css
:root {
  /* Backgrounds */
  --background: 0 0% 98%;        /* was #f5f5f3 → near-white grey */
  --foreground: 240 10% 3.9%;    /* near-black text */
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;

  /* Primary accent (your blue) */
  --primary: 207 71% 39%;        /* #1d6fa8 in HSL */
  --primary-foreground: 0 0% 100%;

  /* Secondary / muted surfaces */
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;

  /* Accent (shadcn semantic — for hover highlights, not primary actions) */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;

  /* Semantic states */
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 69% 45%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%;
  --warning-foreground: 0 0% 100%;

  /* Borders & inputs */
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 207 71% 39%;           /* was hardcoded blue — now tokenized */

  /* Radius */
  --radius: 0.5rem;                /* 8px = rounded-lg. Single source. */

  /* Legacy support: map old names to new for gradual migration */
  --bg: hsl(var(--background));
  --surface: hsl(var(--card));
  --surface-2: hsl(var(--secondary));
  --text: hsl(var(--foreground));
  --text-muted: hsl(var(--muted-foreground));
  --text-faint: hsl(240 3.8% 60%);
  --blue: hsl(var(--primary));
  --green: hsl(var(--success));
  --amber: hsl(var(--warning));
  --red: hsl(var(--destructive));
}

.dark {
  --background: 240 10% 3.9%;     /* #0a0a0a → slightly elevated from pure black */
  --foreground: 0 0% 98%;
  --card: 240 10% 5.9%;           /* was #141414 → now properly spaced from bg */
  --card-foreground: 0 0% 98%;
  --popover: 240 10% 5.9%;
  --popover-foreground: 0 0% 98%;

  --primary: 207 71% 64%;        /* lighter blue in dark mode */
  --primary-foreground: 240 10% 3.9%;

  --secondary: 240 3.7% 15.9%;
  --secondary-foreground: 0 0% 98%;
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;

  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 69% 58%;
  --success-foreground: 240 10% 3.9%;
  --warning: 38 92% 60%;
  --warning-foreground: 240 10% 3.9%;

  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  --ring: 207 71% 64%;

  /* Legacy dark overrides */
  --bg: hsl(var(--background));
  --surface: hsl(var(--card));
  --surface-2: hsl(var(--secondary));
  --text: hsl(var(--foreground));
  --text-muted: hsl(var(--muted-foreground));
  --text-faint: hsl(240 5% 45%);
  --blue: hsl(var(--primary));
  --green: hsl(var(--success));
  --amber: hsl(var(--warning));
  --red: hsl(var(--destructive));
}
```

**Tailwind config additions** (add to `theme.extend.colors`):
```js
background: "hsl(var(--background))",
foreground: "hsl(var(--foreground))",
card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
border: "hsl(var(--border))",
input: "hsl(var(--input))",
ring: "hsl(var(--ring))",
```

**Why HSL**: shadcn, Radix, and modern CSS all use HSL. It makes opacity manipulation trivial (`bg-primary/10`), guarantees predictable dark-mode behavior, and removes the current chaos of hex vs rgba vs raw Tailwind classes.

---

### 2.2 Radius Standardization (One Rule)

| Element | Radius | Tailwind | Rationale |
|---|---|---|---|
| Cards | 8px | `rounded-lg` | Consistent with `--radius` |
| Buttons | 6px | `rounded-md` | Slightly tighter than cards; pill shapes are mobile-only |
| Inputs | 6px | `rounded-md` | Matches button geometry |
| Badges, pills, status dots | 9999px | `rounded-full` | ONLY these elements |
| Avatars | 9999px | `rounded-full` | Only these |
| Dropdowns / Popovers | 8px | `rounded-lg` | Matches cards |
| Modals / Drawers | 12px | `rounded-xl` | Overlays need more visual weight |
| Sidebar nav items | 8px | `rounded-lg` | Matches cards, not buttons |

**Banished**: `rounded-xl` on cards (84 instances), `rounded-full` on buttons (159 instances), `rounded-md` on cards.

---

### 2.3 Spacing Standardization

Define three component sizes via `cva`. Every interactive element must pick one.

```ts
// src/lib/variants.ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        outline: "border border-border bg-background hover:bg-accent hover:text-accent-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-9 px-4 py-2 text-sm rounded-md",
        sm: "h-8 px-3 text-xs rounded-md",
        lg: "h-10 px-6 text-sm rounded-md",
        icon: "h-9 w-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export const inputVariants = cva(
  "flex w-full border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-9 rounded-md",
        sm: "h-8 rounded-md text-xs px-2.5 py-1.5",
        lg: "h-10 rounded-md",
      },
    },
    defaultVariants: { size: "default" },
  }
);

export const cardVariants = cva(
  "border border-border bg-card text-card-foreground shadow-sm",
  {
    variants: {
      padding: {
        default: "p-6 rounded-lg",
        compact: "p-4 rounded-lg",
        loose: "p-8 rounded-lg",
      },
    },
    defaultVariants: { padding: "default" },
  }
);
```

**Migration rule**: Every new or refactored component must use `cva`. Legacy components are touched only when they violate radius or color rules in the same file being edited for animation.

---

### 2.4 Shadow Diet

| Context | Shadow | Change |
|---|---|---|
| Cards (default) | none | Remove `shadow-sm`. Border alone defines elevation. |
| Cards (hover) | `shadow-sm` | Only on hover. Remove `hover:shadow-md`. |
| Dropdowns / Popovers | `shadow-sm` | Kill `shadow-xl`. Use border + subtle shadow. |
| Modals / Drawers | `shadow-lg` | This is the ONLY place `shadow-lg` is allowed. |
| Command palette | `shadow-lg` | Overlay exception. |
| KPI cards | none | Kill `shadow-sm`. Add `border` if missing. |
| Tables | none | Remove all table shadows. |

**Count check**: Current code has `shadow-xl` ×17, `shadow-lg` ×25, `shadow-sm` ×4. After migration: `shadow-lg` ×~5, `shadow-sm` ×~15 (hover states), `shadow-xl` ×0, `shadow-md` ×0.

---

### 2.5 Typography Minimums

| Element | Minimum size | Change |
|---|---|---|
| Table body | `text-sm` (14px) | Kill `text-xs` in tables |
| Buttons | `text-sm` (14px) | `sm` variant can be `text-xs` |
| Card titles | `text-base` (16px) or `text-lg` | Kill `text-sm` card headers |
| KPI labels | `text-sm` (14px) | Already correct |
| Badges | `text-xs` (12px) | OK — badges are metadata |
| Sidebar nav | `text-sm` (14px) | Already correct |
| Dropdown items | `text-sm` (14px) | Kill `text-xs` dropdown rows |
| Form labels | `text-sm` (14px) | Already correct |

**Tracking-wider**: Kill on body text. Reserve for uppercase badge labels ONLY (3–4 instances max). Current count: 31. Target: ≤5.

---

### 2.6 Active State Fix

Remove `active:scale-95` everywhere. Replace with `active:opacity-80` or `active:bg-muted`.

| Element | Current | New |
|---|---|---|
| Buttons (`.btn`) | `transform: scale(0.95)` | `opacity: 0.85` (no transform) |
| Topbar buttons | `active:scale-95` | `active:bg-muted` |
| Sidebar nav items | `active:scale-95` | Remove entirely (Link has no active state) |
| Dropdown items | `active:scale-95` | `active:bg-muted` |

---

## 3. Framer Motion Integration Plan

### 3.1 Installation

```bash
cd apps/web && npm install framer-motion
```

**Bundle impact**: ~40KB gzipped. Tree-shaken — only imported utilities are bundled.

### 3.2 Animation Tokens

Centralize all motion config in one file to prevent inconsistency:

```ts
// src/lib/animation.ts
export const spring = { type: "spring", stiffness: 300, damping: 30 };
export const springStiff = { type: "spring", stiffness: 400, damping: 25 };
export const springSoft = { type: "spring", stiffness: 200, damping: 35 };

export const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: "easeOut" },
};

export const fadeInUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: "easeOut" },
};

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.05 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: spring },
};

export const layoutTransition = {
  layout: { type: "spring", stiffness: 300, damping: 30 },
};

export const scaleOnTap = {
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 400, damping: 25 },
};

export const hoverLift = {
  whileHover: { y: -2, transition: springSoft },
};
```

**Rule**: No inline `transition={{ duration: 0.5 }}` anywhere. All motion references tokens from `animation.ts`.

---

## 4. Per-Page Animation Spec

### 4.1 Dashboard (`/dashboard`)

**KPI Cards — Staggered Entrance**

On page mount, the 4 KPI cards should not appear simultaneously. They should cascade in with a 50ms stagger. Each card also lifts on hover.

```tsx
// In dashboard/index.tsx
import { motion } from "framer-motion";
import { staggerContainer, staggerItem, hoverLift } from "@/lib/animation";

<motion.div
  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
  variants={staggerContainer}
  initial="initial"
  animate="animate"
>
  {kpis.map((kpi) => (
    <motion.div key={kpi.title} variants={staggerItem} {...hoverLift}>
      <KPICard ... />
    </motion.div>
  ))}
</motion.div>
```

**Chart Section — Fade-In**

The chart card (which is larger and loads heavier data) should fade in slightly after the KPIs.

```tsx
<motion.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ delay: 0.25, duration: 0.4, ease: "easeOut" }}
>
  <Card>
    {/* chart content */}
  </Card>
</motion.div>
```

**Recent Leads List — Slide-In Items**

Each lead list item slides in from the left with 40ms stagger.

```tsx
<motion.div variants={staggerContainer} initial="initial" animate="animate">
  {recentLeads.map((lead, i) => (
    <motion.div
      key={lead.id}
      variants={staggerItem}
      custom={i}
    >
      <LeadListRow ... />
    </motion.div>
  ))}
</motion.div>
```

**KPI Number Count-Up**

When KPI cards mount, the numeric value should count up from 0 to the target over 1.2s. Use a simple custom hook (no extra lib needed).

```ts
// src/lib/useCountUp.ts
import { useState, useEffect } from "react";

export function useCountUp(end: number, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      setCount(Math.floor(progress * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, duration]);
  return count;
}
```

```tsx
const count = useCountUp(kpi.value);
<p className="text-3xl font-bold">{count}</p>
```

---

### 4.2 Sidebar (`components/layout/sidebar.tsx`)

**Collapse Animation**

The sidebar width transition is currently a CSS `transition-all duration-300`. Keep the CSS for width (Framer Motion layout animations on fixed-position elements are expensive). But add Framer Motion to the nav item labels.

When collapsing, labels fade out and shrink. When expanding, they fade in and grow. This prevents the "text squashing" visual bug.

```tsx
{!collapsed && (
  <motion.span
    initial={{ opacity: 0, width: 0 }}
    animate={{ opacity: 1, width: "auto" }}
    exit={{ opacity: 0, width: 0 }}
    transition={{ duration: 0.2 }}
  >
    {item.label}
  </motion.span>
)}
```

**Active Nav Item — Micro-Bounce**

When a nav item becomes active, the background color transitions with a spring (not linear CSS). The icon also gets a tiny `scale: 1.05` pop.

```tsx
<motion.div
  animate={active ? { scale: 1.05 } : { scale: 1 }}
  transition={{ type: "spring", stiffness: 400, damping: 20 }}
>
  <Icon className={cn("w-[18px] h-[18px] shrink-0", active && "text-blue")} />
</motion.div>
```

---

### 4.3 Topbar (`components/layout/topbar.tsx`)

**Notification Bell — Shake on New**

When `unreadCount` increases from 0 to >0, the bell icon shakes once.

```tsx
const [shake, setShake] = useState(false);
useEffect(() => {
  if (unreadCount > 0) {
    setShake(true);
    const t = setTimeout(() => setShake(false), 500);
    return () => clearTimeout(t);
  }
}, [unreadCount]);

<motion.div
  animate={shake ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
  transition={{ duration: 0.5 }}
>
  <Bell className="w-4 h-4" />
</motion.div>
```

**Notification Dropdown — Slide + Fade**

Current dropdown appears instantly. It should slide down from the bell with a slight fade.

```tsx
{notifOpen && (
  <motion.div
    initial={{ opacity: 0, y: -8, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: -8, scale: 0.96 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
    className="absolute right-0 top-full mt-2 w-80 ..."
  >
    {/* dropdown content */}
  </motion.div>
)}
```

**Avatar Dropdown — Same pattern**

Mirror the notification dropdown animation for consistency.

---

### 4.4 Search Page (`/search/google-maps`)

**Expanded → Collapsed Transition**

This is the most important motion in the app. It currently snaps between states. It should animate.

```tsx
// Wrap the form container
<motion.div
  layout
  transition={{ type: "spring", stiffness: 250, damping: 30 }}
  className={cn(
    "transition-all",
    hasResults ? "max-w-7xl" : "max-w-xl mx-auto"
  )}
>
  {/* form or results */}
</motion.div>
```

**Results Table — Row Stagger**

When results load, rows should not all appear at once. Stagger 30ms per row, max 500ms total (so 100 results still feel instant).

```tsx
<motion.tbody variants={staggerContainer} initial="initial" animate="animate">
  {results.map((r, i) => (
    <motion.tr
      key={r.place_id}
      variants={staggerItem}
      custom={i}
      className="..."
    >
      {/* cells */}
    </motion.tr>
  ))}
</motion.tbody>
```

**Row Hover — Slide Right**

On hover, a search result row should slide 4px to the right and the background should subtly highlight.

```tsx
<motion.tr
  whileHover={{ x: 4, backgroundColor: "hsl(var(--muted))" }}
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
>
```

**Save Button — Success Pop**

After clicking "Save" on a lead, the button should morph: text changes to "Saved ✓", background flashes green briefly, then settles.

```tsx
<motion.button
  whileTap={{ scale: 0.95 }}
  animate={saved ? { backgroundColor: "hsl(var(--success))" } : {}}
  transition={{ duration: 0.2 }}
>
  {saved ? "Saved ✓" : "Save"}
</motion.button>
```

---

### 4.5 Leads Page (`/leads`)

**Card Grid — Masonry-Style Entrance**

Lead cards should enter with a subtle scale-up + fade, staggered by 40ms. On filter change, cards that remain should reorder with layout animation (Framer Motion's `layout` prop).

```tsx
<motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" layout>
  {leads.map((lead) => (
    <motion.div
      key={lead.id}
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={spring}
      {...hoverLift}
    >
      <LeadCard lead={lead} />
    </motion.div>
  ))}
</motion.div>
```

**Important**: The `layout` prop on the parent grid + each child enables automatic reordering when filters/sorts change. Cards physically move to their new positions instead of disappearing and reappearing.

---

### 4.6 Lead Detail (`/leads/[id]`)

**Tab Switcher — Underline Slide**

The tab underline should slide to the active tab, not snap.

```tsx
// Track active tab index, render a motion.div underline
<motion.div
  className="absolute bottom-0 h-0.5 bg-primary rounded-full"
  layoutId="tab-underline"
  transition={{ type: "spring", stiffness: 300, damping: 30 }}
  style={{ width: tabWidth, left: tabOffset }}
/>
```

`layoutId` is the magic here — Framer Motion handles the morphing between positions automatically.

**Section Cards — Accordion Expand**

Each collapsible section (Overview, Contact, Notes) should expand with `AnimatePresence` + height animation.

```tsx
<AnimatePresence>
  {expanded && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* section content */}
    </motion.div>
  )}
</AnimatePresence>
```

---

### 4.7 Pipeline (`/pipeline`)

**Column Reorder — Drag + Animate**

If implementing drag-and-drop column reordering (future scope, but motion infra should support it), each column uses `layout` prop. Cards within columns also use `layout` so they reorder smoothly when status changes.

**Card Move Between Columns**

When a card moves from "New" to "Contacted", it should animate to the new column position. This requires `layout` on the card + the parent columns. The card will physically travel across the screen.

```tsx
// Each PipelineCard
<motion.div layout layoutId={lead.id} transition={spring}>
  <LeadCard lead={lead} />
</motion.div>
```

**New Card Drop — Bounce**

When a card is dropped into a column, it should scale from 0.9 to 1.0 with a spring overshoot (damping < 20).

```tsx
<motion.div
  initial={{ scale: 0.9 }}
  animate={{ scale: 1 }}
  transition={{ type: "spring", stiffness: 300, damping: 15 }}
>
```

---

### 4.8 Sequences (`/sequences`)

**Timeline — Node Entrance**

Sequence steps should draw in from left to right. Each node (circle + label) fades in and slides up 8px, staggered 80ms.

```tsx
<motion.div variants={staggerContainer} initial="initial" animate="animate">
  {steps.map((step, i) => (
    <motion.div
      key={i}
      variants={staggerItem}
      className="flex items-center gap-3"
    >
      <motion.div
        className="w-3 h-3 rounded-full bg-primary"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: i * 0.08, type: "spring", stiffness: 400 }}
      />
      <span>{step.name}</span>
    </motion.div>
  ))}
</motion.div>
```

---

### 4.9 Global — Page Transitions

Wrap the Next.js Pages Router layout in `AnimatePresence` for cross-page transitions.

```tsx
// In _app.tsx or a layout wrapper
import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/router";

function App({ Component, pageProps }) {
  const router = useRouter();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={router.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Component {...pageProps} />
      </motion.div>
    </AnimatePresence>
  );
}
```

**Warning**: `mode="wait"` means the old page exits before the new page enters. This adds ~200ms to every navigation. If the app feels sluggish, switch to `mode="sync"` (both animate simultaneously) or remove page transitions entirely and keep animations per-page.

**Recommendation**: Start WITHOUT global page transitions. Add them only if per-page animations feel disconnected. The `AnimatePresence` pattern above is documented for future use but NOT part of Phase 1.

---

## 5. Component-Specific Animation Specs

### 5.1 Button Component (New)

Create a canonical button with all motion and styling built in.

```tsx
// src/components/ui/button.tsx
"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/lib/variants";

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  children,
  ...props
}: ButtonProps) {
  return (
    <motion.button
      className={cn(buttonVariants({ variant, size }), className)}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
```

**Rules enforced by this component**:
- Radius: `rounded-md` (6px)
- Hover: lifts 1px (no shadow change — shadow is static)
- Tap: scales to 0.97 (spring, not CSS transition)
- No `active:scale-95` in className
- Focus ring: uses `ring-ring` token

---

### 5.2 Card Component (Refactored)

```tsx
// src/components/ui/card.tsx (refactored)
"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { cardVariants } from "@/lib/variants";

export function Card({
  className,
  animate = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { animate?: boolean }) {
  const Comp = animate ? motion.div : "div";
  return (
    <Comp
      className={cn(cardVariants({ padding: "default" }), className)}
      {...(animate ? { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 } } : {})}
      {...props}
    />
  );
}
```

---

### 5.3 Badge Component (Refactored)

Update badge colors to use semantic tokens instead of raw class strings.

```tsx
// src/components/ui/badge.tsx
import { cva } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        outline: "text-foreground",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning text-warning-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);
```

Update `PIPELINE_BADGE_COLORS` and `ENGAGEMENT_BADGE_COLORS` in `card.tsx` to use `badgeVariants({ variant: "..." })` instead of raw Tailwind strings.

---

## 6. Performance Rules

1. **Never animate `layout` on scroll containers**. The leads table with 100+ rows should NOT use `layout` on each row. Use `layout` only on grids/columns with ≤30 items.
2. **Never animate `filter: blur()`**. It's GPU-toxic. Use opacity + scale instead.
3. **Use `will-change: transform`** sparingly. Framer Motion adds it automatically. Don't double-add in CSS.
4. **Disable animations for `prefers-reduced-motion`**. Wrap all motion components:
   ```tsx
   const prefersReducedMotion =
     typeof window !== "undefined" &&
     window.matchMedia("(prefers-reduced-motion: reduce)").matches;
   ```
   If true, render the static component instead of the `motion.` wrapper.
5. **Don't animate expensive properties**: `width`, `height`, `top`, `left` on large lists. Use `transform: translateX/Y` and `scale` only.
6. **Lazy-load Framer Motion**: If bundle is a concern, dynamic-import it on pages that need it (dashboard, pipeline). Search page and settings can stay static initially.

---

## 7. Migration Plan

### Phase A: Foundation (Day 1)

1. **Install framer-motion** in `apps/web`
2. **Rewrite `globals.css`** with new token block (§2.1). Keep legacy `--bg`, `--surface` etc as computed values so nothing breaks immediately.
3. **Extend `tailwind.config.js`** with new colors (§2.1).
4. **Create `src/lib/variants.ts`** with `buttonVariants`, `inputVariants`, `cardVariants` (§2.3).
5. **Create `src/lib/animation.ts`** with all motion tokens (§3.2).
6. **Commit.**

### Phase B: Global Components (Day 1–2)

7. **Refactor `src/components/ui/card.tsx`** to use new tokens + optional `animate` prop.
8. **Refactor `src/components/ui/badge.tsx`** to use `cva` + semantic tokens.
9. **Create `src/components/ui/button.tsx`** with Framer Motion (§5.1).
10. **Update `sidebar.tsx`**:
    - Kill `active:scale-95`
    - Add label fade on collapse (§4.2)
    - Standardize radius: `rounded-lg` on nav items
11. **Update `topbar.tsx`**:
    - Kill `active:scale-95`
    - Add bell shake + dropdown motion (§4.3)
    - Standardize radius: `rounded-md` on buttons, `rounded-full` only on avatar
12. **Commit.**

### Phase C: Dashboard (Day 2)

13. **Update `dashboard/index.tsx`**:
    - KPI stagger + count-up (§4.1)
    - Chart fade-in delay
    - Recent leads slide-in
14. **Commit.**

### Phase D: Search Page (Day 2–3)

15. **Update `search/google-maps.tsx` + `SearchResultsTable.tsx`**:
    - Form/results layout transition (§4.4)
    - Row stagger on load
    - Row hover slide
    - Save button success pop
16. **Standardize radius in all search sub-components**.
17. **Commit.**

### Phase E: Leads + Detail (Day 3)

18. **Update `leads/index.tsx`**:
    - Card grid stagger + layout animation (§4.5)
19. **Update `leads/[id].tsx`**:
    - Tab underline slide (§4.6)
    - Section accordion expand
    - Kill 21 `rounded-full` instances
20. **Commit.**

### Phase F: Pipeline + Misc (Day 3–4)

21. **Update `pipeline.tsx`**:
    - Card layout animation (§4.7)
    - Column layout (if drag-and-drop exists)
22. **Audit remaining pages** (`/sequences`, `/replies`, `/billing`, `/settings`) for:
    - `active:scale-95` removal
    - Radius standardization
    - Color token migration (`bg-blue/10` → `bg-primary/10`, etc.)
23. **Final shadow audit**: remove all `shadow-xl`, `shadow-lg` outside modals.
24. **Typography audit**: kill `text-xs` in tables and dropdowns.
25. **Commit.**

---

## 7.5 Phase Acceptance Criteria (Bug Prevention)

Each phase gates the next. Do NOT proceed to the next phase until all criteria for the current phase pass.

### Phase A: Foundation — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| A.1 | `npm run build` in `apps/web` completes with **zero errors** and **zero new warnings** | Terminal output |
| A.2 | All existing pages still render correctly — no visual regressions in sidebar, topbar, dashboard, leads, search | Manual click-through of every route |
| A.3 | Dark mode toggle still works and no element becomes illegible | Toggle theme on every page |
| A.4 | Legacy token aliases (`--bg`, `--surface`, `--text`, etc.) still resolve correctly — no `undefined var` in computed styles | DevTools → Elements → computed styles check |
| A.5 | Tailwind config compiles — no "Unknown color" warnings | Build log |
| A.6 | `framer-motion` is importable in a test component without crashing the dev server | Add a test `<motion.div>` to a page, verify it renders |
| A.7 | No `class-variance-authority` version conflicts — `cva` works in a test component | Import `cva` in `variants.ts`, verify no peer-dep warnings |
| A.8 | CSS variables render in HSL format correctly — `hsl(var(--primary))` produces a visible color | DevTools → Elements → check a primary-colored element |

### Phase B: Global Components — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| B.1 | Sidebar collapse/expand animates labels without text squashing or layout shift | Click collapse button 5× rapidly |
| B.2 | Active nav item highlight is visible in both light and dark mode | Click every nav item |
| B.3 | No `active:scale-95` remains in `sidebar.tsx` or `topbar.tsx` | `grep -n "scale-95"` both files |
| B.4 | Topbar bell shake triggers only on `unreadCount` **increase from 0**, not on every poll | Mock notification, verify shake happens once, not every 30s |
| B.5 | Notification dropdown opens/closes with slide+fade, not instant pop | Click bell 3× |
| B.6 | Avatar dropdown mirrors notification dropdown animation | Click avatar 3× |
| B.7 | Theme toggle (moon/sun) still works, no FOUC | Toggle 3× |
| B.8 | Sign out still works and redirects correctly | Click sign out |

### Phase C: Dashboard — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| C.1 | KPI numbers animate from 0 to target on mount, not jump instantly | Hard-refresh dashboard |
| C.2 | Stagger is 50ms between cards — total entrance <300ms | DevTools → Performance → record |
| C.3 | KPI cards lift on hover (1px), return on mouse leave | Hover each card |
| C.4 | Chart section fades in **after** KPIs, not simultaneously | Hard-refresh, watch timing |
| C.5 | Recent leads list slides in from left, not fade only | Hard-refresh |
| C.6 | Count-up hook handles `end=0` without crash (edge case) | Simulate empty KPI |
| C.7 | No `useCountUp` re-renders cause unnecessary re-renders of parent | React DevTools Profiler |

### Phase D: Search Page — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| D.1 | Expanded → collapsed transition is smooth, no jump or flash | Run search |
| D.2 | Clicking "Refine" expands form smoothly, results table stays visible | Click Refine |
| D.3 | Results table rows stagger in — max total stagger 500ms even for 100 rows | Run search with 100 results |
| D.4 | Row hover slide-right (4px) does not break text truncation or layout | Hover a row with long business name |
| D.5 | Save button success pop: text changes to "Saved ✓", green flash, then settles | Click Save on a result |
| D.6 | Save button can be clicked again (edge case: double-save) without crash | Double-click Save |
| D.7 | No table layout thrash when results update (filtering, sorting) | Filter by website toggle |
| D.8 | Search page skeleton flash is NOT reintroduced | Hard-refresh, watch for skeleton blink |

### Phase E: Leads + Detail — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| E.1 | Leads card grid stagger entrance works with any number of cards (0, 1, 12, 50) | Filter to show different counts |
| E.2 | Cards reorder smoothly when filter changes (layout animation) | Change status filter |
| E.3 | Card hover lift does not cause z-index fighting or shadow clipping | Hover card near viewport edge |
| E.4 | Lead detail tab underline slides to active tab, not snaps | Click each tab |
| E.5 | Tab underline position is correct after window resize | Resize browser, check alignment |
| E.6 | Section accordion expand/collapse is smooth, content does not flash | Click each collapsible section |
| E.7 | All 21 `rounded-full` instances in `leads/[id].tsx` replaced per radius rules | `grep -c "rounded-full"` → should be ≤3 (avatars/badges only) |
| E.8 | Lead detail page loads without FOUC or layout shift | Hard-refresh a lead detail URL |

### Phase F: Pipeline + Misc — Acceptance Criteria

| # | Criterion | Verification |
|---|---|---|
| F.1 | Pipeline card entrance stagger works | Load pipeline |
| F.2 | No `active:scale-95` in any file under `apps/web/src/pages` or `components` | `grep -r "scale-95"` |
| F.3 | No `shadow-xl` in any file outside modal/drawer components | `grep -r "shadow-xl"` |
| F.4 | No `focus:ring-blue` anywhere | `grep -r "focus:ring-blue"` |
| F.5 | `text-xs` removed from all table bodies and dropdown items | `grep -r "text-xs"` → only badges and metadata allowed |
| F.6 | All pages pass `prefers-reduced-motion` test: animations instant | Enable reduce motion, reload each page |
| F.7 | `npm run build` produces no new warnings | Build log |
| F.8 | Lighthouse "Accessibility" score ≥ 90 (motion should not penalize) | Run Lighthouse |
| F.9 | Bundle size increase from `framer-motion` < 50KB gzipped | `npm run build` → check `.next/static` |

---

## 8. Regression Checklist

Before marking complete, verify:

| Check | How |
|---|---|
| No console errors | DevTools → Console |
| Dark mode tokens flip correctly | Toggle theme, check cards/borders/text contrast |
| `prefers-reduced-motion` respected | macOS: System Settings → Accessibility → Display → Reduce motion ON. Animations should be instant. |
| Mobile sidebar still works | Collapse/expand on narrow viewport |
| Search → results transition smooth | Run a search, watch form collapse |
| KPI count-up works | Load dashboard, numbers animate from 0 |
| No layout thrash on rapid tab switches | Click between leads rapidly |
| Bundle size acceptable | `npm run build` in `apps/web`, check `.next/static` output size |
| All `rounded-full` on buttons gone | Search `rounded-full` in `apps/web/src/pages`, `apps/web/src/components` |
| All `active:scale-95` gone | Search `scale-95` in same dirs |
| All `shadow-xl` gone | Search `shadow-xl` |
| All `focus:ring-blue` gone | Search `focus:ring-blue` |

---

## 9. Dependencies

```json
{
  "dependencies": {
    "framer-motion": "^11.x",
    "class-variance-authority": "^0.7.x"
  }
}
```

`class-variance-authority` is likely already installed (shadcn dependency). Verify:

```bash
cd apps/web && npm ls class-variance-authority || npm install class-variance-authority
```

Install Framer Motion:

```bash
cd apps/web && npm install framer-motion
```

No other dependencies needed. All animation logic is custom hooks + Framer Motion primitives.

---

## 10. Files Changed Summary

| File | Action | Lines |
|---|---|---|
| `apps/web/src/globals.css` | Rewrite tokens | ~120 |
| `apps/web/tailwind.config.js` | Add colors | ~+20 |
| `apps/web/src/lib/variants.ts` | New | ~60 |
| `apps/web/src/lib/animation.ts` | New | ~40 |
| `apps/web/src/lib/useCountUp.ts` | New | ~15 |
| `apps/web/src/components/ui/button.tsx` | New | ~30 |
| `apps/web/src/components/ui/card.tsx` | Refactor | ~±20 |
| `apps/web/src/components/ui/badge.tsx` | Refactor | ~±30 |
| `apps/web/src/components/layout/sidebar.tsx` | Refactor + motion | ~±25 |
| `apps/web/src/components/layout/topbar.tsx` | Refactor + motion | ~±35 |
| `apps/web/src/pages/dashboard/index.tsx` | Add motion | ~±40 |
| `apps/web/src/pages/search/google-maps.tsx` | Add motion | ~±30 |
| `apps/web/src/components/search/SearchResultsTable.tsx` | Add motion | ~±25 |
| `apps/web/src/pages/leads/index.tsx` | Add motion | ~±25 |
| `apps/web/src/pages/leads/[id].tsx` | Add motion + radius fixes | ~±50 |
| `apps/web/src/pages/pipeline.tsx` | Add motion | ~±20 |
| Various other pages | Token migration (radius, colors, shadows) | ~±100 across 10 files |

**Total estimate**: ~700 lines changed across ~20 files. No functional logic changes. Purely visual + motion.

---

## 11. Open Questions

1. ~~Drag-and-drop pipeline~~: **NOT built** — skip §4.7 column reordering. Pipeline motion limited to card entrance stagger.
2. **_app.tsx page transitions**: **Recommendation: NO.** Adds 200ms to every navigation. Per-page entrance animations (§4.1–4.6) are sufficient. If you want them later, the code is in §4.9 — just uncomment.
3. **Animation intensity**: "Dramatic but subtle" — interpreted as: motion is **semantically purposeful** (cards slide in because they arrived, buttons compress because you tapped them) rather than decorative (no bouncing logos, no spinning loaders). The spec already follows this philosophy. If you want more flair on any specific interaction, call it out during implementation.

---

## 12. Beyond Motion — Additional Polish Opportunities

These are NOT in scope for the 4-day motion sprint, but should be tackled next. Ranked by impact/effort:

### A. Empty States (High impact, Low effort)
Every list, table, and dashboard widget needs an empty-state illustration + CTA. Current behavior: blank white space.
- Dashboard KPIs with zero data → "No leads yet. Run a search →" with illustration
- Leads list empty → "Start by searching for leads in your area"
- Pipeline empty → "Your pipeline is empty. Save leads from search to populate it."
- Sequences empty → "Create your first email sequence"
- Search results empty → "No businesses found. Try broadening your search."

Style: Simple line-art illustration (Lucide icon composition, not custom SVG), centered, `text-muted-foreground`, primary CTA button.

### B. Toast Notification System (High impact, Medium effort)
Current feedback is silent. User saves a lead → nothing happens. User moves lead to pipeline → no confirmation.
- Install `sonner` (already shadcn-compatible) or build lightweight toast with Framer Motion.
- Trigger toasts on: save lead, move to pipeline, delete, sequence sent, error (red), success (green).
- Position: bottom-right desktop, top-center mobile.

### C. Loading States (High impact, Low effort)
Current skeletons are generic gray boxes. They should match the shape of the content.
- Dashboard: 4 KPI skeleton cards (same aspect ratio as real cards), chart skeleton (rounded rectangle).
- Leads table: 8 rows of skeleton with avatar circle + text lines.
- Search: Skeleton table rows with pill-shaped badges.
- Lead detail: Skeleton profile card with circular avatar placeholder.

Use `animate-pulse` sparingly — prefer a subtle `shimmer` gradient sweep (`bg-gradient-to-r from-muted via-muted-foreground/10 to-muted`) for premium feel.

### D. Command Palette / ⌘K (High impact, Medium effort)
Global keyboard-driven navigation. `cmd+k` opens a modal with:
- Page navigation ("Go to Leads", "Go to Search")
- Actions ("Create sequence", "Run search")
- Lead search (type lead name → jump to detail)

Use `cmdk` React library (already used by shadcn's Command component). Wrap in Framer Motion for entrance.

### E. Mobile Responsiveness Audit (High impact, High effort)
Current UI assumes desktop. The sidebar is `hidden md:flex` — mobile has no nav. The leads table is unreadable on <768px.
- Add bottom tab bar for mobile (`sm:hidden`)
- Convert leads table to card list on mobile (same data, vertical stack)
- Search form: stack vertically on narrow screens
- Lead detail: stack columns vertically
- Modal/drawer full-screen on mobile

### F. Bulk Actions (Medium impact, Medium effort)
Leads page: select multiple leads → bulk delete, bulk change status, bulk add to sequence.
- Checkbox column in table
- Floating action bar (bottom of viewport) when ≥1 selected
- "Select all" on current page

### G. Table Density Toggle (Low impact, Low effort)
Compact / Comfortable / Spacious toggle on all tables. Changes padding from `py-2` → `py-3` → `py-4`. Persists in localStorage.

### H. Inline Edit (Medium impact, High effort)
Lead detail fields (name, title, company, notes) editable inline instead of "Edit" mode. Click text → becomes input → blur saves. Reduce friction for quick corrections.

### I. Real-Time Indicators (Low impact, Low effort)
When background jobs are running (enrichment, email sending), show a subtle spinning indicator in the topbar. Clicking it opens a status panel with job queue.

### J. Onboarding Checklist (High impact, Medium effort)
New users see a dismissible checklist card on dashboard:
1. ✅ Connect email (Supabase auth already done)
2. ⬜ Set target geography
3. ⬜ Run first search
4. ⬜ Save first lead
5. ⬜ Create first sequence
6. ⬜ Send first email

Progress bar + confetti on completion (Framer Motion `useAnimation`).

### K. Keyboard Shortcuts Documentation (Low impact, Low effort)
`?` key opens a modal listing all shortcuts. Examples:
- `g d` → Go to Dashboard
- `g s` → Go to Search
- `g l` → Go to Leads
- `n` → New search (if on search page)
- `e` → Edit (if on lead detail)
- `?` → This help modal

Implement with a lightweight `useKeyboardShortcut` hook.

### L. Data Export (Medium impact, Low effort)
"Export to CSV" on leads table, search results, pipeline. Frontend generation via `papaparse` or simple string joining. No backend needed for MVP.

### M. Search Filter Persistence (Low impact, Low effort)
Last search filters saved to `localStorage` or URL query params. Returning to `/search/google-maps` restores previous query. Prevents re-typing "Plumber in Manchester" every time.

---

**Recommended next sprint order**: A → B → C → E → J. That's empty states, toasts, loading skeletons, mobile audit, onboarding. All are visible, user-facing polish that compounds the motion work.
