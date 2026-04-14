import OpenAI from 'openai';
import { applyUkCorrections } from '../lib/uk-corrections';

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
  bio?: string;
  profile?: {
    usp?: string | null;
    services?: string[];
    full_name?: string | null;
    owner_first_name?: string | null;
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

// Remove emojis, keyword stuffing, 24/7 etc. from business names
export function cleanBusinessName(raw: string): string {
  let name = raw;
  name = name.split('|')[0].trim();
  name = name.replace(/[^\w\s.\-',\/&$#@()]/g, '').trim();
  name = name.replace(/\b(24\/7|24h|24\s*hr|24\s*hours?)\b/gi, '').trim();
  name = name.replace(/^[^\w]+|[^\w]+$/g, '').trim();
  name = name.replace(/\s{2,}/g, ' ').trim();
  if (name.length > 60) {
    name = name.substring(0, 60).replace(/\s+\S*$/, '').trim();
  }
  name = name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return name || 'Unknown Business';
}

function joinLines(strings: string[]): string {
  return strings.filter(Boolean).join('\n');
}

export async function generateEmailWithAI(request: AIEmailGenerationRequest): Promise<AIEmailResponse> {
  const { lead, tone, purpose, customInstructions, recontact, bio, profile } = request;

  // Build profile context — NO template literals to avoid corruption
  const p = (profile as any) || {};
  const signoff = p.signoff || 'Best regards';
  const senderName = p.full_name || '';
  const ownerFirstName = p.owner_first_name || null;

  const profileLines: string[] = [];
  if (p.usp) profileLines.push('Pitch: ' + p.usp);
  if (p.services && p.services.length > 0) profileLines.push('Services: ' + p.services.join(', '));
  if (p.calendly) profileLines.push('Calendly link: ' + p.calendly);
  if (p.linkedin) profileLines.push('LinkedIn: ' + p.linkedin);
  profileLines.push('Sign off email with: ' + signoff);
  if (senderName) profileLines.push('Sender full name: ' + senderName);

  const profileBlock = profileLines.length > 0 ? joinLines(['', 'Sender profile:', ...profileLines]) : '';

  // Lead info
  const leadLines: string[] = [
    'Business: ' + cleanBusinessName(lead.business_name),
  ];
  if (lead.category) leadLines.push('Category: ' + lead.category);
  if (lead.city) leadLines.push('Location: ' + lead.city + (lead.country ? ', ' + lead.country : ''));
  if (lead.rating) leadLines.push('Rating: ' + lead.rating + '/5');
  if (lead.website_url) leadLines.push('Website: ' + lead.website_url);
  if (lead.email) leadLines.push('Email: ' + lead.email);
  if (lead.phone) leadLines.push('Phone: ' + lead.phone);
  if (bio) leadLines.push('Bio: ' + bio);

  const leadDescription = joinLines(leadLines);

  // System prompt — NO template literals, all string concatenation
  let basePrompt = 'You are a professional cold email writer for a B2B lead generation agency.\n';
  basePrompt += 'Write personalized, concise outreach emails.\n';
  basePrompt += 'Always return valid JSON with "subject" and "body" fields.\n';
  basePrompt += 'No markdown, no code fences — just raw JSON.\n\n';
  basePrompt += 'STRICT RULES:\n';
  basePrompt += '1. GREETING: Use "Hi ' + cleanBusinessName(lead.business_name) + ' team," or "Hello at ' + cleanBusinessName(lead.business_name) + ',."\n';
  basePrompt += '   NEVER use placeholders like [Name], [First Name], [Company], [Your Name].\n';
  basePrompt += '   If you don\'t know the company name, use "Hi there,".\n';
  basePrompt += '2. SIGN-OFF: Use the exact sign-off provided in the sender profile.\n';
  basePrompt += '   If a sender name is provided, put it on a new line after the sign-off comma.\n';
  basePrompt += '   Example: "Best regards,\\nJohn Smith"\n';
  basePrompt += '   NEVER use [Your Name] or any placeholder.\n';
  basePrompt += '3. Keep the email under 120 words.\n';
  basePrompt += '4. One clear call-to-action only.\n';
  basePrompt += '5. Never use: leverage, synergy, empower, solutions, cutting-edge, seamless.';

  if (recontact) {
    basePrompt += '\n\nIMPORTANT: This is a RE-ENGAGEMENT email. The lead did NOT respond to previous outreach.';
    basePrompt += '\nUse a completely different angle. Keep it SHORT (4-5 sentences max).';
    basePrompt += '\nDo NOT reference previous emails. Use friendly casual tone. End with a simple yes/no question.';
  }

  // User prompt — NO template literals
  let userPrompt = 'Write a cold email with the following parameters:\n\n';
  userPrompt += 'Lead details:\n' + leadDescription + '\n';
  if (profileBlock) userPrompt += profileBlock + '\n';
  userPrompt += '\nTone: ' + tone + '\n';
  userPrompt += 'Purpose: ' + purpose + '\n';
  if (customInstructions) userPrompt += 'Additional instructions: ' + customInstructions + '\n';
  userPrompt += '\nReturn ONLY a JSON object with "subject" and "body" keys. '
    + 'Make the email personalized to this business.';

  const response = await openai.chat.completions.create({
    model: 'google/gemma-2-9b-it',
    messages: [
      { role: 'system', content: basePrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.7,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Empty response from AI model');
  }

  try {
    // Extract JSON — model may wrap in markdown code blocks or add extra text
    let jsonStr = rawContent;
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      const first = jsonStr.indexOf('{');
      const last = jsonStr.lastIndexOf('}');
      if (first !== -1 && last > first) {
        jsonStr = jsonStr.substring(first, last + 1);
      }
    }

    const parsed = JSON.parse(jsonStr) as AIEmailResponse;
    if (!parsed.subject || !parsed.body) {
      throw new Error('Missing subject or body in AI response');
    }
    return { subject: applyUkCorrections(parsed.subject), body: applyUkCorrections(parsed.body) };
  } catch (parseError) {
    console.warn('[AI Email] Failed to parse JSON, falling back to raw content');
    return {
      subject: 'Outreach to ' + cleanBusinessName(lead.business_name),
      body: rawContent,
    };
  }
}

export async function classifyReply(replyText: string) {
  const systemPrompt = 'You are a sales assistant classifying cold email replies.\n'
    + 'Classify the reply into exactly one of these categories:\n'
    + 'INTERESTED, NOT_NOW, UNSUBSCRIBE, WARM, NEUTRAL\n\n'
    + 'Rules:\n'
    + 'INTERESTED — asking about pricing, next steps, wants more info\n'
    + 'NOT_NOW — timing issue, currently busy, try later\n'
    + 'UNSUBSCRIBE — remove me, stop emailing, not interested at all\n'
    + 'WARM — positive but vague, open to conversation\n'
    + 'NEUTRAL — unclear, could be anything\n\n'
    + 'Return ONLY valid JSON, no markdown, no code fences:\n'
    + '{"classification":"CATEGORY","reasoning":"brief explanation"}';

  const response = await openai.chat.completions.create({
    model: 'google/gemma-2-9b-it',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Reply text: ' + replyText.slice(0, 1000)},
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
