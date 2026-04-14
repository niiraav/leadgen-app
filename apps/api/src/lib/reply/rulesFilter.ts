interface WebhookPayload {
  headers:     Record<string, string>
  subject:     string
  bodyPlain:   string
  senderEmail: string
}

interface RuleResult {
  type:    'reply' | 'out_of_office' | 'bounce_hard' | 'bounce_soft' | 'unsubscribe'
  reason?: string
}

export function runRulesFilter(payload: WebhookPayload): RuleResult {
  const h       = payload.headers
  const subject = (payload.subject   || '').toLowerCase()
  const body    = (payload.bodyPlain || '').toLowerCase()
  const sender  = (payload.senderEmail || '').toLowerCase()

  // Hard / soft bounce
  if (
    h['x-failed-recipients'] ||
    subject.includes('delivery status notification') ||
    subject.includes('mail delivery subsystem') ||
    subject.includes('undeliverable') ||
    subject.includes('returned mail') ||
    sender.includes('mailer-daemon') ||
    sender.includes('postmaster')
  ) {
    const isSoft = body.includes('mailbox full')
                || body.includes('temporarily')
                || body.includes('try again later')
    return { type: isSoft ? 'bounce_soft' : 'bounce_hard' }
  }

  // Out of office
  if (
    h['auto-submitted'] === 'auto-replied' ||
    h['x-autoreply'] ||
    h['x-autorespond'] ||
    subject.includes('out of office') ||
    subject.includes('automatic reply') ||
    subject.includes('auto-reply') ||
    subject.includes("i'm away") ||
    subject.includes('on holiday') ||
    subject.includes('on leave') ||
    body.includes("i'm on holiday") ||
    body.includes('i am on holiday') ||
    body.includes("i'm on leave") ||
    body.includes('i am on leave') ||
    body.includes('i will be out of office') ||
    body.includes('i am out of office') ||
    body.includes("i'm currently out") ||
    body.includes('back on') ||
    body.includes('limited access to email') ||
    body.includes('returning on')
  ) {
    return { type: 'out_of_office' }
  }

  // Unsubscribe / GDPR opt-out
  if (
    body.includes('unsubscribe') ||
    body.includes('remove me') ||
    body.includes('stop emailing') ||
    body.includes('stop contacting') ||
    body.includes('opt out') ||
    body.includes('opt-out') ||
    body.includes('please remove') ||
    body.includes('do not contact') ||
    body.includes('gdpr')
  ) {
    return { type: 'unsubscribe', reason: 'opt_out_keyword' }
  }

  return { type: 'reply' }
}

export type { WebhookPayload, RuleResult }
