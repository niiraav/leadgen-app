# Smoke Test Script — Accessibility & Interaction Cross-Page Pass

**Scope:** Verify Phase 0–9 a11y/interaction fixes do not introduce regressions.
**Time budget:** 15–20 minutes.
**Tools:** Chrome DevTools (Device Mode), Keyboard, macOS VoiceOver (or NVDA on Win).

---

## 0. Pre-Test Setup

1. Open `https://leadgen-app-web.vercel.app` (or local `http://localhost:3000`).
2. Log in with smoke credentials: `smoke-2026@leadgenapp.com` / `Sm0keTest!2026`
3. DevTools → Console: clear errors. Keep console open during test.
4. DevTools → Network: disable cache.

---

## 1. Overlay Lifecycle — Focus Traps, Scroll Lock, Escape, Return Focus

**Risk:** focus-trap-react + useScrollLock + useEscapeKey may fail to clean up on close, leaving page unscrollable or focus trapped.

### 1A. LogReplyModal (Replies page)
1. Go to `/replies`
2. Click any reply card → LogReplyModal opens
3. **Scroll lock:** Try scrolling the background page with mousewheel / trackpad → background MUST NOT scroll
4. **Focus trap:** Press Tab repeatedly → focus MUST cycle inside modal only (subject input → body textarea → close button → back to subject)
5. **Escape:** Press Esc → modal closes, background scrolls again
6. **Return focus:** Press Tab once → focus MUST land on the reply card trigger that opened the modal (not random element)
7. Repeat with keyboard: Tab to reply card, Enter to open, Esc to close

### 1B. LeadQuickDrawer (Leads page)
1. Go to `/leads`
2. Click any lead row → LeadQuickDrawer slides in from right
3. **Scroll lock:** Background MUST NOT scroll
4. **Focus trap:** Tab cycles inside drawer only (name → email → copy buttons → tabs → close)
5. **Escape:** Esc closes drawer, background scrolls
6. **Return focus:** Tab after close → focus on the row that opened it

### 1C. ReplyDrawer (Replies page)
1. Go to `/replies`
2. Click "Reply" button on any reply card → ReplyDrawer opens
3. Repeat scroll/focus/Escape/return-focus checks from 1B

### 1D. OnboardingModal
1. If onboarding modal is suppressed, trigger it via URL param: `?onboarding=1` or clear `has_seen_onboarding` in localStorage and refresh
2. Repeat scroll/focus/Escape/return-focus checks
3. **Dismiss via backdrop:** Click grey backdrop → modal closes (if configured)

### 1E. Bottom Nav "More" Menu (Mobile)
1. DevTools → Device Mode → iPhone SE
2. Tap hamburger / "More" button in bottom nav
3. Menu opens as overlay
4. **Scroll lock:** Page MUST NOT scroll behind menu
5. **Focus trap:** Tab cycles inside menu only
6. **Escape:** Esc closes menu
7. **Return focus:** Tap after close → focus back on More button

### 1F. LossReasonModal / FollowUpModal / BulkLossModal / BulkFollowUpModal
1. Go to `/pipeline`
2. Drag a card to "Lost" column → LossReasonModal opens
3. Repeat scroll/focus/Escape/return-focus checks
4. Select a card → click "Set Follow Up" → FollowUpModal opens → repeat
5. Bulk select 2+ cards → "Bulk Mark Lost" → BulkLossModal → repeat
6. Bulk select → "Bulk Follow Up" → BulkFollowUpModal → repeat

**Pass criteria:**
- [ ] All modals/drawers lock background scroll when open
- [ ] All modals/drawers trap focus internally
- [ ] Escape closes every overlay
- [ ] Focus returns to trigger element after close
- [ ] No console errors during any open/close cycle

---

## 2. Mobile Viewport — h-dvh Regression

**Risk:** h-screen → h-dvh change could cause layout collapse, double scrollbars, or content hidden behind mobile browser chrome.

### 2A. Login Page
1. DevTools → iPhone SE (375 × 667)
2. Go to `/auth/login` (log out if needed)
3. **Layout:** Page fills viewport exactly. No white gap at bottom. No double scrollbar.
4. **Content:** Email + password inputs + submit button + "Sign up" link all visible without scrolling.
5. **Keyboard:** Tap email input → software keyboard opens. Page MUST NOT jump/zoom unexpectedly. Submit button MUST remain reachable (scroll if needed, but no overflow:hidden trapping).

### 2B. Dashboard
1. Log in, go to `/dashboard` on iPhone SE
2. **Layout:** Dashboard cards visible. No horizontal scroll.
3. **Bottom nav:** Bottom nav sticks to viewport bottom, not page bottom.
4. **Scroll:** Vertical scroll works smoothly. No stuck scroll (indicates scroll lock leak).

### 2C. Leads Table
1. Go to `/leads` on iPhone SE
2. **Table:** Table scrolls horizontally if needed, but no page-level horizontal scroll.
3. **Drawer:** Open LeadQuickDrawer → drawer slides in, background locks → close → scroll works.

### 2D. Pipeline Board
1. Go to `/pipeline` on iPhone SE
2. **Board:** Board scrolls horizontally. Page does NOT scroll vertically (board takes full height).
3. **Drag:** Touch-drag a card. Card follows finger. Drop works.

**Pass criteria:**
- [ ] No white gaps at viewport bottom on any page
- [ ] No double scrollbars
- [ ] Software keyboard does not break layout
- [ ] Bottom nav stays at viewport bottom, not content bottom
- [ ] Horizontal scroll only where intended (table, pipeline), never page-level

---

## 3. Keyboard Navigation — Focus Rings & Tab Order

**Risk:** focus-visible styles missing, illogical tab order, skip-to-content broken.

### 3A. Login Page
1. Go to `/auth/login`
2. Press Tab → focus lands on **"Skip to content"** link (top-left, may be visually hidden until focused)
3. Press Enter on "Skip to content" → focus jumps to `<main id="main-content">`
4. Tab through: Email input → Password input → Show/hide password button → Submit → "Sign up" link
5. **Focus rings:** Every element MUST have visible focus ring (2px accent-coloured outline). No invisible focus.

### 3B. Dashboard
1. Go to `/dashboard`
2. Tab → "Skip to content" appears. Enter → jumps to main.
3. Tab through nav items (sidebar on desktop, top bar items). Each MUST show focus ring.
4. Tab to any card or button. Focus ring visible.
5. **Icon-only buttons:** Tab to notification bell, avatar, collapse button. All MUST have visible focus ring and aria-label read by screen reader (test in 5A).

### 3C. Replies Page
1. Go to `/replies`
2. Tab through filter toggles. **aria-pressed** state: screen reader should announce "pressed" / "not pressed" (test in 5A).
3. Tab to pagination prev/next buttons. Focus ring visible. Enter works.

### 3D. Pipeline Board
1. Go to `/pipeline`
2. Tab to a card. Focus ring visible.
3. Press Enter → card opens (or triggers action). Card MUST be keyboard-activatable.
4. Tab to "Set Follow Up" / "Mark Lost" buttons inside card. Focus rings visible.

**Pass criteria:**
- [ ] Skip-to-content link appears on first Tab, jumps to main on Enter
- [ ] Every interactive element has visible :focus-visible ring
- [ ] Tab order is logical (top-to-bottom, left-to-right)
- [ ] No focus trap on normal page content (only inside modals)

---

## 4. Framer Motion — reducedMotion Must Not Break

**Risk:** MotionConfig reducedMotion="user" suppresses animations. Some logic may depend on onAnimationComplete callbacks.

### 4A. Dashboard Cards
1. Go to `/dashboard`
2. Cards should animate in (fade/slide) on load. Animation MUST play.
3. No console warnings about motion config.

### 4B. Pipeline Drag
1. Go to `/pipeline`
2. Drag a card to another column. Drop animation (spring/fling) MUST play.
3. Card lands smoothly. No jank.

### 4C. Search Results
1. Go to `/search`, run any search
2. Results animate in. Animation MUST play.

### 4D. Reduced Motion Preference (macOS)
1. System Preferences → Accessibility → Display → Reduce Motion → ON
2. Refresh any page with motion
3. Animations SHOULD be suppressed or simplified (instant transitions acceptable)
4. Page MUST still function fully — no broken layouts, no missing content
5. Turn Reduce Motion OFF after test

**Pass criteria:**
- [ ] Animations play normally with reducedMotion off
- [ ] Animations suppressed (or instant) with reducedMotion on
- [ ] No broken layout or missing content in either state
- [ ] No console errors related to motion

---

## 5. Screen Reader Sanity — Icons, Loading, Headings

**Risk:** aria-hidden on decorative icons could hide meaningful icons. aria-busy + aria-live could spam. Heading hierarchy broken.

### 5A. VoiceOver / NVDA Quick Pass

**macOS VoiceOver:** Cmd + F5 to turn on. Ctrl + Option + Arrow keys to navigate.
**NVDA:** Insert + Space → browse mode. Arrow keys to navigate.

#### Billing Page (`/billing`)
1. Navigate by headings (VoiceOver: Ctrl+Option+Cmd+H, NVDA: H)
2. **Heading hierarchy:** Only ONE `<h1>` on page. Logical `<h2>` → `<h3>` flow. No skips.
3. Navigate to plan cards. Screen reader should read plan name + price + features.
4. **Decorative icons:** MUST NOT be announced (CheckCircle, Settings, etc. should be silent).
5. **Loading state:** If plans loading, aria-busy="true" + aria-live="polite" should announce "Loading billing details" or similar (sr-only text).

#### Replies Page (`/replies`)
1. Navigate to filter toggles.
2. **aria-pressed:** Screen reader should announce "Filter by unread, button, pressed" or "not pressed".
3. **Icons:** MessageSquare, Clock icons MUST NOT be announced.
4. **Pagination:** Prev/Next buttons with aria-label should announce "Previous page" / "Next page", not just "button".

#### Sequences Page (`/sequences`)
1. Navigate to sequence list.
2. **Icon-only buttons:** "Delete sequence" button should announce "Delete sequence, button" via aria-label. NOT "button" with no context.
3. **Edit step buttons:** "Edit step, button" / "Save step, button" announced clearly.

#### Sequences Enroll (`/sequences/[id]/enroll`)
1. Submit enrollment. Loading state should announce "Enrolling leads..." via aria-live.
2. Success state: `<h1>` should be announced as heading level 1.

#### Leads Detail (`/leads/[id]`)
1. Copy buttons should NOT have redundant title + aria-label conflict. Screen reader should read aria-label only, cleanly.

**Pass criteria:**
- [ ] Zero decorative icons announced by screen reader
- [ ] Every icon-only button has meaningful accessible name (aria-label)
- [ ] Loading states announce politely (not aggressively)
- [ ] Exactly one `<h1>` per page, logical hierarchy below it
- [ ] No aria-live spam from large containers (only changing elements)

---

## 6. Console & Error Check

After completing sections 1–5:

1. DevTools → Console
2. **Expected:** Zero errors, zero warnings related to:
   - React key prop warnings
   - Invalid ARIA attribute warnings
   - Focus trap errors
   - Framer Motion warnings
3. **Acceptable:** Warnings from third-party libs (Stripe, maps) that existed before this change.

---

## Sign-Off

| Section | Tester | Pass | Fail | Notes |
|---------|--------|------|------|-------|
| 1. Overlay Lifecycle | | [ ] | [ ] | |
| 2. Mobile Viewport | | [ ] | [ ] | |
| 3. Keyboard Navigation | | [ ] | [ ] | |
| 4. Framer Motion | | [ ] | [ ] | |
| 5. Screen Reader | | [ ] | [ ] | |
| 6. Console Clean | | [ ] | [ ] | |

**If ALL sections pass:** Commit with message `a11y: cross-page audit + interaction fixes (Phase 0–9)` and push.

**If ANY section fails:** Do NOT commit. Fix the regression, re-run only the failed section, then sign off again.
