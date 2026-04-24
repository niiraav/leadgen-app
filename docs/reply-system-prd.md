# Reply System Enhancement PRD

## Status: Draft v2 — Ready for Review
**Scope:** Frontend urgency signals, real-time notifications, ReplyDrawer actionability
**Dependencies:** None (all backend events/classifiers already exist)

---

## 1. Problem Statement

Replies from leads arrive via Inngest classification and Socket.io emission, but the frontend fails to:
- Surface them with urgency in the primary workflow (Pipeline Kanban)
- Notify the user in real-time (Socket events fire into void — `useRealtimeSocket` exists in `socket.ts` but is never mounted)
- Provide actionable context (original email missing, draft reply read-only)
- Track handling state (no `read_at` / `handled_at` on `reply_events`)

**Result:** Replies rot unseen in the "Replied" column, forcing users to discover them via 30s-polling bell or manual scanning.

---

## 2. Success Criteria

| # | Criteria | Measurement |
|---|---|---|
| 1 | User sees a new reply within 5 seconds of arrival without scrolling | Socket toast fires + Pipeline card flashes |
| 2 | User can triage reply priority at a glance from Kanban | Intent color + snippet visible on card |
| 3 | User understands "who said what and why" without leaving drawer | Original email + reply body + sender identity in one view |
| 4 | User can action a reply (copy draft, mark handled) without opening Gmail | Copy-to-clipboard + mark-as-handled in drawer |
| 5 | Replied lead visually clears from "urgent" state after handling | `read_at` / `handled_at` gates badge/border |
| 6 | No stale sidebar badge after handling | Badge decrements via Socket event, not poll lag |

---

## 3. Scope

### In Scope
- PipelineCard reply urgency styling (border, badge, snippet, intent chip)
- Socket.io toast wiring via `ReplyToastProvider` in `_app.tsx`
- `reply_events` schema additions (`read_at`, `handled_at`, `reply_status`, `sender_name`)
- ReplyDrawer enrichment (original email context, editable draft, copy button, mark-handled)
- Sidebar Replies nav badge (driven by Socket event, fallback poll)
- Pipeline page sticky "X unread replies" banner (fallback if user misses toast)
- `GET /replies/:id` to include original sent email join
- `PATCH /replies/:id/read` and `/handled` endpoints
- `POST /replies/:id/regenerate-draft` endpoint (no rate limiting in MVP — monitor abuse)

### Out of Scope (Later Sprint)
- "Send reply" via Mailgun proxy (needs outbound send API + spam compliance review)
- Browser Push API notifications
- Full inbox-style Replies page redesign (current table is adequate with badge)
- Rate limiting on regenerate-draft (monitor first, gate later if needed)

---

## 4. User Stories

### US-1: Real-Time Discovery
> As a user, when a lead replies to my sequence while I'm working in the app, I want to see an immediate toast with their name and intent, so I don't miss time-sensitive replies.

**Acceptance:**
- Toast appears within 5s of `reply/received` Inngest completion
- Toast shows: business name, intent emoji, key phrase snippet (max 60 chars)
- Toast CTA "Open Reply" opens `ReplyDrawer` directly (not lead page)
- Toast auto-dismisses after 10s unless hovered
- Multiple toasts stack vertically (max 3 visible)
- If Socket is disconnected, sticky banner on Pipeline page still surfaces unread count

### US-2: Kanban Triage
> As a user viewing my Pipeline, I want replied leads to visually scream for attention, so I prioritize them over cold leads.

**Acceptance:**
- `status === 'replied'` card gets colored left border by **latest reply intent**:
  - `interested` → green-500
  - `question` → blue-500
  - `objection` → amber-500
  - `not_now` → purple-500
  - `not_interested` / `unsubscribe` → red-500
- Card shows "NEW REPLY" badge if latest `reply_events.read_at IS NULL`
- Card shows first 80 chars of latest `key_phrase` below business name (italic, muted)
- If a lead has **multiple unhandled replies**, badge shows count: "3 NEW REPLIES"
- "Replied" column header shows count of unhandled replies
- Sequence-paused indicator: small "⏸ Paused" text if enrollment status is `paused`

### US-3: Context in Drawer
> As a user who opens a replied lead, I want to see both what I sent and what they replied, so I don't context-switch to Gmail.

**Acceptance:**
- ReplyDrawer header shows: `From: {sender_name} <{sender_email}>`
- Collapsible "Your Last Email" section above reply body
  - Fetches from `sequence_step_executions` (last sent step for this lead)
  - Shows sent date, subject, body truncated to 300 chars
  - If no sent step found, show "No outbound email on record" gracefully
- Reply body shows full `body_plain` with `key_phrase` highlighted
- Subject line displayed as header above body

### US-4: Actionable Draft
> As a user reading a reply, I want to edit and copy an AI-generated draft response, so I can paste it into Gmail quickly.

**Acceptance:**
- `suggested_reply_draft` renders in `<textarea>` (not static `<div>`)
- User can edit text freely
- "Copy to Clipboard" button copies current textarea content
- "Regenerate" button hits `POST /replies/:id/regenerate-draft`
  - If OpenRouter fails, toast shows "Could not regenerate — try again later"
  - If success, textarea content updates with new draft
- Mark-as-handled button sets `handled_at` and clears urgency UI immediately
  - Does NOT auto-move lead to another column — user controls pipeline stage

### US-5: Sidebar Awareness
> As a user, I want the Replies nav item to show an unread count, so I know when to visit that page.

**Acceptance:**
- Sidebar "Replies" shows red badge with count of `reply_status = 'new'`
- Badge increments immediately on Socket `reply:detected` event
- Badge decrements immediately when any reply is marked read/handled
- Fallback: poll `GET /replies/unread-count` every 60s on initial load / reconnect
- **Clicking Replies nav does NOT mark any replies as read** — user explicitly handles per-reply

### US-6: Fallback Discovery (Socket Disconnected)
> As a user who missed the real-time toast, I want to see a persistent indicator on the Pipeline page, so I don't lose replies in the noise.

**Acceptance:**
- Pipeline page shows dismissible sticky banner at top when `unread_reply_count > 0`
- Banner text: "{N} unread replies waiting — [View Replies]"
- Banner auto-hides when count drops to 0
- Banner survives page refresh (fetched on mount)

---

## 5. Data Model Changes

### 5.1 Database

**Database:** Supabase Postgres (`drizzle.config.ts` — `dialect: 'postgresql'`). All `reply_events` operations use `supabaseAdmin` (PostgREST).

### 5.2 Schema Migration

```sql
-- ============================================
-- Sprint: Reply System Enhancement
-- ============================================

-- 1. reply_events: add tracking columns
ALTER TABLE reply_events
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reply_status TEXT DEFAULT 'new'
    CHECK (reply_status IN ('new', 'read', 'replied', 'snoozed', 'archived')),
  ADD COLUMN IF NOT EXISTS handled_by_action TEXT,
  ADD COLUMN IF NOT EXISTS sender_name TEXT,
  ADD COLUMN IF NOT EXISTS original_step_execution_id UUID REFERENCES sequence_step_executions(id);

-- 2. Index for fast unread counting per user
CREATE INDEX IF NOT EXISTS idx_reply_events_status_user
  ON reply_events(reply_status, user_id)
  WHERE reply_status = 'new';

-- 3. Index for lead-level reply lookups
CREATE INDEX IF NOT EXISTS idx_reply_events_lead_read
  ON reply_events(lead_id, read_at);

-- 4. Index for latest-reply intent lookup (used by PipelineCard)
CREATE INDEX IF NOT EXISTS idx_reply_events_lead_received
  ON reply_events(lead_id, received_at DESC);
```

**Note:** `reply_status` excludes `'drafted'` — no user story triggers this state. It may be added later if "draft reply without sending" becomes a feature.

### 5.3 TypeScript Types (shared)

```typescript
// Add to packages/shared/src/types.ts
export interface ReplyEvent {
  id: string;
  lead_id: string;
  user_id: string;
  sender_email: string;
  sender_name?: string | null;
  subject?: string | null;
  body_plain?: string | null;
  intent_label: string;
  user_corrected_label?: string | null;
  confidence?: number | null;
  sentiment_score?: number | null;
  urgency?: 'low' | 'medium' | 'high' | null;
  suggested_next_action?: string | null;
  suggested_reply_draft?: string | null;
  key_phrase?: string | null;
  hot_score: number;
  received_at: string;
  read_at?: string | null;
  handled_at?: string | null;
  reply_status: 'new' | 'read' | 'replied' | 'snoozed' | 'archived';
  handled_by_action?: string | null;
  needs_review: boolean;
  original_step_execution_id?: string | null;
  created_at: string;
}

export interface OriginalSentEmail {
  id: string;
  step_number: number;
  subject: string;
  body_plain: string;
  sent_at: string;
}

// Augment Lead type for PipelineCard reply lookups
export interface LeadWithLatestReply extends Lead {
  latest_reply?: {
    id: string;
    intent_label: string;
    key_phrase?: string | null;
    body_plain?: string | null;
    received_at: string;
    read_at?: string | null;
    reply_status: string;
    hot_score: number;
    sender_name?: string | null;
  } | null;
  unread_reply_count?: number;
  sequence_paused?: boolean;
}
```

---

## 6. API Specification

### 6.1 Existing Endpoints (No Change)
- `GET /replies` — list with pagination
- `PATCH /replies/:id/intent` — correct intent
- `POST /replies/:id/snooze` — snooze

### 6.2 New / Modified Endpoints

#### `GET /replies/unread-count`
**Auth:** Bearer token
**Response:**
```json
{ "count": 7 }
```
**Logic:** `SELECT COUNT(*) FROM reply_events WHERE user_id = $1 AND reply_status = 'new'`

#### `GET /replies/:id` (Enhanced)
**Change:** Include original sent email join
**Response:**
```json
{
  "id": "uuid",
  "lead_id": "uuid",
  "sender_email": "dave@cityplumbers.co.uk",
  "sender_name": "Dave Smith",
  "subject": "Re: Quick question about your website",
  "body_plain": "Sounds good, what are your rates? ...",
  "intent_label": "interested",
  "key_phrase": "what are your rates",
  "hot_score": 92,
  "received_at": "2026-04-24T14:32:00Z",
  "read_at": null,
  "reply_status": "new",
  "suggested_reply_draft": "Hi Dave, thanks for getting back...",
  "original_email": {
    "id": "uuid",
    "step_number": 1,
    "subject": "Quick question about your website",
    "body_plain": "Hi Dave, I noticed City Plumbers...",
    "sent_at": "2026-04-22T09:15:00Z"
  }
}
```
**Logic:**
1. Fetch reply_events row + lead join (existing)
2. If `original_step_execution_id`, fetch that row
3. Else, query `sequence_step_executions` for latest sent step by `lead_id` (via `sequence_enrollments` join on `lead_id`)
4. If no step found, `original_email: null`

#### `PATCH /replies/:id/read`
**Body:** empty or `{ "read_at": "iso" }`
**Response:** updated reply row
**Logic:**
```sql
UPDATE reply_events
SET read_at = NOW(),
    reply_status = 'read'
WHERE id = $1 AND user_id = $2 AND reply_status = 'new'
RETURNING *;
```
**Side effect:** Emit Socket.io `reply:read` event to user room so sidebar badge decrements immediately.

#### `POST /replies/:id/handled`
**Body:** `{ "action": "sent_reply" | "marked_interested" | "snoozed" | "archived" }`
**Response:** `{ "handled_at": "iso", "reply_status": "replied" }`
**Logic:**
```sql
UPDATE reply_events
SET handled_at = NOW(),
    reply_status = CASE $2
      WHEN 'sent_reply' THEN 'replied'
      WHEN 'marked_interested' THEN 'replied'
      WHEN 'snoozed' THEN 'snoozed'
      WHEN 'archived' THEN 'archived'
    END,
    handled_by_action = $2
WHERE id = $1 AND user_id = $3
RETURNING *;
```
**Side effect:** Emit Socket.io `reply:handled` event.

#### `POST /replies/:id/regenerate-draft`
**Body:** empty
**Response:** `{ "suggested_reply_draft": "..." }`
**Logic:**
1. Fetch reply + lead data
2. Call OpenRouter with prompt: `Given this reply from {business_name}, draft a professional response. Reply: {body_plain}`
3. On success: update `reply_events.suggested_reply_draft` with new text
4. On failure: return 502 with `{ "error": "Draft generation failed" }`
5. **No rate limiting in MVP.** Monitor `/replies/:id/regenerate-draft` usage via logs. If abuse detected, add Redis counter in follow-up sprint.

### 6.3 Pipeline Endpoint Changes

#### `GET /pipeline/leads` (Enhanced)
**Change:** For leads with `status = 'replied'`, join latest `reply_events` row to surface intent, key phrase, read status, and count unhandled replies per lead.

**Response augmentation per lead:**
```json
{
  "latest_reply": {
    "id": "uuid",
    "intent_label": "interested",
    "key_phrase": "what are your rates",
    "read_at": null,
    "reply_status": "new",
    "hot_score": 92,
    "sender_name": "Dave Smith"
  },
  "unread_reply_count": 1,
  "sequence_paused": true
}
```

**Logic (PostgREST-friendly):**
Since PostgREST doesn't support LATERAL joins well, fetch replies in a separate query keyed by lead IDs, then merge client-side OR use a Supabase RPC function.

**Recommended approach:** Add a lightweight RPC function:
```sql
CREATE OR REPLACE FUNCTION get_leads_with_latest_replies(p_user_id UUID)
RETURNS TABLE (...) AS $$
  -- Returns leads + latest_reply JSONB + unread_reply_count INT + sequence_paused BOOL
$$ LANGUAGE sql STABLE;
```

**Alternative (no RPC):** Frontend fetches pipeline leads as-is, then batched-fetches latest replies via `GET /replies?lead_ids=id1,id2,id3&limit=1` — but this adds N+1 risk. **Decision: create RPC function.**

---

## 7. Frontend Specification

### 7.1 Component Map

| Component | Changes |
|---|---|
| `_app.tsx` | Add `<ReplyToastProvider>` as child of layout — mounts `useReplyToast` hook unconditionally |
| `ReplyToastProvider.tsx` | New: subscribes to Socket, renders toasts, tracks `unread_reply_count` in React state exposed via Context |
| `Sidebar.tsx` | Consumes `ReplyToastContext` for badge count instead of polling |
| `PipelineCard.tsx` | Add `isRepliedUrgent` mode: colored border, NEW REPLY badge, intent chip, snippet preview, sender name, sequence paused indicator |
| `PipelineBoard.tsx` | Add sticky unread banner at top; add unread count to "Replied" column header |
| `ReplyDrawer.tsx` | Major refactor: sender header, original email collapsible, editable textarea, copy/regenerate/handled buttons |
| `replies.tsx` | Add reply status badge to table rows; `PATCH /replies/:id/read` on drawer open; show unread count in header |

### 7.2 State Management Architecture

**No Zustand in codebase.** Use React Context for reply-related UI state.

```typescript
// apps/web/src/context/ReplyToastContext.tsx
interface ReplyToastState {
  unreadCount: number;
  recentReplyIds: string[];
  increment: () => void;
  decrement: () => void;
  setCount: (n: number) => void;
  openDrawer: (replyEventId: string) => void;
}
```

**Why Context over `window.dispatchEvent`:**
- Type-safe across components
- Survives Next.js page transitions (no risk of detached listeners)
- Testable without mocking DOM events
- `openDrawer` callback is passed to toast renderer directly

**Socket event → Context update flow:**
```
Socket 'reply:detected'  →  ReplyToastProvider  →  { unreadCount +1, show toast }
                                    ↓
                           Sidebar reads context  →  badge renders N+1
                           PipelineBoard reads context  →  banner renders
                           ReplyDrawer open callback  →  drawer mounts with ID
```

### 7.3 PipelineCard Reply State (Multiple Replies Specified)

**Rule:** PipelineCard always reflects the **latest reply by `received_at`** for that lead. If multiple unhandled replies exist, badge shows count.

```
┌─────────────────────────────────────────────┐
│ ┃                                           │  ← left border = latest intent color (2px)
│ ┃  [2 NEW REPLIES]  City Plumbers London 92🔥│  ← badge shows count if >1
│ ┃  ✉️ Interested · "what are your rates?"   │  ← latest intent chip + latest key_phrase
│ ┃  📧 Dave Smith <dave@...>               │  ← latest sender_name (muted, small)
│ ┃  ⏸ Sequence paused                        │  ← if any enrollment paused for this lead
│ ┃                                           │
│ ┃  [Quick Reply] [Mark Handled]             │  ← action buttons on hover
└─────────────────────────────────────────────┘
```

**States:**
- `latest_reply.reply_status === 'new'` → border + NEW REPLY badge + bold business name
- `latest_reply.reply_status === 'read'` → border only, no badge, normal weight
- `latest_reply.reply_status IN ('replied', 'snoozed', 'archived')` → no border, no badge, faded snippet
- `unread_reply_count > 1` → badge text uses plural: "{N} NEW REPLIES"

### 7.4 ReplyToast Design

```
┌────────────────────────────────────────┐
│ 🔥 City Plumbers London replied        │
│ "what are your rates?" — Interested    │
│ [Open Reply]        [Dismiss]         │
└────────────────────────────────────────┘
```

- Intent color on left accent (4px)
- Auto-dismiss: 10s, pause on hover
- Max 3 stacked, newest on top
- Click outside dismisses all
- **"Open Reply"** calls `openDrawer(replyEventId)` from Context (not `window.dispatchEvent`)

### 7.5 ReplyDrawer Layout

```
┌──────────────────────────────────────────────┐
│ City Plumbers London                    ✕    │
│ Dave Smith <dave@cityplumbers.co.uk> · London│
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ✉️ Interested  🔥92  Urgent  2m ago         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│ [⚠️ Needs Review — 45% confidence]           │
│                                              │
│ ▼ Your Last Email (sent 2 days ago)          │
│   Subject: Quick question about your website │
│   Hi Dave, I noticed...                      │
│                                              │
│ ▲ Their Reply                                │
│   Re: Quick question about your website      │
│   ─────────────────────────────────────      │
│   Sounds good, <mark>what are your rates</mark>?
│                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ 🤖 AI Suggested Reply                        │
│ ┌─────────────────────────────────────────┐  │
│ │ Hi Dave, thanks for getting back...     │  │  ← editable <textarea>
│ │ ...                                     │  │
│ └─────────────────────────────────────────┘  │
│ [Copy] [Regenerate]                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ [Mark as Handled] [Snooze 30d] [Archive]     │
└──────────────────────────────────────────────┘
```

**Failure states:**
- Original email not found → collapsible section shows "No outbound email on record" (not crash)
- Regenerate fails → toast "Could not regenerate draft. Try again later." (button stays enabled)
- Mark Handled fails → toast "Failed to update. Please retry." (revert optimistic UI)

### 7.5a ReplyDrawer Compose Expansion (Gray UI Pattern)

**Goal:** Reduce cognitive load by showing context first, then expanding into compose mode only when the user chooses to reply. Reuses the existing `ReplyDrawer` component — no separate modal.

**Two modes controlled by `composeMode` boolean:**

#### View Mode (default on open)
```
┌──────────────────────────────────────────────┐
│ City Plumbers London                    ✕    │
│ Dave Smith <dave@cityplumbers.co.uk> · London│
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ✉️ Interested  🔥92  Urgent  2m ago         │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                              │
│ ▼ Your Last Email (sent 2 days ago)          │
│   Subject: Quick question about your website │
│   Hi Dave, I noticed...                      │
│                                              │
│ ▲ Their Reply                                │
│   Re: Quick question about your website      │
│   ─────────────────────────────────────      │
│   Sounds good, <mark>what are your rates</mark>?
│                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ [📝 Reply to this email]                     │  ← primary CTA, prominent
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ [Mark as Handled] [Snooze 30d] [Archive]     │
└──────────────────────────────────────────────┘
  width: max-w-lg (512px)
```

- AI draft textarea is **hidden** in view mode
- "Reply to this email" is the single primary action
- User reads full context (original + reply + intent) before deciding to compose

#### Compose Mode (triggered by CTA)
```
┌──────────────────────────────────────────────────────────┐
│ City Plumbers London                              ✕      │
│ Dave Smith <dave@cityplumbers.co.uk> · London            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ✉️ Interested  🔥92  Urgent  2m ago                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                          │
│ ▼ Your Last Email (sent 2 days ago)                      │
│   Subject: Quick question about your website               │
│   Hi Dave, I noticed...                                  │
│                                                          │
│ ▲ Their Reply                                            │
│   Re: Quick question about your website                  │
│   ─────────────────────────────────────                  │
│   Sounds good, what are your rates?                      │
│                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ ✉️ Compose Reply                                         │
│   To:    dave@cityplumbers.co.uk                         │
│   Subj:  Re: Quick question about your website           │
│   ┌─────────────────────────────────────────────────┐    │
│   │ Hi Dave, thanks for getting back to us...       │    │  ← editable <textarea>
│   │ ...                                               │    │
│   └─────────────────────────────────────────────────┘    │
│   [Copy] [Regenerate]                                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│ [Log as Sent]  [Open in Mail]                            │  ← mailto: + logEmailSent
│ [Mark as Handled] [Snooze 30d] [Archive]                 │
└──────────────────────────────────────────────────────────┘
  width: max-w-2xl (672px), smooth transition 200ms
```

**Implementation notes:**
- Drawer width transitions via CSS `transition: width 200ms ease` + Tailwind `data-[compose=true]:max-w-2xl`
- `To:` and `Subject:` are read-only fields showing recipient + `Re: {original_subject}`
- Textarea pre-filled with existing `suggested_reply_draft` from API
- "Log as Sent" reuses existing `POST /email-activity/log` endpoint (same as `ComposeModal`)
- "Open in Mail" generates `mailto:` link with pre-filled subject + body (same as `ComposeModal`)
- Compose mode can be collapsed back to view mode via a "← Back" chevron in the header
- No new backend endpoints required

**Fallback:** If animation or width transition causes layout jank on mobile, compose fields render inline below the reply without width change (drawer stays full-width on mobile regardless).

### 7.6 Sticky Banner (Socket Fallback)

```
┌──────────────────────────────────────────────────────────────┐
│ 🔥 3 unread replies waiting    [View Replies]  [× Dismiss]  │  ← amber bg, fixed below topbar
└──────────────────────────────────────────────────────────────┘
```

- Visible when `unreadCount > 0` AND user is on `/pipeline` page
- Dismissed state stored in `sessionStorage` (survives refresh but not new session)
- Clicking "View Replies" navigates to `/replies`
- Auto-reappears if new reply arrives while dismissed (Socket event resets dismiss)

---

## 8. Socket.io Wiring

### 8.1 Backend (Verify Existing)

`handleInboundReply.ts` line 381-394 emits via `emitReplyNotification()` → Socket.io `reply:detected` event.

**Verify:** `io.to(user:${userId}).emit('reply:detected', payload)` fires after DB commit.

**New events to add:**
- `reply:read` — emitted by `PATCH /replies/:id/read` handler
- `reply:handled` — emitted by `POST /replies/:id/handled` handler

Both decrement client's `unreadCount` immediately.

### 8.2 Frontend Provider

New file: `apps/web/src/components/replies/ReplyToastProvider.tsx`

```typescript
'use client';
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { toast } from 'sonner';
import { useRealtimeSocket } from '@/lib/socket';

interface ReplyToastContextValue {
  unreadCount: number;
  openDrawer: (replyEventId: string) => void;
  markRead: () => void;
  markHandled: () => void;
}

const ReplyToastContext = createContext<ReplyToastContextValue | null>(null);

export function ReplyToastProvider({ children, onOpenDrawer }: { children: ReactNode; onOpenDrawer: (id: string) => void }) {
  const [unreadCount, setUnreadCount] = useState(0);

  // Fetch initial count on mount
  useEffect(() => {
    fetch(`${API_BASE}/replies/unread-count`, { headers: await fetchAuthHeaders() })
      .then(r => r.json())
      .then(j => setUnreadCount(j.count ?? 0));
  }, []);

  const openDrawer = useCallback((id: string) => {
    onOpenDrawer(id);
  }, [onOpenDrawer]);

  const { connected } = useRealtimeSocket((data) => {
    // Increment badge
    setUnreadCount(c => c + 1);
    // Show toast
    const t = toast(/* ... toast JSX with openDrawer callback ... */);
  });

  // Listen for read/handled events from other components to decrement
  useEffect(() => {
    const handler = () => setUnreadCount(c => Math.max(0, c - 1));
    window.addEventListener('reply:marked-read', handler);
    window.addEventListener('reply:marked-handled', handler);
    return () => {
      window.removeEventListener('reply:marked-read', handler);
      window.removeEventListener('reply:marked-handled', handler);
    };
  }, []);

  return (
    <ReplyToastContext.Provider value={{ unreadCount, openDrawer, markRead: () => setUnreadCount(c => Math.max(0, c - 1)), markHandled: () => setUnreadCount(c => Math.max(0, c - 1)) }}>
      {children}
    </ReplyToastContext.Provider>
  );
}

export function useReplyToastContext() {
  const ctx = useContext(ReplyToastContext);
  if (!ctx) throw new Error('useReplyToastContext must be inside ReplyToastProvider');
  return ctx;
}
```

**Mount in `_app.tsx`:**
```tsx
// apps/web/src/pages/_app.tsx
import { ReplyToastProvider } from '@/components/replies/ReplyToastProvider';

function MyApp({ Component, pageProps }) {
  const [drawerReplyId, setDrawerReplyId] = useState<string | null>(null);

  return (
    <ReplyToastProvider onOpenDrawer={(id) => setDrawerReplyId(id)}>
      {/* existing layout */}
      <ReplyDrawer isOpen={!!drawerReplyId} replyId={drawerReplyId} onClose={() => setDrawerReplyId(null)} />
    </ReplyToastProvider>
  );
}
```

**Note:** `useReplyToast` hook is **never called conditionally** — it lives inside `ReplyToastProvider` which is always rendered. The Rules of Hooks are satisfied.

---

## 9. Implementation Order

### Day 1 — Backend
1. **Migration** — run `010_reply_enhancement.sql`
2. **RPC function** — `get_leads_with_latest_replies()` for PipelineCard data
3. **API endpoints:**
   - `GET /replies/unread-count`
   - Enhanced `GET /replies/:id` with original email join
   - `PATCH /replies/:id/read` (+ emit `reply:read` Socket event)
   - `POST /replies/:id/handled` (+ emit `reply:handled` Socket event)
   - `POST /replies/:id/regenerate-draft`
4. **Inngest handler update** — populate `sender_name` from email headers; set `reply_status = 'new'` on insert
5. **Socket server verify** — confirm `reply:detected` emits after DB commit; add `reply:read` and `reply:handled` emits

### Day 2 — Frontend (Core)
1. **ReplyToastProvider** — Context + Socket subscription + toast rendering
2. **Mount in `_app.tsx`** — wire Provider around layout, pass `setDrawerReplyId` callback
3. **Sidebar badge** — consume Context, render badge
4. **Pipeline sticky banner** — consume Context, render on `/pipeline`

### Day 3 — Frontend (Pipeline + Drawer)
1. **PipelineCard** — `isRepliedUrgent` styling block with multiple-reply handling
2. **PipelineBoard** — unread count in "Replied" column header; integrate RPC data
3. **ReplyDrawer** — sender header, original email collapsible, editable textarea, copy/regenerate/handled buttons
4. **replies.tsx** — status badge column; `PATCH /replies/:id/read` on drawer open
5. **ReplyDrawer Compose Expansion (Gray UI Pattern)** — see §7.4 below. Optional enhancement shipped with Day 3 if time allows; falls back to always-visible textarea if not.

### Day 4 — Polish + Testing
1. **Negative path testing** (see Section 10)
2. **Socket disconnect fallback** — verify banner appears when Socket down
3. **Responsive mobile** — toast position, drawer width, card snippet truncation
4. **Copy button** — test clipboard API fallback for older browsers

---

## 10. Testing Checklist

### Happy Path
- [ ] Migration applies cleanly in local Supabase
- [ ] `GET /replies/unread-count` returns correct count
- [ ] `GET /replies/:id` includes `original_email` when step execution exists
- [ ] `GET /replies/:id` returns `original_email: null` gracefully when no step found
- [ ] `PATCH /replies/:id/read` updates `read_at` + `reply_status`, emits Socket `reply:read`
- [ ] `POST /replies/:id/handled` with each action value updates correctly, emits Socket `reply:handled`
- [ ] Inbound reply via Mailgun webhook sets `reply_status = 'new'` and `sender_name` populated
- [ ] Socket toast fires when simulated reply arrives (test via `reply:detected` event)
- [ ] Toast CTA opens ReplyDrawer with correct reply
- [ ] Sidebar badge increments on Socket event, decrements on mark-read
- [ ] Pipeline sticky banner appears when `unreadCount > 0`, hides at 0
- [ ] PipelineCard shows colored border for `new` reply, loses border after "Mark Handled"
- [ ] PipelineCard shows "3 NEW REPLIES" badge when multiple unhandled replies exist
- [ ] ReplyDrawer shows original sent email collapsible
- [ ] ReplyDrawer opens in view mode (textarea hidden, "Reply to this email" CTA visible)
- [ ] Clicking "Reply to this email" expands drawer to compose mode (width increases, subject/to fields appear)
- [ ] Compose mode pre-fills textarea with existing AI draft
- [ ] "Open in Mail" generates correct mailto: link with subject + body
- [ ] "Log as Sent" calls `POST /email-activity/log` with correct payload
- [ ] Collapsing compose mode returns to view mode without losing draft edits
- [ ] Editable draft can be copied to clipboard
- [ ] Regenerate button fetches new draft and updates textarea
- [ ] Mark Handled button clears urgency and updates status

### Negative / Failure Paths
- [ ] **Socket disconnected:** sticky banner still surfaces unread count on page load (fallback to initial fetch)
- [ ] **Original email not found:** ReplyDrawer shows "No outbound email on record" without crashing
- [ ] **Regenerate-draft fails (OpenRouter 502):** button shows error toast, keeps existing draft in textarea
- [ ] **Regenerate-draft fails (network offline):** toast shows "Network error — check connection"
- [ ] **Mark Handled fails (API 500):** optimistic UI reverts, toast shows "Failed to update. Retry?"
- [ ] **Multiple tabs open:** marking read in Tab A updates badge in Tab B via Socket broadcast
- [ ] **Rapid multiple replies arrive:** toasts stack max 3, oldest auto-dismisses; badge shows correct total
- [ ] **Lead with `status='replied'` but no reply_events row:** PipelineCard falls back to old style (no crash)
- [ ] **Mobile viewport:** toast positions bottom-center, drawer is full-width, snippet truncates correctly
- [ ] **SSR hydration:** `_app.tsx` mounts ReplyToastProvider only on client (Next.js Pages Router safe)

---

## 11. Rollback Plan

- Schema migration is additive only (new nullable columns) — safe to ignore new fields if frontend reverted
- API endpoints are new routes — no breaking changes to existing
- Frontend changes are additive styling — PipelineCard falls back to old style if `latest_reply` is null
- `ReplyToastProvider` can be removed from `_app.tsx` in one line; all child components gracefully handle missing Context (return null for badge, no-op for banner)
- If Socket toast is noisy, set `showToasts: false` in Context default props (no rebuild required)

---

## 12. Decisions Log

| # | Decision | Rationale |
|---|---|---|
| 1 | No Zustand — use React Context | Zustand is not in the codebase. Context is sufficient for a single reactive value (`unreadCount`) + one callback (`openDrawer`). |
| 2 | Postgres confirmed, not SQLite | `drizzle.config.ts` uses `dialect: 'postgresql'`. All `reply_events` queries use `supabaseAdmin`. Migration syntax is valid. |
| 3 | Latest reply intent wins on Kanban card | Simplest rule. Count badge handles multiple replies. User opens drawer to see full thread. |
| 4 | Clicking Replies nav does NOT mark all read | Prevents accidental bulk marking. User explicitly handles per-reply. |
| 5 | No `'drafted'` in `reply_status` enum | No user story triggers this state. Add later if "draft without sending" becomes a feature. |
| 6 | Mark Handled does NOT auto-move pipeline stage | Keeps reply handling (transient) separate from pipeline stage (persistent). Offer "Move to Interested" as secondary CTA. |
| 7 | No rate limiting on regenerate-draft in MVP | Monitor via logs first. Gate later if OpenRouter costs spike. |
| 8 | `window.dispatchEvent` rejected in favor of Context | SSR-safe, type-safe, survives Next.js page transitions, testable without DOM mocking. |
| 9 | Sticky banner added as Socket fallback | Toast is single point of failure if user is away or Socket down. Banner provides ambient awareness on Pipeline page. |
| 10 | Gray UI compose expansion pattern adopted for ReplyDrawer | View-first pattern reduces cognitive load; reuses existing drawer + mailto:/logEmailSent flows; no new backend. Falls back to always-visible textarea if animation jank. |

---

*Prepared for LeadGen App — Revision 2*
*Schema verified: PostgreSQL via Supabase. No Zustand in codebase. Socket.io server exists but frontend subscription unmounted.*
