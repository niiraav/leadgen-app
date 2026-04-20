import { Hono } from 'hono';
import { z } from 'zod';
import { getLeadById, getUserId, supabaseAdmin, createActivity, type JsonValue } from '../db';
import { generateEmailWithAI } from '../services/ai-email';
import { enforceCredits, enforceFeatureGate, EnforcementError } from '../lib/billing/enforce';
import { incrementAIEmails } from '../lib/usage';

const router = new Hono();

const aiEmailSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'casual', 'persuasive']).default('professional'),
  purpose: z.string().min(1).max(200),
  customInstructions: z.string().max(500).optional(),
  recontact: z.boolean().default(false),
  bio: z.string().max(2000).optional(),
  owner_first_name: z.string().max(200).optional(),
  profile_usp: z.string().max(500).optional(),
  profile_services: z.array(z.string()).optional(),
  profile_full_name: z.string().max(200).optional(),
  profile_signoff: z.string().max(200).optional(),
  profile_cta: z.string().max(300).optional(),
  profile_calendly: z.string().max(500).optional(),
  profile_linkedin: z.string().max(500).optional(),
  review_summary: z.string().max(5000).optional(),
});

router.post('/:id/ai-email', async (c) => {
  try {
    const userId = getUserId(c);
    const id = c.req.param('id');

    // ── Feature gate: AI emails require outreach+ plan ──
    const gate = await enforceFeatureGate(userId, 'ai_emails');
    if (!gate.allowed) {
      return c.json({ error: gate.upgradeRequired, upgrade_required: true }, 402);
    }

    // ── Credit enforcement: check AI email limit ──
    try {
      await enforceCredits(userId, 'ai_email');
    } catch (err) {
      if (err instanceof EnforcementError) {
        const status = err.upgradeRequired ? 402 : 403;
        return c.json({ error: err.message, upgrade_required: err.upgradeRequired, limit: err.limit, remaining: err.remaining }, status);
      }
      throw err;
    }

    const body = await c.req.json();
    const parsed = aiEmailSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
    }

    const lead = await getLeadById(userId, id);
    if (!lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    const { tone, purpose, customInstructions, recontact, bio: requestBio, owner_first_name, profile_usp, profile_services, profile_full_name, profile_signoff, profile_cta, profile_calendly, profile_linkedin, review_summary } = parsed.data;

    // Use bio from request body, or fall back to the lead's cached ai_bio
    let bio: string | null | undefined = requestBio || ((lead as any).ai_bio ?? null);

    // Auto-generate bio if not cached (invisible to frontend)
    if (!bio) {
      try {
        const llmKey = process.env.FIREWORKS_API_KEY || process.env.OPENROUTER_API_KEY || '';
        const llmBase = process.env.FIREWORKS_BASE_URL || 'https://api.fireworks.ai/inference/v1';
        const llmModel = process.env.FIREWORKS_MODEL || 'fireworks/minimax-m2p7';
        if (llmKey) {
          const bioPrompt = 'Write a concise business bio (max 200 characters) for:\n'
            + 'Name: ' + (lead.business_name || 'Unknown') + '\n'
            + 'Category: ' + (lead.category || 'Unknown') + '\n'
            + 'Location: ' + (lead.city || 'Unknown') + '\n'
            + 'Description: ' + ((lead as any).description || 'No description available') + '\n'
            + 'Rating: ' + (lead.rating || 'N/A') + '\n'
            + 'Website: ' + (lead.website_url || 'No website');
          const resp = await fetch(llmBase + '/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + llmKey,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://leadgen.app',
              'X-Title': 'LeadGen App',
            },
            body: JSON.stringify({
              model: llmModel,
              messages: [
                { role: 'system', content: 'Write concise, professional business bios. Max 200 chars.' },
                { role: 'user', content: bioPrompt },
              ],
              max_tokens: 300,
            }),
          });
          if (resp.ok) {
            const completion = await resp.json() as { choices?: { message?: { content?: string } }[] };
            bio = completion.choices?.[0]?.message?.content?.trim() ?? null;
            if (bio) {
              // Cache bio for future use — no activity log (invisible operation)
              await supabaseAdmin
                .from('leads')
                .update({ ai_bio: bio, ai_bio_generated_at: new Date().toISOString() })
                .eq('id', id)
                .eq('user_id', userId);
            }
          }
        }
      } catch (e) {
        console.warn('[AI Email] Bio generation failed, continuing without bio:', e instanceof Error ? e.message : e);
      }
    }

    // Parse review summary JSON if provided
    const leadReviewSummary = review_summary ? JSON.parse(review_summary) : (lead as any).review_summary || undefined;

    console.log(`[AI Email] Generating email for lead: ${lead.business_name}`);

    const emailData = await generateEmailWithAI({
      lead: {
        business_name: lead.business_name,
        email: lead.email ?? undefined,
        phone: lead.phone ?? undefined,
        website_url: lead.website_url ?? undefined,
        category: lead.category ?? undefined,
        city: lead.city ?? undefined,
        country: lead.country ?? undefined,
        rating: lead.rating ?? undefined,
      },
      tone,
      purpose,
      customInstructions,
      recontact,
      bio: bio || undefined,
      profile: {
        usp: profile_usp ?? null,
        services: profile_services,
        full_name: profile_full_name ?? null,
        owner_first_name: owner_first_name ?? null,
        signoff: profile_signoff ?? null,
        cta: profile_cta ?? null,
        calendly: profile_calendly ?? null,
        linkedin: profile_linkedin ?? null,
      },
      review_summary: leadReviewSummary,
    });

    // ── Increment AI email usage ──
    try { await incrementAIEmails(userId); } catch (e) { console.warn('[AI Email] Usage increment failed:', e); }

    return c.json({ lead_id: id, email: emailData });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[AI Email] Error: ${message}`);
    return c.json({ error: 'Failed to generate email', details: message }, 500);
  }
});

export default router;
