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
};

export type AIEmailResponse = {
  subject: string;
  body: string;
};

export async function generateEmailWithAI({
  lead,
  tone,
  purpose,
  customInstructions,
}: AIEmailGenerationRequest): Promise<AIEmailResponse> {
  const systemPrompt = `You are a professional cold email writer for a B2B lead generation agency.
Write personalized, concise outreach emails.
Always return valid JSON with "subject" and "body" fields.
No markdown, no code fences — just raw JSON.`;

  const leadDescription = [
    `Business: ${lead.business_name}`,
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

Tone: ${tone}
Purpose: ${purpose}
${customInstructions ? `Additional instructions: ${customInstructions}` : ''}

Return ONLY a JSON object with "subject" and "body" keys. Make the email personalized to this business.`;

  const response = await openai.chat.completions.create({
    model: 'qwen/qwen-2.5-72b-instruct',
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
    const parsed = JSON.parse(content) as AIEmailResponse;

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
      subject: `Outreach to ${lead.business_name}`,
      body: content,
    };
  }
}
