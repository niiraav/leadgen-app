import { Hono } from 'hono';
import { verifyMailgunWebhook } from '../../lib/email/mailgun';
import { supabaseAdmin } from '../../db';
import { inngest } from '../../lib/inngest/client';

const router = new Hono();

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

    // Parse reply address: reply+{replyToken}@{domain}
    const replyPattern = /reply\+([^@]+)@/;
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
    const replyInsertData: Record<string, unknown> = {
      lead_id: leadId,
      enrolment_id: enrolmentId,
      user_id: lead.user_id,
      sender_email: from,
      mailgun_message_id: mailgunMessageId || null,
      in_reply_to: null,
      subject,
      body_plain: strippedText || bodyPlain,
      body_html: strippedHtml || bodyHtml,
      received_at: timestampFloat ? new Date(timestampFloat * 1000).toISOString() : new Date().toISOString(),
      type: 'reply',
      needs_review: true,
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
      return c.json({ error: 'Failed to save reply' }, 500);
    }

    // Send Inngest event for async processing
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

    return c.json({
      status: 'ok',
      replyId: replyEvent.id,
      inngestId: inngestResult.ids[0],
    });
  } catch (err) {
    console.error('[Inbound Reply Webhook] Unexpected error:', err);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
