# AGENT.md — Analytics Dead-Leads Fix + Scheduler Health Guard

## Context
- `apps/api/src/routes/analytics.ts` — dashboard analytics endpoint.
- `apps/api/src/routes/sequences.ts` — sequence enrollment endpoint.
- `apps/api/src/services/sequence-scheduler.ts` — exports `isSchedulerHealthy()`.

## Task 1: Fix `dead_leads_pending` in analytics.ts

The current code at lines 86-92 counts `failed`/`paused` sequence enrollments as dead leads pending. This is wrong.

**Replace lines 86-92** with logic that actually counts dead-lead prompts from the last 7 days whose leads are still unactioned (status `new` or `contacted`).

Use the existing `weekStart` variable (already in scope from line 26) for the 7-day boundary.

Patch instructions for `apps/api/src/routes/analytics.ts`:

1. Replace the block:
```ts
    const enrollCount = new Map<string, number>();
    let deadLeadsPending = 0;
    for (const e of enrollStats ?? []) {
      const s = e.status as string;
      enrollCount.set(s, (enrollCount.get(s) ?? 0) + 1);
      if (s === 'failed' || s === 'paused') deadLeadsPending++;
    }
```

With:
```ts
    const enrollCount = new Map<string, number>();
    for (const e of enrollStats ?? []) {
      const s = e.status as string;
      enrollCount.set(s, (enrollCount.get(s) ?? 0) + 1);
    }

    // Dead leads pending: dead_lead_prompt activities in last 7 days where lead is still new/contacted
    let deadLeadsPending = 0;
    const { data: deadActivities } = await supabaseAdmin
      .from('lead_activities')
      .select('lead_id')
      .eq('user_id', userId)
      .eq('type', 'dead_lead_prompt')
      .gte('created_at', weekStart.toISOString());

    if (deadActivities && deadActivities.length > 0) {
      const leadIds = [...new Set(deadActivities.map((a: { lead_id: string }) => a.lead_id))];
      const { data: pendingLeads } = await supabaseAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('id', leadIds)
        .in('status', ['new', 'contacted']);
      deadLeadsPending = pendingLeads ?? 0;
    }
```

**IMPORTANT**: The `weekStart` variable is already defined at line 26 in this function scope — do NOT redeclare it.

## Task 2: Add scheduler health guard to sequences enroll endpoint

In `apps/api/src/routes/sequences.ts`:

1. **Update the import on line 4** to include `isSchedulerHealthy`:
```ts
import { schedulerQueue, deadLeadQueue, isSchedulerHealthy } from '../services/sequence-scheduler';
```

2. **Insert a health check after line 279** (immediately after the credit-enforcement block, before the sequence-existence query). Add this block:
```ts
    if (!isSchedulerHealthy()) {
      return c.json({ error: 'Sequence scheduler is currently unavailable. Please try again shortly.' }, 503);
    }
```

## Verification

After patching:
1. Run `npm run typecheck` (or `tsc --noEmit`) in `apps/api/` to confirm no TS errors.
2. If dev server is running, restart it (`npx tsx --no-cache src/index.ts`).
3. Report back the typecheck result and confirm both files patched cleanly.
