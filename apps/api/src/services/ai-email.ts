import OpenAI from 'openai';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

if (!OPENROUTER_KEY) {
  console.warn('[OpenRouter] OPENROUTER_API_KEY not set — AI email generation will fail');
}

const openai = new OpenAI({
  apiKey: OPENROUTER_KEY,
  baseURL: OPENROUTER_BASE,
  defaultHeaders: {
    'HTTP-Referer': 'https://leadgen-app.local',
    'X-Title': 'LeadGen App',
  },
});

export type AILeadInfo = {
  business_name: string;
  email?: string;
  phone?: string;
  website_url?: string;
  category?: string;
  city?: string;
  country?: string;
  rating?: number;
};

export type AIEmailGenerationRequest = {
  lead: AILeadInfo;
  tone: string;
  purpose: string;
  customInstructions?: string;
  recontact?: boolean;
  profile?: {
    usp?: string | null;
    services?: string[];
    signoff?: string | null;
    cta?: string | null;
    calendly?: string | null;
    linkedin?: string | null;
  };
};

export type AIEmailResponse = {
  subject: string;
  body: string;
};

export function cleanBusinessName(raw: string): string {
  let name = raw;
  name = name.split('|')[0].trim();
  name = name.replace(/[^\w\s.\-',/&\$#@()]/gu, '').trim();
  name = name.replace(/\b(24\/7|24h|24\s*hr|24\s*hours?)\b/gi, '').trim();
  name = name.replace(/^[^\w]+|[^\w]+$/g, '').trim();
  name = name.replace(/\s{2,}/g, ' ').trim();
  if (name.length > 60) {
    name = name.substring(0, 60).replace(/\s+\S*$/, '').trim();
  }
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return name || 'Unknown Business';
}

export async function generateEmailWithAI(request: AIEmailGenerationRequest): Promise<AIEmailResponse> {
  const { lead, tone, purpose, customInstructions, recontact, profile } = request;
  const basePrompt = `You are a professional cold email writer for a B2B lead generation agency.
Write personalized, concise outreach emails.
Always return valid JSON with "subject" and "body" fields.
No markdown, no code fences — just raw JSON.

RULES FOR GREETING:
- Start with a greeting that references the lead's company name, e.g. "Hi [Company] team," or "Hello at [Company],".
- NEVER use placeholders like [Name], [First Name], [Recipient], or [Company Manager].
- If no company name is available, use "Hi there,".

RULES FOR SIGN-OFF:
- Use the exact sign-off provided in the sender profile below.
- Follow it with the sender's real name from the sender profile.
- NEVER use [Your Name], [Your Company], or any placeholder.`;

  // Build profile context for the prompt
  const p = (request as any).profile || {};
  const ctx: string[] = [];
  if (p.usp) ctx.push('Pitch: ' + p.usp);
  if (p.services && p.services.length) ctx.push('Services: ' + p.services.join(', '));
  if (p.calendly) ctx.push('Calendly link: ' + p.calendly);
  if (p.linkedin) ctx.push('LinkedIn: ' + p.linkedin);
  const profileBlock = ctx.length ? '\nSender profile:\n' + ctx.join('\n') + '\nSign off: ' + (p.signoff || 'Best regards') + '\nSender name: ' + (p.full_name || '') : '';

  const systemPrompt = recontact
    ? basePrompt + '\n\nIMPORTANT: This is a RE-ENGAGEMENT email. The lead did NOT respond to previous outreach.\nUse a completely different angle than a typical first-contact email.\nKeep it SHORT (4-5 sentences max). Be direct and respectful.\nDo NOT reference previous emails or mention that they didn\'t reply.\nUse a friendly, casual tone. End with a simple yes/no question to lower friction.'
    : basePrompt;

  const leadDescription = [
    `Business: ${cleanBusinessName(lead.business_name)}`,
    lead.category ? `Category: ${lead.category}` : '',
    lead.city ? `Location: ${lead.city}${lead.country ? `, ${lead.country}` : ''}` : '',
    lead.rating ? `Rating: ${lead.rating}/5` : '',
    lead.website_url ? `Website: ${lead.website_url}` : '',
    lead.email ? `Email: ${lead.email}` : '',
    lead.phone ? `Phone: ${lead.phone}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const userPrompt = `Write a cold email with the following parameters:

Lead details:
${leadDescription}
${profileBlock}

Tone: ${tone}
Purpose: ${purpose}
${customInstructions ? `Additional instructions: ${customInstructions}` : ''}

Return ONLY a JSON object with "subject" and "body" keys. Make the email personalized to this business.`;

  const response = await openai.chat.completions.create({
    model: 'google/gemma-2-9b-it',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.7,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from AI model');
  }

  try {
    // Extract JSON from response — model may wrap in markdown code blocks
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // Also try to find JSON if there's extra text
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr) as AIEmailResponse;

    if (!parsed.subject || !parsed.body) {
      throw new Error('Missing subject or body in AI response');
    }

    return {
      subject: parsed.subject,
      body: parsed.body,
    };
  } catch (parseError) {
    // If JSON parsing fails, return raw content as body
    console.warn('[AI Email] Failed to parse JSON response, falling back to raw content');
    return {
      subject: `Outreach to ${cleanBusinessName(lead.business_name)}`,
      body: content,
    };
  }
}

export async function classifyReply(replyText: string) {
  const systemPrompt = `You are a sales assistant classifying cold email replies.
Classify the reply into exactly one of these categories:
INTERESTED, NOT_NOW, UNSUBSCRIBE, WARM, NEUTRAL

Rules:
INTERESTED — asking about pricing, next steps, wants more info
NOT_NOW — timing issue, currently busy, try later
UNSUBSCRIBE — remove me, stop emailing, not interested at all
WARM — positive but vague, open to conversation
NEUTRAL — unclear, could be anything

Return ONLY valid JSON, no markdown, no code fences:
{"classification":"CATEGORY","reasoning":"brief explanation"}`;

  const response = await openai.chat.completions.create({
    model: 'google/gemma-2-9b-it',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Reply text: ${replyText.slice(0, 1000)}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 256,
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('Empty response from AI model');

  let jsonStr = raw;
  const codeBlockMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) jsonStr = jsonMatch[0];

  const parsed = JSON.parse(jsonStr) as { classification: string; reasoning: string };
  return {
    classification: (parsed.classification || 'NEUTRAL').toUpperCase(),
    reasoning: parsed.reasoning || '',
  };
}


// ====== SPRINT 4a PIPELINE AUTOMATION — learnings ======
//
// Common Issues Encountered:
//
// 1. Template Literal Corruption — patching .ts files can corrupt
//    template literals with ? and backtick characters.
//    Pattern: const token=sessio...ken;
//    Fix:  const token = session?.access_token;
//    Rule: Always verify head -10 of patched API files.
//
// 2. Route 44s from wrong mount prefix — routes in leads.ts
//    mount under /leads, so /analytics/pipeline-health becomes
//    /leads/analytics/pipeline-health (wrong). Move to analytics.ts.
//
// 3. Python scripts need 'import os' explicitly — not auto-imported.
//    Scripts using os.path or os.makedirs must include it.
//
// 4. Supabase REST API caches schema for ~30s after ALTER TABLE.
//    PGRST204 errors right after migration = just wait.
//
// 5. OpenRouter JSON mode: gemma-2-9b-it wraps JSON in code blocks.
//    Always strip with regex before JSON.parse.
//
// 6. Zod z.string().optional().or(z.literal('')) accepts '' but not null.
//    Send empty strings to clear fields, never null.
