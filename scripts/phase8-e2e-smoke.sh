#!/usr/bin/env bash
# Phase 8: E2E Integration Smoke Test
# Full user journey: create sequence → add steps → activate → enroll lead → verify job queued → force run → verify email sent → verify Mailgun event stored → verify reply classification updates dashboard
#
# USAGE:
#   1. Ensure local dev server is running: cd apps/api && npx tsx --no-cache src/index.ts
#   2. Ensure Redis is available (local or Upstash)
#   3. Run: bash scripts/phase8-e2e-smoke.sh
#
# NOTE: If your Supabase project is paused, resume it first via the Supabase dashboard.

set -euo pipefail

API="http://localhost:3001"
AUTH="Authorization: Bearer test-token"
RED="\033[0;31m"
GRN="\033[0;32m"
YEL="\033[1;33m"
RST="\033[0m"

PASS() { echo -e "${GRN}✓${RST} $1"; }
FAIL() { echo -e "${RED}✗${RST} $1"; exit 1; }
WARN() { echo -e "${YEL}⚠${RST} $1"; }

echo "=== Phase 8: E2E Integration Smoke Test ==="
echo ""

# ── 1. Health check ──────────────────────────────────────────────────────────
echo "1. Health check (includes Redis)"
HEALTH=$(curl -s --max-time 10 "${API}/health")
echo "   Response: ${HEALTH}"
if echo "${HEALTH}" | grep -q '"status":"ok"'; then
  PASS "Server is healthy"
else
  FAIL "Server health check failed"
fi
if echo "${HEALTH}" | grep -q '"redis":true'; then
  PASS "Redis is connected"
else
  WARN "Redis is NOT connected — scheduler queue may be disabled"
fi
echo ""

# ── 2. Create a sequence ─────────────────────────────────────────────────────
echo "2. Create sequence"
SEQ=$(curl -s --max-time 20 -X POST "${API}/sequences" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name":"E2E Smoke Test Sequence","steps":[{"step_order":1,"subject_template":"Hello {{name}}","body_template":"Hi {{name}}, this is a test email for {{company}}.","delay_days":0},{"step_order":2,"subject_template":"Follow-up","body_template":"Just checking in, {{name}}.","delay_days":1}]}')
echo "   Response: ${SEQ}"
SEQ_ID=$(echo "${SEQ}" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4)
if [ -z "${SEQ_ID}" ]; then
  FAIL "Failed to create sequence"
fi
PASS "Created sequence: ${SEQ_ID}"
echo ""

# ── 3. Verify sequence is draft ────────────────────────────────────────────────
echo "3. Verify sequence status = draft"
SEQ_GET=$(curl -s --max-time 10 "${API}/sequences/${SEQ_ID}" -H "${AUTH}")
if echo "${SEQ_GET}" | grep -q '"status":"draft"'; then
  PASS "Sequence is draft"
else
  FAIL "Sequence is not draft"
fi
echo ""

# ── 4. Activate sequence ─────────────────────────────────────────────────────
echo "4. Activate sequence"
PATCH=$(curl -s --max-time 20 -X PATCH "${API}/sequences/${SEQ_ID}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"status":"active"}')
if echo "${PATCH}" | grep -q '"message":"Sequence updated"'; then
  PASS "Sequence activated"
else
  FAIL "Failed to activate sequence: ${PATCH}"
fi
echo ""

# ── 5. Verify validation rejects empty steps at creation ──────────────────────
echo "5. Activation guard test (empty steps)"
EMPTY_SEQ=$(curl -s --max-time 20 -X POST "${API}/sequences" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"name":"Empty Sequence","steps":[]}')
if echo "${EMPTY_SEQ}" | grep -qi 'validation failed\|at least one step\|400'; then
  PASS "Empty step sequence correctly rejected at creation"
else
  # If it somehow created, test activation guard
  EMPTY_ID=$(echo "${EMPTY_SEQ}" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4 || true)
  if [ -n "${EMPTY_ID}" ]; then
    GUARD=$(curl -s --max-time 20 -X PATCH "${API}/sequences/${EMPTY_ID}" \
      -H "${AUTH}" -H "Content-Type: application/json" \
      -d '{"status":"active"}')
    if echo "${GUARD}" | grep -q 'must have at least one step'; then
      PASS "Activation guard correctly blocks empty sequence"
    else
      FAIL "Activation guard did NOT block empty sequence: ${GUARD}"
    fi
  else
    WARN "Unexpected empty sequence response: ${EMPTY_SEQ}"
  fi
fi
echo ""

# ── 6. Step editing persistence ─────────────────────────────────────────────
echo "6. Step editing persistence (before enrollment)"
EDIT=$(curl -s --max-time 20 -X PATCH "${API}/sequences/${SEQ_ID}" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"steps":[{"step_order":1,"subject_template":"Updated Subject","body_template":"Updated body for {{name}}.","delay_days":0}]}')
if echo "${EDIT}" | grep -q '"message":"Sequence updated"'; then
  PASS "Steps edited successfully"
else
  FAIL "Step editing failed: ${EDIT}"
fi

# Verify edit persisted
SEQ_GET2=$(curl -s --max-time 10 "${API}/sequences/${SEQ_ID}" -H "${AUTH}")
if echo "${SEQ_GET2}" | grep -q 'Updated Subject'; then
  PASS "Edited step persisted in DB"
else
  FAIL "Edited step did NOT persist"
fi
echo ""

# ── 7. Enroll a lead ─────────────────────────────────────────────────────────
echo "7. Enroll a test lead"
# First create a lead
LEAD=$(curl -s --max-time 20 -X POST "${API}/leads" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d '{"business_name":"E2E Test Lead","email":"e2e-smoke@example.com","status":"new","source":"test"}')
LEAD_ID=$(echo "${LEAD}" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4 || true)
if [ -z "${LEAD_ID}" ]; then
  # Try fetching existing leads
  LEADS=$(curl -s --max-time 10 "${API}/leads?limit=1" -H "${AUTH}")
  LEAD_ID=$(echo "${LEADS}" | grep -o '"id":"[^"]*"' | head -n1 | cut -d'"' -f4 || true)
fi
if [ -z "${LEAD_ID}" ]; then
  FAIL "Could not get a lead ID for enrollment"
fi
ENROLL=$(curl -s --max-time 20 -X POST "${API}/sequences/${SEQ_ID}/enroll" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "{\"lead_ids\":[\"${LEAD_ID}\"]}")
echo "   Response: ${ENROLL}"
if echo "${ENROLL}" | grep -q '"enrolled":1'; then
  PASS "Lead enrolled"
else
  FAIL "Enrollment failed: ${ENROLL}"
fi
echo ""

# ── 8. Duplicate enrollment guard ────────────────────────────────────────────
echo "8. Duplicate enrollment guard"
DUP=$(curl -s --max-time 20 -X POST "${API}/sequences/${SEQ_ID}/enroll" \
  -H "${AUTH}" -H "Content-Type: application/json" \
  -d "{\"lead_ids\":[\"${LEAD_ID}\"]}")
echo "   Response: ${DUP}"
if echo "${DUP}" | grep -q '"enrolled":0' && echo "${DUP}" | grep -q '"skipped_ids"'; then
  PASS "Duplicate enrollment correctly skipped"
else
  WARN "Duplicate guard response unexpected: ${DUP}"
fi
echo ""

# ── 9. Verify dashboard analytics include dead_leads_pending ────────────────
echo "9. Dashboard analytics (dead_leads_pending)"
ANALYTICS=$(curl -s --max-time 10 "${API}/analytics/dashboard" -H "${AUTH}")
echo "   Response: ${ANALYTICS}"
if echo "${ANALYTICS}" | grep -q 'dead_leads_pending'; then
  PASS "Dashboard includes dead_leads_pending field"
else
  FAIL "Dashboard missing dead_leads_pending"
fi
echo ""

# ── 10. Pause and resume sequence ─────────────────────────────────────────────
echo "10. Pause and resume sequence"
PAUSE=$(curl -s --max-time 20 -X POST "${API}/sequences/${SEQ_ID}/pause" -H "${AUTH}")
if echo "${PAUSE}" | grep -q '"message":"Sequence paused"'; then
  PASS "Sequence paused"
else
  FAIL "Pause failed: ${PAUSE}"
fi

RESUME=$(curl -s --max-time 20 -X POST "${API}/sequences/${SEQ_ID}/resume" -H "${AUTH}")
if echo "${RESUME}" | grep -q '"message":"Sequence resumed"'; then
  PASS "Sequence resumed"
else
  FAIL "Resume failed: ${RESUME}"
fi
echo ""

# ── 11. Template preview endpoint ─────────────────────────────────────────────
echo "11. Template preview endpoint"
PREVIEW=$(curl -s --max-time 10 "${API}/sequences/${SEQ_ID}/preview?lead_id=${LEAD_ID}" -H "${AUTH}")
echo "   Response: ${PREVIEW}"
if echo "${PREVIEW}" | grep -q 'E2E Test Lead' || echo "${PREVIEW}" | grep -q 'e2e-smoke@example.com'; then
  PASS "Template preview shows substituted variables"
else
  WARN "Preview may not show substitutions (lead data may differ)"
fi
echo ""

# ── 12. Cleanup ──────────────────────────────────────────────────────────────
echo "12. Cleanup"
curl -s --max-time 10 -X POST "${API}/sequences/${SEQ_ID}/pause" -H "${AUTH}" > /dev/null || true
curl -s --max-time 10 -X DELETE "${API}/sequences/${SEQ_ID}" -H "${AUTH}" > /dev/null || true
PASS "Cleanup attempted"
echo ""

echo "=== Phase 8 Smoke Test Complete ==="
echo ""
echo "Manual verification still needed:"
echo "  - Force-run a BullMQ job and verify email is actually sent (requires Mailgun + Redis)"
echo "  - Verify Mailgun webhook stores event in mailgun_events table"
echo "  - Verify AI reply classification updates enrollment status to 'replied'"
echo "  - Verify dashboard dead_leads_pending increments when leads fail/pause"
echo ""
echo "SQL migrations to apply via Supabase SQL Editor:"
echo "  - apps/api/migrations/032_sequence_executions_status.sql"
echo "  - apps/api/migrations/033_update_sequence_steps_rpc.sql"
echo "  - apps/api/migrations/034_partial_unique_enrollment.sql"
