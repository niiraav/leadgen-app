import { Hono } from 'hono';
import { supabaseAdmin, getUserId } from '../db';
import { inngest } from '../lib/inngest/client';
import { emitReplyRead, emitReplyHandled } from '../lib/reply/notifications';

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
  const unread = c.req.query('unread');
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

  if (unread === 'true') {
    query = query.eq('reply_status', 'new');
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
 * GET /replies/unread-count
 * Returns the total number of reply_events with reply_status='new' for this user.
 * Used by Sidebar badge + PipelineBoard banner.
 */
router.get('/unread-count', async (c) => {
  const userId = getUserId(c);

  const { count, error } = await supabaseAdmin
    .from('reply_events')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('reply_status', 'new');

  if (error) {
    console.error('[Replies] Error fetching unread count:', error);
    return c.json({ error: 'Failed to fetch unread count' }, 500);
  }

  return c.json({ unreadCount: count ?? 0 });
});

/**
 * GET /replies/:id
 * Get a single reply event with full lead data.
 * Also generates and returns a suggested_reply_draft via Fireworks if not already cached.
 */
router.get('/:id', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  // Fetch reply with lead data + original sent email
  const { data: reply, error: replyError } = await supabaseAdmin
    .from('reply_events')
    .select(
      '*, lead:leads(business_name, email, city), original_step_execution:sequence_step_executions(id, step_number, subject, body_plain, sent_at)'
    )
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (replyError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  // Fallback: if original_step_execution_id is null, find latest sent step for this lead
  let originalEmail = reply.original_step_execution || null;
  if (!originalEmail && reply.lead_id) {
    const { data: fallbackSteps, error: fallbackError } = await supabaseAdmin
      .from('sequence_step_executions')
      .select('id, step_number, subject, body_plain, sent_at, enrolment_id')
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(1)
      .not('sent_at', 'is', null);

    if (!fallbackError && fallbackSteps && fallbackSteps.length > 0) {
      // Verify this step belongs to an enrollment for this lead
      const { data: enrolment } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('id')
        .eq('id', fallbackSteps[0].enrolment_id)
        .eq('lead_id', reply.lead_id)
        .single();
      if (enrolment) {
        originalEmail = fallbackSteps[0];
      }
    }
  }

  // Use reply_events-level draft cache (not lead-level)
  let suggestedReply = reply.suggested_reply_draft || null;

  // If not cached, generate one via Fireworks
  if (!suggestedReply && reply.body_plain) {
    try {
      const lead = reply.lead;
      const llmKey = process.env.FIREWORKS_API_KEY || process.env.OPENROUTER_API_KEY || '';
      const llmBase = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
      const llmModel = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';
      const llmResponse = await fetch(llmBase + '/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${llmKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: llmModel,
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

      if (llmResponse.ok) {
        const result = await llmResponse.json();
        suggestedReply = result.choices?.[0]?.message?.content || null;

        // Cache the draft on the reply_events row (not the lead)
        if (suggestedReply) {
          await supabaseAdmin
            .from('reply_events')
            .update({ suggested_reply_draft: suggestedReply })
            .eq('id', reply.id);
        }
      }
    } catch (err) {
      console.warn('[Replies] Failed to generate reply draft:', err);
    }
  }

  return c.json({
    ...reply,
    original_email: originalEmail,
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

/**
 * PATCH /replies/:id/read
 * Mark a reply as read. Sets read_at timestamp and reply_status='read'.
 * Idempotent: safe to call multiple times.
 * Emits Socket.io event so all clients sync badge state instantly.
 */
router.patch('/:id/read', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  // Verify ownership and get lead_id for socket emit
  const { data: reply, error: fetchError } = await supabaseAdmin
    .from('reply_events')
    .select('id, lead_id, reply_status')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('reply_events')
    .update({
      reply_status: 'read',
      read_at: now,
    })
    .eq('id', id);

  if (updateError) {
    console.error('[Replies] Error marking read:', updateError);
    return c.json({ error: 'Failed to mark reply as read' }, 500);
  }

  // Emit socket event for real-time badge sync
  try {
    await emitReplyRead({
      userId,
      replyEventId: id,
      leadId: reply.lead_id,
    });
  } catch (socketErr) {
    console.warn('[Replies] Socket emit failed (non-critical):', socketErr);
  }

  return c.json({
    success: true,
    replyId: id,
    readAt: now,
    previousStatus: reply.reply_status,
  });
});

/**
 * POST /replies/:id/handled
 * Mark a reply as handled with a specific action.
 * Body: { action: 'replied' | 'not_interested' | 'snoozed' | 'archived' }
 * Sets handled_at and maps action to reply_status.
 * Emits Socket.io event for real-time sync.
 */
router.post('/:id/handled', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  const body = await c.req.json();
  const action = body.action as string;

  const validActions = ['replied', 'not_interested', 'snoozed', 'archived'];
  if (!validActions.includes(action)) {
    return c.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, 400);
  }

  // Verify ownership and get lead_id for socket emit
  const { data: reply, error: fetchError } = await supabaseAdmin
    .from('reply_events')
    .select('id, lead_id, reply_status, enrolment_id')
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (fetchError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  // Map action to reply_status
  const statusMap: Record<string, string> = {
    replied: 'replied',
    not_interested: 'archived',
    snoozed: 'snoozed',
    archived: 'archived',
  };

  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from('reply_events')
    .update({
      reply_status: statusMap[action],
      handled_at: now,
    })
    .eq('id', id);

  if (updateError) {
    console.error('[Replies] Error marking handled:', updateError);
    return c.json({ error: 'Failed to mark reply as handled' }, 500);
  }

  // For snoozed action, also pause enrollment if present
  if (action === 'snoozed' && reply.enrolment_id) {
    try {
      await supabaseAdmin
        .from('sequence_enrollments')
        .update({
          status: 'paused',
          paused_reason: 'reply_snoozed',
        })
        .eq('id', reply.enrolment_id);
    } catch (seqErr) {
      console.warn('[Replies] Failed to pause enrollment:', seqErr);
    }
  }

  // Emit socket event for real-time sync
  try {
    await emitReplyHandled({
      userId,
      replyEventId: id,
      leadId: reply.lead_id,
      action,
    });
  } catch (socketErr) {
    console.warn('[Replies] Socket emit failed (non-critical):', socketErr);
  }

  return c.json({
    success: true,
    replyId: id,
    action,
    status: statusMap[action],
    handledAt: now,
  });
});

/**
 * POST /replies/:id/regenerate-draft
 * Force-regenerate the suggested_reply_draft via Fireworks LLM.
 * Overwrites any existing cached draft on the reply_events row.
 * Returns the new draft text.
 */
router.post('/:id/regenerate-draft', async (c) => {
  const userId = getUserId(c);
  const id = c.req.param('id');

  // Fetch reply with lead data + original email context
  const { data: reply, error: replyError } = await supabaseAdmin
    .from('reply_events')
    .select(
      '*, lead:leads(business_name, email, city), original_step_execution:sequence_step_executions(id, step_number, subject, body_plain, sent_at)'
    )
    .eq('id', id)
    .eq('user_id', userId)
    .single();

  if (replyError || !reply) {
    return c.json({ error: 'Reply not found' }, 404);
  }

  if (!reply.body_plain) {
    return c.json({ error: 'Reply has no body text to draft a response for' }, 400);
  }

  const lead = reply.lead;
  const originalEmail = reply.original_step_execution;
  const llmKey = process.env.FIREWORKS_API_KEY || '';
  const llmBase = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
  const llmModel = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';

  if (!llmKey) {
    console.error('[Replies] No LLM API key configured for draft regeneration');
    return c.json({ error: 'LLM service not configured' }, 503);
  }

  try {
    const userContentParts = [
      `Company: ${lead?.business_name || 'Unknown'}`,
      `Contact: ${lead?.email || 'Unknown'}`,
      `Location: ${lead?.city || 'Unknown'}`,
    ];

    if (originalEmail) {
      userContentParts.push(`\nOriginal email we sent (Step ${originalEmail.step_number || '?'}):`);
      userContentParts.push(`Subject: ${originalEmail.subject || 'N/A'}`);
      userContentParts.push(`Body:\n${originalEmail.body_plain || 'N/A'}`);
    }

    userContentParts.push(`\nTheir reply:\n${reply.body_plain}`);
    userContentParts.push('\nDraft a professional reply that addresses their message. Keep it brief and personalized.');

    const llmResponse = await fetch(llmBase + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${llmKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: llmModel,
        messages: [
          {
            role: 'system',
            content: 'You are a professional B2B sales assistant. Write a concise, personalized reply draft. Keep it under 150 words.',
          },
          {
            role: 'user',
            content: userContentParts.join('\n'),
          },
        ],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text().catch(() => 'unknown');
      console.error('[Replies] LLM draft regeneration failed:', errText);
      return c.json({ error: 'LLM service returned an error' }, 502);
    }

    const result = await llmResponse.json();
    const draft = result.choices?.[0]?.message?.content || null;

    if (!draft) {
      return c.json({ error: 'LLM returned empty draft' }, 502);
    }

    // Save to reply_events row
    await supabaseAdmin
      .from('reply_events')
      .update({ suggested_reply_draft: draft })
      .eq('id', id);

    return c.json({
      success: true,
      replyId: id,
      draft,
    });
  } catch (err) {
    console.error('[Replies] Draft regeneration error:', err);
    return c.json({ error: 'Failed to regenerate draft' }, 500);
  }
});

export default router;
