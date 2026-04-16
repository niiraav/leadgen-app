import { Hono } from 'hono';
import { z } from 'zod';
import { getLeadById, getUserId, createLead, createActivity, type JsonValue } from '../db';
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

    const { tone, purpose, customInstructions, recontact, bio, owner_first_name, profile_usp, profile_services, profile_full_name, profile_signoff, profile_cta, profile_calendly, profile_linkedin, review_summary } = parsed.data;

    // Use bio from request body, or fall back to the lead's cached ai_bio
    const leadBio = bio || (lead as any).ai_bio || undefined;

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
      bio: leadBio,
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
