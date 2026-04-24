import { Hono } from 'hono';
import { verifyMailgunWebhook } from '../../lib/email/mailgun';
import { supabaseAdmin } from '../../db';
import { inngest } from '../../lib/inngest/client';

const router = new Hono();

/**
 * Detect if an error is a network-level failure (Supabase unreachable, etc.)
 * Returns 503 so Mailgun retries with backoff instead of hammering 500s.
 */
function isNetworkError(err: unknown): boolean {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('fetch failed') || msg.includes('econnrefused') || msg.includes('etimedout') || msg.includes('enotfound');
  }
  return false;
}

/**
 * POST /webhooks/inbound-reply
 * Handle Mailgun inbound reply webhooks.
 *
 * This is a PUBLIC endpoint -- no auth middleware.
 * Mailgun signature is verified via HMAC.
 */
router.post('/', async (c) => {
  try {
    const body = await c.req.parseBody();

    const token = body['token'] as string;
    const timestamp = body['timestamp'] as string;
    const signature = body['signature'] as string;

    if (!token || !timestamp || !signature) {
      console.warn('[Inbound Reply Webhook] Missing webhook verification fields');
      return c.json({ error: 'Missing verification fields' }, 400);
    }

    // Verify Mailgun webhook signature
    if (!verifyMailgunWebhook({ token, timestamp, signature })) {
      console.warn('[Inbound Reply Webhook] Invalid signature');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    const recipientRaw = body['recipient'] as string;
    const from = body['from'] as string;
    const subject = (body['subject'] as string) || '';
    const bodyPlain = (body['body-plain'] as string) || '';
    const bodyHtml = (body['body-html'] as string) || '';
    const strippedText = (body['stripped-text'] as string) || '';
    const strippedHtml = (body['stripped-html'] as string) || '';
    const messageHeaders = body['message-headers'] as string;
    const mailgunMessageId = (body['Message-Id'] as string) || '';
    const timestampFloat = parseFloat(timestamp);

    // Parse reply address: reply+{replyToken}@{domain} (case-insensitive)
    const replyPattern = /reply\+([^@]+)@/i;
    const match = recipientRaw.match(replyPattern);

    if (!match) {
      console.warn('[Inbound Reply Webhook] Could not parse recipient', recipientRaw);
      return c.json({ error: 'Invalid recipient format' }, 400);
    }

    const replyToken = match[1];

    // Look up the lead by reply_token (Sprint 9: opaque token, not raw leadId)
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, user_id, email, business_name')
      .eq('reply_token', replyToken)
      .single();

    if (leadError || !lead) {
      console.warn('[Inbound Reply Webhook] Lead not found for reply_token', replyToken);
      return c.json({ error: 'Lead not found' }, 404);
    }

    const leadId = lead.id;

    // Look up the most recent sequence step execution for email context
    const { data: stepExec, error: stepError } = await supabaseAdmin
      .from('sequence_step_executions')
      .select('id, enrolment_id, step_number, subject, body_plain, sent_at')
      .eq('user_id', lead.user_id)
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const enrolmentId = (stepExec as any)?.enrolment_id || null;

    // Insert the reply event into reply_events
    // Normalize sender email (strip display name if present)
    const senderEmail = (from.match(/<([^>]+)>/) || [null, from])[1];
    // Extract sender display name from "Name" <email> format
    const senderNameMatch = from.match(/^"?([^"<]+)"?\s*</);
    const senderName = senderNameMatch ? senderNameMatch[1].trim() : null;

    const replyInsertData: Record<string, unknown> = {
      lead_id: leadId,
      enrolment_id: enrolmentId,
      user_id: lead.user_id,
      sender_email: senderEmail,
      sender_name: senderName,
      mailgun_message_id: mailgunMessageId || null,
      in_reply_to: null,
      subject,
      body_plain: strippedText || bodyPlain,
      body_html: strippedHtml || bodyHtml,
      received_at: !isNaN(timestampFloat) ? new Date(timestampFloat * 1000).toISOString() : new Date().toISOString(),
      type: 'reply',
      reply_status: 'new',
      needs_review: true,
      original_step_execution_id: stepExec?.id || null,
    };

    // Try to extract In-Reply-To header if present
    if (messageHeaders) {
      try {
        const headers = JSON.parse(messageHeaders);
        const inReplyTo = headers?.find(
          (h: string[]) => h[0] === 'In-Reply-To'
        )?.[1];
        if (inReplyTo) {
          replyInsertData.in_reply_to = inReplyTo;
        }
      } catch {
        // Ignore header parse errors
      }
    }

    const { data: replyEvent, error: insertError } = await supabaseAdmin
      .from('reply_events')
      .insert(replyInsertData)
      .select()
      .single();

    if (insertError) {
      console.error('[Inbound Reply Webhook] Failed to insert reply event', insertError);
      // 23505 = unique_violation — likely duplicate mailgun_message_id
      if (insertError.code === '23505') {
        return c.json({ error: 'Duplicate mailgun_message_id — reply already recorded' }, 409);
      }
      return c.json({ error: 'Failed to save reply' }, 500);
    }

    // Send Inngest event for async processing (best-effort)
    let inngestId: string | undefined;
    const inngestEventKey = process.env.INNGEST_EVENT_KEY;
    if (inngestEventKey && inngestEventKey !== 'dev-key') {
      try {
        const inngestResult = await inngest.send({
          name: 'reply/received',
          data: {
            replyEventId: replyEvent.id,
            leadId,
            enrolmentId: enrolmentId || null,
            stepExecutionId: stepExec?.id || null,
            senderEmail: from,
            subject,
            bodyPlain: strippedText || bodyPlain,
            receivedAt: replyInsertData.received_at,
          },
        });
        inngestId = inngestResult.ids[0];
      } catch (inngestErr) {
        console.warn('[Inbound Reply Webhook] Inngest send failed (async processing will be delayed):', (inngestErr as Error).message);
      }
    } else {
      console.warn('[Inbound Reply Webhook] Skipping Inngest send — INNGEST_EVENT_KEY not configured');
    }

    return c.json({
      status: 'ok',
      replyId: replyEvent.id,
      inngestId: inngestId || null,
    });
  } catch (err) {
    if (isNetworkError(err)) {
      console.error('[Inbound Reply Webhook] Network error (Supabase/Inngest unreachable):', (err as Error).message);
      return c.json({ error: 'Service temporarily unavailable — please retry' }, 503);
    }
    console.error('[Inbound Reply Webhook] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
