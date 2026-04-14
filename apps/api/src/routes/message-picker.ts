/**
 * Message picker routes — templates, daily quota, send messages via WhatsApp/SMS
 *
 * Tiers for daily message limit:  free=5, outreach=50, growth=-1 (unlimited)
 * Tiers for custom templates:     free=0 (defaults only), outreach=5, growth=-1
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { getUserId, supabaseAdmin, createActivity } from '../db';
import { getTier, canonicalPlan, type CanonicalPlanId } from '../lib/billing/tiers';

const router = new Hono();

// ─── Tier limit maps ─────────────────────────────────────────────────────────

const DAILY_MESSAGE_LIMITS: Record<CanonicalPlanId, number> = {
  free: 5,
  outreach: 50,
  growth: -1, // unlimited
};

const CUSTOM_TEMPLATE_LIMITS: Record<CanonicalPlanId, number> = {
  free: 0,
  outreach: 5,
  growth: -1, // unlimited
};

// ─── Default templates ───────────────────────────────────────────────────────

const DEFAULT_TEMPLATES = [
  { name: 'Rating Mention', message: 'Hi {name}, saw your {rating} rating. Lead gen tip?', is_default: true },
  { name: 'Category Pitch', message: 'Hey {name}, helping {category} like you get 2x leads. Chat?', is_default: true },
  { name: 'WhatsApp CTA', message: 'Hi {name}, noticed your site. More leads via WhatsApp?', is_default: true },
  { name: 'Follow-up', message: 'Hey {name}, back re: lead automation for {category}.', is_default: true },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolve user plan via subscriptions → profiles fallback */
async function getUserPlan(userId: string): Promise<CanonicalPlanId> {
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sub) {
    return canonicalPlan((sub as any).plan) as CanonicalPlanId;
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('plan')
    .eq('id', userId)
    .maybeSingle();

  return canonicalPlan((profile as any)?.plan) as CanonicalPlanId;
}

/** Get today's start timestamp in ISO */
function todayISO(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const sendSchema = z.object({
  leadId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  channel: z.enum(['whatsapp', 'sms']),
  message: z.string().min(1),
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  message: z.string().min(1),
});

// ─── GET /message-picker ────────────────────────────────────────────────────
// Returns templates, daily quota, and lead data for personalization preview

router.get('/', async (c) => {
  try {
    const userId = getUserId(c);
    const leadId = c.req.query('leadId');

    // ── 1. Get or seed templates ──────────────────────────────────────────
    const { data: existingTemplates, error: tplErr } = await supabaseAdmin
      .from('message_templates')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false });

    if (tplErr) {
      console.error('[MessagePicker GET /] Template query error:', tplErr);
      return c.json({ error: 'Failed to fetch templates' }, 500);
    }

    let templates = existingTemplates ?? [];

    // Seed defaults if user has no templates at all
    if (templates.length === 0) {
      const inserts = DEFAULT_TEMPLATES.map((t) => ({
        user_id: userId,
        name: t.name,
        message: t.message,
        is_default: t.is_default,
        usage_count: 0,
      }));

      const { data: seeded, error: seedErr } = await supabaseAdmin
        .from('message_templates')
        .insert(inserts)
        .select('*');

      if (seedErr) {
        console.error('[MessagePicker GET /] Seed error:', seedErr);
      }
      templates = seeded ?? [];
    }

    // ── 2. Daily quota ────────────────────────────────────────────────────
    const plan = await getUserPlan(userId);
    const dailyLimit = DAILY_MESSAGE_LIMITS[plan];

    const { count: usedToday, error: countErr } = await supabaseAdmin
      .from('message_sends')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayISO());

    if (countErr) {
      console.error('[MessagePicker GET /] Daily count error:', countErr);
    }

    const used = usedToday ?? 0;
    const limit = dailyLimit === -1 ? -1 : dailyLimit;

    // ── 3. Lead data for personalization preview ──────────────────────────
    let lead: { business_name: string | null; category: string | null; rating: number | null; phone: string | null } | null = null;

    if (leadId) {
      const { data: leadData, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('business_name, category, rating, phone')
        .eq('id', leadId)
        .eq('user_id', userId)
        .maybeSingle();

      if (leadErr) {
        console.error('[MessagePicker GET /] Lead query error:', leadErr);
      }
      lead = leadData as any ?? null;
    }

    return c.json({
      templates,
      dailyQuota: { used, limit },
      lead,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MessagePicker GET /] Error:', message);
    return c.json({ error: 'Failed to fetch message picker data', details: message }, 500);
  }
});

// ─── POST /message-picker/send ──────────────────────────────────────────────
// Validates, enforces quota, records send, creates activity

router.post('/send', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = sendSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { leadId, templateId, channel, message } = parsed.data;

    // ── 1. Validate personalization resolved ──────────────────────────────
    const unresolved = /\{(name|rating|category)\}/.exec(message);
    if (unresolved) {
      return c.json({
        error: `Unresolved placeholder {${unresolved[1]}} in message. Replace with lead data before sending.`,
      }, 400);
    }

    // ── 2. Enforce daily quota ────────────────────────────────────────────
    const plan = await getUserPlan(userId);
    const dailyLimit = DAILY_MESSAGE_LIMITS[plan];

    if (dailyLimit !== -1) {
      const { count: usedToday, error: countErr } = await supabaseAdmin
        .from('message_sends')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', todayISO());

      if (countErr) {
        console.error('[MessagePicker POST /send] Daily count error:', countErr);
      }

      const used = usedToday ?? 0;
      const remaining = Math.max(0, dailyLimit - used);

      if (used >= dailyLimit) {
        return c.json({
          error: `Daily message limit reached (${used}/${dailyLimit}). Upgrade your plan for more messages.`,
          upgradeRequired: true,
          limit: dailyLimit,
          remaining: 0,
        }, 402);
      }
    }

    // ── 3. Verify lead exists and get phone ──────────────────────────────
    const { data: lead, error: leadErr } = await supabaseAdmin
      .from('leads')
      .select('id, business_name, phone')
      .eq('id', leadId)
      .eq('user_id', userId)
      .maybeSingle();

    if (leadErr || !lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const phone = (lead as any).phone;
    if (!phone) {
      return c.json({ error: 'Lead has no phone number' }, 400);
    }

    // ── 4. Record send in message_sends ──────────────────────────────────
    const { error: sendErr } = await supabaseAdmin
      .from('message_sends')
      .insert({
        user_id: userId,
        lead_id: leadId,
        template_id: templateId ?? null,
        channel,
        message,
      });

    if (sendErr) {
      console.error('[MessagePicker POST /send] Insert send error:', sendErr);
      return c.json({ error: 'Failed to record message send' }, 500);
    }

    // ── 5. Increment template usage count ────────────────────────────────
    if (templateId) {
      const { error: tplUpdateErr } = await supabaseAdmin.rpc('increment_template_usage', {
        p_template_id: templateId,
      });

      // Fallback: manual increment if RPC doesn't exist
      if (tplUpdateErr) {
        const { data: tpl } = await supabaseAdmin
          .from('message_templates')
          .select('usage_count')
          .eq('id', templateId)
          .eq('user_id', userId)
          .single();

        if (tpl) {
          await supabaseAdmin
            .from('message_templates')
            .update({ usage_count: ((tpl as any).usage_count ?? 0) + 1 })
            .eq('id', templateId)
            .eq('user_id', userId);
        }
      }
    }

    // ── 6. Create lead activity ──────────────────────────────────────────
    try {
      await createActivity(userId, {
        lead_id: leadId,
        type: 'message_sent',
        description: `Message sent via ${channel}`,
      });
    } catch (actErr: any) {
      console.warn('[MessagePicker POST /send] Activity log failed:', actErr.message);
    }

    // ── 7. Build URL ─────────────────────────────────────────────────────
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    let url: string;

    if (channel === 'whatsapp') {
      const waPhone = cleanPhone.replace('+', '');
      url = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    } else {
      url = `sms:${cleanPhone}?body=${encodeURIComponent(message)}`;
    }

    return c.json({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MessagePicker POST /send] Error:', message);
    return c.json({ error: 'Failed to send message', details: message }, 500);
  }
});

// ─── POST /message-picker/templates ──────────────────────────────────────────
// Create a custom template (is_default=false)

router.post('/templates', async (c) => {
  try {
    const userId = getUserId(c);
    const body = await c.req.json();
    const parsed = createTemplateSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const { name, message: msg } = parsed.data;

    // ── 1. Validate at least one personalization placeholder ─────────────
    if (!/\{(name|rating|category)\}/.test(msg)) {
      return c.json({
        error: 'Template must contain at least one personalization placeholder ({name}, {rating}, or {category})',
      }, 400);
    }

    // ── 2. Check custom template limit ────────────────────────────────────
    const plan = await getUserPlan(userId);
    const customLimit = CUSTOM_TEMPLATE_LIMITS[plan];

    if (customLimit === 0) {
      return c.json({
        error: 'Custom templates not available on Free plan. Upgrade to Outreach or Growth.',
        upgradeRequired: true,
      }, 402);
    }

    if (customLimit !== -1) {
      const { count: customCount, error: countErr } = await supabaseAdmin
        .from('message_templates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_default', false);

      if (countErr) {
        console.error('[MessagePicker POST /templates] Count error:', countErr);
      }

      const used = customCount ?? 0;
      if (used >= customLimit) {
        return c.json({
          error: `Custom template limit reached (${used}/${customLimit}). Upgrade your plan for more templates.`,
          upgradeRequired: true,
          limit: customLimit,
          remaining: 0,
        }, 402);
      }
    }

    // ── 3. Insert template ───────────────────────────────────────────────
    const { data: template, error: insertErr } = await supabaseAdmin
      .from('message_templates')
      .insert({
        user_id: userId,
        name,
        message: msg,
        is_default: false,
        usage_count: 0,
      })
      .select('*')
      .single();

    if (insertErr) {
      console.error('[MessagePicker POST /templates] Insert error:', insertErr);
      return c.json({ error: 'Failed to create template' }, 500);
    }

    return c.json({ template }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MessagePicker POST /templates] Error:', message);
    return c.json({ error: 'Failed to create template', details: message }, 500);
  }
});

// ─── DELETE /message-picker/templates/:id ───────────────────────────────────
// Can only delete custom (non-default) templates

router.delete('/templates/:id', async (c) => {
  try {
    const userId = getUserId(c);
    const templateId = c.req.param('id');

    // ── 1. Check template exists and is not default ───────────────────────
    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from('message_templates')
      .select('id, is_default')
      .eq('id', templateId)
      .eq('user_id', userId)
      .maybeSingle();

    if (tplErr || !tpl) {
      return c.json({ error: 'Template not found' }, 404);
    }

    if ((tpl as any).is_default) {
      return c.json({ error: 'Cannot delete default templates' }, 403);
    }

    // ── 2. Delete ────────────────────────────────────────────────────────
    const { error: deleteErr } = await supabaseAdmin
      .from('message_templates')
      .delete()
      .eq('id', templateId)
      .eq('user_id', userId);

    if (deleteErr) {
      console.error('[MessagePicker DELETE /templates/:id] Delete error:', deleteErr);
      return c.json({ error: 'Failed to delete template' }, 500);
    }

    return c.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[MessagePicker DELETE /templates/:id] Error:', message);
    return c.json({ error: 'Failed to delete template', details: message }, 500);
  }
});

export default router;
