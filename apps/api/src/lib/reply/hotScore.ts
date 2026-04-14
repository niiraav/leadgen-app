export function computeHotScore({
  sentimentScore, urgency, stepNumber, receivedAt,
}: {
  sentimentScore: number
  urgency:        'low' | 'medium' | 'high'
  stepNumber:     number
  receivedAt:     string
}): number {
  const urgencyWeight = { low: 0, medium: 15, high: 30 }
  const stepBonus     = Math.min(stepNumber * 5, 20)

  // Recency: full score within 2hrs, linear decay to 0 over 48hrs
  const hoursAgo    = (Date.now() - new Date(receivedAt).getTime()) / 3_600_000
  const recencyScore = Math.max(0, 1 - hoursAgo / 48) * 20

  const raw = (sentimentScore * 0.5)
            + urgencyWeight[urgency]
            + stepBonus
            + recencyScore

  return Math.round(Math.min(100, raw))
}
