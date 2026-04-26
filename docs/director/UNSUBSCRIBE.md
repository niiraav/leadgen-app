# Unsubscribe / Opt-Out Mechanism — Implementation Instructions

## Context
- `do_not_contact` already exists on `leads` (boolean, default false) — migration 024.
- Sequence scheduler (`apps/api/src/services/sequence-scheduler.ts`) currently does NOT check `do_not_contact` before sending.
- `sendOutreachEmail()` is only called from the sequence scheduler — safe to append footer unconditionally.
- `FRONTEND_URL` env var is already used in `billing.ts` — reuse it for unsubscribe link generation.
- No JWT library installed yet — install `jose` (ESM-native, no `jsonwebtoken` issues).

## Files to create / modify

| # | Action | File |
|---|--------|------|
| 1 | Install dependency | `apps/api/package.json` |
| 2 | Create utility | `apps/api/src/lib/email/unsubscribe.ts` |
| 3 | Create migration SQL | `apps/api/migrations/035_unsubscribes.sql` |
| 4 | Modify email sender | `apps/api/src/lib/email/send.ts` |
| 5 | Modify scheduler | `apps/api/src/services/sequence-scheduler.ts` |
| 6 | Create endpoint | `apps/api/src/routes/unsubscribe.ts` |
| 7 | Mount route | `apps/api/src/index.ts` |
| 8 | Create page | `apps/web/src/pages/unsubscribe.tsx` |

---

## 1. Install `jose`

Run from repo root:

```bash
npm install jose --workspace=@leadgen/api
```

No other dependency changes needed.

---

## 2. Create `apps/api/src/lib/email/unsubscribe.ts`

```typescript
import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(
  process.env.UNSUBSCRIBE_JWT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

if (SECRET.length === 0) {
  console.warn('[Unsubscribe] No UNSUBSCRIBE_JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY set. Unsubscribe tokens will fail.');
}

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

export interface UnsubscribeTokenPayload {
  lead_id: string;
  sequence_id: string;
}

export async function generateUnsubscribeToken(
  leadId: string,
  sequenceId: string
): Promise<string> {
  return new SignJWT({ lead_id: leadId, sequence_id: sequenceId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('90d')
    .sign(SECRET);
}

export async function verifyUnsubscribeToken(
  token: string
): Promise<UnsubscribeTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, {
      clockTolerance: 60,
      maxTokenAge: '90d',
    });
    if (!payload.lead_id || !payload.sequence_id) return null;
    return {
      lead_id: payload.lead_id as string,
      sequence_id: payload.sequence_id as string,
    };
  } catch {
    return null;
  }
}

export function buildUnsubscribeLink(token: string): string {
  return `${APP_URL}/unsubscribe?t=${encodeURIComponent(token)}`;
}
```

---

## 3. Create `apps/api/migrations/035_unsubscribes.sql`

Apply via Supabase SQL Editor only (no local postgres access).

```sql
-- Audit table for unsubscribe events
CREATE TABLE IF NOT EXISTS unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  email_domain TEXT,
  unsubscribed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT NOT NULL DEFAULT 'link'
    CHECK (source IN ('link', 'reply', 'manual')),
  enrollment_id UUID REFERENCES sequence_enrollments(id) ON DELETE SET NULL,
  sequence_id UUID REFERENCES sequences(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_unsubscribes_lead_id ON unsubscribes(lead_id);
CREATE INDEX IF NOT EXISTS idx_unsubscribes_unsubscribed_at ON unsubscribes(unsubscribed_at);
```

---

## 4. Modify `apps/api/src/lib/email/send.ts`

Add `unsubscribeLink` to `SendEmailParams` and append footer to both html and text.

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

## 5. Modify `apps/api/src/services/sequence-scheduler.ts`

### 5a. Add imports at top
```typescript
import {
  generateUnsubscribeToken,
  buildUnsubscribeLink,
} from '../lib/email/unsubscribe';
```

### 5b. In the worker callback, after step 2 (skip if not active), add a `do_not_contact` guard BEFORE creating the `email_due` activity.

Refactor to this exact order inside the worker callback:

1. Fetch enrollment
2. Skip if not active
3. Fetch step
4. If no step → sequence complete (unchanged)
5. **Move lead fetch here** (add `do_not_contact` to select) — this is currently at line ~147; move it to BEFORE the `email_due` activity
6. If `do_not_contact` → pause enrollment, log skipped, return
7. Create activity "email_due" — move this to AFTER the lead fetch / guard
8. Generate unsubscribe token, build link
9. Send email (pass unsubscribeLink)
10. Update enrollment
11. Queue next step

Exact diff logic:

- Move the lead `.select(...)` block (currently around line 147) to right after step 3 (the step fetch / no-step completion block). Add `do_not_contact` to the select list.
- Insert the guard block immediately after the lead fetch, before the `email_due` activity.
- Move the `email_due` activity creation to AFTER the guard, right before the `if (lead?.email)` send block.
- Before calling `sendOutreachEmail`, generate the token and link:

```typescript
        const unsubscribeToken = await generateUnsubscribeToken(
          enrollment.lead_id,
          enrollment.sequence_id
        );
        const unsubscribeLink = buildUnsubscribeLink(unsubscribeToken);
```

- Pass `unsubscribeLink` to `sendOutreachEmail` call.

The rest of the worker logic (update enrollment, queue next step, dead-lead worker) stays unchanged.

```typescript
      // Guard: lead has opted out
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

---

## 6. Create `apps/api/src/routes/unsubscribe.ts`

```typescript
import { Hono } from 'hono';
import { verifyUnsubscribeToken } from '../lib/email/unsubscribe';
import { supabaseAdmin } from '../db';

const app = new Hono();

app.get('/', async (c) => {
  const token = c.req.query('t');
  if (!token) {
    return c.json({ error: 'Missing token' }, 400);
  }

  const payload = await verifyUnsubscribeToken(token);
  if (!payload) {
    return c.json({ error: 'Invalid or expired token' }, 400);
  }

  const { lead_id } = payload;

  // Fetch lead
  const { data: lead } = await supabaseAdmin
    .from('leads')
    .select('id, email, do_not_contact')
    .eq('id', lead_id)
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
        unsubscribed: true,
        engagement_status: 'unsubscribed',
        pipeline_stage: 'lost',
      })
      .eq('id', lead_id);
  }

  // Audit log
  await supabaseAdmin
    .from('unsubscribes')
    .insert({
      lead_id,
      email_domain: lead.email?.split('@')[1] ?? null,
      source: 'link',
      sequence_id: payload.sequence_id,
    });

  // Pause any active sequences for this lead
  await supabaseAdmin
    .from('sequence_enrollments')
    .update({ status: 'paused', paused_reason: 'unsubscribed' })
    .eq('lead_id', lead_id)
    .eq('status', 'active');

  return c.json({ success: true, lead_id });
});

export default app;
```

---

## 7. Mount route in `apps/api/src/index.ts`

Add after the health endpoint and BEFORE auth routes (so it is public):

```typescript
// Public unsubscribe endpoint — no auth
import unsubscribeRouter from './routes/unsubscribe';
app.route('/unsubscribe', unsubscribeRouter);
```

Place this immediately after the `app.get('/health', ...)` block and before the `app.use('/leads/*', authMiddleware)` lines.

---

## 8. Create `apps/web/src/pages/unsubscribe.tsx`

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

`SUPABASE_SERVICE_ROLE_KEY` is already set on Render and is reused as the JWT signing secret. If you want a dedicated secret, add `UNSUBSCRIBE_JWT_SECRET` on Render.

---

## 11. Post-deploy verification

1. Enroll a test lead in a sequence with a step that sends immediately (or force-run via BullMQ).
2. Inspect the sent email in Mailgun logs — verify the footer contains the unsubscribe link.
3. Click the link — land on `/unsubscribe?t=TOKEN` and see the success message.
4. Check backend: lead `do_not_contact` = true, `engagement_status` = 'unsubscribed'.
5. Re-trigger the sequence step for that enrollment — verify the worker skips it with `skipped_unsubscribed` status in `sequence_step_executions` and the enrollment is `paused`.

---

## Parallel safety note

This track touches ONLY backend files (`apps/api/src/`) and one new frontend page (`apps/web/src/pages/unsubscribe.tsx`). It does NOT overlap with the accessibility audit files (components, existing pages, CSS). Zero collision risk with Hermes' frontend audit work.
