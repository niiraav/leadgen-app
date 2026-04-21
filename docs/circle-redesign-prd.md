# LeadGen App — Circle-Inspired UI Redesign
## Product Requirements Document (PRD)

---

## 1. Overview

Migrate the LeadGen web app's visual design from its current custom styling to a Linear-inspired dense, monochromatic SaaS aesthetic based on the [Circle](https://github.com/ln-dev7/circle) open-source reference.

**Goals:**
- Dense, professional, monochromatic UI (color ONLY for status indicators)
- Card-in-card layout pattern (outer bg → inner container with border + rounded)
- Subtle borders, minimal shadows, compact but breathable density
- Full dark/light theme toggle
- Reusable shadcn/ui component layer

**Non-Goals (Phase 0-2):**
- Upgrade to Next.js 15 or App Router (stay on Pages Router)
- Upgrade to Tailwind v4 (stay on v3)
- No backend changes

---

## 2. Structural Mismatch Analysis

| Aspect | Circle | LeadGen (Current) | Strategy |
|---|---|---|---|
| Framework | Next.js 15 App Router | Next.js 14 Pages Router | **Keep Pages Router.** Port patterns to `_app.tsx`. |
| Tailwind | v4, `@theme` in CSS | v3, `tailwind.config.js` | **Keep v3.** Convert oklch tokens to HSL in config. |
| React | 19 | 18 | **Keep React 18.** Adapt component patterns. |
| UI Library | shadcn/ui (30+ primitives) | Custom CSS + few Radix | **Install shadcn/ui on v3.** Fully supported. |
| State | Zustand v5 (8 stores) | React state + React Query | **Keep React Query for data.** Add Zustand for UI state only. |
| Fonts | Geist Sans/Mono (next/font) | Inter (Google Fonts) | **Switch to Geist.** Package already exists via next/font. |
| Theme | next-themes (class strategy) | Custom `.dark` class on :root | **Adopt next-themes.** Clean, battle-tested. |
| Charts | recharts (unused) | recharts + SVG charts | **Keep current chart approach.** Migrate to recharts later. |

---

## 3. Phase Breakdown

### PHASE 0 — Trial Page: Dashboard v2
**Goal:** Prove the new design system works on real data without breaking anything.

**Approach:** Clone the current Dashboard page to `/dashboard/v2`, apply the new shadcn/zinc design system, run side-by-side.

**What this proves:**
- shadcn/ui installs and works with Tailwind v3 + Pages Router
- Color token conversion from Circle's oklch → Tailwind v3 HSL
- Card-in-card layout works in LeadGen's layout shell
- Dark mode toggle works
- Real data (API calls) renders correctly with new components

**Deliverables:**
- Install shadcn/ui (zinc base, New York style)
- Install next-themes, Geist font
- Convert Circle's oklch tokens to Tailwind v3 HSL config
- Build `/dashboard/v2` page using cloned dashboard logic + new components
- Side-by-side comparison at `/dashboard` (old) vs `/dashboard/v2` (new)

**Effort:** 1-2 days
**Dependencies:** None

#### Phase 0 — Step-by-Step

**Step 0.1 — Initialize shadcn/ui**
```bash
cd apps/web
npx shadcn@latest init --yes --template next --base-color zinc
```
This creates:
- `components.json` (shadcn config)
- `src/lib/utils.ts` (cn helper)
- Updates `globals.css` with shadcn's CSS variables
- Updates `tailwind.config.js` with shadcn theme tokens

**Step 0.2 — Install Circle-equivalent shadcn components**
```bash
npx shadcn add card badge button skeleton command dialog dropdown-menu separator tabs avatar tooltip
```
Add lazily as needed:
```bash
npx shadcn add checkbox select switch popover context-menu calendar
```

**Step 0.3 — Install additional dependencies**
```bash
npm install next-themes @next/font
```
Geist font is already in Next.js 14 via `next/font/google` (geist package). If not, install:
```bash
npm install geist
```

**Step 0.4 — Convert Circle's oklch tokens to Tailwind v3 HSL**

Circle uses oklch values. Convert to approximate HSL equivalents for v3 config:

| Circle Token | Circle (oklch) | HSL Approx | Usage |
|---|---|---|---|
| `--background` light | `oklch(1 0 0)` | `0 0% 100%` | Page background |
| `--foreground` light | `oklch(0.141 0.005 285.823)` | `240 10% 3.9%` | Primary text |
| `--card` light | `oklch(1 0 0)` | `0 0% 100%` | Card surface |
| `--card-foreground` light | `oklch(0.141 0.005 285.823)` | `240 10% 3.9%` | Card text |
| `--popover` light | `oklch(1 0 0)` | `0 0% 100%` | Popover/dropdown |
| `--popover-foreground` light | `oklch(0.141 0.005 285.823)` | `240 10% 3.9%` | Popover text |
| `--primary` light | `oklch(0.21 0.006 285.885)` | `240 5.9% 10%` | Primary actions |
| `--primary-foreground` light | `oklch(0.985 0 0)` | `0 0% 98%` | On-primary text |
| `--secondary` light | `oklch(0.967 0.001 286.375)` | `240 4.8% 95.9%` | Secondary bg |
| `--secondary-foreground` light | `oklch(0.21 0.006 285.885)` | `240 5.9% 10%` | On-secondary text |
| `--muted` light | `oklch(0.967 0.001 286.375)` | `240 4.8% 95.9%` | Muted bg |
| `--muted-foreground` light | `oklch(0.552 0.016 285.938)` | `240 3.8% 46.1%` | Muted text |
| `--accent` light | `oklch(0.967 0.001 286.375)` | `240 4.8% 95.9%` | Accent bg |
| `--accent-foreground` light | `oklch(0.21 0.006 285.885)` | `240 5.9% 10%` | On-accent text |
| `--destructive` light | `oklch(0.577 0.245 27.325)` | `0 84.2% 60.2%` | Error/danger |
| `--destructive-foreground` light | `oklch(0.985 0 0)` | `0 0% 98%` | On-destructive |
| `--border` light | `oklch(0.92 0.004 286.32)` | `240 5.9% 90%` | Borders |
| `--input` light | `oklch(0.92 0.004 286.32)` | `240 5.9% 90%` | Input borders |
| `--ring` light | `oklch(0.871 0.006 286.286)` | `240 5.9% 65%` | Focus rings |
| `--container` light | `#fff` | `0 0% 100%` | Inner card bg |

**Dark mode equivalents** (all inverted to dark zinc tones):
| `--background` dark | `oklch(0.141 0.005 285.823)` | `240 10% 3.9%` |
| `--foreground` dark | `oklch(0.985 0 0)` | `0 0% 98%` |
| `--card` dark | `oklch(0.141 0.005 285.823)` | `240 10% 3.9%` |
| `--card-foreground` dark | `oklch(0.985 0 0)` | `0 0% 98%` |
| `--primary` dark | `oklch(0.985 0 0)` | `0 0% 98%` |
| `--primary-foreground` dark | `oklch(0.21 0.006 285.885)` | `240 5.9% 10%` |
| `--secondary` dark | `oklch(0.274 0.006 286.033)` | `240 3.7% 15.9%` |
| `--secondary-foreground` dark | `oklch(0.985 0 0)` | `0 0% 98%` |
| `--muted` dark | `oklch(0.274 0.006 286.033)` | `240 3.7% 15.9%` |
| `--muted-foreground` dark | `oklch(0.705 0.015 286.067)` | `240 5% 64.9%` |
| `--accent` dark | `oklch(0.274 0.006 286.033)` | `240 3.7% 15.9%` |
| `--accent-foreground` dark | `oklch(0.985 0 0)` | `0 0% 98%` |
| `--border` dark | `oklch(0.274 0.006 286.033)` | `240 3.7% 15.9%` |
| `--input` dark | `oklch(0.274 0.006 286.033)` | `240 3.7% 15.9%` |
| `--ring` dark | `oklch(0.442 0.017 285.786)` | `240 4.9% 83.9%` |
| `--container` dark | `#101011` | `240 6% 6.7%` |

**Step 0.5 — Update tailwind.config.js**

Replace the current custom colors with shadcn's standard token map. Keep `darkMode: 'class'`.

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        container: "hsl(var(--container))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
```

**Step 0.6 — Update globals.css**

Replace the current CSS variables block with shadcn's standard token system plus LeadGen's custom extensions (status colors).

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap');

@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 65%;
    --container: 0 0% 100%;
    --radius: 0.625rem;

    /* LeadGen status colors (kept for functional use) */
    --status-new: 211 70% 39%;
    --status-contacted: 38 100% 30%;
    --status-replied: 142 63% 29%;
    --status-interested: 150 60% 35%;
    --status-not-interested: 0 57% 46%;
    --status-qualified: 211 70% 39%;
    --status-proposal: 270 50% 45%;
    --status-converted: 142 63% 29%;
    --status-archived: 240 3.8% 46.1%;
    --status-ooo: 240 3.8% 46.1%;

    --font-geist-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-geist-mono: 'Geist Mono', ui-monospace, monospace;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --popover: 240 10% 3.9%;
    --popover-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
    --container: 240 6% 6.7%;
  }
}

@layer base {
  * { @apply border-border; }
  html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
  body { @apply bg-background text-foreground; font-family: var(--font-geist-sans); }
}
```

**Step 0.7 — Add next-themes provider in `_app.tsx`**

Wrap the app with `ThemeProvider` from next-themes:

```tsx
import { ThemeProvider } from "next-themes";

// Inside App component:
<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  {/* existing content */}
</ThemeProvider>
```

**Step 0.8 — Build `/dashboard/v2.tsx`**

Clone `/dashboard/index.tsx` → `/dashboard/v2.tsx`.

Replace all UI with shadcn equivalents:

| Current Component | New shadcn Equivalent |
|---|---|
| `KPICard` (custom) | `Card` + `CardContent` from shadcn |
| `Card` (custom) | `Card` from shadcn |
| `Badge` (custom) | `Badge` from shadcn |
| `SkeletonCard` | `Skeleton` from shadcn |
| Custom `.btn` classes | `Button` from shadcn (variants: default, secondary, ghost, outline) |
| Custom `.input` class | `Input` from shadcn |
| Custom `.card` class | `Card` from shadcn |

**Card-in-card layout for `/dashboard/v2`:**
```tsx
<div className="min-h-svh lg:p-2">
  <div className="lg:border lg:rounded-lg overflow-hidden flex flex-col bg-container h-full">
    {/* Page content */}
  </div>
</div>
```

**Step 0.9 — Side-by-side test**
- Navigate to `/dashboard` (old styling)
- Navigate to `/dashboard/v2` (new styling)
- Compare:
  - Colors are correct in light mode
  - Dark mode toggle works
  - All API data renders
  - Charts display
  - No console errors
  - Mobile responsive

**Step 0.10 — Decision gate**
If Phase 0 looks good → proceed to Phase 1.
If not → iterate on tokens / components before wider migration.

---

### PHASE 1 — Foundation: Design Tokens + Layout Shell
**Goal:** Replace the app's global styling and layout with the new design system.

**Effort:** 3-4 days
**Dependencies:** Phase 0 approved

**1.1 — Geist Font Setup**
```tsx
// _app.tsx or _document.tsx
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
```
Apply to `<html>` or `<main>` element.

**1.2 — New App Shell (Circle's layout adapted for Pages Router)**

Circle uses `SidebarProvider` (shadcn's built-in sidebar primitive) + `MainLayout` with header slots.

Build LeadGen equivalent:
- **Sidebar** (`components/layout/app-sidebar.tsx`): Collapsible, ~240px wide, org nav, bottom user section
- **MainLayout** (`components/layout/main-layout.tsx`): Wraps pages with card-in-card container
- **ThemeToggle** (`components/layout/theme-toggle.tsx`): Moon/sun switch

Replace current `Sidebar` + `TopBar` + `BottomNav` gradually. Or build new shell and swap via feature flag.

**1.3 — Page Header Pattern**
Circle's header slots per page:
```tsx
<MainLayout header={<IssuesHeader />} headersNumber={2}>
  <IssuesContent />
</MainLayout>
```

LeadGen equivalent for each page:
```tsx
<MainLayout header={<LeadsHeader />}>
  <LeadsContent />
</MainLayout>
```

**1.4 — Install remaining shadcn components as needed**
```bash
npx shadcn add sidebar sheet scroll-area collapsible
```

---

### PHASE 2 — Leads Page (Biggest Page)
**Goal:** Migrate the leads table, filters, kanban, and actions.

**Effort:** 5-8 days
**Dependencies:** Phase 1

**2.1 — Lead Row (Issue-Line Equivalent)**
Build `components/leads/lead-row.tsx`:
- Compact row (~40px tall)
- Columns: ID, title (business name), status badge, assignee avatar, priority, labels, last activity
- Inline status dropdown (adapt Circle's status selector)
- Right-click context menu (adapt Circle's context menu)
- Custom SVG circular progress rings for pipeline status

**2.2 — Filter System**
Port Circle's `filter-store.ts` pattern:
```ts
// store/lead-filters.ts
interface LeadFilters {
  status: string[];
  owner: string[];
  source: string[];
  score: string[];
  // Actions...
}
```

UI: Filter bar above table, active filter pills, clear-all button.

**2.3 — List / Kanban View Toggle**
Port Circle's `view-store.ts`:
```ts
// store/view-store.ts
export type ViewType = 'list' | 'kanban';
// Persist to localStorage
```

**2.4 — Create Lead Modal**
Adapt Circle's `create-issue-modal` → `create-lead-modal`.

**2.5 — Command Palette (cmdk)**
```bash
npm install cmdk
```
Global search: leads, sequences, campaigns, settings, actions.

**2.6 — Drag-to-reorder Pipeline**
```bash
npm install react-dnd react-dnd-html5-backend
```

---

### PHASE 3 — Other Pages
**Goal:** Migrate Settings, Members, Campaigns, Sequences list.

**Effort:** 3-5 days
**Dependencies:** Phase 2

| Circle Component | LeadGen Page |
|---|---|
| Settings (integration cards) | `/settings` |
| Members (member-line table) | `/members` or team management |
| Projects table | `/campaigns` |
| Teams table | `/sequences` list |
| Inbox | `/replies` |

Mostly copy-paste from Circle equivalents with LeadGen data.

---

### PHASE 4 — LeadGen-Specific Features (Build from Scratch)
**Goal:** Build features Circle doesn't have.

**Effort:** 10-15 days
**Dependencies:** Phase 3

| Feature | Description | Effort |
|---|---|---|
| Billing/Stripe page | Subscription management, upgrade prompts | 2-3 days |
| Sequence builder | Visual email sequence builder | 3-5 days |
| Email template editor | Rich text / markdown editor for emails | 2-3 days |
| Analytics dashboard | Recharts-based charts (already have recharts dep) | 2-3 days |
| Import/export flows | CSV import, lead enrichment status | 1-2 days |
| Lead detail/enrichment | Contact detail sidebar, enrichment data display | 2-3 days |

---

## 4. Component Mapping Reference

| Circle | LeadGen Equivalent | Adaptation Notes |
|---|---|---|
| `issue-line` | `lead-row` | Add engagementStatus, pipelineStage, doNotContact |
| `group-issues` (kanban) | `pipeline-board` | Status groups → pipeline stages |
| `filter-store` | `lead-filters` | Map status/assignee/priority/labels → status/owner/source/score |
| `view-store` | `view-store` | Direct copy, list ↔ kanban |
| `status-selector` | `status-dropdown` | Map Linear statuses → LeadGen statuses |
| `priority-selector` | `priority-dropdown` | Reuse pattern |
| `assignee-user` | `owner-assignment` | Avatar + dropdown |
| `command-palette` | `global-search` | cmdk with LeadGen data sources |
| `create-issue-modal` | `create-lead-modal` | Adapt form fields |
| `context-menu` | `lead-context-menu` | Actions: compose, add to sequence, archive, etc. |
| `org-switcher` | `workspace-switcher` | Single org for now, stub |
| `settings-integrations` | `settings-page` | Cards for API keys, integrations |

---

## 5. Data Layer Rules (Critical)

**DO NOT port Circle's data stores.** Circle uses mock data. LeadGen has a real API.

| Layer | Circle Approach | LeadGen Approach |
|---|---|---|
| Data fetching | Zustand store with mock data | Keep React Query (`useQuery`, `useInfiniteQuery`) |
| Server state | Local Zustand | React Query cache |
| UI state | Zustand stores | Port relevant stores (filters, view, modals, search) |
| Mutations | Direct store update | Keep `api.leads.update()` calls |

**Port only these Zustand stores:**
- `filter-store.ts` → `lead-filters.ts`
- `view-store.ts` → `view-store.ts`
- `search-store.ts` → `command-palette-store.ts`
- `create-issue-store.ts` → `create-lead-store.ts`

---

## 6. Tailwind v3 Conversion Cheat Sheet

Circle v4 syntax → LeadGen v3 syntax:

| Circle v4 | LeadGen v3 |
|---|---|
| `@import 'tailwindcss'` | `@tailwind base; @tailwind components; @tailwind utilities;` |
| `@plugin "tailwindcss-animate"` | `plugins: [require("tailwindcss-animate")]` |
| `@custom-variant dark (&:is(.dark *))` | `darkMode: 'class'` |
| `@theme { --font-sans: ... }` | `fontFamily: { sans: [...] }` in tailwind.config.js |
| `@theme inline { --color-background: ... }` | `colors: { background: "hsl(var(--background))" }` |
| `bg-container` | `bg-[hsl(var(--container))]` or add `container` to colors |
| `text-muted-foreground` | `text-muted-foreground` (same name) |
| `lg:border lg:rounded-md` | `lg:border lg:rounded-md` (same) |

---

## 7. Risk Register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| shadcn/ui conflicts with existing custom components | Medium | High | Keep old components in `components/legacy/` during migration. Gradual swap. |
| Dark mode breaks existing custom SVG charts | Medium | Medium | Test all charts in dark mode. Use `currentColor` + `className` for stroke/fill. |
| Tailwind v3 HSL tokens don't match Circle's oklch exactly | Low | Low | Visual QA against Circle screenshots. Tweak tokens. |
| React 18 vs React 19 component patterns | Low | Medium | Test all Radix/shadcn primitives. Most work on React 18. |
| Pages Router layout patterns differ from App Router | High | Medium | Explicitly port `SidebarProvider` context to `_app.tsx`. Test SSR. |
| Bundle size bloat from 30+ shadcn components | Medium | Low | Install lazily. Tree-shaking handles unused. |

---

## 8. Timeline Summary

| Phase | Scope | Effort | Cumulative |
|---|---|---|---|
| **0** | Trial page (`/dashboard/v2`) | 1-2 days | 1-2 days |
| **1** | Design tokens + layout shell | 3-4 days | 4-6 days |
| **2** | Leads page (table + kanban) | 5-8 days | 9-14 days |
| **3** | Other pages (settings, members, campaigns) | 3-5 days | 12-19 days |
| **4** | LeadGen-specific features | 10-15 days | **22-34 days** |

**Decision after Phase 0:** Proceed / iterate / abort.
**Decision after Phase 2:** Ship to users or continue in branch.

---

## 9. Phase 0 Implementation Checklist

- [ ] `npx shadcn@latest init` in `apps/web`
- [ ] Install shadcn components: card, badge, button, skeleton, dialog, dropdown-menu, separator, tabs, avatar, tooltip
- [ ] `npm install next-themes geist`
- [ ] `npm install tailwindcss-animate` (dev dep if missing)
- [ ] Update `tailwind.config.js` with shadcn token map
- [ ] Update `globals.css` with shadcn CSS variables
- [ ] Add `ThemeProvider` to `_app.tsx`
- [ ] Create `pages/dashboard/v2.tsx` (clone from `dashboard/index.tsx`)
- [ ] Replace all custom `<Card>` with shadcn `<Card>`
- [ ] Replace all custom `<Badge>` with shadcn `<Badge>`
- [ ] Replace all custom `.btn` with shadcn `<Button>`
- [ ] Replace custom `<input>` with shadcn `<Input>` where applicable
- [ ] Apply card-in-card wrapper to `/dashboard/v2`
- [ ] Add theme toggle button to `/dashboard/v2`
- [ ] Test light mode
- [ ] Test dark mode
- [ ] Test mobile responsive
- [ ] Verify all API calls work (data loads)
- [ ] No console errors
- [ ] Screenshot side-by-side (`/dashboard` vs `/dashboard/v2`)
