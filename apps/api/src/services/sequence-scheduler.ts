/** BullMQ Sequence Scheduler Service */

import { Queue, Worker, Job, RedisConnection } from 'bullmq';
import IORedis from 'ioredis';
import { supabaseAdmin, createActivity } from '../db';
import { sendOutreachEmail } from '../lib/email/send';

// ─── Redis Connection ──────────────────────────────────────────────────────

const redisUrl = process.env.UPSTASH_REDIS_URL || '';
const redisToken = process.env.UPSTASH_REDIS_TOKEN || '';

let redis: IORedis | null = null;

function getRedis() {
  if (!redis && redisUrl) {
    redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(redisUrl.includes('upstash') ? {
        tls: { rejectUnauthorized: false },
      } : {}),
    });
  }
  return redis;
}

// ─── Queues ─────────────────────────────────────────────────────────────────

export let schedulerQueue: Queue | null = null;
export let deadLeadQueue: Queue | null = null;

export function initQueues() {
  const conn = getRedis();
  if (!conn) {
    console.warn('[Sequence Scheduler] Redis not configured — queues disabled');
    return null;
  }

  schedulerQueue = new Queue('sequence-scheduler', {
    connection: conn,
    defaultJobOptions: { removeOnComplete: { count: 100 } },
  });

  deadLeadQueue = new Queue('dead-lead-prompts', {
    connection: conn,
    defaultJobOptions: { removeOnComplete: { count: 100 } },
  });

  return { schedulerQueue, deadLeadQueue };
}

// ─── Worker ─────────────────────────────────────────────────────────────────

let worker: Worker | null = null;
let deadLeadWorker: Worker | null = null;

export function startSequenceWorker() {
  const conn = getRedis();
  if (!conn) return null;

  worker = new Worker(
    'sequence-scheduler',
    async (job: Job<{ enrollment_id: string; step_order: number }>) => {
      const { enrollment_id, step_order } = job.data;

      // 1. Fetch enrollment
      const { data: enrollment, error: ee } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('*')
        .eq('id', enrollment_id)
        .maybeSingle();

      if (ee || !enrollment) return;

      // 2. Skip if not active
      if (enrollment.status !== 'active') return;

      // 3. Fetch the step
      const { data: step } = await supabaseAdmin
        .from('sequence_steps')
        .select('*')
        .eq('sequence_id', enrollment.sequence_id)
        .eq('step_order', step_order)
        .maybeSingle();

      if (!step) {
        // Sequence complete
        await supabaseAdmin
          .from('sequence_enrollments')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', enrollment_id);

        await createActivity(enrollment.user_id, {
          lead_id: enrollment.lead_id,
          type: 'sequence_completed',
          description: 'Sequence completed',
        });

        // Queue dead-lead prompt (24hr delay)
        if (deadLeadQueue) {
          await deadLeadQueue.add(
            `dead-${enrollment_id}`,
            { lead_id: enrollment.lead_id, enrollment_id },
            { delay: 24 * 60 * 60 * 1000, jobId: `dead-${enrollment_id}` }
          );
        }
        return;
      }

      // 4. Create activity
      await createActivity(enrollment.user_id, {
        lead_id: enrollment.lead_id,
        type: 'email_due',
        description: `Email due: "${step.subject_template}" (step ${step_order})`,
      });

      // 4b. Send the email via Mailgun
      const { data: lead } = await supabaseAdmin
        .from('leads')
        .select('email, business_name, reply_token')
        .eq('id', enrollment.lead_id)
        .maybeSingle();

      if (lead?.email) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('full_name, user_email, company_name')
          .eq('id', enrollment.user_id)
          .maybeSingle();

        const fromName = (profile as any)?.full_name || 'Team';
        const fromEmail = (profile as any)?.user_email || process.env.MAILGUN_FROM_EMAIL || '';

        try {
          await sendOutreachEmail({
            to: lead.email,
            fromName,
            fromEmail,
            subject: step.subject_template,
            html: step.body_template,
            text: step.body_template,
            leadId: enrollment.lead_id,
            replyToken: (lead as any)?.reply_token || '',
            enrolmentId: enrollment_id,
            sequenceStepId: (step as any).id,
            sequenceId: enrollment.sequence_id,
            userId: enrollment.user_id,
            stepNumber: step_order,
          });

          await createActivity(enrollment.user_id, {
            lead_id: enrollment.lead_id,
            type: 'email_sent',
            description: `Email sent: "${step.subject_template}" (step ${step_order})`,
          });
        } catch (err) {
          console.error('[Sequence Worker] Failed to send email:', err);
          await supabaseAdmin
            .from('sequence_step_executions')
            .insert({
              sequence_id:    enrollment.sequence_id,
              enrolment_id:   enrollment_id,
              user_id:        enrollment.user_id,
              step_number:    step_order,
              subject:        step.subject_template,
              body_plain:     step.body_template,
              status:         'failed',
              sent_via:       'mailgun',
            });
          await createActivity(enrollment.user_id, {
            lead_id: enrollment.lead_id,
            type: 'email_failed',
            description: `Email failed: "${step.subject_template}" (step ${step_order})`,
          });
        }
      }

      // 5. Update enrollment
      const delayMs = step.delay_days * 86400000;
      const nextAt = new Date(Date.now() + delayMs).toISOString();

      await supabaseAdmin
        .from('sequence_enrollments')
        .update({ current_step: step_order + 1, next_step_at: nextAt })
        .eq('id', enrollment_id);

      // 6. Queue next step (idempotent via jobId)
      if (schedulerQueue && delayMs >= 0) {
        await schedulerQueue.add(
          `${enrollment_id}-${step_order + 1}`,
          { enrollment_id, step_order: step_order + 1 },
          { delay: delayMs, jobId: `${enrollment_id}-${step_order + 1}` }
        );
      }
    },
    { connection: conn, concurrency: 10 }
  );

  // Dead lead prompts worker
  deadLeadWorker = new Worker(
    'dead-lead-prompts',
    async (job: Job<{ lead_id: string; enrollment_id: string }>) => {
      const { lead_id } = job.data;
      try {
        const { data: enrollment } = await supabaseAdmin
          .from('sequence_enrollments')
          .select('user_id')
          .eq('lead_id', lead_id)
          .eq('id', job.data.enrollment_id)
          .maybeSingle();

        if (!enrollment?.user_id) return;

        const { data: lead } = await supabaseAdmin
          .from('leads')
          .select('status')
          .eq('id', lead_id)
          .eq('user_id', enrollment.user_id)
          .maybeSingle();

        if (lead && ['contacted', 'new'].includes(lead.status)) {
          await createActivity(enrollment.user_id, {
            lead_id,
            type: 'dead_lead_prompt',
            description: 'Lead is inactive — no reply after sequence completion',
          });
        }
      } catch (err) {
        console.error('[Dead Lead] Worker error:', err);
      }
    },
    { connection: conn, concurrency: 5 }
  );

  console.log('[Sequence Scheduler] Workers started');
  return worker;
}

export async function stopWorkers() {
  await worker?.close();
  await deadLeadWorker?.close();
  redis?.quit();
}
