/**
 * handleNotNowSnooze — resumes a lead after a "not now" reply
 *
 * Triggered by the reply/not-now-snooze event that was scheduled
 * by handleInboundReply.  Sleeps until the agreed re-enrolment date,
 * checks that the lead is still eligible, then updates the lead
 * record so the sequence scheduler can pick it up again.
 *
 * Uses supabaseAdmin (NOT Drizzle ORM) for every DB operation.
 */
import { inngest } from '../client'
import { supabaseAdmin } from '../../../db'

interface NotNowSnoozeEvent {
  name: 'reply/not-now-snooze'
  data: {
    leadId: string
    enrolmentId: string
    userId: string
    sequenceId?: string        // fallback/original sequence
    reenrolAt: string          // ISO date – the date to wake up
    originalSequenceId: string // which sequence to restore
  }
}

export const handleNotNowSnooze = inngest.createFunction(
  {
    id: 'handle-not-now-snooze',
    name: 'Handle Not-Now Snooze (Re-enrolment)',
    triggers: [{ event: 'reply/not-now-snooze' }],
  },
  async ({ event, step }: any) => {
    const d = event.data

    // ── 1. Wait until re-enrol date ───────────────────────────────
    // step.sleepUntil takes an ISO string or epoch ms.  The Inngest
    // runtime handles the actual delay across serverless cold-starts.
    await step.sleepUntil('wait-for-reenrol-date', d.reenrolAt)

    // ── 2. Verify lead still exists and is eligible ───────────────
    const leadCheck = await step.run('check-lead-eligible', async () => {
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('id, status, user_id')
        .eq('id', d.leadId)
        .eq('user_id', d.userId)
        .limit(1)
        .maybeSingle()

      if (!lead) {
        return { eligible: false, reason: 'lead_not_found' }
      }

      const leadRecord = lead as unknown as {
        id: string
        status: string
        user_id: string
      }

      if (leadRecord.status === 'do_not_contact') {
        return { eligible: false, reason: 'do_not_contact' }
      }

      return { eligible: true, status: leadRecord.status }
    })

    if (!leadCheck.eligible) {
      return {
        skipped: true,
        reason: `lead_ineligible: ${leadCheck.reason}`,
        leadId: d.leadId,
      }
    }

    // ── 3. Check that the sequence enrollment still exists ────────
    const enrollmentCheck = await step.run('check-enrollment', async () => {
      if (!d.enrolmentId) return { exists: false }

      const { data: enrollment } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('id, status')
        .eq('id', d.enrolmentId)
        .limit(1)
        .maybeSingle()

      if (!enrollment) {
        return { exists: false }
      }

      return {
        exists: true,
        status: (enrollment as any).status,
      }
    })

    // ── 4. Re-activate the lead ───────────────────────────────────
    const reactivation = await step.run('reactivate-lead', async () => {
      const leadPatch: Record<string, unknown> = {
        status: 'replied',                // back into the pool
        next_action_at: null,             // clear old snooze
        next_action_note: null,
        hot_score: 0,                     // reset — treat as fresh touchpoint
      }

      const { data, error } = await supabaseAdmin
        .from('leads')
        .update(leadPatch)
        .eq('id', d.leadId)
        .eq('user_id', d.userId)
        .select('id, status')
        .single()

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, leadId: (data as any).id }
    })

    // ── 5. Re-enroll in the sequence if enrollment still exists ───
    const reEnrollment = await step.run('re-enroll-sequence', async () => {
      if (!enrollmentCheck.exists) {
        // Create a fresh enrollment so the sequence processor picks it up
        const { data, error } = await supabaseAdmin
          .from('sequence_enrollments')
          .insert({
            lead_id: d.leadId,
            user_id: d.userId,
            sequence_id: d.originalSequenceId,
            status: 'active',
            enrolled_at: new Date().toISOString(),
            next_step_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (error) {
          return { success: false, error: error.message, method: 'new_enrollment' }
        }

        return { success: true, enrollmentId: (data as any).id, method: 'new_enrollment' }
      }

      // Resume existing paused enrollment
      const { error } = await supabaseAdmin
        .from('sequence_enrollments')
        .update({
          status: 'active',
          next_step_at: new Date().toISOString(),
        })
        .eq('id', d.enrolmentId)

      if (error) {
        return { success: false, error: error.message, method: 'resume_enrollment' }
      }

      return { success: true, enrollmentId: d.enrolmentId, method: 'resume_enrollment' }
    })

    return {
      success: reactivation.success && reEnrollment.success,
      leadId: d.leadId,
      reactivation,
      reEnrollment,
    }
  }
)
