export interface ClassificationResult {
  intent:               'interested' | 'not_now' | 'not_interested' | 'question' | 'objection' | 'referral' | 'other'
  sentiment_score:      number        // 0–100
  urgency:              'low' | 'medium' | 'high'
  confidence:           number        // 0–100
  suggested_next_action: string       // max 12 words
  key_phrase:           string        // max 10 words
  reenrol_at:           string | null // ISO date string or null
}

export async function classifyReplyIntent(input: {
  bodyPlain:            string
  subject:              string
  originalEmailSubject: string
  originalEmailBody:    string
  sequenceStepNumber:   number
  leadBusinessName:     string
  leadCategory:         string
  leadLocation:         string
}): Promise<ClassificationResult> {
  const systemPrompt = `You are an AI classifying B2B cold outreach replies for UK freelancers and small businesses.
Return ONLY valid JSON. No explanation. No markdown. No code fences.

Schema:
{
  "intent": "interested" | "not_now" | "not_interested" | "question" | "objection" | "referral" | "other",
  "sentiment_score": number (0–100, 100 = most positive),
  "urgency": "low" | "medium" | "high",
  "confidence": number (0–100, your certainty in this classification),
  "suggested_next_action": string (max 12 words, actionable instruction for the sender),
  "key_phrase": string (most intent-revealing phrase from the reply, max 10 words),
  "reenrol_at": string | null (ISO 8601 date if reply contains a time reference e.g. "try me in Q3", "back in July", "after the bank holiday". null if no time reference found.)
}

UK English rules (critical):
- "I'll have a think" = not_now (NOT not_interested)
- "Sounds interesting" = interested
- "We're sorted" = not_interested
- "Might be worth a chat" = interested
- "Leave it with me" = not_now
- "Not for us" = not_interested`

  const userPrompt = `Context:
- Business: ${input.leadBusinessName} (${input.leadCategory}, ${input.leadLocation})
- Sequence step: ${input.sequenceStepNumber}
- Original subject: ${input.originalEmailSubject}
- Original body (truncated): ${input.originalEmailBody.slice(0, 300)}

Reply subject: ${input.subject}
Reply:
${input.bodyPlain.slice(0, 800)}`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 300,
    }),
  })

  if (!response.ok) {
    const errBody = await response.text().catch(() => '')
    console.error(`[classifier] OpenRouter HTTP ${response.status}:`, errBody.slice(0, 200))
    return {
      intent: 'other',
      sentiment_score: 50,
      urgency: 'low',
      confidence: 30,
      suggested_next_action: 'Review reply manually',
      key_phrase: input.bodyPlain.slice(0, 60),
      reenrol_at: null,
    }
  }

  const data = await response.json()

  // Handle OpenRouter error responses (no choices array)
  if (!data.choices || !data.choices[0]?.message?.content) {
    const errMsg = data.error?.message || data.message || JSON.stringify(data)
    console.error('[classifier] OpenRouter unexpected response:', errMsg)
    // Return a fallback classification instead of crashing
    return {
      intent: 'other',
      sentiment_score: 50,
      urgency: 'low',
      confidence: 30,
      suggested_next_action: 'Review reply manually',
      key_phrase: input.bodyPlain.slice(0, 60),
      reenrol_at: null,
    }
  }

  const result = JSON.parse(data.choices[0].message.content) as ClassificationResult

  // Sanitise
  const validIntents = ['interested','not_now','not_interested','question','objection','referral','other']
  if (!validIntents.includes(result.intent)) result.intent = 'other'
  result.confidence = Math.max(0, Math.min(100, result.confidence ?? 50))
  result.sentiment_score = Math.max(0, Math.min(100, result.sentiment_score ?? 50))

  return result
}
