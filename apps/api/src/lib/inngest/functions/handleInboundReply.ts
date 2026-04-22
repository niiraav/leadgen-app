/**
 * handleInboundReply — main reply processing pipeline
 *
 * Receives the reply/received event (with replyEventId), looks up the
 * already-inserted reply_event row, classifies intent, scores the lead,
 * updates DB, pauses/cancels sequences, emits a Socket.io notification,
 * and optionally schedules a Not-Now snooze.
 *
 * Uses supabaseAdmin (NOT Drizzle ORM) for every DB operation.
 */
import { inngest } from '../client'
import { supabaseAdmin } from '../../../db'
import { runRulesFilter } from '../../reply/rulesFilter'
import { classifyReplyIntent } from '../../reply/classifier'
import { computeHotScore } from '../../reply/hotScore'
import { emitReplyNotification } from '../../reply/notifications'
import { handleSequenceAction } from '../../reply/sequenceAction'

// ── Event schema (matches what the webhook sends) ──────────────────
interface ReplyReceivedEvent {
  name: 'reply/received'
  data: {
    replyEventId: string
    leadId: string
    enrolmentId?: string | null
    stepExecutionId?: string | null
    senderEmail: string
    subject: string
    bodyPlain: string
    receivedAt: string          // ISO string
  }
}

// ── Function ──────────────────────────────────────────────────────
export const handleInboundReply = inngest.createFunction(
  {
    id: 'handle-inbound-reply',
    name: 'Handle Inbound Reply',
    triggers: [{ event: 'reply/received' }],
  },
  async ({ event, step }: any) => {
    const d = event.data as ReplyReceivedEvent['data']
    const startTime = Date.now()

    // ── 1. Look up the already-inserted reply_event row ──────────
    const replyRow = await step.run('fetch-reply-event', async () => {
      const { data, error } = await supabaseAdmin
        .from('reply_events')
        .select('*')
        .eq('id', d.replyEventId)
        .single()

      if (error || !data) {
        throw new Error(`reply_event not found: ${d.replyEventId} — ${error?.message ?? 'no data'}`)
      }
      return data as any
    })

    // ── 2. Look up the lead for context ──────────────────────────
    const lead = await step.run('fetch-lead', async () => {
      const { data, error } = await supabaseAdmin
        .from('leads')
        .select('id, user_id, business_name, category, city, email, status, email_status')
        .eq('id', d.leadId)
        .single()

      if (error || !data) {
        throw new Error(`Lead not found: ${d.leadId} — ${error?.message ?? 'no data'}`)
      }
      return data as any
    })

    // ── 3. Run rules pre-filter on the reply ─────────────────────
    const rulesResult = await step.run('run-rules-filter', async () => {
      // Build headers object from stored data (best effort)
      const headers: Record<string, string> = {}
      if (replyRow.in_reply_to) {
        headers['in-reply-to'] = replyRow.in_reply_to
      }

      return runRulesFilter({
        headers,
        subject: replyRow.subject || '',
        bodyPlain: replyRow.body_plain || '',
        senderEmail: replyRow.sender_email || '',
      })
    })

    // ── 4. Update reply_event type from rules filter ─────────────
    await step.run('update-reply-type', async () => {
      const { error } = await supabaseAdmin
        .from('reply_events')
        .update({ type: rulesResult.type })
        .eq('id', replyRow.id)

      if (error) {
        console.warn('[handleInboundReply] Failed to update reply_event type:', error.message)
      }
    })

    // ── 5. Handle non-reply types (bounce, OOO, unsubscribe) ────
    if (rulesResult.type !== 'reply') {
      const nonReplyResult = await step.run('handle-non-reply', async () => {
        switch (rulesResult.type) {
          case 'out_of_office': {
            await supabaseAdmin
              .from('leads')
              .update({ status: 'out_of_office', engagement_status: 'out_of_office' })  // Phase 3: dual-write — out_of_office is an engagement status
              .eq('id', d.leadId)
              .eq('user_id', lead.user_id)
            // Log activity with field-aware label
            try {
              await supabaseAdmin
                .from('lead_activities')
                .insert({
                  lead_id: d.leadId,
                  user_id: lead.user_id,
                  type: 'status_changed',
                  description: 'Out of office auto-reply detected',
                  field: 'engagement_status',
                })
            } catch (actErr) {
              console.warn('[handleInboundReply] Activity log failed for out_of_office:', actErr)
            }
            return { type: 'out_of_office', status: 'updated' }
          }
          case 'bounce_hard': {
            // Sprint 2 patch: do NOT overwrite lead status with 'bounced_hard'
            // (not in LeadStatus union). Only update email_status.
            // If email_status was already 'bounced', skip the activity log.
            const prevStatus = lead.email_status
            await supabaseAdmin
              .from('leads')
              .update({ email_status: 'bounced' })
              .eq('id', d.leadId)
              .eq('user_id', lead.user_id)
            // Log activity only if email_status actually changed
            if (prevStatus !== 'bounced') {
              try {
                await supabaseAdmin
                  .from('lead_activities')
                  .insert({
                    lead_id: d.leadId,
                    user_id: lead.user_id,
                    type: 'status_changed',
                    description: 'Email bounced (hard bounce)',
                  })
              } catch (actErr) {
                console.warn('[handleInboundReply] Activity log failed for bounce_hard:', actErr)
              }
            }
            return { type: 'bounce_hard', status: 'updated' }
          }
          case 'bounce_soft': {
            await supabaseAdmin
              .from('leads')
              .update({ email_status: 'bounced_soft' })
              .eq('id', d.leadId)
              .eq('user_id', lead.user_id)
            return { type: 'bounce_soft', status: 'updated' }
          }
          case 'unsubscribe': {
            await supabaseAdmin
              .from('leads')
              .update({ status: 'do_not_contact', do_not_contact: true })  // Phase 3: dual-write domain column
              .eq('id', d.leadId)
              .eq('user_id', lead.user_id)
            // Log activity — Phase 3: field-aware label "Marked do not contact"
            try {
              await supabaseAdmin
                .from('lead_activities')
                .insert({
                  lead_id: d.leadId,
                  user_id: lead.user_id,
                  type: 'status_changed',
                  description: 'Unsubscribed / marked do not contact',
                  field: 'do_not_contact',
                })
            } catch (actErr) {
              console.warn('[handleInboundReply] Activity log failed for unsubscribe:', actErr)
            }
            return { type: 'unsubscribe', status: 'updated' }
          }
          default:
            return { type: rulesResult.type, status: 'no_action' }
        }
      })

      // Also cancel/pause the sequence enrollment
      await step.run('sequence-action-non-reply', async () => {
        await handleSequenceAction({
          intent: nonReplyResult.type,
          enrolmentId: d.enrolmentId,
          leadId: d.leadId,
        })
      })

      // Mark as processed (no LLM needed)
      await step.run('mark-processed-non-reply', async () => {
        const { error } = await supabaseAdmin
          .from('reply_events')
          .update({
            intent_label: null,
            needs_review: false,
            processed_at: new Date().toISOString(),
            processing_duration_ms: Date.now() - startTime,
            inngest_event_id: event.id || null,
          })
          .eq('id', replyRow.id)
        if (error) {
          throw new Error(`[handleInboundReply] Failed to mark processed: ${error.message}`)
        }
      })

      return {
        skipped: true,
        reason: `non_reply_type: ${rulesResult.type}`,
        replyEventId: replyRow.id,
        nonReplyResult,
      }
    }

    // ── 6. LLM classification ─────────────────────────────────────
    const classification = await step.run('classify-intent', async () => {
      return classifyReplyIntent({
        bodyPlain: replyRow.body_plain || '',
        subject: replyRow.subject || '',
        originalEmailSubject: '',  // webhook doesn't pass original sent subject
        originalEmailBody: '',     // webhook doesn't pass original sent body
        sequenceStepNumber: 0,     // unknown from webhook data
        leadBusinessName: lead.business_name || '',
        leadCategory: lead.category || '',
        leadLocation: lead.city || '',
      })
    })

    // ── 7. Compute hot score ──────────────────────────────────────
    const hotScore = await step.run('compute-hot-score', async () => {
      return computeHotScore({
        sentimentScore: classification.sentiment_score,
        urgency: classification.urgency,
        stepNumber: 0,
        receivedAt: d.receivedAt,
      })
    })

    // ── 8. Determine needs_review flag ────────────────────────────
    const needsReview = classification.confidence < 60 || classification.intent === 'other'

    // ── 9. Update reply_events with classification ────────────────
    await step.run('update-reply-event', async () => {
      const { error } = await supabaseAdmin
        .from('reply_events')
        .update({
          intent_label: classification.intent,
          sentiment_score: classification.sentiment_score,
          urgency: classification.urgency,
          confidence: classification.confidence,
          suggested_next_action: classification.suggested_next_action,
          key_phrase: classification.key_phrase,
          needs_review: needsReview,
          hot_score: hotScore,
          processed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - startTime,
          inngest_event_id: event.id || null,
        })
        .eq('id', replyRow.id)

      if (error) {
        throw new Error(`Failed to update reply_event: ${error.message}`)
      }
    })

    // ── 10. Update lead record ────────────────────────────────────
    const leadUpdate = await step.run('update-lead', async () => {
      const leadPatch: Record<string, unknown> = {
        status: 'replied',
        hot_score: hotScore,
        last_reply_at: d.receivedAt,
        last_reply_intent: classification.intent,
      }

      // For not_now, set a re-scheduled follow-up
      if (classification.intent === 'not_now' && classification.reenrol_at) {
        leadPatch.next_action_at = classification.reenrol_at
        leadPatch.next_action_note = classification.suggested_next_action
      }

      const { data, error } = await supabaseAdmin
        .from('leads')
        .update(leadPatch)
        .eq('id', d.leadId)
        .eq('user_id', lead.user_id)
        .select('id, status')
        .single()

      if (error) {
        console.warn('[handleInboundReply] Lead update failed:', error.message, '— lead may not exist')
        return { updated: false, error: error.message }
      }
      return { updated: true, leadId: (data as any).id }
    })

    // ── 11. Handle sequence action (pause/cancel) ─────────────────
    await step.run('sequence-action', async () => {
      await handleSequenceAction({
        intent: classification.intent,
        enrolmentId: d.enrolmentId,
        leadId: d.leadId,
      })
    })

    // ── 12. Emit Socket.io notification + persist to DB ──────────
    await step.run('emit-notification', async () => {
      const emoji: Record<string, string> = {
        interested: '🔥', question: '❓', objection: '🤔',
        not_now: '⏰', not_interested: '👋', referral: '🤝', other: '💬',
      }
      const icon = emoji[classification.intent] ?? '💬'

      const title = classification.intent === 'interested'
        ? `${icon} ${lead.business_name || 'Lead'} replied — looks interested`
        : classification.intent === 'question'
        ? `${icon} ${lead.business_name || 'Lead'} has a question`
        : `${icon} ${lead.business_name || 'Lead'} replied`

      const notifBody = classification.key_phrase
        ? `"${classification.key_phrase}"`
        : undefined

      // Persist to notifications table
      try {
        await supabaseAdmin
          .from('notifications')
          .insert({
            user_id: lead.user_id,
            type: 'reply_received',
            title,
            body: notifBody ?? null,
            lead_id: d.leadId,
            read: false,
          })
      } catch (dbErr) {
        console.warn('[handleInboundReply] Notification DB insert failed:', dbErr)
      }

      // Also emit via Socket.io for real-time
      try {
        await emitReplyNotification({
          userId: lead.user_id,
          leadName: lead.business_name || lead.email || 'Lead',
          businessName: lead.business_name || '',
          intent: classification.intent,
          keyPhrase: classification.key_phrase,
          hotScore,
          replyEventId: replyRow.id,
        })
      } catch (err) {
        // Socket may not be initialized if running via Inngest worker
        console.warn('[handleInboundReply] Socket notification failed:', err)
      }
    })

    // ── 13. Schedule Not-Now snooze if applicable ─────────────────
    const snoozeResult = await step.run('schedule-snooze', async () => {
      if (classification.intent !== 'not_now' || !classification.reenrol_at) {
        return { scheduled: false, reason: 'not_applicable' }
      }

      const sleepUntilMs = new Date(classification.reenrol_at).getTime()
      if (isNaN(sleepUntilMs)) {
        return { scheduled: false, reason: 'invalid_date' }
      }

      // Schedule a follow-up event for later
      await step.sendEvent('schedule-not-now-snooze', {
        name: 'reply/not-now-snooze',
        data: {
          leadId: d.leadId,
          enrolmentId: d.enrolmentId,
          userId: lead.user_id,
          sequenceId: null,
          reenrolAt: classification.reenrol_at,
          originalSequenceId: null,
        },
        ts: sleepUntilMs,
      })

      return { scheduled: true, reenrolAt: classification.reenrol_at }
    })

    // ── Return summary ────────────────────────────────────────────
    return {
      replyEventId: replyRow.id,
      intent: classification.intent,
      hotScore,
      needsReview,
      leadUpdated: leadUpdate.updated,
      snooze: snoozeResult,
    }
  }
)
