// Use the getSocketServer helper from lib/socket.ts
import { getSocketServer } from '../socket'

const intentEmoji: Record<string, string> = {
  interested: '🔥',
  question: '❓',
  objection: '🤔',
  not_now: '⏰',
  not_interested: '👋',
  referral: '🤝',
  other: '💬',
}

export async function emitReplyNotification({
  userId, leadName, businessName, intent, keyPhrase, hotScore, replyEventId,
}: {
  userId: string
  leadName: string
  businessName: string
  intent: string
  keyPhrase: string
  hotScore: number
  replyEventId: string
}) {
  const io = getSocketServer()
  if (!io) return
  const emoji = intentEmoji[intent] ?? '💬'

  const title = intent === 'interested'
    ? `${emoji} ${businessName} replied — looks interested`
    : intent === 'question'
    ? `${emoji} ${businessName} has a question`
    : `${emoji} ${businessName} replied`

  io.to(`user:${userId}`).emit('reply:detected', {
    type: 'reply_detected',
    title,
    subtitle: keyPhrase ? `"${keyPhrase}"` : undefined,
    hotScore,
    replyEventId,
    intent,
    cta: 'View reply →',
    ctaHref: `/replies/${replyEventId}`,
  })
}
