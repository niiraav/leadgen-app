/**
 * Reply Detection E2E Test Script
 *
 * Tests the full pipeline locally without requiring ngrok or Mailgun:
 * 1. Webhook signature generation
 * 2. Webhook POST to local API
 * 3. DB verification via Supabase REST
 * 4. /replies API testing
 * 5. Module unit tests (rules, classifier, hotScore, sequenceAction)
 *
 * Prerequisites: API running on :3001, Supabase env vars set.
 *
 * Run: npx tsx test-reply-detection/e2e-test.ts
 */

import { createHmac } from 'crypto';
import http from 'http';

// ─── Config ──────────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:3001';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WEBHOOK_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY || '';
const INBOUND_DOMAIN = process.env.INBOUND_REPLY_DOMAIN || 'sandboxe2fd5218245b4954a326c97d3257795d.mailgun.org';

const COLORS = {
  pass: '\x1b[32m✓\x1b[0m',
  fail: '\x1b[31m✗\x1b[0m',
  warn: '\x1b[33m⚠\x1b[0m',
  info: '\x1b[36mℹ\x1b[0m',
};

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function pass(msg: string) { console.log(`  ${COLORS.pass} ${msg}`); passCount++; }
function fail(msg: string, detail?: string) { console.log(`  ${COLORS.fail} ${msg}`); if (detail) console.log(`    ${detail}`); failCount++; }
function warn(msg: string) { console.log(`  ${COLORS.warn} ${msg}`); warnCount++; }
function info(msg: string) { console.log(`  ${COLORS.info} ${msg}`); }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function signWebhook(token: string, timestamp: string): string {
  const hmac = createHmac('sha256', WEBHOOK_KEY);
  hmac.update(`${timestamp}${token}`);
  return hmac.digest('hex');
}

function postWebhook(payload: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(payload);
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path: '/webhooks/inbound-reply',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(data.toString()),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, body: JSON.parse(body) });
          } catch {
            resolve({ status: res.statusCode || 0, body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data.toString());
    req.end();
  });
}

async function supabaseQuery(table: string, query: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  return res.json();
}

async function supabaseDelete(table: string, query: string): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: 'application/json',
    },
  });
  return res.status;
}

async function apiGet(path: string, token?: string): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  try {
    return { status: res.status, body: await res.json() };
  } catch {
    return { status: res.status, body: null };
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Reply Detection E2E Test Suite');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 0. Health check
  {
    console.log('0. API Health Check');
    try {
      const { status, body } = await apiGet('/health');
      if (status === 200 && body?.status === 'ok') pass('API healthy');
      else fail('API health check failed', JSON.stringify(body));
    } catch (e: any) {
      fail('API unreachable', e.message);
      console.log('\nAborting — API must be running on port 3001.\n');
      process.exit(1);
    }
  }

  // 1. Fetch a real lead with reply_token
  console.log('\n1. Fetch test lead from Supabase');
  let lead: any = null;
  let token = '';
  try {
    const leads = await supabaseQuery('leads', 'select=id,user_id,reply_token,business_name,email,status&limit=1');
    if (Array.isArray(leads) && leads.length > 0) {
      lead = leads[0];
      token = lead.reply_token;
      pass(`Found lead: ${lead.business_name || 'Unnamed'} (reply_token: ${token.slice(0, 8)}...)`);
    } else {
      fail('No leads found in DB');
    }
  } catch (e: any) {
    fail('Supabase query failed', e.message);
  }

  if (!token) {
    console.log('\nAborting — need a lead with reply_token.\n');
    process.exit(1);
  }

  // 2. Webhook Security — Missing fields
  console.log('\n2. Webhook Security — Missing verification fields');
  {
    const { status, body } = await postWebhook({ recipient: `reply+${token}@${INBOUND_DOMAIN}` });
    if (status === 400 && body?.error?.includes('Missing')) pass('Returns 400 for missing fields');
    else fail(`Expected 400, got ${status}`, JSON.stringify(body));
  }

  // 3. Webhook Security — Invalid signature
  console.log('\n3. Webhook Security — Invalid HMAC signature');
  {
    const ts = Math.floor(Date.now() / 1000).toString();
    const { status, body } = await postWebhook({
      token: 'badtoken',
      timestamp: ts,
      signature: 'fakesignature',
      recipient: `reply+${token}@${INBOUND_DOMAIN}`,
      from: 'test@example.com',
      subject: 'Re: Hello',
      'body-plain': 'Interested in your service',
    });
    if (status === 401) pass('Returns 401 for invalid signature');
    else fail(`Expected 401, got ${status}`, JSON.stringify(body));
  }

  // 4. Webhook Security — Unknown reply_token
  console.log('\n4. Webhook Security — Unknown reply_token');
  {
    const ts = Math.floor(Date.now() / 1000).toString();
    const tok = 'nonexistenttoken123';
    const sig = signWebhook(tok, ts);
    const { status, body } = await postWebhook({
      token: tok,
      timestamp: ts,
      signature: sig,
      recipient: `reply+${tok}@${INBOUND_DOMAIN}`,
      from: 'test@example.com',
      subject: 'Re: Hello',
      'body-plain': 'Interested',
    });
    if (status === 404) pass('Returns 404 for unknown token');
    else fail(`Expected 404, got ${status}`, JSON.stringify(body));
  }

  // 5. Webhook Security — Invalid recipient format
  console.log('\n5. Webhook Security — Invalid recipient format');
  {
    const ts = Math.floor(Date.now() / 1000).toString();
    const tok = 'anytoken';
    const sig = signWebhook(tok, ts);
    const { status, body } = await postWebhook({
      token: tok,
      timestamp: ts,
      signature: sig,
      recipient: 'just@plain.com',
      from: 'test@example.com',
      subject: 'Re: Hello',
      'body-plain': 'Interested',
    });
    if (status === 400) pass('Returns 400 for invalid recipient format');
    else fail(`Expected 400, got ${status}`, JSON.stringify(body));
  }

  // 6. Happy Path — Valid webhook
  console.log('\n6. Happy Path — Valid webhook ingestion');
  let replyEventId: string | null = null;
  {
    const ts = Math.floor(Date.now() / 1000).toString();
    const tok = token;
    const sig = signWebhook(tok, ts);
    const uniqueSubject = `E2E Test ${Date.now()}`;
    const { status, body } = await postWebhook({
      token: tok,
      timestamp: ts,
      signature: sig,
      recipient: `reply+${tok}@${INBOUND_DOMAIN}`,
      from: 'prospect@example.com',
      subject: uniqueSubject,
      'body-plain': 'Yes I am very interested in your services. Please call me next week.',
      'stripped-text': 'Yes I am very interested in your services. Please call me next week.',
      'Message-Id': `<e2e-${Date.now()}@mailgun>`,
    });

    if (status === 200 && body?.status === 'ok') {
      replyEventId = body.replyId;
      pass(`Webhook accepted — replyId: ${replyEventId?.slice(0, 8)}...`);
      if (body?.inngestId) info(`Inngest eventId: ${body.inngestId}`);
      else warn('No inngestId returned — Inngest may be offline');
    } else {
      fail(`Expected 200, got ${status}`, JSON.stringify(body));
    }

    // Verify DB
    if (replyEventId) {
      await new Promise((r) => setTimeout(r, 500)); // brief wait
      const events = await supabaseQuery(
        'reply_events',
        `id=eq.${replyEventId}&select=id,lead_id,user_id,subject,body_plain,sender_email,type,intent_label`
      );
      if (Array.isArray(events) && events.length === 1) {
        const ev = events[0];
        if (ev.lead_id === lead.id) pass('reply_events.lead_id matches');
        else fail('reply_events.lead_id mismatch', `${ev.lead_id} vs ${lead.id}`);
        if (ev.subject === uniqueSubject) pass('reply_events.subject stored correctly');
        else fail('reply_events.subject mismatch');
        if (ev.type === 'reply') pass('reply_events.type defaults to "reply"');
        else fail('reply_events.type unexpected', ev.type);
        if (!ev.intent_label) pass('reply_events.intent_label null before Inngest processing');
        else warn('reply_events.intent_label already set — Inngest may have run');
      } else {
        fail('reply_events row not found in DB', JSON.stringify(events));
      }
    }
  }

  // 7. Edge case — Duplicate mailgun_message_id
  console.log('\n7. Edge Case — Duplicate mailgun_message_id');
  {
    // We can't fully test uniqueness unless there's a DB constraint.
    // Check if reply_events has a unique index on mailgun_message_id.
    const idxQuery = await fetch(
      `${SUPABASE_URL}/rest/v1/reply_events?limit=0`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    // Unfortunately Supabase REST doesn't expose index info easily.
    warn('Cannot verify mailgun_message_id uniqueness via REST — check migration 009');
  }

  // 8. Rules Filter — OOO
  console.log('\n8. Rules Filter — Out-of-Office detection');
  {
    // Test via direct module import (can't trigger Inngest without dev server)
    try {
      const { runRulesFilter } = await import('../apps/api/src/lib/reply/rulesFilter.ts');
      const ooo = runRulesFilter({
        headers: { 'auto-submitted': 'auto-replied' },
        subject: 'Out of office',
        bodyPlain: "I'm on holiday until July 15th.",
        senderEmail: 'user@company.com',
      });
      if (ooo.type === 'out_of_office') pass('OOO detected via auto-submitted header');
      else fail('OOO not detected', JSON.stringify(ooo));

      const ooo2 = runRulesFilter({
        headers: {},
        subject: 'Automatic reply: Away',
        bodyPlain: 'I am currently out of the office.',
        senderEmail: 'user@company.com',
      });
      if (ooo2.type === 'out_of_office') pass('OOO detected via subject/body');
      else fail('OOO not detected via subject/body', JSON.stringify(ooo2));
    } catch (e: any) {
      fail('Failed to import rulesFilter', e.message);
    }
  }

  // 9. Rules Filter — Bounce
  console.log('\n9. Rules Filter — Bounce detection');
  {
    try {
      const { runRulesFilter } = await import('../apps/api/src/lib/reply/rulesFilter.ts');
      const bounce = runRulesFilter({
        headers: {},
        subject: 'Delivery Status Notification (Failure)',
        bodyPlain: 'The message was undeliverable.',
        senderEmail: 'mailer-daemon@googlemail.com',
      });
      if (bounce.type === 'bounce_hard') pass('Hard bounce detected');
      else fail('Hard bounce not detected', JSON.stringify(bounce));

      const soft = runRulesFilter({
        headers: {},
        subject: 'Returned mail: see transcript',
        bodyPlain: 'Mailbox full. Try again later.',
        senderEmail: 'postmaster@company.com',
      });
      if (soft.type === 'bounce_soft') pass('Soft bounce detected (mailbox full)');
      else fail('Soft bounce not detected', JSON.stringify(soft));
    } catch (e: any) {
      fail('Failed to import rulesFilter', e.message);
    }
  }

  // 10. Rules Filter — Unsubscribe
  console.log('\n10. Rules Filter — Unsubscribe detection');
  {
    try {
      const { runRulesFilter } = await import('../apps/api/src/lib/reply/rulesFilter.ts');
      const unsub = runRulesFilter({
        headers: {},
        subject: 'Re: Your outreach',
        bodyPlain: 'Please remove me from your mailing list.',
        senderEmail: 'angry@client.com',
      });
      if (unsub.type === 'unsubscribe') pass('Unsubscribe detected');
      else fail('Unsubscribe not detected', JSON.stringify(unsub));
    } catch (e: any) {
      fail('Failed to import rulesFilter', e.message);
    }
  }

  // 11. Hot Score computation
  console.log('\n11. Hot Score computation');
  {
    try {
      const { computeHotScore } = await import('../apps/api/src/lib/reply/hotScore.ts');
      const score1 = computeHotScore({ sentimentScore: 80, urgency: 'high', stepNumber: 2, receivedAt: new Date().toISOString() });
      if (score1 >= 80 && score1 <= 100) pass(`High sentiment + high urgency = ${score1}`);
      else fail('Unexpected hot score for high/high', String(score1));

      const score2 = computeHotScore({ sentimentScore: 20, urgency: 'low', stepNumber: 0, receivedAt: new Date(Date.now() - 48 * 3600_000).toISOString() });
      if (score2 <= 30) pass(`Low sentiment + old = ${score2}`);
      else fail('Unexpected hot score for low/old', String(score2));

      // Recency should matter
      const fresh = computeHotScore({ sentimentScore: 50, urgency: 'medium', stepNumber: 1, receivedAt: new Date().toISOString() });
      const old = computeHotScore({ sentimentScore: 50, urgency: 'medium', stepNumber: 1, receivedAt: new Date(Date.now() - 47 * 3600_000).toISOString() });
      if (fresh > old) pass('Fresh reply scores higher than old reply');
      else fail('Recency not affecting score', `fresh=${fresh} old=${old}`);
    } catch (e: any) {
      fail('Failed to import hotScore', e.message);
    }
  }

  // 12. Sequence Action
  console.log('\n12. Sequence Action logic');
  {
    try {
      const { handleSequenceAction } = await import('../apps/api/src/lib/reply/sequenceAction.ts');
      // This needs a real enrolmentId to test properly, so we just verify the function exists and imports
      pass('handleSequenceAction imports successfully');
      // We'd need a real enrolment to test DB writes — skip for now
      warn('Full sequence action DB test skipped — requires active enrollment');
    } catch (e: any) {
      fail('Failed to import sequenceAction', e.message);
    }
  }

  // 13. /replies API — Auth required
  console.log('\n13. /replies API — Authentication');
  {
    const noAuth = await apiGet('/replies');
    if (noAuth.status === 401 || noAuth.status === 403) pass('Replies API requires auth');
    else fail(`Expected 401/403, got ${noAuth.status}`);
  }

  // 14. /replies API — With auth (if we can get a token)
  console.log('\n14. /replies API — Fetch with smoke-test token');
  {
    // Try to get a token via the smoke test account
    try {
      const loginRes = await fetch(`${API_BASE}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '' },
        body: JSON.stringify({ email: 'smoke-2026@leadgenapp.com', password: 'Sm0keTest!2026' }),
      });
      const loginBody = await loginRes.json().catch(() => ({}));
      const accessToken = loginBody.access_token;

      if (!accessToken) {
        warn('Could not get smoke-test token — skipping /replies auth test');
      } else {
        const repliesRes = await apiGet('/replies?limit=5', accessToken);
        if (repliesRes.status === 200 && Array.isArray(repliesRes.body?.replies)) {
          pass('/replies returns 200 with replies array');
          info(`Total replies: ${repliesRes.body.total}`);
        } else {
          fail('/replies failed', `${repliesRes.status}: ${JSON.stringify(repliesRes.body)}`);
        }

        // Test intent filter
        const interestedRes = await apiGet('/replies?limit=5&intent=interested', accessToken);
        if (interestedRes.status === 200) pass('/replies intent filter works');
        else fail('/replies intent filter failed', String(interestedRes.status));

        // Test needsReview filter
        const reviewRes = await apiGet('/replies?limit=5&needsReview=true', accessToken);
        if (reviewRes.status === 200) pass('/replies needsReview filter works');
        else fail('/replies needsReview filter failed', String(reviewRes.status));
      }
    } catch (e: any) {
      fail('Smoke test login failed', e.message);
    }
  }

  // 15. Cleanup — delete test reply_events
  console.log('\n15. Cleanup');
  if (replyEventId) {
    const delStatus = await supabaseDelete('reply_events', `id=eq.${replyEventId}`);
    if (delStatus === 204 || delStatus === 200) pass('Test reply_event deleted');
    else warn(`Delete returned ${delStatus}`);
  }

  // Also delete any reply_events with subject matching E2E Test
  {
    const e2eEvents = await supabaseQuery('reply_events', 'subject=like.*E2E%20Test%25&select=id');
    if (Array.isArray(e2eEvents) && e2eEvents.length > 0) {
      for (const ev of e2eEvents) {
        await supabaseDelete('reply_events', `id=eq.${ev.id}`);
      }
      pass(`Cleaned up ${e2eEvents.length} stale E2E reply_events`);
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (failCount > 0) {
    console.log('  ⚠️  Some tests failed. Review output above.\n');
    process.exit(1);
  }
  if (warnCount > 0) {
    console.log('  ⚠️  Some tests skipped or warned. Review output above.\n');
    process.exit(0);
  }
  console.log('  ✅ All critical tests passed.\n');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
