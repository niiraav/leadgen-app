import { supabaseAdmin } from '../../db'

export async function handleSequenceAction({
  intent, enrolmentId, leadId,
}: { intent: string; enrolmentId: string; leadId: string }) {
  switch (intent) {
    case 'interested':
    case 'not_interested':
    case 'referral':
      await supabaseAdmin
        .from('sequence_enrollments')
        .update({ status: 'cancelled', paused_reason: 'reply_detected' })
        .eq('id', enrolmentId)
      break

    case 'not_now':
    case 'question':
    case 'objection':
    default:
      await supabaseAdmin
        .from('sequence_enrollments')
        .update({ status: 'paused', paused_reason: 'reply_detected' })
        .eq('id', enrolmentId)
      break

    case 'out_of_office':
      // No action — sequence continues via BullMQ as normal
      break
  }
}
