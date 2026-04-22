import OpenAI from 'openai';
import { applyUkCorrections } from '../lib/uk-corrections';

const LLM_BASE = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
const LLM_KEY = process.env.FIREWORKS_API_KEY || process.env.OPENROUTER_API_KEY || '';
const LLM_MODEL = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';

if (!LLM_KEY) {
  console.warn('[LLM] FIREWORKS_API_KEY not set — AI email generation will fail');
}

const openai = new OpenAI({
  apiKey: LLM_KEY,
  baseURL: LLM_BASE,
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
  review_summary?: {
    owner_name?: string | null;
    staff_names?: string[];
    themes?: string[];
    usp_candidates?: string[];
    pain_points?: string[];
  } | null;
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
  basePrompt += 'Write ONE personalized, concise outreach email.\n';
  basePrompt += 'Your entire response must be a single valid JSON object. Nothing else.\n';
  basePrompt += 'NO explanations, NO reasoning, NO thinking out loud, NO markdown, NO code fences.\n';
  basePrompt += 'ONLY raw JSON with exactly these two keys: "subject" and "body".\n';
  basePrompt += 'If you write anything other than the JSON object, you have failed.\n\n';
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

  if (request.review_summary?.owner_name) {
    basePrompt += '\n   If an owner name is provided in the review context, greet them by first name: "Hi [First Name],"';
  }

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

  // ── Review insights context — weave naturally into email ──
  if (request.review_summary) {
    const rs = request.review_summary;
    const reviewLines: string[] = [];
    reviewLines.push('Additional context from real customer reviews:');
    if (rs.owner_name) reviewLines.push('- Owner name: ' + rs.owner_name);
    if (rs.staff_names && rs.staff_names.length > 0) reviewLines.push('- Staff mentioned by customers: ' + rs.staff_names.join(', '));
    if (rs.themes && rs.themes.length > 0) reviewLines.push('- What customers value most: ' + rs.themes.join(', '));
    if (rs.usp_candidates && rs.usp_candidates.length > 0) reviewLines.push('- Differentiating strengths to reference: ' + rs.usp_candidates.join(', '));
    if (rs.pain_points && rs.pain_points.length > 0) reviewLines.push('- Areas some customers mentioned: ' + rs.pain_points.join(', '));
    if (reviewLines.length > 1) {
      reviewLines.push('');
      reviewLines.push('Use this context to write a specific, personalised cold email. Weave these details naturally into the narrative — do not list them, do not reference "reviews" or "research", and do not make the email feel data-driven. Write as if you simply know this business well and have a genuine reason to reach out.');
      userPrompt += '\n' + joinLines(reviewLines) + '\n';
    }
  }

  userPrompt += '\nReturn ONLY a raw JSON object with exactly two keys: "subject" and "body".\n';
  userPrompt += 'Do NOT include any thinking, reasoning, or explanation.\n';
  userPrompt += 'Example: {"subject":"Hello","body":"Hi team,\\n\\n..."}\n';
  userPrompt += 'Make the email personalized to this business.';

  const response = await openai.chat.completions.create({
    model: LLM_MODEL,
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

    // 1. Strip markdown code fences
    const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    // 2. Find the outermost JSON object (reasoning often precedes JSON)
    // Try matching a JSON object that contains both "subject" and "body"
    const jsonObjMatch = jsonStr.match(/\{[\s\S]*?"subject"[\s\S]*?"body"[\s\S]*?\}/);
    if (jsonObjMatch) {
      jsonStr = jsonObjMatch[0];
    } else {
      // Fallback: first { to last }
      const first = jsonStr.indexOf('{');
      const last = jsonStr.lastIndexOf('}');
      if (first !== -1 && last > first) {
        jsonStr = jsonStr.substring(first, last + 1);
      }
    }

    // 3. Clean common LLM artifacts (trailing commas, extra quotes)
    jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

    const parsed = JSON.parse(jsonStr) as AIEmailResponse;
    if (!parsed.subject || !parsed.body) {
      throw new Error('Missing subject or body in AI response');
    }
    return { subject: applyUkCorrections(parsed.subject), body: applyUkCorrections(parsed.body) };
  } catch (parseError) {
    console.warn('[AI Email] Failed to parse JSON. Raw first 500 chars:', rawContent.slice(0, 500));
    // NEVER return raw LLM text as the body — always use a clean template fallback
    return {
      subject: 'Quick question about ' + cleanBusinessName(lead.business_name),
      body: 'Hi ' + cleanBusinessName(lead.business_name) + ' team,\n\n'
        + 'I came across your business and was impressed by what you\'re doing in the ' + (lead.category || 'market') + '.\n\n'
        + 'I help businesses like yours with lead generation and outreach automation. Would you be open to a quick chat about how we might work together?\n\n'
        + (profile?.signoff || 'Best regards') + ',\n'
        + (profile?.full_name || ''),
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
    model: LLM_MODEL,
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

  // Find JSON object with classification key
  const jsonObjMatch = jsonStr.match(/\{[\s\S]*?"classification"[\s\S]*?\}/);
  if (jsonObjMatch) jsonStr = jsonObjMatch[0];
  else {
    const first = jsonStr.indexOf('{');
    const last = jsonStr.lastIndexOf('}');
    if (first !== -1 && last > first) jsonStr = jsonStr.substring(first, last + 1);
  }

  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  try {
    const parsed = JSON.parse(jsonStr) as { classification: string; reasoning: string };
    return {
      classification: (parsed.classification || 'NEUTRAL').toUpperCase(),
      reasoning: parsed.reasoning || '',
    };
  } catch {
    console.warn('[AI Reply Classify] Failed to parse JSON. Raw first 300 chars:', raw.slice(0, 300));
    return { classification: 'NEUTRAL', reasoning: 'Parse error — fallback to neutral' };
  }
}
