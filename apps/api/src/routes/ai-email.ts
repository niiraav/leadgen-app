import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../drizzle';
import { leads } from '../db/schema';
import { generateEmailWithAI } from '../services/ai-email';

const router = new Hono();

const aiEmailSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'casual', 'persuasive']).default('professional'),
  purpose: z.string().min(1).max(200),
  customInstructions: z.string().max(500).optional(),
});

// ─── POST /leads/:id/ai-email ────────────────────────────────────────────────

router.post('/:id/ai-email', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = aiEmailSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: 'Validation failed', details: parsed.error.flatten() }, 400);
  }

  // Fetch lead
  const result = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (result.length === 0) {
    return c.json({ error: 'Lead not found' }, 404);
  }

  const lead = result[0];
  const { tone, purpose, customInstructions } = parsed.data;

  console.log(`[AI Email] Generating email for lead: ${lead.businessName}`);

  try {
    const emailData = await generateEmailWithAI({
      lead: {
        business_name: lead.businessName,
        email: lead.email || undefined,
        phone: lead.phone || undefined,
        website_url: lead.websiteUrl || undefined,
        category: lead.category || undefined,
        city: lead.city || undefined,
        country: lead.country || undefined,
        rating: lead.rating || undefined,
      },
      tone,
      purpose,
      customInstructions,
    });

    return c.json({
      lead_id: id,
      email: emailData,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error generating email';
    console.error(`[AI Email] Error: ${message}`);
    return c.json({ error: 'Failed to generate email', details: message }, 500);
  }
});

export default router;
