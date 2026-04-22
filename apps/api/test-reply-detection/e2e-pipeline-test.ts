/**
 * E2E Pipeline Test for handleInboundReply
 *
 * Tests the full business logic without the Inngest framework:
 * 1. Creates a reply_event row
 * 2. Runs rules filter
 * 3. Classifies intent via LLM
 * 4. Computes hot score
 * 5. Updates lead
 * 6. Handles sequence action
 * 7. Verifies DB state
 * 8. Cleans up
 */
import { supabaseAdmin } from '../src/db'
import { runRulesFilter } from '../src/lib/reply/rulesFilter'
import { classifyReplyIntent } from '../src/lib/reply/classifier'
import { computeHotScore } from '../src/lib/reply/hotScore'
import { handleSequenceAction } from '../src/lib/reply/sequenceAction'

const TEST_LEAD_ID = 'fbceb879-5c98-4fde-8299-64d97ccd659d'
const TEST_USER_ID = 'a5c431a2-ecb2-4a28-a1ee-03221e8870cc'
const TEST_ENROLMENT_ID = 'c76d9df9-62e7-4fa5-953f-0289dd6bbf3d'

let createdReplyId: string | null = null

async function cleanup() {
  if (createdReplyId) {
    await supabaseAdmin.from('reply_events').delete().eq('id', createdReplyId)
    console.log(`Cleaned up reply_event ${createdReplyId}`)
  }
  // Reset lead status
  await supabaseAdmin.from('leads').update({
    status: 'new',
    hot_score: null,
    last_reply_at: null,
    last_reply_intent: null,
  }).eq('id', TEST_LEAD_ID)
  // Reset enrollment status
  await supabaseAdmin.from('sequence_enrollments').update({
    status: 'active',
    paused_reason: null,
  }).eq('id', TEST_ENROLMENT_ID)
}

async function main() {
  try {
    // ── 0. Fetch lead baseline ───────────────────────────────────────
    const { data: leadBefore } = await supabaseAdmin
      .from('leads')
      .select('id, status, hot_score, last_reply_at, last_reply_intent, email_status')
      .eq('id', TEST_LEAD_ID)
      .single()

    console.log('0. Lead BEFORE:', JSON.stringify(leadBefore, null, 2))

    // ── 1. Create reply_event ────────────────────────────────────────
    const { data: replyEvent, error: insertErr } = await supabaseAdmin
      .from('reply_events')
      .insert({
        lead_id: TEST_LEAD_ID,
        enrolment_id: TEST_ENROLMENT_ID,
        user_id: TEST_USER_ID,
        sender_email: 'john@example.com',
        mailgun_message_id: `test-${Date.now()}@mailgun`,
        subject: 'Re: Your outreach',
        body_plain: "Hi, thanks for reaching out. I'm quite interested in learning more about your services. Could we schedule a quick call next week?",
        body_html: '<p>Hi, thanks for reaching out. I\'m quite interested...</p>',
        received_at: new Date().toISOString(),
        type: 'reply',
        needs_review: true,
      })
      .select()
      .single()

    if (insertErr || !replyEvent) {
      throw new Error(`Failed to create reply_event: ${insertErr?.message}`)
    }

    createdReplyId = replyEvent.id
    console.log(`1. Created reply_event: ${createdReplyId}`)

    // ── 2. Rules filter ──────────────────────────────────────────────
    const rulesResult = runRulesFilter({
      headers: {},
      subject: replyEvent.subject,
      bodyPlain: replyEvent.body_plain,
      senderEmail: replyEvent.sender_email,
    })

    console.log('2. Rules filter result:', rulesResult)

    if (rulesResult.type !== 'reply') {
      console.log('Rules classified as non-reply. Stopping pipeline test.')
      return
    }

    // ── 3. LLM Classification ──────────────────────────────────────
    console.log('3. Calling LLM classifier...')
    const classification = await classifyReplyIntent({
      bodyPlain: replyEvent.body_plain,
      subject: replyEvent.subject,
      originalEmailSubject: '',
      originalEmailBody: '',
      sequenceStepNumber: 1,
      leadBusinessName: 'Fix Corp 3',
      leadCategory: 'plumber',
      leadLocation: 'London',
    })

    console.log('3. Classification result:', JSON.stringify(classification, null, 2))

    // ── 4. Hot score ─────────────────────────────────────────────────
    const hotScore = computeHotScore({
      sentimentScore: classification.sentiment_score,
      urgency: classification.urgency,
      stepNumber: 1,
      receivedAt: replyEvent.received_at,
    })

    console.log('4. Hot score:', hotScore)

    // ── 5. Update lead ───────────────────────────────────────────────
    const leadPatch: Record<string, any> = {
      status: 'replied',
      hot_score: hotScore,
      last_reply_at: replyEvent.received_at,
      last_reply_intent: classification.intent,
    }

    if (classification.intent === 'not_now' && classification.reenrol_at) {
      leadPatch.next_action_at = classification.reenrol_at
      leadPatch.next_action_note = classification.suggested_next_action
    }

    const { data: updatedLead, error: updateErr } = await supabaseAdmin
      .from('leads')
      .update(leadPatch)
      .eq('id', TEST_LEAD_ID)
      .select('id, status, hot_score, last_reply_at, last_reply_intent')
      .single()

    if (updateErr || !updatedLead) {
      throw new Error(`Lead update failed: ${updateErr?.message}`)
    }

    console.log('5. Lead AFTER update:', JSON.stringify(updatedLead, null, 2))

    // ── 6. Sequence action ───────────────────────────────────────────
    await handleSequenceAction({
      intent: classification.intent,
      enrolmentId: TEST_ENROLMENT_ID,
      leadId: TEST_LEAD_ID,
    })

    const { data: enrollmentAfter } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('id, status, paused_reason')
      .eq('id', TEST_ENROLMENT_ID)
      .single()

    console.log('6. Enrollment AFTER action:', JSON.stringify(enrollmentAfter, null, 2))

    // ── 7. Update reply_event with classification ─────────────────────
    const { error: replyUpdateErr } = await supabaseAdmin
      .from('reply_events')
      .update({
        intent_label: classification.intent,
        sentiment_score: classification.sentiment_score,
        urgency: classification.urgency,
        confidence: classification.confidence,
        suggested_next_action: classification.suggested_next_action,
        key_phrase: classification.key_phrase,
        needs_review: classification.confidence < 60 || classification.intent === 'other',
        hot_score: hotScore,
        processed_at: new Date().toISOString(),
      })
      .eq('id', createdReplyId)

    if (replyUpdateErr) {
      console.warn('Reply event update failed:', replyUpdateErr.message)
    }

    // ── 8. Verify reply_event state ─────────────────────────────────
    const { data: replyAfter } = await supabaseAdmin
      .from('reply_events')
      .select('*')
      .eq('id', createdReplyId)
      .single()

    console.log('8. Reply event AFTER processing:', JSON.stringify({
      id: replyAfter.id,
      intent_label: replyAfter.intent_label,
      hot_score: replyAfter.hot_score,
      confidence: replyAfter.confidence,
      needs_review: replyAfter.needs_review,
      processed_at: replyAfter.processed_at,
    }, null, 2))

    // ── Summary ──────────────────────────────────────────────────────
    console.log('\n=== E2E PIPELINE TEST SUMMARY ===')
    console.log('Lead status:', leadBefore.status, '->', updatedLead.status)
    console.log('Hot score:', updatedLead.hot_score)
    console.log('Intent:', classification.intent)
    console.log('Confidence:', classification.confidence)
    console.log('Enrollment status:', enrollmentAfter?.status)
    console.log('Reply processed:', !!replyAfter.processed_at)
    console.log('\nAll pipeline steps completed successfully.')

  } catch (err) {
    console.error('\nE2E PIPELINE TEST FAILED:', err)
    process.exitCode = 1
  } finally {
    console.log('\nCleaning up test data...')
    await cleanup()
  }
}

main()
