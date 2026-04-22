import Mailgun from 'mailgun.js'
import FormData from 'form-data'
import { createHmac } from 'crypto'

const mailgun = new Mailgun(FormData)

export const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY!,
}) as any

export const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN!
export const INBOUND_REPLY_DOMAIN = process.env.INBOUND_REPLY_DOMAIN!

/**
 * Verify a Mailgun inbound webhook signature.
 * Callers should reject the webhook if this returns false.
 */
export function verifyMailgunWebhook({
  token,
  timestamp,
  signature,
}: {
  token: string
  timestamp: string
  signature: string
}): boolean {
  const key = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || process.env.MAILGUN_API_KEY!
  const hmac = createHmac('sha256', key)
  hmac.update(`${timestamp}${token}`)
  const digest = hmac.digest('hex')
  return digest === signature
}
