import { mg, MAILGUN_DOMAIN, INBOUND_REPLY_DOMAIN } from './mailgun'
import { supabaseAdmin } from '../../db'

export interface SendEmailParams {
  to:               string
  fromName:         string   // e.g. "James Ward"
  fromEmail:        string   // e.g. "james@example.com"
  subject:          string
  html:             string
  text:             string
  leadId:           string
  replyToken:       string   // Sprint 7: opaque token for reply tracking
  enrolmentId:      string
  sequenceStepId:   string
  sequenceId:       string     // actual sequence UUID (not step ID)
  userId:           string   // Supabase auth user id
  stepNumber:       number   // step index in the sequence
}

export interface SendEmailResult {
  messageId: string
  replyTo:   string
}

export async function sendOutreachEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const replyTo = `reply+${params.replyToken}@${INBOUND_REPLY_DOMAIN}`

  const result = await mg.messages.create(MAILGUN_DOMAIN, {
    to:              params.to,
    from:            `${params.fromName} <${params.fromEmail}>`,
    subject:         params.subject,
    html:            params.html,
    text:            params.text,
    'h:Reply-To':             replyTo,
    'h:X-Findr-Lead-Id':      params.leadId,
    'h:X-Findr-Enrolment-Id': params.enrolmentId,
    'h:X-Findr-Step-Id':      params.sequenceStepId,
  })

  await supabaseAdmin
    .from('sequence_step_executions')
    .insert({
      sequence_id:    params.sequenceId,     // actual sequence UUID
      enrolment_id:   params.enrolmentId,
      user_id:        params.userId,
      step_number:    params.stepNumber,
      subject:        params.subject,
      body_plain:     params.text,
      mailgun_message_id: result.id,
      sent_via:       'mailgun',
    })

  return {
    messageId: result.id ?? '',
    replyTo,
  }
}
