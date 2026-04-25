# PRD: LeadQuickDrawer v2 — Integrated Action Drawer

**Status**: Draft  
**Author**: Nirav + AI  
**Date**: 2026-04-25  
**Scope**: Pipeline page side-drawer redesign  
**Dependencies**: Existing `MessagePicker` (WhatsApp/SMS), `api.messagePicker` endpoints

---

## 1. Overview

Transform the current `LeadQuickDrawer` from a **read-only deal/follow-up panel** into an **action hub** where users can view lead intel, update deal value, set follow-ups, and compose messages — all without leaving the pipeline board.

### Goals
- Reduce context-switching: every action on a lead happens in one drawer
- Surface SMS/WhatsApp templates (already built) inline instead of in a separate modal
- Add Email as a first-class channel alongside SMS/WhatsApp
- Preserve all existing functionality (deal value, follow-up quick-set pills, health indicator)

### Non-Goals
- Replacing the full Lead Detail page — this is a **quick-action** drawer, not a full CRM record
- Building backend WhatsApp/SMS send logic — already exists
- Replacing the `FollowUpModal` bulk action — modal stays for multi-select bulk operations

---

## 2. Current State

| Component | Location | Purpose |
|---|---|---|
| `LeadQuickDrawer` | `components/pipeline/LeadQuickDrawer.tsx` | Side drawer: header, deal value input, follow-up date + quick pills |
| `MessagePicker` | `components/leads/MessagePicker.tsx` | Modal: template list, custom message, WhatsApp/SMS send with quota |
| `MessagePickerModal` | `pages/leads/index.tsx` (lines 720–850) | Simpler inline modal for WhatsApp/SMS in leads table |
| `api.messagePicker` | `lib/api.ts` | `get(leadId)`, `send({leadId, channel, message, templateId})`, `saveTemplate()` |

**Gap**: No email sending API exists. `messagePicker.send` only handles `"whatsapp"` and `"sms"`.

---

## 3. Proposed Drawer Layout

The drawer is a **right-side slide-out panel** (`max-w-md`, `w-full`, `h-full`) with three stacked sections separated by subtle dividers.

```
┌──────────────────────────────────────────────┐
│ ✕  Manchester Plumbing Supplies Ltd   [×]    │ ← Header (fixed)
│    CONTACTED                                 │
├──────────────────────────────────────────────┤
│ 🔥 Hot Score 85                              │
│ 📞 +44 161 203 6060                          │ ← Section 1: Lead Info
│ 📍 Manchester, GB                            │
│ ⭐ 4.9 (87 reviews)                          │
│ 🏷️ Plumbing                                 │
│ 📅 Added 4/15/2026                           │
├──────────────────────────────────────────────┤
│ £ Deal value  [ £ 0.00             ]       │
│ Follow-up     [ 27/04/2026  📅 ]  ● On track │ ← Section 2: Deal & Follow-up
│ [Tomorrow] [3d] [1w] [2w]                    │
├──────────────────────────────────────────────┤
│ 💬 Message                                   │ ← Section 3: Composer
│ ┌──────────────────────────────────────────┐ │
│ │ [Email●] [SMS] [WhatsApp]  From: [You ▼] │ │ ← Channel toggle
│ │ To: manchester@plumbing.com              │ │
│ │ ┌────────────────────────────────────┐   │ │
│ │ │ Hi {name}, ...                   │   │ │ ← Textarea
│ │ │                                    │   │ │
│ │ └────────────────────────────────────┘   │ │
│ │ [Templates ▼]         [Cancel] [Send→] │ │ ← Actions
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

(● = active channel)

---

## 4. Section Specifications

### 4.1 Header (existing, minor additions)

**Position**: Fixed at top of drawer, `p-5`, `border-b border-border`.

**Left side**:
- `business_name` — `text-sm font-semibold text-text`
- `email || phone || "No contact"` — `text-xs text-text-muted mt-0.5`

**Right side** (NEW):
- Status badge: `lead.stage` rendered as a `StatusBadge` component (same as pipeline cards)
- If `unreadReplyCount > 0`: red pulse dot + count badge

**Close button**: `×` icon, top-right.

### 4.2 Section 1 — Lead Intelligence

**Content** (stacked vertically, `space-y-2`, `p-5`):

| Row | Icon | Content | Style |
|---|---|---|---|
| Hot Score | `Flame` (lucide) | `Hot Score {lead.score ?? "N/A"}` | `text-sm font-medium text-warning` |
| Phone | `Phone` | `{lead.phone || "—"}` | `text-sm text-text` |
| Location | `MapPin` | `{lead.city}, {lead.country}` | `text-sm text-text` |
| Rating | `Star` | `{lead.rating} ({lead.reviewCount} reviews)` | `text-sm text-text` |
| Category | `Tag` | `{lead.category}` as pill badge | `text-xs bg-surface-2 border border-border px-2 py-0.5 rounded-full` |
| Added | `Calendar` | `Added {formatDate(lead.createdAt)}` | `text-xs text-text-muted` |

**Click behavior**: Phone number → `tel:` link. Email → `mailto:` link. Location → Google Maps search link.

### 4.3 Section 2 — Deal Value & Follow-up

**Existing behavior preserved**:
- Deal value input with `£` prefix, `onBlur` auto-save via `onUpdate`
- Follow-up date input (`type="date"`), `onBlur` auto-save
- Health indicator: red/amber/green dot + label ("Overdue" / "Due today" / "On track" / "No follow-up")
- Quick-set pill buttons: Tomorrow, 3 days, 1 week, 2 weeks — each calls `onUpdate({ followUpDate })` immediately

**Visual polish**:
- Wrap in a subtle card: `bg-surface-2/50 rounded-lg p-4 border border-border/40`
- Health dot uses `w-2 h-2 rounded-full` with `bg-destructive` / `bg-warning` / `bg-success`

### 4.4 Section 3 — Message Composer (NEW)

**Default state**: **Collapsed**. Shows a single bar:
```
┌──────────────────────────────────────────────┐
│ 💬 Send message…              [Email] [SMS] [W]│
└──────────────────────────────────────────────┘
```
- Bar: `bg-surface-2 rounded-lg border border-border/60 px-3 py-2.5 flex items-center justify-between cursor-pointer hover:border-border transition-colors`
- Left: `MessageSquare` icon + "Send message…" `text-sm text-text-muted`
- Right: three mini channel badges (inactive: `text-text-faint`, active: `text-blue`)
- **Click anywhere on bar** → expands to full composer

**Expanded composer**:

#### Channel Toggle
- Three tabs: `Email` | `SMS` | `WhatsApp`
- Active tab: `bg-primary text-primary-foreground px-3 py-1 rounded-md text-xs font-medium`
- Inactive tab: `text-text-muted hover:text-text px-3 py-1 text-xs`
- **Email** is default active channel

#### From / To Row
- **From**: dropdown showing current user/workspace email. For MVP, static text: "From: {userEmail}" with no dropdown.
- **To**: auto-populated from `lead.email`. If no email, show "No email address" in `text-text-faint`.
- Only shown for **Email** channel. For SMS/WhatsApp, show phone number instead.

#### Message Textarea
- `textarea` with `h-32`, `resize-none`
- Placeholder: `"Hi {name}, I noticed your {rating}-rated {category} business..."` (context-aware)
- Supports `{name}`, `{rating}`, `{category}` substitution on send
- Character counter: bottom-right, `text-xs text-text-faint`

#### Templates Dropdown (NEW for Email, EXISTING for SMS/WhatsApp)
- `Templates ▼` button left of action buttons
- For **Email**: fetch email templates (new API — see Section 6). Show as dropdown list. Selecting a template populates the textarea.
- For **SMS/WhatsApp**: reuse existing `MessagePicker` template fetch via `api.messagePicker.get(leadId)`. Selecting a template populates the textarea.

#### Action Buttons
- **Cancel**: `text-sm text-text-muted hover:text-text px-3 py-2` — collapses composer, clears draft
- **Send**: `btn btn-primary text-sm px-4 py-2 inline-flex items-center gap-2`
  - Email: `Send` with `Send` icon (lucide)
  - SMS: `Send SMS` with `MessageSquare` icon
  - WhatsApp: `Send WhatsApp` with green styling
- Disabled states: no recipient, empty message, quota exceeded

---

## 5. Channel-Specific Behavior

### Email Channel
- **Recipient**: `lead.email`
- **API**: `POST /emails/send` (NEW — see Section 6)
- **Templates**: Fetch from `GET /email-templates` (NEW)
- **Validation**: requires `lead.email` to be present
- **Send action**: API call, then toast success, keep drawer open

### SMS Channel
- **Recipient**: `lead.phone` or `lead.contact_phone`
- **API**: `api.messagePicker.send({ channel: "sms", ... })` — **EXISTS**
- **Templates**: `api.messagePicker.get(leadId)` returns SMS/WhatsApp templates — **EXISTS**
- **Validation**: requires phone number, opens native SMS app via `sms:` URL scheme
- **Quota**: displayed below textarea (`{used}/{limit} sends today`)

### WhatsApp Channel
- **Recipient**: `lead.phone` (normalized with `44` prefix if needed)
- **API**: `api.messagePicker.send({ channel: "whatsapp", ... })` — **EXISTS**
- **Templates**: same as SMS — **EXISTS**
- **Validation**: requires phone number, opens WhatsApp web/app via `https://wa.me/` URL
- **Quota**: same as SMS

### Disabled Channels
- If `lead.email` is missing → Email tab disabled with tooltip "No email address"
- If `lead.phone` is missing → SMS and WhatsApp tabs disabled with tooltip "No phone number"
- If daily quota exceeded → SMS/WhatsApp tabs disabled with tooltip "Daily quota reached"

---

## 6. API Requirements

### 6.1 Existing (No Changes)

```
GET   /message-picker?leadId={id}      → templates, quota, lead
POST  /message-picker/send             → {leadId, channel, message, templateId?}
POST  /message-picker/templates        → {name, message}
```

### 6.2 New Endpoints Required

**Email templates list**:
```
GET /email-templates
Response: { templates: { id, name, subject, body }[] }
```

**Email send**:
```
POST /emails/send
Body: { leadId: string, subject: string, body: string, templateId?: string }
Response: { success: boolean, messageId?: string }
```

> **Backend owner**: needs to be created by backend team or in a separate backend PR. This PRD assumes these endpoints exist; if not, Email channel ships as "Coming soon" disabled state.

### 6.3 Frontend API Client Additions

Add to `lib/api.ts`:

```ts
emails: {
  templates: () => request<{ templates: { id: string; name: string; subject: string; body: string }[] }>("/email-templates"),
  send: (data: { leadId: string; subject: string; body: string; templateId?: string }) =>
    request<{ success: boolean; messageId?: string }>("/emails/send", { method: "POST", body: JSON.stringify(data) }),
}
```

---

## 7. State Management

The drawer is a **controlled component** — state lives in the parent (`pages/pipeline/index.tsx`).

### Props Interface (updated)

```ts
interface LeadQuickDrawerProps {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (id: string, data: Record<string, unknown>) => Promise<void>;
  // NEW:
  userEmail?: string;           // for "From" field
  unreadCount?: number;        // for header badge
}
```

### Internal State (LeadQuickDrawer)

```ts
const [composerExpanded, setComposerExpanded] = useState(false);
const [activeChannel, setActiveChannel] = useState<"email" | "sms" | "whatsapp">("email");
const [message, setMessage] = useState("");
const [subject, setSubject] = useState("");        // email only
const [templates, setTemplates] = useState<any[]>([]);
const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
const [sending, setSending] = useState(false);
const [quota, setQuota] = useState({ used: 0, limit: 0 });
```

### Reset Behavior

On `isOpen` change to `true`:
- Reset composer to collapsed
- Reset message/subject to empty
- Reset channel to "email"
- Fetch templates for active channel

On `lead` change:
- Reset all composer state
- If lead has `email` → default to Email
- Else if lead has `phone` → default to WhatsApp
- Else → all channels disabled

On `onClose`:
- Clear draft message (or prompt "Discard draft?" if non-empty — **MVP: auto-discard**)

---

## 8. Component Architecture

### Option A: Monolithic Drawer (MVP)

All logic in `LeadQuickDrawer.tsx`. ~400 lines. Fastest to implement.

### Option B: Sub-Components (Recommended)

Extract for testability and future reuse:

```
components/pipeline/
  LeadQuickDrawer.tsx          — shell + layout + state orchestration
  LeadQuickDrawerHeader.tsx    — business name, status, close
  LeadInfoSection.tsx            — score, phone, location, etc.
  DealFollowUpSection.tsx        — deal value, date, quick pills
  MessageComposer.tsx            — channel toggle, textarea, templates, send
    ChannelToggle.tsx            — Email/SMS/WhatsApp tabs
    TemplateDropdown.tsx         — template selector (reused from MessagePicker logic)
    MessageTextarea.tsx          — textarea + character count
```

**Decision**: Start with **Option A** (monolithic). Extract sub-components in a follow-up refactor PR once behavior is stable.

---

## 9. Reuse Strategy

### What to Reuse

| Source | What | How |
|---|---|---|
| `MessagePicker.tsx` | Template fetch logic, personalization (`{name}`, `{rating}`, `{category}`), quota display | Copy/adapt logic into drawer composer section |
| `MessagePickerModal` (leads page) | Simpler template + send flow | Reference for SMS/WhatsApp send UX |
| `InlineEdit` (lead detail page) | Deal value editing pattern | Already used in drawer — keep |

### What NOT to Reuse

- **Do NOT** try to render `MessagePicker` inside the drawer — it's a modal component with its own overlay, portal, and header. Extract the logic, not the component.
- **Do NOT** reuse the lead detail page's full composer — it's page-level, not drawer-sized.

---

## 10. Design Tokens

Use existing design system:

| Token | Usage |
|---|---|
| `bg-surface` | Drawer background |
| `bg-surface-2` | Input backgrounds, collapsed composer bar |
| `border-border` / `border-border/40` | Dividers, card borders |
| `text-text` | Primary text |
| `text-text-muted` | Secondary text, placeholders |
| `text-text-faint` | Tertiary text, disabled states |
| `text-warning` | Hot score, amber health |
| `text-destructive` / `bg-destructive` | Red health, errors |
| `text-success` / `bg-success` | Green health, success states |
| `text-blue` | Active states, links |
| `text-green` | WhatsApp branding |
| `btn btn-primary` | Send button |
| `input` | Text inputs, date picker |
| `rounded-lg` | Cards, inputs |
| `text-xs` / `text-sm` | Body text hierarchy |

---

## 11. Edge Cases

| Case | Behavior |
|---|---|
| No email + no phone | Composer section hidden entirely. Show "No contact info" text. |
| Draft message + close drawer | Discard without prompt (MVP). Future: confirmation dialog. |
| Send fails | Show inline error below composer. Keep draft. |
| Template fetch fails | Show "Failed to load templates" with retry button. Allow free-text send. |
| User switches channel mid-draft | **Clear draft** (templates differ per channel). Future: per-channel draft persistence. |
| Lead updated externally while drawer open | Drawer stays with stale data. Close + reopen to refresh. (Standard pattern.) |

---

## 12. Keyboard Navigation

Part of the **lost features recovery** (separate from this PRD but should not conflict):

- `Enter` on focused card → opens drawer with **composer collapsed**
- `Esc` inside drawer → close drawer
- `Tab` cycles through: close button → deal value → follow-up date → quick pills → composer bar → (if expanded) channel tabs → textarea → templates → cancel → send
- Arrow keys for channel tab switching when composer focused

---

## 13. Acceptance Criteria

### Must-Have (MVP)

- [ ] Drawer shows Lead Info section with all 6 rows (score, phone, location, rating, category, added date)
- [ ] Deal value and follow-up sections work identically to current drawer (auto-save, quick pills, health)
- [ ] Composer section is **collapsed by default**
- [ ] Clicking collapsed bar expands full composer
- [ ] Channel toggle shows Email/SMS/WhatsApp with Email as default
- [ ] Email channel: textarea + subject line + templates dropdown + send button
- [ ] SMS/WhatsApp channel: reuses existing `api.messagePicker` template fetch and send
- [ ] Disabled channels when lead lacks contact info
- [ ] Cancel button collapses composer and clears draft
- [ ] Send button triggers correct API per channel
- [ ] Send success shows toast, keeps drawer open
- [ ] No visual regressions on pipeline board (health strip, filters, search, modals all still work)

### Should-Have (v2)

- [ ] Email backend endpoints (`/email-templates`, `/emails/send`) integrated
- [ ] Per-channel draft persistence (switching channels doesn't clear draft)
- [ ] "Discard draft?" confirmation on close
- [ ] AI compose shortcut (`/ai` or button) that calls LLM to draft message
- [ ] Read receipts / send status indicator in drawer

### Nice-to-Have

- [ ] Email template creation inline (save draft as template)
- [ ] Scheduled send ("Send now" vs "Send tomorrow 9am")
- [ ] Attachment support for email

---

## 14. Dependencies & Risks

| Dependency | Risk | Mitigation |
|---|---|---|
| Email backend API doesn't exist | Email channel can't send | Ship Email channel as disabled/"Coming soon" with tooltip |
| `MessagePicker` template fetch fails | SMS/WhatsApp composer broken | Graceful fallback to free-text compose |
| Drawer height overflows on small screens | Bad UX on laptops | Ensure sections are scrollable, composer starts collapsed |
| Lead object missing `score`, `reviewCount` | Hot Score row empty | Show "N/A" or hide row conditionally |

---

## 15. Open Questions

1. **Email subject line**: auto-generated from template or manual input? (PRD assumes manual)
2. **Email "From" address**: static user email, or workspace-level config with dropdown?
3. **SMS/WhatsApp quota display**: show in collapsed bar or only in expanded composer?
4. **Template sharing**: should email templates and SMS/WhatsApp templates be the same table or separate?
5. **Send button color**: primary blue for all channels, or channel-branded colors (green for WhatsApp, etc.)?

---

## 16. Implementation Order

1. **Lead Info section** (Section 4.1–4.2) — additive, no risk
2. **Deal/Follow-up visual polish** (card wrapper, health dot) — cosmetic
3. **Composer shell** (collapsed bar + expand/collapse) — new state
4. **Channel toggle UI** (tabs, disabled states) — no API calls yet
5. **SMS/WhatsApp integration** (template fetch, send) — reuse existing `MessagePicker` logic
6. **Email integration** (templates, send) — blocked on backend or ship disabled
7. **Keyboard nav wiring** — integrate with existing `Enter` to open drawer

---

**End of PRD**
