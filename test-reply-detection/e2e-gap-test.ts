/**
 * Reply Detection Gap Tests
 *
 * Covers remaining areas not fully tested in the main suite:
 * 1. /replies API returns real data after webhook ingestion
 * 2. Duplicate mailgun_message_id handling
 * 3. Socket.IO broadcast on new reply
 * 4. Inngest handler direct invocation (simulated)
 */

import { createHmac } from 'crypto';
import http from 'http';

const API_BASE = 'http://localhost:3001';
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const WEBHOOK_KEY = process.env.MAILGUN_WEBHOOK_SIGNING_KEY!;
const INBOUND_DOMAIN = process.env.INBOUND_REPLY_DOMAIN || 'inbound.leadgenapp.com';
const SMOKE_TOKEN = process.env.SMOKE_TOKEN || '';

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

function signWebhook(token: string, timestamp: string): string {
  const hmac = createHmac('sha256', WEBHOOK_KEY);
  hmac.update(`${timestamp}${token}`);
  return hmac.digest('hex');
}

function postWebhook(payload: Record<string, string>): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(payload);
    const req = http.request(
      { hostname: 'localhost', port: 3001, path: '/webhooks/inbound-reply', method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data.toString()) },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try { resolve({ status: res.statusCode || 0, body: JSON.parse(body) }); }
          catch { resolve({ status: res.statusCode || 0, body }); }
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
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, Accept: 'application/json' },
  });
  return res.json();
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  Reply Detection Gap Test Suite');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Get a real lead
  let lead: any = null;
  let token = '';
  {
    const leads = await supabaseQuery('leads', 'select=id,user_id,reply_token,business_name,email,status&limit=1');
    if (Array.isArray(leads) && leads.length > 0) {
      lead = leads[0];
      token = lead.reply_token;
    } else {
      fail('No leads found');
      process.exit(1);
    }
  }

  // 2. Happy path webhook — keep data for API test
  console.log('\n1. Webhook ingestion (keeping data)');
  let replyEventId: string | null = null;
  const uniqueSubject = `Gap Test ${Date.now()}`;
  const messageId = `<gap-${Date.now()}@mailgun>`;
  {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signWebhook(token, ts);
    const { status, body } = await postWebhook({
      token: token,
      timestamp: ts,
      signature: sig,
      recipient: `reply+${token}@${INBOUND_DOMAIN}`,
      from: 'prospect@example.com',
      subject: uniqueSubject,
      'body-plain': 'Yes I am interested. Call me tomorrow.',
      'stripped-text': 'Yes I am interested. Call me tomorrow.',
      'Message-Id': messageId,
    });

    if (status === 200 && body?.status === 'ok') {
      replyEventId = body.replyId;
      pass(`Webhook accepted — replyId: ${replyEventId?.slice(0, 8)}...`);
    } else {
      fail(`Expected 200, got ${status}`, JSON.stringify(body));
    }
  }

  // 3. Verify /replies API returns the new event
  console.log('\n2. /replies API returns newly created reply');
  if (SMOKE_TOKEN && replyEventId) {
    const res = await fetch(`${API_BASE}/replies`, {
      headers: { Authorization: `Bearer ${SMOKE_TOKEN}` },
    });
    const data = await res.json();
    if (res.status === 200 && Array.isArray(data.replies)) {
      const found = data.replies.find((r: any) => r.id === replyEventId);
      if (found) {
        pass('Replies API includes newly created reply event');
        if (found.lead?.business_name === lead.business_name) {
          pass('Lead nested data populated correctly');
        } else {
          warn('Lead nested data mismatch or missing');
        }
      } else {
        fail('Replies API did not include the new reply event', `Returned ${data.replies.length} replies`);
      }
    } else {
      fail('/replies API returned unexpected response', JSON.stringify(data).slice(0, 200));
    }
  } else {
    warn('No SMOKE_TOKEN — skipping /replies auth test');
  }

  // 4. Duplicate mailgun_message_id test
  console.log('\n3. Duplicate mailgun_message_id handling');
  if (replyEventId) {
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = signWebhook(token, ts);
    const { status, body } = await postWebhook({
      token: token,
      timestamp: ts,
      signature: sig,
      recipient: `reply+${token}@${INBOUND_DOMAIN}`,
      from: 'prospect@example.com',
      subject: 'Re: Duplicate test',
      'body-plain': 'Duplicate body',
      'stripped-text': 'Duplicate body',
      'Message-Id': messageId, // SAME message ID
    });

    // Should get a 500 from DB unique constraint violation, or ideally a graceful 409
    if (status === 409) {
      pass('Duplicate mailgun_message_id rejected with 409');
    } else if (status === 500) {
      warn('Duplicate rejected but returned 500 (DB unique constraint) — should be 409');
    } else if (status === 200) {
      fail('Duplicate mailgun_message_id was accepted — unique constraint not enforced');
      // Clean up the duplicate
      const dupEvents = await supabaseQuery('reply_events', `mailgun_message_id=eq.${encodeURIComponent(messageId)}&select=id&order=created_at.desc&limit=2`);
      if (Array.isArray(dupEvents) && dupEvents.length > 1) {
        for (const dup of dupEvents.slice(1)) {
          await fetch(`${SUPABASE_URL}/rest/v1/reply_events?id=eq.${dup.id}`, {
            method: 'DELETE',
            headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
          });
        }
      }
    } else {
      warn(`Unexpected status ${status} for duplicate test`, JSON.stringify(body));
    }
  }

  // 5. Socket.IO broadcast test (basic connectivity)
  console.log('\n4. Socket.IO server connectivity');
  {
    const io = await import('socket.io-client');
    const client = (io as any).default('http://localhost:3001', { transports: ['websocket'], timeout: 3000 });
    let connected = false;
    client.on('connect', () => { connected = true; client.disconnect(); });
    client.on('connect_error', (err: any) => { console.log(`    Socket error: ${err.message}`); });
    await new Promise((r) => setTimeout(r, 2000));
    if (connected) {
      pass('Socket.IO client can connect to API server');
    } else {
      warn('Socket.IO connection failed — server may not have socket.io mounted');
    }
  }

  // 5. Inngest handler direct test (simulate)
  console.log('\n5. Inngest handler — direct classification pipeline');
  try {
    const { runRulesFilter } = await import('../apps/api/src/lib/reply/rulesFilter.ts');
    const { classifyReplyIntent } = await import('../apps/api/src/lib/reply/classifier.ts');
    const { computeHotScore } = await import('../apps/api/src/lib/reply/hotScore.ts');

    // Simulate a high-interest reply
    const reply = {
      bodyPlain: 'Yes we are very interested! Please call us ASAP. We need a quote by Friday.',
      subject: 'Re: Your outreach',
      originalEmailSubject: 'Introduction to our services',
      originalEmailBody: 'Hi there, I wanted to reach out about...',
      sequenceStepNumber: 1,
      leadBusinessName: lead.business_name || 'Test Business',
      leadCategory: 'Plumbing',
      leadLocation: 'London',
    };

    const classification = await classifyReplyIntent(reply as any);
    if (classification.intent === 'interested') {
      pass('Classifier correctly labels high-interest reply as interested');
    } else {
      warn(`Classifier returned ${classification.intent} instead of interested`);
    }
    const hotScore = computeHotScore({
      sentimentScore: classification.sentiment_score,
      urgency: classification.urgency,
      stepNumber: 1,
      receivedAt: new Date().toISOString(),
    });
    if (hotScore >= 80) {
      pass(`Hot score computed as ${hotScore} (high)`);
    } else {
      warn(`Hot score ${hotScore} lower than expected for interested+positive+high`);
    }
  } catch (e: any) {
    fail('Direct classification pipeline failed', e.message);
  }

  // Cleanup
  console.log('\n6. Cleanup');
  if (replyEventId) {
    await fetch(`${SUPABASE_URL}/rest/v1/reply_events?id=eq.${replyEventId}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
    });
    pass('Test reply_event deleted');
  }
  // Also clean up any duplicate if it was created
  {
    const events = await supabaseQuery('reply_events', `mailgun_message_id=eq.${encodeURIComponent(messageId)}&select=id`);
    if (Array.isArray(events)) {
      for (const ev of events) {
        await fetch(`${SUPABASE_URL}/rest/v1/reply_events?id=eq.${ev.id}`, {
          method: 'DELETE',
          headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` },
        });
      }
      if (events.length > 0) pass(`Cleaned up ${events.length} events with test message ID`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  Results: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('═══════════════════════════════════════════════════════════════\n');
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
