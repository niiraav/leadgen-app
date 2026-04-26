# Unsubscribe / Opt-Out Mechanism — Corrected Implementation Instructions

## Context

- `do_not_contact` already exists on `leads` (boolean, default false) — migration 024.
- Sequence scheduler (`apps/api/src/services/sequence-scheduler.ts`) does NOT check `do_not_contact` before sending.
- `sendOutreachEmail()` is only called from the sequence scheduler — safe to append footer unconditionally.
- `FRONTEND_URL` env var is already used in `billing.ts` — reuse it for unsubscribe link generation.
- **No new dependency needed.** We use an opaque random token (same pattern as `reply_token`) instead of JWT. Simpler, no key rotation, matches existing codebase conventions.
- `sequence_enrollments` already has `paused_reason` (TEXT, nullable) from migration 009.
- `engagement_status` enum does NOT include `'unsubscribed'` — do not attempt to set it. `do_not_contact` is the single source of truth.

---

## Files to create / modify

| # | Action | File |
|---|--------|------|
| 1 | Create utility | `apps/api/src/lib/email/unsubscribe.ts` |
| 2 | Create migration SQL | `apps/api/migrations/035_unsubscribes.sql` |
| 3 | Modify email sender | `apps/api/src/lib/email/send.ts` |
| 4 | Modify scheduler | `apps/api/src/services/sequence-scheduler.ts` |
| 5 | Create endpoint | `apps/api/src/routes/unsubscribe.ts` |
| 6 | Mount route | `apps/api/src/index.ts` |
| 7 | Create page | `apps/web/src/pages/unsubscribe.tsx` |
| 8 | Gate enrollment | `apps/api/src/routes/sequences.ts` |

---

## 1. Create `apps/api/src/lib/email/unsubscribe.ts`

```typescript
import { createHash, randomBytes } from 'crypto';

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export function generateUnsubscribeToken(): string {
  // 32 bytes hex = 64 chars — same length class as reply_token
  return randomBytes(32).toString('hex');
}

export function hashUnsubscribeToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function buildUnsubscribeLink(token: string): string {
  return `${APP_URL}/unsubscribe?t=${encodeURIComponent(token)}`;
}
```

**Why opaque token instead of JWT?**
- No library to install (no `jose`, no `jsonwebtoken`).
- No key rotation complexity.
- Matches existing `reply_token` pattern in `db.ts` (`generateReplyToken()`).
- Token stored hashed in `unsubscribes` table for verification (same security model as password hashes).

---

## 2. Create `apps/api/migrations/035_unsubscribes.sql`

Apply via Supabase SQL Editor only (no local postgres access).

```sql
-- Audit table for unsubscribe events (GDPR / CAN-SPAM trail)
CREATE TABLE IF NOT EXISTS unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email_domain TEXT,
  token_hash TEXT NOT NULL,           -- sha256 of the opaque token, for verification
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'link'
    CHECK (source IN ('link', 'reply', 'manual')),
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_unsubscribes_lead_id ON unsubscribes(lead_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribes_token_hash ON unsubscribes(token_hash);
CREATE INDEX IF NOT EXISTS idx_unsubscribes_unsubscribed_at ON unsubscribes(unsubscribed_at);
```

**Why both `leads.do_not_contact` AND `unsubscribes` table?**
- `leads.do_not_contact` = single source of truth for the scheduler guard (fast boolean lookup).
- `unsubscribes` = audit trail for GDPR data-subject requests and unsubscribe-rate analytics.
- Both are written on every unsubscribe event.

---

## 3. Modify `apps/api/src/lib/email/send.ts`

Add `unsubscribeLink` to `SendEmailParams` and append footer to both html and text **after** the body is built (not as a template variable — users never type `{{unsubscribe_link}}`).

```typescript
export interface SendEmailParams {
  // ... existing fields ...
  stepNumber:       number;
  unsubscribeLink?: string;   // NEW
}

export async function sendOutreachEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const replyTo = `reply+${params.replyToken}@${INBOUND_REPLY_DOMAIN}`;

  let html = params.html;
  let text = params.text;

  if (params.unsubscribeLink) {
    const footerHtml = `<br><br><hr style="border:0;border-top:1px solid #eee;"><p style="font-size:12px;color:#666;">Don't want to hear from me? <a href="${params.unsubscribeLink}">Unsubscribe</a></p>`;
    const footerText = `\n\n---\nDon't want to hear from me? Unsubscribe: ${params.unsubscribeLink}`;
    html = html + footerHtml;
    text = text + footerText;
  }

  const result = await mg.messages.create(MAILGUN_DOMAIN, {
    to:              params.to,
    from:            `${params.fromName} <${params.fromEmail}>`,
    subject:         params.subject,
    html,            // uses modified html
    text,            // uses modified text
    'h:Reply-To':             replyTo,
    'h:X-Findr-Lead-Id':      params.leadId,
    'h:X-Findr-Enrolment-Id': params.enrolmentId,
    'h:X-Findr-Step-Id':      params.sequenceStepId,
  });

  // ... rest unchanged (sequence_step_executions insert + return)
}
```

---

## 4. Modify `apps/api/src/services/sequence-scheduler.ts`

### 4a. Add imports at top

```typescript
import {
  generateUnsubscribeToken,
  hashUnsubscribeToken,
  buildUnsubscribeLink,
} from '../lib/email/unsubscribe';
```

### 4b. Reorder the worker callback

Current order in the file (lines ~95–227):
1. Fetch enrollment
2. Skip if not active
3. Fetch step
4. If no step → sequence complete
5. Create activity "email_due"
6. Fetch lead
7. Send email
8. Update enrollment
9. Queue next step

**New order:**
1. Fetch enrollment
2. Skip if not active
3. Fetch step
4. If no step → sequence complete (unchanged)
5. **Fetch lead** — MOVE this from line ~147 to here. **Add `do_not_contact` to the select list.**
6. **Guard: if `lead.do_not_contact` → pause enrollment, log skipped, return**
7. Create activity "email_due" — MOVE this to after the guard
8. Generate unsubscribe token + build link
9. Send email (pass `unsubscribeLink`)
10. Update enrollment
11. Queue next step

Exact code changes:

**Step 5 — Move lead fetch here, add `do_not_contact`:**
```typescript
      // 5. Fetch lead (moved from below; added do_not_contact)
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('email, business_name, reply_token, contact_full_name, owner_name, city, phone, website_url, category, do_not_contact')
        .eq('id', enrollment.lead_id)
        .maybeSingle();
```

**Step 6 — DNC guard:**
```typescript
      // 6. Guard: lead has opted out
      if (lead?.do_not_contact) {
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'paused', paused_reason: 'unsubscribed' })
          .eq('id', enrollment_id);

        await createActivity(enrollment.user_id, {
          lead_id: enrollment.lead_id,
          type: 'skipped_unsubscribed',
          description: `Skipped step ${step_order} — lead unsubscribed`,
        });

        await supabaseAdmin
          .from('sequence_step_executions')
          .insert({
            sequence_id:    enrollment.sequence_id,
            enrolment_id:   enrollment_id,
            user_id:        enrollment.user_id,
            step_number:    step_order,
            subject:        step.subject_template,
            body_plain:     step.body_template,
            status:         'skipped_unsubscribed',
            sent_via:       'mailgun',
          });

        return;   // stop — do NOT queue next step
      }
```

**Step 7 — Move `email_due` activity here:**
```typescript
      // 7. Create activity (moved to after DNC guard)
      await createActivity(enrollment.user_id, {
        lead_id: enrollment.lead_id,
        type: 'email_due',
        description: `Email due: "${step.subject_template}" (step ${step_order})`,
      });
```

**Step 8 — Generate token and link (before send block):**
```typescript
      // 8. Generate unsubscribe token + link
      let unsubscribeLink: string | undefined;
      if (lead?.email) {
        const rawToken = generateUnsubscribeToken();
        const tokenHash = hashUnsubscribeToken(rawToken);

        // Pre-register the token in unsubscribes table (so the link works even if the email
        // client pre-fetches it). The unsubscribes row is created now; unsubscribed_at stays
        // NULL until the user actually clicks.
        await supabaseAdmin
          .from('unsubscribes')
          .insert({
            lead_id: enrollment.lead_id,
            token_hash: tokenHash,
            source: 'link',
            enrollment_id,
            sequence_id: enrollment.sequence_id,
          })
          .select('id')
          .single();

        unsubscribeLink = buildUnsubscribeLink(rawToken);
      }
```

**Step 9 — Pass `unsubscribeLink` to `sendOutreachEmail`:**
```typescript
        await sendOutreachEmail({
          to: lead.email,
          fromName,
          fromEmail,
          subject: substitutedSubject,
          html: substitutedBody,
          text: substitutedBody,
          leadId: enrollment.lead_id,
          replyToken: (lead as any)?.reply_token || '',
          enrolmentId: enrollment_id,
          sequenceStepId: (step as any).id,
          sequenceId: enrollment.sequence_id,
          userId: enrollment.user_id,
          stepNumber: step_order,
          unsubscribeLink,   // NEW
        });
```

**Steps 10–11 (update enrollment + queue next) remain unchanged.**

---

## 5. Create `apps/api/src/routes/unsubscribe.ts`

```typescript
import { Hono } from 'hono';
import { hashUnsubscribeToken } from '../lib/email/unsubscribe';
import { supabaseAdmin } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const token = c.req.query('t');
  if (!token || typeof token !== 'string') {
    return c.json({ error: 'Missing token' }, 400);
  }

  const tokenHash = hashUnsubscribeToken(token);

  // Look up the pre-registered unsubscribe row
  const { data: unsubRow, error: unsubErr } = await supabaseAdmin
    .from('unsubscribes')
    .select('id, lead_id, unsubscribed_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (unsubErr || !unsubRow) {
    return c.json({ error: 'Invalid or expired token' }, 400);
  }

  const leadId = unsubRow.lead_id;

  // Fetch lead
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, email, do_not_contact')
    .eq('id', leadId)
    .maybeSingle();

  if (!lead) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  // Idempotent: only mutate if not already opted out
  if (!lead.do_not_contact) {
    await supabaseAdmin
      .from('leads')
      .update({
        do_not_contact: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);
  }

  // Record the actual unsubscribe timestamp (if not already set)
  if (!unsubRow.unsubscribed_at) {
    await supabaseAdmin
      .from('unsubscribes')
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq('id', unsubRow.id);
  }

  // Pause any active sequences for this lead
  await supabaseAdmin
    .from('sequence_enrollments')
    .update({ status: 'paused', paused_reason: 'unsubscribed' })
    .eq('lead_id', leadId)
    .eq('status', 'active');

  // Log activity
  await supabaseAdmin
    .from('lead_activities')
    .insert({
      user_id: null,   // system action — no specific user
      lead_id: leadId,
      type: 'unsubscribed',
      description: 'Lead unsubscribed via email link',
    });

  return c.json({ success: true, lead_id: leadId });
});

export default app;
```

**Why we pre-register the token in the scheduler instead of creating it on click:**
- Some email clients (Gmail, Outlook) pre-fetch URLs for link preview / safety scanning.
- If we only created the `unsubscribes` row on click, a pre-fetch would 404 and the real click would too.
- Pre-registering with `unsubscribed_at = NULL` means the link is valid immediately, but the actual unsubscribe timestamp is only set on the first real human click.

---

## 6. Mount route in `apps/api/src/index.ts`

Add **before** the `app.use('/leads/*', authMiddleware)` lines and **after** the health endpoint:

```typescript
// Public unsubscribe endpoint — NO auth middleware
import unsubscribeRouter from './routes/unsubscribe';
app.route('/unsubscribe', unsubscribeRouter);
```

If your `index.ts` has a global `app.use('*', authMiddleware)` or similar, you must exclude `/unsubscribe` from it. Use a conditional:

```typescript
app.use('*', async (c, next) => {
  if (c.req.path === '/unsubscribe' || c.req.path.startsWith('/unsubscribe/')) {
    return next();
  }
  return authMiddleware(c, next);
});
```

---

## 7. Create `apps/web/src/pages/unsubscribe.tsx`

```tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function UnsubscribePage() {
  const router = useRouter();
  const { t } = router.query;
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    if (!t || typeof t !== "string") return;

    fetch(`${API_BASE}/unsubscribe?t=${encodeURIComponent(t)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Request failed");
        const data = await res.json();
        if (data.success) setStatus("success");
        else throw new Error("Unsubscribe failed");
      })
      .catch(() => setStatus("error"));
  }, [t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        {status === "loading" && (
          <>
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Processing your request…</p>
          </>
        )}
        {status === "success" && (
          <>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              You&apos;ve been unsubscribed
            </h1>
            <p className="text-sm text-muted-foreground">
              You will no longer receive automated emails from this sender.
            </p>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-2xl font-semibold text-foreground mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground">
              We couldn&apos;t process your unsubscribe request. Please contact support if you continue receiving emails.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
```

No auth gate, no layout wrapper needed. Keep it minimal.

---

## 8. Gate sequence enrollment for DNC leads

In `apps/api/src/routes/sequences.ts`, find the enrollment endpoint (usually `POST /:id/enroll`). Before creating enrollments, filter out leads where `do_not_contact = true`:

```typescript
  // After fetching lead IDs, check DNC status
  const { data: leadsCheck } = await supabaseAdmin
    .from('leads')
    .select('id, do_not_contact, business_name')
    .in('id', leadIds)
    .eq('user_id', userId);

  const dncIds = (leadsCheck ?? []).filter((l: any) => l.do_not_contact).map((l: any) => l.id);
  const enrollableIds = leadIds.filter((id) => !dncIds.includes(id));

  if (dncIds.length > 0) {
    console.warn(`[Enroll] Skipped ${dncIds.length} DNC leads`);
  }

  // Use enrollableIds instead of leadIds for the rest of the enrollment logic
```

Return the skipped count in the response so the frontend can show a toast:

```typescript
  return c.json({
    enrolled: enrollableIds.length,
    skipped_dnc: dncIds.length,
    skipped_ids: dncIds,
  });
```

---

## 9. Type-check & test locally

After all edits, run from repo root:

```bash
cd apps/api && npx tsc --noEmit
```

If type errors, fix them before proceeding.

Restart the API dev server with `--no-cache` (critical after scheduler edits):

```bash
cd apps/api && npx tsx --no-cache src/index.ts
```

---

## 10. Environment variables

Ensure the following are set on Render (backend) and Vercel (frontend):

| Var | Set on | Value |
|-----|--------|-------|
| `FRONTEND_URL` | Render | `https://leadgen-app-web.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Vercel | `https://leadgen-app-uz2o.onrender.com` |

`FRONTEND_URL` is already used in `billing.ts` for Stripe redirects. Reuse it — do NOT hardcode `app.gapr.io` anywhere.

---

## 11. Post-deploy verification

1. Enroll a test lead in a sequence with a step that sends immediately (or force-run via BullMQ).
2. Inspect the sent email in Mailgun logs — verify the footer contains the unsubscribe link with the correct domain (`leadgen-app-web.vercel.app/unsubscribe?t=...`).
3. Click the link — land on `/unsubscribe?t=TOKEN` and see the success message.
4. Check backend: `leads.do_not_contact` = true; `unsubscribes` row has `unsubscribed_at` set.
5. Re-trigger the sequence step for that enrollment — verify the worker skips it with `skipped_unsubscribed` status in `sequence_step_executions` and the enrollment is `paused` with `paused_reason = 'unsubscribed'`.
6. Try enrolling the same lead in a new sequence — verify the enrollment API returns `skipped_dnc: 1` and does not create an enrollment.

---

## 12. Parallel safety note

This track touches ONLY:
- Backend: `apps/api/src/lib/email/*`, `apps/api/src/services/sequence-scheduler.ts`, `apps/api/src/routes/unsubscribe.ts`, `apps/api/src/routes/sequences.ts`, `apps/api/src/index.ts`
- Frontend: `apps/web/src/pages/unsubscribe.tsx` (one new page)
- Migration: `apps/api/migrations/035_unsubscribes.sql`

It does NOT overlap with the accessibility audit files (components, existing pages, CSS). Zero collision risk with Hermes' frontend audit work.
