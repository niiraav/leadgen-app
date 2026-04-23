# Phase E — Lead Detail Tabbed Interface
## PRD v1.1

---

## 1. Objective

Replace the four accordion cards in the right column of the lead detail page (`[id].tsx`) with a single Card containing a shadcn Tabs component (icon tabs variant). Tabs: **Email**, **Activity**, **Replies**, **Notes**.

Additionally:
- Email composer retains its distinct email-composer UI (Generate + Send CTAs, subject line, body textarea, action toolbar).
- Add a **Back button** at the top of the page to return to the previous page.

---

## 2. Current State (What Exists)

Right column (`lg:col-span-2 space-y-4`) contains four separate Cards:

| # | Card | Lines | Expandable |
|---|------|-------|------------|
| 1 | AI Email Composer | 1569–1740 | No (always open) |
| 2 | Activity History | 1747–1806 | Yes (accordion) |
| 3 | Replies | 1808–1883 | Yes (accordion) |
| 4 | Notes | 1885–1914 | Yes (accordion) |

Accordion state:
```tsx
const [expandedSections, setExpandedSections] = useState({
  activity: true,
  replies: true,
  notes: true,
});
const toggleSection = (key: string) => { ... };
```

Each accordion card has a `<button>` header with title + chevron, and `<AnimatePresence initial={false}>` wrapping the body with `expandCollapse` spring animation.

---

## 3. Target State (What We're Building)

### 3.1 Page Header — Back Button

Above the two-column grid, add a back navigation bar:

```tsx
<div className="mb-4">
  <button
    onClick={() => router.back()}
    className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
  >
    <ArrowLeft className="w-4 h-4" />
    Back
  </button>
</div>
```

Uses `router.back()` from Next.js `useRouter` for browser-history-based navigation (takes user back to Leads list or whatever page they came from).

### 3.2 Right Column Structure

```
<div className="lg:col-span-2 space-y-4">
  {/* Banners (unchanged) */}
  {isRecontact && <Banner ... />}
  {lead.email_status === "catch-all" && <Banner ... />}

  {/* Single Card with Tabs */}
  <Card className="p-0 overflow-hidden">
    <LeadDetailTabs
      emailTab={<EmailComposerPanel />}
      activityTab={<ActivityPanel />}
      repliesTab={<RepliesPanel />}
      notesTab={<NotesEditor ... />}
      activityCount={allActivities.length}
      repliesCount={repliesQuery.data?.replies?.length ?? 0}
    />
  </Card>
</div>
```

### 3.3 Tab Bar Design

Uses shadcn Tabs primitive (`src/components/ui/tabs.tsx`) with custom trigger styling.

| Tab | Icon | Badge (conditional) |
|-----|------|---------------------|
| Email | `Sparkles` | None |
| Activity | `Clock` | `{count}` pill if > 0 |
| Replies | `MessageSquare` | `{count}` pill if > 0 |
| Notes | `NotebookPen` | None |

Tab trigger styling:
- Default: `text-text-muted bg-transparent`
- Active: `text-text bg-surface-2 border border-border/60 shadow-sm`
- Transition: `transition-all duration-200`
- Padding: `px-3 py-1.5 rounded-md`
- Gap: `gap-1.5`

No underline animation (per user request — using pill/switch style instead of PRD §4.6 underline).

---

## 4. Email Composer Panel (Tab Content)

The Email tab must look and feel like an email composer — not just raw form inputs. It retains all current functionality and visual hierarchy, adapted to live inside a shared Card.

### 4.1 Structure (inside Email tab panel)

```
<div className="email-composer-panel">
  ┌─────────────────────────────────────────────────────────────┐
  │  [Sparkles icon]  AI Email Composer          [Generate btn] │  ← composer-header
  ├─────────────────────────────────────────────────────────────┤
  │  Prerequisites hints (if any)                                │
  ├─────────────────────────────────────────────────────────────┤
  │  Subject options pills (if generated)                        │
  ├─────────────────────────────────────────────────────────────┤
  │  Subject: _______________________________________________    │  ← borderless input
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │  Body textarea (12 rows, resize-none)                        │  ← borderless textarea
  │                                                              │
  ├─────────────────────────────────────────────────────────────┤
  │  [Copy]  {N} words                    [Send Email]           │  ← composer-footer
  └─────────────────────────────────────────────────────────────┘
```

### 4.2 Styling Adaptations for Shared Card

Since the Email panel is no longer wrapped in its own Card, we add a subtle top border to separate the tab bar from the composer header:

| Element | Current (own Card) | New (inside shared Card) |
|---------|-------------------|--------------------------|
| Composer header | `p-4 border-b border-border/40` | `px-4 pt-4 pb-3 border-b border-border/40` |
| Subject input | `px-4 pt-3` | `px-4 pt-3` (unchanged) |
| Body textarea | `px-4 pb-3 pt-1` | `px-4 pb-3 pt-1` (unchanged) |
| Composer footer | `px-4 py-3 bg-surface-2 border-t border-border/40` | `px-4 py-3 bg-surface-2/60 border-t border-border/40` |
| Outer wrapper | `<Card className="p-0 overflow-hidden">` | No outer wrapper — content is direct child of `TabsContent` |

The footer keeps its `bg-surface-2` toolbar background so it reads as a distinct action bar at the bottom of the composer.

### 4.3 Retained Elements

- **Header**: Sparkles icon + "AI Email Composer" title + "Generate personalized email" button (right-aligned)
- **Generate button**: Triggers `handleAISuggest(isRecontact)`
- **Prerequisites banner**: Amber warning when no email or no review summary
- **Subject options**: Pill buttons for switching between generated subject lines
- **Subject input**: Borderless, full-width
- **Body textarea**: 12 rows, borderless, resize-none, word count
- **Footer toolbar**: Copy button, word counter, mobile "Copy for mail app" button, Send Email button with all states (disabled, loading, queued, do-not-contact block)

---

## 5. Other Tab Panels (Minimal Changes)

### 5.1 Activity Tab
- Content: Timeline list of `allActivities` entries
- Styling: `divide-y divide-border/40` on the list container
- Each entry: `p-4 hover:bg-surface-2/50 transition-colors`
- No outer padding — the `px-4` is on each row

### 5.2 Replies Tab
- Content: Reply cards from `repliesQuery.data.replies`
- Styling: `space-y-3` with `px-4 pb-4` wrapper
- Each card: `border border-border/40 rounded-lg p-3`
- No outer padding — wrapper provides it

### 5.3 Notes Tab
- Content: `<NotesEditor leadId={leadId} initialNotes={lead.notes ?? ""} />`
- NotesEditor handles its own padding internally

---

## 6. Files to Create

### 6.1 `src/components/ui/tabs.tsx`

Base shadcn Tabs primitive using `@radix-ui/react-tabs`.
Exports: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`

### 6.2 `src/components/leads/LeadDetailTabs.tsx`

Props interface:
```tsx
interface LeadDetailTabsProps {
  emailTab: React.ReactNode;
  activityTab: React.ReactNode;
  repliesTab: React.ReactNode;
  notesTab: React.ReactNode;
  activityCount?: number;
  repliesCount?: number;
  defaultTab?: "email" | "activity" | "replies" | "notes";
}
```

Renders:
- `Tabs` wrapper with `defaultValue={defaultTab ?? "email"}`
- `TabsList` with 4 `TabsTrigger` items (icon + label + optional count badge)
- 4 `TabsContent` panels, each wrapped in `motion.div` for enter animation

Tab bar container styling:
```
px-4 pt-3 pb-1 border-b border-border/40 flex gap-1
```

---

## 7. Files to Modify

### 7.1 `src/pages/leads/[id].tsx`

#### Add import:
- `ArrowLeft` from `lucide-react`
- `NotebookPen` from `lucide-react`
- `LeadDetailTabs` from `@/components/leads/LeadDetailTabs`

#### Delete:
- `expandedSections` state (lines 126–130)
- `toggleSection` function (lines 131–133)
- `expandCollapse` variant (lines 136–140)
- `ChevronDown` and `ChevronUp` from lucide imports (line 8)
- All 3 accordion button headers (lines 1748–1767, 1810–1828, 1887–1897)
- All 3 `<AnimatePresence initial={false}>` wrappers (lines 1768–1805, 1829–1882, 1898–1913)
- All `expandedSections.*` conditionals

#### Add: Back button (above the two-column grid)

Insert before `<motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6">`:

```tsx
<div className="mb-4">
  <button
    onClick={() => router.back()}
    className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text transition-colors"
  >
    <ArrowLeft className="w-4 h-4" />
    Back
  </button>
</div>
```

#### Replace right column (lines 1548–1915):

Current:
```tsx
<div id="email-composer" className="lg:col-span-2 space-y-4">
  {/* banners */}
  {/* 4 separate Cards */}
</div>
```

New:
```tsx
<div className="lg:col-span-2 space-y-4">
  {/* banners — unchanged */}

  <Card className="p-0 overflow-hidden">
    <LeadDetailTabs
      defaultTab="email"
      emailTab={
        <div>
          {/* === Email Composer Header === */}
          <div className="px-4 pt-4 pb-3 border-b border-border/40">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue" />
                AI Email Composer
              </h3>
              <button
                onClick={() => handleAISuggest(isRecontact)}
                disabled={emailLoading}
                className="btn btn-secondary text-xs py-1.5 h-8"
              >
                {emailLoading ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> Generate personalized email</>
                )}
              </button>
            </div>
            {/* prerequisites, subject options, error — unchanged */}
          </div>

          {/* === Subject === */}
          <div className="px-4 pt-3">
            <input type="text" placeholder="Subject line..." ... />
          </div>

          {/* === Body === */}
          <div className="px-4 pb-3 pt-1">
            <textarea rows={12} ... />
          </div>

          {/* === Footer Toolbar === */}
          <div className="px-4 py-3 bg-surface-2/60 border-t border-border/40 flex items-center justify-between">
            {/* copy, word count, mobile copy, send — unchanged */}
          </div>
        </div>
      }
      activityTab={
        <div className="divide-y divide-border/40">
          {/* activity entries */}
        </div>
      }
      repliesTab={
        <div className="px-4 pb-4 space-y-3">
          {/* reply cards */}
        </div>
      }
      notesTab={
        <NotesEditor leadId={leadId} initialNotes={lead.notes ?? ""} />
      }
      activityCount={allActivities.length}
      repliesCount={repliesQuery.data?.replies?.length ?? 0}
    />
  </Card>
</div>
```

Note: `id="email-composer"` removed (no longer needed for anchor linking).

---

## 8. Animation & Motion

### 8.1 Tab Switch Animation

`TabsContent` panels animate with a subtle fade + slight vertical shift on mount:

```tsx
<motion.div
  initial={{ opacity: 0, y: 4 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.2, ease: "easeOut" }}
>
  {children}
</motion.div>
```

Implemented inside `LeadDetailTabs.tsx` wrapping each `TabsContent` body.

### 8.2 Active Tab Indicator

No underline slide. Active tab uses `bg-surface-2` + `border` + `shadow-sm` pill style. Transition handled by Tailwind `transition-all duration-200`.

### 8.3 Count Badge Animation

When count changes from 0 to N, badge fades in:
```tsx
<span className="animate-in fade-in duration-200">{count}</span>
```

---

## 9. CSS / Styling Requirements

No new CSS variables needed. Uses existing tokens:
- `--surface-2` → active tab bg, composer footer bg
- `--border` / `--border-legacy` → tab border, composer borders
- `--text` / `--text-muted` → text colors

Tab bar container:
```
bg-transparent border-b border-border/40 px-4 pt-3 pb-1 gap-1
```

Email composer footer:
```
bg-surface-2/60 border-t border-border/40
```
(Using `/60` opacity to soften the toolbar against the shared Card bg, avoiding a "card within card" visual.)

---

## 10. Accessibility

- Tabs follow Radix UI accessibility: arrow key navigation, role="tablist", aria-selected
- Each `TabsTrigger` has `aria-label` when icon-only (not applicable — we show text + icon)
- Keyboard focus ring: `focus-visible:ring-2 focus-visible:ring-ring`
- Back button is a `<button>` with visible text label (not icon-only)

---

## 11. Acceptance Criteria

| ID | Criterion | Verification |
|----|-----------|------------|
| E.1 | Back button renders at top of page, clicking it returns to previous page | Click back button |
| E.2 | All 4 tab labels render with correct icons (Sparkles, Clock, MessageSquare, NotebookPen) | Visual inspection |
| E.3 | Activity tab shows count badge when `allActivities.length > 0` | Load lead with activity |
| E.4 | Replies tab shows count badge when replies exist | Load lead with replies |
| E.5 | Clicking tab switches content panel with smooth fade animation | Click each tab |
| E.6 | Email tab is default active on page load | Refresh page |
| E.7 | Email composer retains full header (title + Generate button), subject, body, footer toolbar | Visual inspection |
| E.8 | Generate personalized email button works and triggers AI suggest | Click generate |
| E.9 | Send Email button works (when email valid, not do-not-contact) | Send test email |
| E.10 | Copy button + word count still functional in email footer | Click copy |
| E.11 | NotesEditor renders correctly inside Notes tab, save works | Type + save notes |
| E.12 | Recontact and catch-all banners still appear above tabs | Visual inspection |
| E.13 | No accordion state, toggleSection, expandCollapse, ChevronDown/Up remain in file | `grep` confirmation |
| E.14 | Active tab uses pill-style highlight (bg-surface-2 + border + shadow) | Click tabs |

---

## 12. Migration Checklist

- [ ] Install `@radix-ui/react-tabs` (already installed in previous step)
- [ ] Create `src/components/ui/tabs.tsx`
- [ ] Create `src/components/leads/LeadDetailTabs.tsx`
- [ ] Update `src/pages/leads/[id].tsx` imports (add ArrowLeft, NotebookPen, LeadDetailTabs; remove ChevronDown, ChevronUp)
- [ ] Add Back button above two-column grid
- [ ] Delete `expandedSections`, `toggleSection`, `expandCollapse`
- [ ] Extract Email Composer content into `emailTab` prop (keep header, generate button, subject, body, footer)
- [ ] Extract Activity content into `activityTab` prop
- [ ] Extract Replies content into `repliesTab` prop
- [ ] Extract Notes content into `notesTab` prop
- [ ] Delete 3 accordion Card wrappers
- [ ] Replace right column with single Card + LeadDetailTabs
- [ ] Verify no TypeScript errors
- [ ] Verify no runtime errors
- [ ] Run all E.1–E.14 acceptance criteria
