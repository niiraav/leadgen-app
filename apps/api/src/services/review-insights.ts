/**
 * Review insights extraction via LLM.
 *
 * Takes an array of review objects + lead rating/count, calls OpenRouter
 * with a cheap fast model, and returns a structured insights object.
 * Follows the same OpenRouter + JSON extraction pattern as ai-email.ts.
 */

import OpenAI from 'openai';
import { ReviewItem } from './outscraper';

const LLM_BASE = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
const LLM_KEY = process.env.FIREWORKS_API_KEY || process.env.OPENROUTER_API_KEY || '';
const LLM_MODEL = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';

if (!LLM_KEY) {
  console.warn('[Review Insights] FIREWORKS_API_KEY not set — review insight extraction will fail');
}

const openai = new OpenAI({
  apiKey: LLM_KEY,
  baseURL: LLM_BASE,
  defaultHeaders: {
    'HTTP-Referer': 'https://leadgen-app.local',
    'X-Title': 'LeadGen App',
  },
});

export interface ReviewInsights {
  owner_name: string | null;
  owner_confidence: number;
  owner_evidence: string | null;
  staff_names: string[];
  themes: string[];
  usp_candidates: string[];
  pain_points: string[];
  fetched_at: string;
}

/**
 * Extract structured insights from customer reviews using LLM.
 *
 * @param reviews — Up to 10 review objects (text truncated to 300 chars before sending)
 * @param leadRating — The lead's existing rating (passed in, not extracted)
 * @param leadReviewCount — The lead's existing review count (passed in, not extracted)
 * @returns Structured insights object
 * @throws Error on malformed or unparseable LLM response
 */
export async function extractReviewInsights(
  reviews: ReviewItem[],
  leadRating: number | null,
  leadReviewCount: number,
): Promise<ReviewInsights> {
  // Build the reviews text for the prompt — truncate each review to 300 chars
  const reviewLines: string[] = [];
  for (const r of reviews) {
    let line = 'Rating: ' + r.rating + '/5';
    if (r.reviewer_name) line += ' | By: ' + r.reviewer_name;
    if (r.date) line += ' | Date: ' + r.date;
    line += '\n' + r.text.slice(0, 300);
    reviewLines.push(line);
  }

  const reviewsBlock = reviewLines.join('\n---\n');

  // System prompt — string concatenation to avoid template literal corruption
  let systemPrompt = 'You are a business intelligence analyst.\n';
  systemPrompt += 'You read customer reviews and extract structured insights.\n';
  systemPrompt += 'You return ONLY valid JSON — no markdown, no code fences, no commentary.\n\n';
  systemPrompt += 'Return a JSON object with EXACTLY this schema:\n';
  systemPrompt += '{\n';
  systemPrompt += '  "owner_name": string or null,\n';
  systemPrompt += '  "owner_confidence": number (0 to 1),\n';
  systemPrompt += '  "owner_evidence": string or null,\n';
  systemPrompt += '  "staff_names": string[],\n';
  systemPrompt += '  "themes": string[],\n';
  systemPrompt += '  "usp_candidates": string[],\n';
  systemPrompt += '  "pain_points": string[]\n';
  systemPrompt += '}\n\n';
  systemPrompt += 'Rules:\n';
  systemPrompt += '- owner_name: The name of the business owner/manager. Only set if clearly mentioned in reviews (e.g. owner replies, thanks to specific person). Set confidence 0 if unsure.\n';
  systemPrompt += '- owner_confidence: 0.7+ only if the name is directly stated as the owner. 0.3-0.5 if likely but uncertain. 0 if no evidence.\n';
  systemPrompt += '- owner_evidence: Brief quote or reason for the owner_name extraction. Null if no owner found.\n';
  systemPrompt += '- staff_names: Names of specific staff members mentioned positively by customers. Max 5.\n';
  systemPrompt += '- themes: Key themes customers mention (e.g. "friendly service", "reliable", "good value"). Max 5, short phrases.\n';
  systemPrompt += '- usp_candidates: Unique selling points or differentiators mentioned (e.g. "24/7 emergency callout", "family-run since 1980"). Max 5.\n';
  systemPrompt += '- pain_points: Negative aspects or complaints mentioned by multiple reviewers. Only include if present. Max 3.\n';
  systemPrompt += '- If a field has no data, use an empty array or null — never make things up.';

  let userPrompt = 'Business rating: ' + (leadRating ?? 'N/A') + '/5 from ' + leadReviewCount + ' reviews\n\n';
  userPrompt += 'Customer reviews:\n' + reviewsBlock + '\n\n';
  userPrompt += 'Extract insights and return ONLY the JSON object.';

  const response = await openai.chat.completions.create({
    model: LLM_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 1024,
    temperature: 0.3,
  });

  const rawContent = response.choices[0]?.message?.content;
  if (!rawContent) {
    throw new Error('Empty response from LLM for review insights');
  }

  // Parse JSON — same extraction pattern as ai-email.ts
  // Handle markdown code blocks or extra text
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

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseErr) {
    console.error('[Review Insights] Failed to parse LLM JSON:', rawContent.slice(0, 500));
    throw new Error('LLM returned unparseable JSON for review insights');
  }

  // Validate required fields exist
  if (typeof parsed.owner_confidence !== 'number' || !Array.isArray(parsed.themes)) {
    throw new Error('LLM response missing required fields (owner_confidence, themes)');
  }

  // Construct final object — null out owner_name if confidence < 0.7
  const insights: ReviewInsights = {
    owner_name: parsed.owner_confidence >= 0.7 ? (parsed.owner_name || null) : null,
    owner_confidence: parsed.owner_confidence ?? 0,
    owner_evidence: parsed.owner_evidence || null,
    staff_names: Array.isArray(parsed.staff_names) ? parsed.staff_names : [],
    themes: Array.isArray(parsed.themes) ? parsed.themes : [],
    usp_candidates: Array.isArray(parsed.usp_candidates) ? parsed.usp_candidates : [],
    pain_points: Array.isArray(parsed.pain_points) ? parsed.pain_points : [],
    fetched_at: new Date().toISOString(),
  };

  console.log('[Review Insights] Extracted:', JSON.stringify({
    owner_name: insights.owner_name,
    confidence: insights.owner_confidence,
    staff: insights.staff_names.length,
    themes: insights.themes.length,
    usps: insights.usp_candidates.length,
    pains: insights.pain_points.length,
  }));

  return insights;
}
