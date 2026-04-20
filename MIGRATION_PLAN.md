# shadcn/ui Migration Plan — LeadGen App

## Premise

Full UI/UX revamp. No carryover from the old color system, global CSS classes, or styling conventions. Clean slate with shadcn/ui (New York) + Tailwind CSS + custom design tokens.

---

## Current State Summary

| Aspect | Current | Target |
|--------|---------|--------|
| CSS Framework | Tailwind v3.4 | Tailwind v3.4 (same) |
| Component System | Hand-built (`.btn`, `.input`, `.card` globals) | shadcn/ui (Radix primitives) |
| Color System | CSS vars — hex/rgba (`--bg: #0a0a0a`) | CSS vars — HSL raw (`--background: 0 0% 4%`) |
| Dark Mode | `.dark` class + zustand toggle | `.dark` class (same mechanism) |
| Font | Inter via Google CDN `@import` | Inter via `next/font/google` |
| Icons | Lucide + MDI (mixed) | Lucide only |
| Overlays | Custom `bg-black/60` div modals | Radix Dialog/Sheet |
| Variants | Partial CVA (Badge only) | CVA everywhere (shadcn standard) |
| Merge Utility | `cn()` (clsx + tailwind-merge) | Same (already compatible) |

### Scope of Work

- **21 page files** in `src/pages/`
- **27+ component files** in `src/components/`
- **3 global CSS classes** to kill: `.btn` (4 variants), `.input`, `.card`
- **14 CSS custom properties** to replace with shadcn semantic tokens
- **~6 custom modal implementations** to replace with Radix Dialog/Sheet
- **2 icon systems** to consolidate to Lucide-only

---

## Phase 0: Foundation — Clean Slate Setup

**Goal:** Install shadcn/ui infrastructure with a fresh design system. No visual changes to the app yet — just the foundation underneath.

### Step 0.1: Backup critical files

```
cp apps/web/src/globals.css apps/web/src/globals.css.bak
cp apps/web/tailwind.config.js apps/web/tailwind.config.js.bak
cp apps/web/src/pages/_app.tsx apps/web/src/pages/_app.tsx.bak
```

### Step 0.2: Initialize shadcn/ui

```bash
cd apps/web
npx shadcn@latest init
```

- Style: **New York** (tighter radius, denser, professional SaaS feel)
- Base color: **Slate** (neutral, pairs well with any accent)
- CSS variables: **Yes**
- `tsx`: Yes
- Tailwind CSS config: auto-detect

This creates:
- `components.json` — shadcn config
- Installs `@radix-ui/*` primitives, `tailwindcss-animate`, `class-variance-authority`
- Overwrites `globals.css` with shadcn's HSL variable system
- Updates `tailwind.config.js` with shadcn's theme extensions

**CRITICAL:** After init, `globals.css` will be replaced. Our custom vars, `.btn`, `.input`, `.card` classes will be gone. That's intentional — clean slate.

### Step 0.3: Define custom design tokens

After shadcn init overwrites globals.css, add our custom tokens ON TOP of the shadcn base:

**globals.css** — add after shadcn's `:root` block:
```css
:root {
  /* shadcn base tokens are already set by init */

  /* Custom business tokens */
  --success: 142 71% 45%;
  --success-foreground: 144 100% 95%;
  --warning: 38 92% 50%;
  --warning-foreground: 38 100% 95%;
  --hot: 0 84% 60%;
  --hot-foreground: 0 100% 97%;
}

.dark {
  /* shadcn dark tokens already set */

  /* Custom business tokens — dark mode */
  --success: 142 51% 55%;
  --success-foreground: 144 24% 12%;
  --warning: 38 92% 50%;
  --warning-foreground: 38 20% 12%;
  --hot: 0 72% 65%;
  --hot-foreground: 0 24% 12%;
}
```

**tailwind.config.js** — add custom tokens to `extend.colors`:
```js
colors: {
  // shadcn semantic tokens auto-configured
  success: "hsl(var(--success))",
  "success-foreground": "hsl(var(--success-foreground))",
  warning: "hsl(var(--warning))",
  "warning-foreground": "hsl(var(--warning-foreground))",
  hot: "hsl(var(--hot))",
  "hot-foreground": "hsl(var(--hot-foreground))",
}
```

### Step 0.4: Install next-themes and wire dark mode

**Problem:** `src/stores/ui.ts` has `useUIStore` with theme toggle but ZERO consumers. Dark mode is unwired.

**Fix:** Install `next-themes` (shadcn standard) and remove the dead zustand store:

```bash
npm install next-themes
```

**_app.tsx** — add ThemeProvider:
```tsx
import { ThemeProvider } from "next-themes"

// Wrap the root with ThemeProvider:
<ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  {/* existing layout */}
</ThemeProvider>
```

**TopBar** — wire the toggle:
```tsx
import { useTheme } from "next-themes"
const { theme, setTheme } = useTheme()
// Toggle: setTheme(theme === 'dark' ? 'light' : 'dark')
```

**Delete** `src/stores/ui.ts` (dead code).

### Step 0.5: Switch Inter to next/font

**_app.tsx** — add at top:
```tsx
import { Inter } from 'next/font/google'
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
```

Wrap the root `<div>` with `inter.variable` class:
```tsx
<div className={`${inter.variable} min-h-screen flex ...`}>
```

**globals.css** — remove the Google CDN import:
```css
/* DELETE THIS LINE: */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300..700&display=swap');
```

### Step 0.5: Keep only necessary global styles

In globals.css, after shadcn's base layer, add back:

```css
@layer base {
  /* Keep these — they're good defaults */
  * { border-color: hsl(var(--border)); }
  html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
}

@layer utilities {
  .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }
}
```

**DO NOT** bring back `.btn`, `.input`, `.card` — those are dead.

### Step 0.6: Update next.config.js for Radix

```js
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@radix-ui/*'],
};
module.exports = nextConfig;
```

### Step 0.7: Create _document.tsx for dark mode + font

Pages Router needs `_document.tsx` to set `<html>` attributes properly:

```tsx
import { Html, Head, Main, NextScript } from 'next/document'

export default function Document() {
  return (
    <Html lang="en" className="light" suppressHydrationWarning>
      <Head />
      <body className="min-h-screen bg-background font-sans antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
```

### Step 0.8: Verify foundation

```bash
cd apps/web
npx tsc --noEmit          # no type errors
npm run dev                # app starts
```

App will look broken (no button/input/card styles). That's expected — we fix it in Phase 1.

---

## Phase 1: Component Installation & Replacement

**Goal:** Install all shadcn components, then replace every hand-built UI primitive across all pages and components.

### Step 1.1: Batch-install shadcn components

```bash
cd apps/web
npx shadcn@latest add button input label textarea select checkbox switch
npx shadcn@latest add dialog sheet dropdown-menu popover tooltip
npx shadcn@latest add table badge separator scroll-area avatar
npx shadcn@latest add tabs command card
npx shadcn@latest add sonner      # toast notifications (replaces undo-banner pattern)
npx shadcn@latest add form        # react-hook-form integration (optional)
```

This drops ~20 files into `components/ui/`. Some will conflict with our existing files (badge.tsx, card.tsx) — **let shadcn overwrite them**.

### Step 1.2: Migration order (by dependency)

Components are migrated bottom-up. Each step lists what changes and where.

---

#### 1.2.1: Button (replaces .btn, .btn-primary, .btn-secondary, .btn-ghost)

**Files that use old button classes:**
- `pages/auth/login.tsx` — `btn btn-primary`
- `pages/auth/signup.tsx` — `btn btn-primary`
- `pages/leads/index.tsx` — `btn btn-primary/secondary/ghost`
- `pages/leads/[id].tsx` — `btn btn-primary/secondary/ghost`
- `pages/leads/import/index.tsx` — `btn btn-primary/secondary/ghost`
- `pages/sequences/new.tsx` — `btn`, `btn btn-primary`
- `pages/sequences/[id]/enroll.tsx` — `btn btn-primary`
- `pages/billing/manage.tsx` — `btn btn-primary/secondary/ghost`
- `pages/billing/upgrade.tsx` — `btn btn-primary`
- `pages/settings/index.tsx` — `btn btn-primary`
- `components/leads/ListsSidebar.tsx` — `btn btn-primary/ghost`
- `components/leads/EnrichButton.tsx` — `btn btn-primary/ghost`
- `components/leads/VerifyEmailButton.tsx` — `btn btn-primary/ghost`
- `components/leads/MessagePicker.tsx` — cancel button
- `components/leads/SavedFilters.tsx` — filter buttons
- `components/ui/log-reply-modal.tsx` — `btn btn-primary/ghost`

**Mapping:**
| Old class | shadcn component |
|-----------|-----------------|
| `btn btn-primary` | `<Button variant="default">` |
| `btn btn-secondary` | `<Button variant="secondary">` |
| `btn btn-ghost` | `<Button variant="outline">` |
| Icon-only buttons | `<Button variant="ghost" size="icon">` |
| Small buttons | `<Button size="sm">` |

**Action:** Search-replace across all files. Import `Button` from `@/components/ui/button`.

---

#### 1.2.2: Input, Textarea, Label, Select (replaces .input)

**Files that use old input class:**
- `pages/auth/login.tsx` — `input` (email)
- `pages/auth/signup.tsx` — `input` x3
- `pages/leads/index.tsx` — `input` (search)
- `pages/leads/[id].tsx` — `input` x6 (contact fields)
- `pages/leads/import/index.tsx` — file input
- `pages/search/google-maps.tsx` — `input` x2
- `pages/sequences/new.tsx` — `input` x2, select
- `pages/sequences/[id]/enroll.tsx` — `input` (search)
- `pages/settings/index.tsx` — `input` x6+
- `components/leads/ListsSidebar.tsx` — `input` (create/rename)
- `components/leads/EnrichButton.tsx` — `input`
- `components/leads/VerifyEmailButton.tsx` — `input`
- `components/leads/SavedFilters.tsx` — filter name input
- `components/layout/topbar.tsx` — search input

**Mapping:**
| Old | New |
|-----|-----|
| `className="input"` | `<Input />` |
| Custom textarea | `<Textarea />` |
| Native `<select>` | `<Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>...</SelectContent></Select>` |
| Labels near inputs | `<Label />` |

**Note:** Old `.input` had `border-radius: 9999px` (pill shape). shadcn Input is rectangular. If pill shape is desired, override via `className="rounded-full"`. Decision needed — see Considerations.

---

#### 1.2.3: Badge (already partially done)

Our `components/ui/badge.tsx` already uses CVA with variants. shadcn's overwrite will be near-identical. Verify variants match:
- `default` → solid
- `secondary` → muted bg
- `outline` → bordered
- `destructive` → red
- Add custom: `success`, `warning`, `hot` variants in badge.tsx

**Files using badge-like spans:**
- `pages/leads/index.tsx` — status badges
- `pages/leads/[id].tsx` — status, deliverability badges
- `pages/dashboard/index.tsx` — intent badges
- `pages/replies.tsx` — intent badges
- `pages/pipeline/index.tsx` — stage headers
- `pages/sequences/index.tsx` — status badges
- `pages/billing/index.tsx` — plan badge

**Action:** Replace inline `<span className="bg-green/10 text-green ...">` patterns with `<Badge variant="success">` etc.

---

#### 1.2.4: Card (replace custom card div + .card class)

**Mapping:**
| Old | New |
|-----|-----|
| `<div className="card">` | `<Card>` |
| Card header div | `<CardHeader>` |
| Card title | `<CardTitle>` |
| Card description | `<CardDescription>` |
| Card body | `<CardContent>` |
| Card footer | `<CardFooter>` |

**Files using card-like divs:**
- `pages/dashboard/index.tsx` — stat cards, pipeline health, hot leads
- `pages/leads/[id].tsx` — profile card, contact card
- `pages/billing/index.tsx` — plan cards
- `pages/billing/manage.tsx` — plan card
- `components/ui/pipeline-health-card.tsx`
- `components/dashboard/HotLeadsWidget.tsx`

---

#### 1.2.5: Dialog (replaces custom overlay modals)

**Current custom modals** (all use `bg-black/60` overlay + centered div pattern):
- `components/ui/log-reply-modal.tsx`
- `components/ui/onboarding-modal.tsx`
- `components/leads/EnrichButton.tsx` — confirm modal
- `components/leads/VerifyEmailButton.tsx` — confirm modal
- `components/leads/MessagePicker.tsx` — message selection modal
- `pages/leads/index.tsx` — add-to-list modal

**Mapping:**
```tsx
// Old pattern:
<div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
  <div className="bg-surface rounded-xl p-6 max-w-md w-full">
    <h3>Title</h3>
    <p>Content</p>
    <button className="btn btn-primary">Action</button>
  </div>
</div>

// New pattern:
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
      <DialogDescription>Content</DialogDescription>
    </DialogHeader>
    <div>Body content</div>
    <DialogFooter>
      <Button>Action</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**Action:** Replace each custom modal with `<Dialog>`. Remove all `bg-black/60` overlay divs.

---

#### 1.2.6: Sheet (replaces slide-in drawer)

**Current drawer:**
- `components/replies/ReplyDrawer.tsx` — slide-in from right with `animate-slide-in-right`

**Mapping:**
```tsx
<Sheet open={open} onOpenChange={setOpen}>
  <SheetContent side="right">
    <SheetHeader>
      <SheetTitle>Reply Detail</SheetTitle>
    </SheetHeader>
    <div>Content</div>
  </SheetContent>
</Sheet>
```

**Also:** Mobile sidebar could become a Sheet instead of current approach.

---

#### 1.2.7: DropdownMenu (replaces custom dropdown menus)

**Current custom menus:**
- `components/layout/topbar.tsx` — user dropdown (custom)
- `components/leads/SavedFilters.tsx` — filter dropdown (custom)
- `pages/leads/[id].tsx` — action menus

**Mapping:**
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon"><MoreVertical /></Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Action 1</DropdownMenuItem>
    <DropdownMenuItem>Action 2</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

---

#### 1.2.8: Tooltip (replaces title attributes and custom tooltips)

**Current:** Some icons use `title=` attribute, some use `@radix-ui/react-tooltip` (already installed in prior work).

**Action:** Standardize to shadcn Tooltip everywhere. Replace all `title=` attributes with `<Tooltip><TooltipTrigger>...<TooltipContent>...</></>`.

---

#### 1.2.9: Table (replaces custom HTML tables)

**Current custom tables:**
- `pages/leads/index.tsx` — leads table (or SavedLeadsTable)
- `pages/search/google-maps.tsx` — SearchResultsTable
- `pages/leads/import/index.tsx` — preview table
- `pages/sequences/index.tsx` — sequences table
- `pages/sequences/[id]/enroll.tsx` — leads table

**Mapping:**
```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Column</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell>Data</TableCell>
    </TableRow>
  </TableBody>
</Table>
```

**Note:** SavedLeadsTable and SearchResultsTable already exist as composed components — they just need their inner HTML table elements swapped to shadcn Table primitives.

---

#### 1.2.10: Toast/Sonner (replaces undo-banner + use-reply-toast)

**Current implementations:**
- `components/ui/undo-banner.tsx` — custom undo toast + `UndoProvider` context + `useUndo()` hook
- `src/lib/use-reply-toast.ts` — socket events → toast display

**Mapping:**
```tsx
// Undo pattern:
import { toast } from "sonner"
toast("Lead removed", {
  description: "This action can be undone",
  action: { label: "Undo", onClick: () => undo() },
})

// Reply notification pattern:
import { toast } from "sonner"
toast("New reply from " + leadName, {
  description: replyPreview,
})
```

**Code-level changes needed:**
1. Replace `useUndo()` calls in consuming components with `toast()` from sonner
2. Replace `use-reply-toast.ts` internals with `toast()` from sonner
3. Add `<Toaster />` from sonner in `_app.tsx`
4. Delete `components/ui/undo-banner.tsx` entirely (UndoProvider + useUndo)
5. Rewrite or delete `src/lib/use-reply-toast.ts`

---

#### 1.2.11: ScrollArea (replaces custom scroll containers)

**Current:** Sidebar and lists use `overflow-y-auto scrollbar-none`.

**Mapping:**
```tsx
<ScrollArea className="h-[calc(100vh-4rem)]">
  {content}
</ScrollArea>
```

---

### Step 1.3: MDI → Lucide icon audit & migration

Before removing MDI, quantify usage:

```bash
cd apps/web
grep -rn "@mdi" src/ --include="*.tsx" --include="*.ts"
```

For each MDI icon found, map to Lucide equivalent:
- `mdiWholesale` → `Store`
- `mdiMapMarker` → `MapPin`
- `mdiPhone` → `Phone`
- `mdiEmail` → `Mail`
- `mdiWeb` → `Globe`
- etc.

After mapping, remove from package.json:
```bash
npm uninstall @mdi/js @mdi/react
```

### Step 1.4: Preserve UpgradeRequiredError pattern

`src/lib/api.ts` throws `UpgradeRequiredError`. This pattern must survive migration unchanged:

```tsx
// In consuming components, the pattern is:
try {
  await apiCall()
} catch (err) {
  if (err instanceof UpgradeRequiredError) {
    return <UpgradePrompt />  // This component gets shadcn-styled
  }
}
```

**Action:** Restyle `UpgradePrompt` with shadcn components (Alert, Button), but do NOT change the error-to-UI flow in api.ts.

### Step 1.5: Delete dead code

After all component replacements:

1. **globals.css** — remove `@layer components` section entirely (`.btn`, `.input`, `.card` are gone)
2. **Remove old CSS var names** — `--bg`, `--surface`, `--surface-2`, `--border-strong`, `--text-muted`, `--text-faint`, `--accent`, `--accent-text`, `--blue`, `--green`, `--amber`, `--red`
3. **Remove MDI icons** — `@mdi/js` and `@mdi/react` from package.json, replace any remaining MDI icons with Lucide equivalents
4. **Remove `animate-slide-in-right`** — replaced by Sheet's built-in animation
5. **Delete `components/ui/undo-banner.tsx`** — replaced by Sonner (includes UndoProvider + useUndo)
6. **Delete `components/ui/log-reply-modal.tsx`** — replaced by Dialog
7. **Delete `src/stores/ui.ts`** — dead zustand store, replaced by next-themes
8. **Rewrite `src/lib/use-reply-toast.ts`** — adapt to use Sonner's `toast()`

---

## Phase 2: Page-by-Page Rebuild

**Goal:** Walk every page, ensure all old patterns are gone, apply consistent spacing/typography.

### Priority order (by traffic + complexity):

| Priority | Page | Key Changes |
|----------|------|-------------|
| P0 | `auth/login.tsx` | Button, Input, Label, remove hardcoded Google SVG colors |
| P0 | `auth/signup.tsx` | Button, Input, Label |
| P1 | `dashboard/index.tsx` | Card, Badge, Table, recharts wrapper styling |
| P1 | `leads/index.tsx` | Table, Button, Badge, Input, Dialog, Select |
| P1 | `leads/[id].tsx` | Card, Input, Badge, Dialog, DropdownMenu, Textarea |
| P1 | `search/google-maps.tsx` | Input, Button, Table, Badge |
| P2 | `replies.tsx` | Table, Badge, Button, Sheet |
| P2 | `pipeline/index.tsx` | Card, Badge, DragDrop styling |
| P2 | `sequences/index.tsx` | Table, Badge, Button |
| P2 | `sequences/new.tsx` | Input, Textarea, Select, Button |
| P2 | `sequences/[id].tsx` | Button, Input, Select |
| P2 | `sequences/[id]/enroll.tsx` | Input, Table, Checkbox, Button |
| P3 | `leads/import/index.tsx` | Button, Table, Input, Select |
| P3 | `billing/index.tsx` | Card, Badge, Button |
| P3 | `billing/manage.tsx` | Card, Button, Select |
| P3 | `billing/success.tsx` | Button |
| P3 | `billing/upgrade.tsx` | Card, Button |
| P3 | `settings/index.tsx` | Input, Textarea, Select, Button, Switch |

---

## Phase 3: Layout & Navigation Overhaul

**Goal:** Modernize the chrome (sidebar, topbar, bottom nav) using shadcn primitives.

### Sidebar
- Use `Tooltip` for collapsed icon labels
- Use `Separator` for section dividers
- Use `ScrollArea` for overflow
- Use `Button variant="ghost"` for nav items
- Use `Popover` or `Sheet` for mobile sidebar

### TopBar
- Use `Input` for search
- Use `DropdownMenu` for user menu
- Use `Button variant="ghost" size="icon"` for icon actions
- Use `Avatar` for user photo
- Use `Badge` for notification count

### BottomNav
- Use `Button variant="ghost"` for tabs
- Use `Badge` for active indicator
- Consider `NavigationMenu` from shadcn

---

## Phase 4: Polish & QA

1. **Consistency audit** — grep for any remaining hardcoded colors (`#[0-9a-fA-F]{3,8}`), `style={{`, arbitrary values (`[...]`)
2. **Dark mode** — test every page in both themes
3. **Mobile** — test every page at 375px, 768px, 1024px
4. **Keyboard nav** — Tab through every interactive element, verify focus-visible rings
5. **Accessibility** — verify Dialog/Sheet focus trapping, aria labels on icon buttons
6. **Performance** — verify no bundle size regression (Radix is tree-shakeable, should be fine)

---

## Gaps Found in Initial Plan

The audit revealed these items the original plan missed:

### GAP 1: Dark mode store is unwired
`src/stores/ui.ts` has a `useUIStore` with theme toggle, but it has **zero consumers**. No component imports it. The dark mode toggle in TopBar presumably uses something else or is broken. shadcn's standard approach is `next-themes` — install it, use `<ThemeProvider>` in _app.tsx, and wire the toggle to `useTheme()`. Remove the dead zustand store.

### GAP 2: No Radix packages installed (despite prior session claims)
Prior sessions mentioned Radix Popover/DropdownMenu/Tooltip being used in SavedLeadsTable. **This is incorrect.** Zero `@radix-ui/*` packages in package.json, zero `@radix-ui` imports in the codebase. All overlays are custom-built. shadcn init will install all Radix primitives fresh.

### GAP 3: cn() utility must not be overwritten
`src/lib/utils.ts` already has the exact `cn()` function shadcn expects. When `shadcn init` runs, it will try to create this file. **Let it overwrite** — the content is identical. But verify after init that it wasn't moved or duplicated.

### GAP 4: UpgradeRequiredError UI pattern
`src/lib/api.ts` throws `UpgradeRequiredError` which 6+ components catch to render `<UpgradePrompt>`. This is a cross-cutting UI concern — the billing gate. Must be preserved through migration. The `UpgradePrompt` component itself needs to become a shadcn-styled component, but the error-to-UI pattern stays.

### GAP 5: Toast hooks must adapt to Sonner
- `src/lib/use-reply-toast.ts` — socket events → toast display
- `components/ui/undo-banner.tsx` exports `useUndo()` — undo action toasts

Both drive toast/notification UI. When we swap to Sonner, these hooks need to call `toast()` from `sonner` instead of their current custom implementations. This is a code-level change, not just CSS.

### GAP 6: next.config.js needs transpilePackages
Current config is minimal (`reactStrictMode: true` only). Some Radix primitives ship ESM and may need transpiling in Next.js 14. After shadcn init, add:
```js
transpilePackages: ['@radix-ui/*']
```

### GAP 7: MDI icons usage extent unknown
We know `@mdi/js` + `@mdi/react` are installed alongside `lucide-react`. The plan says "remove MDI" but doesn't quantify how many MDI icons are actually used. Before removing the package, audit all MDI imports and map each to a Lucide equivalent.

### GAP 8: Feature-gated rendering
Billing tier gates features via conditional rendering (show/hide upgrade prompts), not conditional styling. Safe for migration — just ensure `UpgradePrompt` is shadcn-styled.

### GAP 9: No _document.tsx exists
Pages Router apps often use `_document.tsx` for `<html>` attributes. Currently missing. The `next/font` Inter setup may need a `_document.tsx` to set `lang` and `className` properly for dark mode. Consider creating one.

---

## Risk Assessment

### HIGH RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **shadcn init overwrites globals.css** | All custom CSS vars, global classes lost instantly | Step 0.1 backup. Accept the overwrite — we want clean slate. Re-add only custom business tokens after. |
| **App visually broken between Phase 0 and Phase 1** | No button/input/card styles — app is unusable | Complete Phase 0 + Phase 1 in one session. Or: keep old globals as fallback and swap in one commit. |
| **Radix hydration mismatches in Pages Router** | Console errors, broken SSR | Radix Dialog/Sheet need `"use client"`. Pages Router pages are client by default, but ensure no SSR-only rendering of these. |
| **Custom modals have complex state** | Business logic tangled with UI in modal components | Extract business logic before swapping UI. Keep handlers, replace markup only. |

### MEDIUM RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **pill-shaped inputs/buttons (border-radius: 9999px)** | shadcn New York uses rectangular. UI feels very different. | Decision needed: accept rectangular (modern SaaS standard) or override with `rounded-full`. See Considerations. |
| **Sidebar width CSS var (`--sidebar-width`)** | Used in _app.tsx for margin offset. shadcn doesn't use this pattern. | Keep the CSS var approach — it's fine. Just reference it consistently. |
| **Color semantic shift** | `--blue` → `--primary` changes meaning. Blue was "info/brand", primary is "main action". | Map deliberately: `--primary` = your main CTA color (decide: blue or dark?). See Considerations. |
| **undo-banner → Sonner migration** | Undo pattern differs from simple toast. Sonner supports action buttons but UX differs. | Test Sonner undo action thoroughly before removing old banner. |

### LOW RISK

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Bundle size** | Radix primitives add weight | All tree-shakeable. ~15KB gzipped for full Radix suite. Negligible. |
| **MDI → Lucide icon gaps** | Some MDI icons may not have Lucide equivalents | Lucide has 1500+ icons. Unlikely to be gaps. Check before removing MDI. |
| **recharts styling** | Charts aren't covered by shadcn | Keep recharts as-is. Style the wrapper cards, not the chart internals. |
| **`cn()` compatibility** | Our cn() might differ from shadcn's | Already identical (clsx + tailwind-merge). Zero risk. |

---

## Considerations & Decisions Needed

### 1. Primary Color — What's your brand accent?

shadcn's `--primary` is the main action color. Options:
- **A) Keep near-black/dark** — matches current `--accent` pattern. Minimal, monochrome. Apple-like.
- **B) Switch to blue** — `--primary` = blue. More traditional SaaS. Action buttons pop.
- **C) Something else** — green, purple, custom brand color.

This affects every Button, link, and interactive element. Decide before Phase 1.

### 2. Input/Button shape — Pill vs Rectangle

Current: `border-radius: 9999px` (pill). shadcn New York: `border-radius: calc(var(--radius) - 2px)` (~6px, rectangular).

- **Rectangular** — standard, professional, information-dense apps (Linear, Vercel, GitHub)
- **Pill** — friendly, consumer-y, rounded feel (Stripe, Notion)

Can override per-component with `className="rounded-full"`, but pick a default.

### 3. Dark mode first or light mode first?

Your current dark mode is well-developed. shadcn init starts with light mode vars. Options:
- **A) Design for light mode first** — set light vars, derive dark from them
- **B) Design for dark mode first** — set dark vars, derive light from them
- **C) Design both simultaneously** — manually tune both `:root` and `.dark`

Given your user base likely skews toward dark (developer/SaaS tool), consider dark-first.

### 4. Migration pace — one commit or progressive?

- **Big bang single commit** — app broken between phases but clean cut. Revert is easy (one commit).
- **Feature branch** — work on a branch, merge when all phases done. App stays stable on main.
- **Feature flag** — toggle between old and new at runtime. Overkill for this.

Recommend: **feature branch**. Work on `feat/shadcn-migration`, merge when Phase 2 complete.

### 5. Google OAuth button

Current login page has a custom Google button with hardcoded SVG in 4 brand colors (`#4285F4`, `#34A853`, `#FBBC05`, `#EA4335`). This won't be a shadcn component. Options:
- **A) Keep custom** — it's a one-off brand button, not part of the design system
- **B) Use `<Button variant="outline">` with Google icon** — cleaner, but loses the colored G logo

### 6. Third-party component styling

- **recharts** — not part of shadcn. Style wrapper cards only. Chart colors reference CSS vars.
- **react-beautiful-dnd / drag** (pipeline page) — not part of shadcn. Style the card within drag items.

---

## File Map — What Gets Deleted, Modified, Created

### DELETED (after Phase 1)
- `globals.css.bak` (after migration confirmed)
- `tailwind.config.js.bak`
- `_app.tsx.bak`
- `components/ui/undo-banner.tsx` (→ Sonner)
- `components/ui/log-reply-modal.tsx` (→ Dialog)
- Any MDI icon imports

### CREATED (by shadcn CLI)
- `components.json`
- `components/ui/button.tsx`
- `components/ui/input.tsx`
- `components/ui/label.tsx`
- `components/ui/textarea.tsx`
- `components/ui/select.tsx`
- `components/ui/checkbox.tsx`
- `components/ui/switch.tsx`
- `components/ui/dialog.tsx`
- `components/ui/sheet.tsx`
- `components/ui/dropdown-menu.tsx`
- `components/ui/popover.tsx`
- `components/ui/tooltip.tsx`
- `components/ui/table.tsx`
- `components/ui/badge.tsx` (overwrites existing)
- `components/ui/card.tsx` (overwrites existing)
- `components/ui/separator.tsx`
- `components/ui/scroll-area.tsx`
- `components/ui/avatar.tsx`
- `components/ui/tabs.tsx`
- `components/ui/sonner.tsx`
- `components/ui/command.tsx`

### MODIFIED (every file that uses old patterns)
All 21 page files + most component files. Each gets:
- Replace `btn btn-primary` → `<Button variant="default">`
- Replace `btn btn-secondary` → `<Button variant="secondary">`
- Replace `btn btn-ghost` → `<Button variant="outline">`
- Replace `className="input"` → `<Input />`
- Replace `className="card"` → `<Card>`
- Replace custom modals → `<Dialog>`
- Replace inline badge spans → `<Badge variant="...">`
- Replace `var(--bg)` → `bg-background`
- Replace `var(--surface)` → `bg-card`
- Replace `var(--text)` → `text-foreground`
- Replace `var(--text-muted)` → `text-muted-foreground`
- Replace `var(--blue)` → `text-primary` (if primary=blue) or `text-blue-500`
- Replace `var(--green)` → `text-success`
- Replace `var(--amber)` → `text-warning`
- Replace `var(--red)` → `text-destructive`
- Replace `border-border` → `border-border` (same name in shadcn, no change needed)

---

## Estimated Effort

| Phase | Time | Notes |
|-------|------|-------|
| Phase 0: Foundation | 2-3 hrs | Init, tokens, next-themes, next/font, _document.tsx, next.config.js |
| Phase 1: Components | 5-7 hrs | Install + replace all primitives. Mechanical but many files. Includes MDI audit, toast migration, undo-banner replacement. |
| Phase 2: Pages | 3-4 hrs | Page-by-page cleanup, spacing, consistency |
| Phase 3: Layout | 2-3 hrs | Sidebar/TopBar/BottomNav overhaul |
| Phase 4: Polish + QA | 2-3 hrs | Audit, dark mode, mobile, a11y |
| **Total** | **14-20 hrs** | |

---

## Execution Checklist

- [ ] Phase 0.1: Backup files (globals.css, tailwind.config.js, _app.tsx)
- [ ] Phase 0.2: `npx shadcn@latest init` (New York, Slate)
- [ ] Phase 0.3: Add custom design tokens (success, warning, hot)
- [ ] Phase 0.4: Install next-themes, wire dark mode, delete src/stores/ui.ts
- [ ] Phase 0.5: Switch Inter to next/font
- [ ] Phase 0.6: Clean globals.css (remove dead layers, keep scrollbar-none utility)
- [ ] Phase 0.7: Update next.config.js (add transpilePackages for Radix)
- [ ] Phase 0.8: Create _document.tsx (html lang, className, suppressHydrationWarning)
- [ ] Phase 0.9: Verify build passes
- [ ] Phase 1.1: Batch-install shadcn components
- [ ] Phase 1.2.1: Migrate Button across all files
- [ ] Phase 1.2.2: Migrate Input/Textarea/Label/Select
- [ ] Phase 1.2.3: Migrate Badge (add custom variants: success, warning, hot)
- [ ] Phase 1.2.4: Migrate Card
- [ ] Phase 1.2.5: Migrate Dialog (replace all custom modals)
- [ ] Phase 1.2.6: Migrate Sheet (replace ReplyDrawer)
- [ ] Phase 1.2.7: Migrate DropdownMenu
- [ ] Phase 1.2.8: Migrate Tooltip
- [ ] Phase 1.2.9: Migrate Table
- [ ] Phase 1.2.10: Migrate Toast/Sonner (replace undo-banner + use-reply-toast)
- [ ] Phase 1.2.11: Migrate ScrollArea
- [ ] Phase 1.3: MDI → Lucide icon audit & migration
- [ ] Phase 1.4: Preserve UpgradeRequiredError pattern (restyle UpgradePrompt)
- [ ] Phase 1.5: Delete dead code (old CSS, dead stores, dead hooks)
- [ ] Phase 2: Page-by-page rebuild (P0 → P1 → P2 → P3)
- [ ] Phase 3: Layout chrome overhaul (Sidebar, TopBar, BottomNav)
- [ ] Phase 4: Polish audit, dark mode, mobile, a11y
