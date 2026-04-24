# Reply-Aware Pipeline Card — PRD (Revised)

## 1. Problem Statement
A lead in the "Replied" Kanban column looks visually identical to a cold "New" lead. The user must scan every card to notice a time-sensitive reply. Sentiment, urgency, and suggested next actions are buried in the separate Replies page. The result: reply rot.

## 2. Audit Findings

| Finding | Detail |
|---------|--------|
| `useReplyToast` | **Dead code.** Defined in `apps/web/src/lib/use-reply-toast.ts`, imported **nowhere**. Socket.io `reply:detected` events are emitted by the backend but never surfaced to the user. |
| `PipelineLead` type | Has no reply fields. Backend writes `last_reply_intent`, `last_reply_at` to the `leads` table during `handleInboundReply`, but the frontend pipeline list never selects them. |
| `PipelineCard` | Zero reply awareness. No border color, no badge, no intent, no action chip. |
| `reply_events` table | No `reply_seen_at` timestamp. Cannot distinguish "unread reply" from "already opened." |

## 3. Out of Scope (Explicitly Rejected)

- **Inline reply snippet on Kanban card** — Too much noise. The board is for spatial scanning; body text competes with the card's primary identity (business name). Reply content lives in the `ReplyDrawer`.
- **"Needs Action" swimlane** — Rejected. Creates a third place for the same lead (column + Replies page + swimlane). Adds cognitive load, reduces it.

## 4. Scope: What We Will Build

### 4.1 Schema Change: `reply_seen_at`

Add `reply_seen_at timestamptz` to `reply_events` table.
- `NULL` = user has never opened this reply in `ReplyDrawer`
- Set to `now()` when `ReplyDrawer` mounts for a given `replyId`
- Used to compute `isUnread` per lead (any reply with `reply_seen_at IS NULL`)

**Run this in Supabase SQL Editor before deploying:**
```sql
ALTER TABLE reply_events ADD COLUMN IF NOT EXISTS reply_seen_at timestamptz;
```
*No migration script required — one line. Verify with `SELECT reply_seen_at FROM reply_events LIMIT 1;`.*

### 4.2 Backend: Pipeline List Enrichment

Modify `api.pipeline.list()` (or the query in `usePipelineBoard`) to select three lightweight reply aggregates per lead:

```sql
SELECT
  l.*,
  (
    SELECT intent_label
    FROM reply_events r
    WHERE r.lead_id = l.id
    ORDER BY r.received_at DESC
    LIMIT 1
  ) as last_reply_intent,
  (
    SELECT received_at
    FROM reply_events r
    WHERE r.lead_id = l.id
    ORDER BY r.received_at DESC
    LIMIT 1
  ) as last_reply_at,
  (
    SELECT id
    FROM reply_events r
    WHERE r.lead_id = l.id
      AND r.reply_seen_at IS NULL
    ORDER BY r.received_at DESC
    LIMIT 1
  ) as last_unread_reply_id,
  EXISTS (
    SELECT 1 FROM reply_events r
    WHERE r.lead_id = l.id
      AND r.reply_seen_at IS NULL
  ) as has_unread_reply
FROM leads l
WHERE l.user_id = $1
```

These are already partially written by `handleInboundReply` to the `leads` table. The cleanest approach is to **select them** in the pipeline list endpoint rather than add new columns to `leads`.

**Alternative if subqueries are slow:** Add `last_reply_intent`, `last_reply_at`, `has_unread_reply` as computed/materialized columns on `leads` and maintain them via the Inngest function. This keeps the list query a simple `SELECT *`.

**Decision:** Use subquery approach first (correctness over performance; solo user scale). Optimize later if pipeline list > 500 ms.

### 4.3 Frontend: `PipelineLead` Type Extension

```typescript
export interface PipelineLead {
  // ... existing fields ...
  lastReplyIntent?: string | null;
  lastReplyAt?: string | null;
  lastUnreadReplyId?: string | null;
  hasUnreadReply?: boolean;
}
```

### 4.4 Frontend: `PipelineCard` Visual Changes

**Only when `hasUnreadReply === true` AND lead is in the `replied` column:**

| Element | Change | Rationale |
|---------|--------|-----------|
| **Left border** | 3px solid color by `lastReplyIntent` | Instant visual triage without reading |
| **"NEW REPLY" badge** | Small pill, top-right of card header | Screams "requires attention" |
| **Intent pill** | Replaces generic engagement status text (e.g. "Opened", "Contacted"). Pipeline stage badge (e.g. "Replied") remains. | User sees *what kind* of reply at a glance without losing column identity |
| **Quick-action chip** | One CTA button below status dropdown | Prevents action paralysis; sentiment → action |
| **Pulsing red dot** | Already exists for `followUpDate` due; amplified when `hasUnreadReply` | Reinforces urgency |

**When `hasUnreadReply === false` (reply already seen) OR lead is not in `replied` column:**
Card renders exactly as it does today. Zero visual change for non-replied leads.

#### 4.4.1 Color Mapping (`lastReplyIntent` → border + pill)

| Intent | Border / Pill Color | Tailwind Token |
|--------|---------------------|----------------|
| `interested` | Green | `border-green-500` / `bg-green-50 text-green-700` |
| `question` | Blue | `border-blue-500` / `bg-blue-50 text-blue-700` |
| `objection` | Amber | `border-amber-500` / `bg-amber-50 text-amber-700` |
| `not_now` | Purple | `border-purple-500` / `bg-purple-50 text-purple-700` |
| `not_interested` | Red | `border-red-500` / `bg-red-50 text-red-700` |
| `out_of_office` | Cyan | `border-cyan-500` / `bg-cyan-50 text-cyan-700` |
| default / unknown | Grey | `border-gray-400` / `bg-gray-50 text-gray-600` |

#### 4.4.2 Quick-Action Chip Mapping

One button, sentiment-driven label, opens `ReplyDrawer`:

| Intent | Chip Label | Action on Click |
|--------|------------|-----------------|
| `interested` | "Book a call →" | Opens `ReplyDrawer` with focus on "Mark Interested" |
| `question` | "Answer →" | Opens `ReplyDrawer` |
| `objection` | "Rebut →" | Opens `ReplyDrawer` |
| `not_now` | "Snooze →" | Opens `ReplyDrawer`; pre-selects Snooze 30d |
| `not_interested` | "Decline →" | Opens `ReplyDrawer` |
| default | "View reply →" | Opens `ReplyDrawer` |

The chip is **not** a direct action — it always opens the drawer. The label primes the user for what they'll find inside. This avoids accidental one-click destructive actions on the board.

### 4.5 Frontend: `ReplyDrawer` — Mark as Seen

When `ReplyDrawer` mounts with a `replyId`:
1. Fire `PATCH /replies/:id/seen` (idempotent, sets `reply_seen_at = now()` if null)
2. On success, invalidate `pipeline` query so the card loses its "NEW REPLY" state on next board render

**New endpoint:** `PATCH /replies/:replyId/seen`

> **Ownership check:** `reply_events` may not have a direct `user_id` column. Verify schema first. If it doesn't, validate ownership via the lead:

```typescript
router.patch('/:replyId/seen', async (c) => {
  const user = c.get('user');
  const replyId = c.req.param('replyId');

  // Validate ownership via reply_events → leads join
  const { data: reply, error: findErr } = await supabaseAdmin
    .from('reply_events')
    .select('id, leads!inner(user_id)')
    .eq('id', replyId)
    .eq('leads.user_id', user.id)
    .single();

  if (findErr || !reply) {
    return c.json({ error: 'Not found' }, 404);
  }

  const { error } = await supabaseAdmin
    .from('reply_events')
    .update({ reply_seen_at: new Date().toISOString() })
    .eq('id', replyId)
    .is('reply_seen_at', null);  // idempotent

  if (error) {
    return c.json({ error: error.message }, 500);
  }

  return c.json({ success: true });
});
```

### 4.6 Frontend: `useReplyToast` — Wire It

`useReplyToast` is currently dead. Wire it into the app layout (e.g., `apps/web/src/components/layout/AppLayout.tsx` or `_app.tsx`):

```typescript
import { useReplyToast } from '@/lib/use-reply-toast';
import { toast } from 'sonner';

function AppLayout({ children }) {
  useReplyToast((title, subtitle, href) => {
    toast.info(title, {
      description: subtitle,
      action: href ? { label: 'View', onClick: () => router.push(href) } : undefined,
      duration: 8000,  // persistent enough to not miss
    });
  });
  return children;
}
```

**Critical fix:** The `Socket.ts` `ReplyNotification` interface must include `ctaHref` for this to work. Verify it's populated by `emitReplyNotification` in `handleInboundReply.ts`. Current code sets `replyEventId` but not `ctaHref` in the socket payload — **backend fix required** to add `href: `/replies?highlight=${replyEventId}``.

### 4.7 Frontend: Replies Page — Unread Count Badge (Sidebar)

Compute client-side from the pipeline query (already enriched with `hasUnreadReply` per lead). Zero extra API calls.

```typescript
const unreadCount = leads.filter(l => l.hasUnreadReply).length;
```

Add a small red dot / count badge to the "Replies" sidebar nav item when `unreadCount > 0`.

```typescript
// Sidebar link
{ label: "Replies", href: "/replies", icon: MessageSquare, badge: unreadCount }
```

If count > 0, render a red circle with the number (or just a dot if count > 9).

## 5. Data Flow

```
Inbound email arrives
  → Webhook inserts reply_events row (reply_seen_at = NULL)
  → Inngest classifies intent, updates lead.last_reply_intent / last_reply_at
  → Socket.io emits reply:detected
  → Frontend toast fires (if wired)
  → Pipeline list query returns has_unread_reply = true
  → PipelineCard renders colored border + NEW REPLY badge + intent pill + action chip

User clicks chip or card
  → LeadQuickDrawer OR ReplyDrawer opens
  → PATCH /replies/:id/seen sets reply_seen_at
  → Pipeline query invalidates
  → Card re-renders without NEW REPLY badge (border may persist until refresh)
```

## 6. Component Changes

| File | Change |
|------|--------|
| `apps/api/src/routes/replies.ts` | Add `PATCH /:replyId/seen` endpoint with ownership-validated join |
| `apps/api/src/routes/pipeline.ts` | Select `last_reply_intent`, `last_reply_at`, `last_unread_reply_id`, `has_unread_reply` in list query |
| `apps/api/src/lib/inngest/functions/handleInboundReply.ts` | Add `ctaHref` to socket payload |
| `apps/web/src/hooks/usePipelineBoard.ts` | Extend `PipelineLead` interface with reply fields |
| `apps/web/src/components/pipeline/PipelineCard.tsx` | Add conditional reply visual layer (border, badge, pill, chip) |
| `apps/web/src/components/replies/ReplyDrawer.tsx` | Call `PATCH /replies/:id/seen` on mount |
| `apps/web/src/components/layout/sidebar.tsx` | Add unread count badge to Replies nav |
| `apps/web/src/lib/use-reply-toast.ts` | Already exists; import and use in layout |
| `apps/web/src/pages/_app.tsx` (or AppLayout) | Wire `useReplyToast` |

## 7. Visual Spec (PipelineCard — Replied State)

```
┌─────────────────────────────────────┐  ← Card container
│▓▓▓▓ NEW REPLY                       │  ← "NEW REPLY" pill (top-right, red bg)
│                                     │
│  Business Name          [🔥 72]     │  ← Name + HotScoreBadge (unchanged)
│  [Replied] ┌────────────┐          │  ← Pipeline stage badge + intent pill
│            │ Interested │  £12,000  │    (intent replaces engagement status text)
│            └────────────┘          │
│                                     │
│  [ Book a call → ]                  │  ← Quick-action chip (bottom)
│                                     │
│  London · View profile →            │  ← City + link (unchanged)
└─────────────────────────────────────┘
↑
3px green left border (interested)
```

**When not in replied column OR reply is seen:** Card renders exactly as today. No border, no badge, no pill, no chip. Pipeline stage badge and engagement status text render normally.

## 8. Testing Checklist

- [ ] `reply_seen_at` column added via SQL Editor; verified with `SELECT`
- [ ] `reply_seen_at` is NULL for all historical replies
- [ ] Pipeline list query includes `last_reply_intent`, `last_reply_at`, `last_unread_reply_id`, `has_unread_reply`
- [ ] `lastUnreadReplyId` is passed to `ReplyDrawer` and used in `PATCH /replies/:id/seen`
- [ ] Card in "New" column has no visual change
- [ ] Card in "Replied" column with `hasUnreadReply=true` shows colored border
- [ ] Card in "Replied" column with `hasUnreadReply=false` has no border
- [ ] "NEW REPLY" badge only appears when `hasUnreadReply=true`
- [ ] Intent pill color matches `lastReplyIntent`
- [ ] Pipeline stage badge (e.g. "Replied") remains visible alongside intent pill
- [ ] Quick-action chip opens `ReplyDrawer`
- [ ] Opening `ReplyDrawer` calls `PATCH /replies/:id/seen` with correct `replyId`
- [ ] PATCH returns 404 if reply does not belong to current user (ownership validated via leads join)
- [ ] After `PATCH`, board refetches and badge disappears within one query cycle (border may persist until full refresh — known limitation)
- [ ] Sidebar Replies nav shows red dot when unread replies exist
- [ ] `useReplyToast` fires when socket event arrives
- [ ] Toast has "View" button that navigates to Replies page
- [ ] No console errors, no hydration mismatch

## 9. Performance Notes

- Subquery approach for reply aggregates adds ~1-2 ms per lead at solo-user scale. Monitor `api.pipeline.list()` latency.
- If latency > 300 ms, switch to materialized columns on `leads` table maintained by Inngest.
- `ReplyDrawer` PATCH is fire-and-forget; no blocking UI.
- Toast duration 8s — long enough to notice, short enough to not pile up.
