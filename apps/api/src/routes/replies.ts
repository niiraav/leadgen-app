import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';
import { inngest } from '../lib/inngest/client';

const router = new Hono();

/**
 * GET /replies
 * List reply events with optional filtering and pagination.
 * Returns replies sorted by hot_score DESC, received_at DESC.
 * Query params: intent?, needsReview?, limit=20, offset=0
 */
router.get('/', async (c) => {
  const userId = getUserId(c);

  const intent = c.req.query('intent');
  const needsReview = c.req.query('needsReview');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  let query = supabaseAdmin
    .from('reply_events')
    .select(
      '*, lead:leads(business_name, email, city)',
      { count: 'exact' }
    )
    .eq('user_id', userId)
    .order('hot_score', { ascending: false })
    .order('received_at', { ascending: false });

  if (intent) {
    query = query.or(
      `intent_label.eq.${intent},user_corrected_label.eq.${intent}`
    );
  }

  if (needsReview !== undefined) {
    query = query.eq('needs_review', needsReview === 'true');
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[Replies] Error fetching replies:', error);
    return c.json({ error: 'Failed to fetch replies' }, 500);
  }

  return c.json({
    replies: data ?? [],
    total: count ?? 0,
  });
});

/**
 * GET /replies/:id
 * Get a single reply event with full lead data.
 * Also generates and returns a suggested_reply_draft via OpenRouter if not already cached.
 */
router.get('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  // Fetch reply with lead data (include suggested_reply_draft from lead)
  const { data: reply, error: replyError } = await supabaseAdmin
    .from('reply_events')
    .select('*, lead:leads(business_name, email, city, suggested_reply_draft)')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (replyError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  // Check if we already have a cached suggested reply draft on the lead
  let suggestedReply = reply.lead?.suggested_reply_draft || null;

  // If not cached, generate one via OpenRouter
  if (!suggestedReply && reply.body_plain) {
    try {
      const lead = reply.lead;
      const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are a professional B2B sales assistant. Write a concise, personalized reply draft. Keep it under 150 words.',
            },
            {
              role: 'user',
              content: `A lead has replied to our outreach email. Here are the details:\n\n` +
                `Company: ${lead?.business_name || 'Unknown'}\n` +
                `Contact: ${lead?.email || 'Unknown'}\n` +
                `Location: ${lead?.city || 'Unknown'}\n` +
                `Their reply:\n${reply.body_plain}\n\n` +
                `Draft a professional reply that addresses their message. Keep it brief and personalized.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      if (openRouterResponse.ok) {
        const result = await openRouterResponse.json();
        suggestedReply = result.choices?.[0]?.message?.content || null;

        // Cache the draft on the lead
        if (suggestedReply) {
          await supabaseAdmin
            .from('leads')
            .update({ suggested_reply_draft: suggestedReply })
            .eq('id', reply.lead_id);
        }
      }
    } catch (err) {
      console.warn('[Replies] Failed to generate reply draft:', err);
    }
  }

  return c.json({
    ...reply,
    suggested_reply_draft: suggestedReply,
  });
});

/**
 * PATCH /replies/:id/intent
 * Update the intent label and record the correction.
 * Body: { intent: string }
 */
router.patch('/:id/intent', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  const body = await c.req.json();
  const intent = body.intent as string;

  if (!intent) {
    return c.json({ error: 'Intent is required' }, 400);
  }

  // Fetch the existing reply to get the original label
  const { data: reply, error: fetchError } = await supabaseAdmin
    .from('reply_events')
    .select('id, intent_label, user_corrected_label, lead_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  const originalLabel = reply.user_corrected_label || reply.intent_label;

  // Update reply_events with user corrected label
  const { data: updatedReply, error: updateError } = await supabaseAdmin
    .from('reply_events')
    .update({ user_corrected_label: intent, needs_review: false })
    .eq('id', id)
    .select('*, lead:leads(business_name, email, city)')
    .single();

  if (updateError) {
    console.error('[Replies] Error updating intent:', updateError);
    return c.json({ error: 'Failed to update intent' }, 500);
  }

  // Record in label_corrections
  await supabaseAdmin
    .from('label_corrections')
    .insert({
      reply_event_id: id,
      user_id: userId,
      original_label: originalLabel,
      corrected_label: intent,
    });

  return c.json(updatedReply);
});

/**
 * POST /replies/:id/snooze
 * Snooze a reply and pause enrollments temporarily.
 * Body: { days?: number } (defaults to 30)
 */
router.post('/:id/snooze', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  const body = await c.req.json();
  const days = body.days ?? 30;

  // Fetch the reply to get the enrolment_id
  const { data: reply, error: fetchError } = await supabaseAdmin
    .from('reply_events')
    .select('enrolment_id, lead_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  const reenrolAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  // Pause the enrollment if there is one
  if (reply.enrolment_id) {
    await supabaseAdmin
      .from('sequence_enrollments')
      .update({
        status: 'paused',
        paused_reason: 'reply_detected',
      })
      .eq('id', reply.enrolment_id);
  }

  // Send Inngest event for scheduling
  await inngest.send({
    name: 'reply/not-now-snooze',
    data: {
      replyId: id,
      leadId: reply.lead_id,
      enrolmentId: reply.enrolment_id,
      reenrolAt: reenrolAt.toISOString(),
    },
  });

  return c.json({
    scheduled: true,
    reenrolAt: reenrolAt.toISOString(),
  });
});

export default router;
