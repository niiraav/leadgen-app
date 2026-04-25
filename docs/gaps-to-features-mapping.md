# From Gaps to Features: How LeadGen App Solves the 4-Step Pipeline

> Current tools live in Step 2 (Monitor). The gaps are Steps 1, 3, and 4.
> LeadGen App is uniquely positioned to own all four.

---

## The Pipeline Framework

| Step | Question | What Founders Do Now | What LeadGen App Provides |
|------|----------|---------------------|---------------------------|
| **1. Research** | What does my market actually want? | Guess keywords, copy competitors | **Market Language Scanner** — discovers real pain phrases from live business data |
| **2. Monitor** | Who's talking about it right now? | Reddit scraping, manual Google Maps, GummySearch (dead) | **Live Search + Enrichment** — official APIs, no ban risk, contact data attached |
| **3. Engage** | What do I say, and why THIS person? | Generic AI drafts, spray-and-pray | **Intent-Aware Outreach** — context cards + situational drafts + warm-up tracking |
| **4. Convert** | Did it work? What's my ROI? | Slack ping, forgotten spreadsheet | **Attribution Pipeline** — discovery → contact → reply → deal, with revenue trace |

---

## Gap-by-Gap: Applied Solution Mapping

### Gap 1: "Keywords come from your website copy, not how your market actually talks"

**The Problem:**
You search for "web design agency London" because that's what YOU call it. The plumber with a broken Wix site doesn't use those words — they say "my website is a mess" or "customers can't find me."

**LeadGen App Solution: Market Language Scanner**

**User Flow:**
1. Founder goes to `/research`
2. Types: "I build websites for local tradespeople who are losing customers"
3. System runs Outscraper search for 50-100 businesses in target area
4. LLM analyzes their descriptions, categories, and review themes
5. Returns ranked phrases:
   - "no online presence" — found in 34% of descriptions
   - "customers can't find me" — extracted from 12 review mentions
   - "website is broken" — 8 mentions
   - "need more leads" — category keyword match
6. One-click: "Search using 'no online presence'" → populates search form

**Feature Spec:**
- **Backend:** `POST /research/market-language` → Outscraper search + Fireworks.ai analysis
- **Storage:** `market_research` table (user_id, input, discovered_phrases[], created_at)
- **Cost:** 1 search credit per scan
- **Value:** Eliminates keyword guessing. Founder now speaks the market's language before touching a single lead.

**Competitive Moat:** No competitor uses live business data + LLM to reverse-discover market language. Apollo gives you contact data. We tell you *what to say before you search.*

---

### Gap 2: "Reply drafts are generated but you still don't know WHY this specific person is worth contacting"

**The Problem:**
AI writes "Hi [Name], I noticed you're a plumber in Hackney..." Generic observation. Not a *reason* to reach out *now*.

**LeadGen App Solution: Intent Snapshot Cards**

**What the User Sees (LeadQuickDrawer):**
```
┌─ Why This Lead ─────────────────────────┐
│ 🔥 Trigger: No website + 4.8★ rating   │
│                                         │
│ Situation: Busy local plumber with      │
│ strong reputation but zero digital      │
│ presence. Losing after-hours bookings.  │
│                                         │
│ Hook: "Your 4.8★ reviews are great —    │
│ but customers can't book you online."   │
│                                         │
│ Risk: May be resistant to "tech" talk.  │
│ Frame as "more customers" not          │
│ "better website."                       │
│                                         │
│ [Copy Hook]  [Generate Draft →]         │
└─────────────────────────────────────────┘
```

**Data Sources (All Already Exist):**
- `ai_bio` — business owner context
- `review_summary.pain_points` — customer complaints
- `readiness_flags` — structural signals (no_website, low_rating)
- `hot_score` — composite urgency
- `contact_enrichment_status` — do we have owner name, email, phone?

**Feature Spec:**
- **Backend:** Expand bio generation prompt to return structured `outreach_context` JSONB
- **Frontend:** New card in `LeadQuickDrawer` above email draft
- **Search Results:** Add "Context" column — one-liner: "No website, 4.5★, 30 reviews — losing online bookings"

**The Shift:** From "here's a list of plumbers" to "here's WHY this plumber is ready for your service, and HOW to approach them."

---

### Gap 3: "Intent scoring can't distinguish 'I hate my CRM' from 'looking for CRM under $50/mo for 3-person team'"

**The Problem:**
Current hot score (0-100) is attribute-based: no website = +25, low rating = -15. It can't tell the difference between "I don't need a website, I'm fine" and "I desperately need one but don't know where to start."

**LeadGen App Solution: 4-Axis Intent Profile**

Replace the single `hot_score` with a multi-dimensional verdict:

| Axis | Question | Signals Used |
|------|----------|-------------|
| **Awareness** | Do they know they have a problem? | No website + has reviews = aware of reputation but missing digital channel |
| **Urgency** | How soon do they need a solution? | Recent negative review, seasonal category, working hours gaps |
| **Budget Fit** | Can they afford the solution? | Review count (business size proxy), price_range, category typical spend |
| **Accessibility** | Can we reach them effectively? | Has email? Phone? Owner name? Socials? |

**Verdict Badge (Pipeline + Search):**
- 🔴 **Venting** (low awareness, high complaint) → "Monitor Only — Not Ready"
- 🟡 **Researching** (aware but comparing) → "Nurture — Send Content"
- 🟢 **Evaluating** (has need + signals) → "Warm — Outreach Now"
- 🔵 **Ready to Buy** (urgency + access + fit) → "Hot — Contact Immediately"

**User Flow:**
1. Search returns 50 leads
2. Filter defaults to "Evaluating + Ready to Buy" only (hides Venting)
3. Pipeline board shows intent badge on each card
4. Drawer shows dimension bars (mini horizontal chart)
5. Sequences can auto-enroll by verdict: "Auto-enroll all 'Ready to Buy' in immediate outreach"

**Feature Spec:**
- **Backend:** New `computeIntentProfile(lead)` function using existing data (reviews, enrichment, flags)
- **Database:** Add `intent_verdict` and `intent_dimensions` JSONB to leads table
- **Frontend:** Badge in PipelineCard, filter in PipelineListView, dimension bars in LeadQuickDrawer

**Value:** Founder doesn't waste time on businesses that aren't ready. Platform becomes opinionated: "Don't spray and pray — understand where they are first."

---

### Gap 4: "No pipeline after discovery. A Slack ping you forget in 20 minutes isn't a sales system"

**The Problem:**
Founder finds 20 great leads, sends 3 emails, gets 1 reply... then nothing. No follow-up system. No stage tracking. Leads die in a spreadsheet row.

**LeadGen App Solution: Search → Pipeline Bridge (Already Built, Just Needs Wiring)**

**What Already Exists:**
- ✅ Full kanban pipeline (8 stages: new → contacted → replied → interested → qualified → proposal_sent → converted → lost)
- ✅ Pipeline list view with sortable columns
- ✅ Activity tracking (every email, reply, stage change logged)
- ✅ Reply detection + auto-status-updates (Inngest)
- ✅ Follow-up date auto-scheduling
- ✅ Bulk actions (move, follow-up, mark lost)

**The Missing Link:**
Search results have "Save" but no "Add to Pipeline" with context pre-attached.

**User Flow:**
1. Search returns 20 leads
2. User clicks "Add to Pipeline" on 5 of them
3. System creates pipeline positions in `Awareness` stage with:
   - Original search query as tag
   - Intent snapshot pre-computed
   - AI first-touch draft pre-generated
   - Due date: +3 days for first outreach
4. Pipeline board now shows these 5 leads with full context
5. User drags to "Contacted" → system logs activity, sends draft
6. Reply comes in → Inngest auto-moves to "Replied" + classifies intent
7. Follow-up date auto-set based on reply type
8. Deal closes → converted_at timestamp logged

**Feature Spec:**
- **Frontend:** Add "Add to Pipeline" button to `SearchResultsTable` alongside existing "Save"
- **Backend:** `POST /pipeline/from-search` — batch create pipeline positions from search results
- **Auto-Rules:**
  - Intent = "Ready to Buy" → Stage = `Interested` (skip Awareness)
  - No email + no phone → Tag = `Needs Enrichment` (don't auto-enroll in sequence)

**Value:** Discovery is worthless without a system to act on it. LeadGen App is the system.

---

### Gap 5: "Reddit WILL ban you. GummySearch shut down in Nov 2025"

**The Problem:**
GummySearch built on Reddit scraping. Reddit killed their API deal. 135,000 users lost their tool overnight.

**LeadGen App Positioning: Official APIs Only — No Scraping, No Ban Risk**

**Current Reality:**
- LeadGen App uses **Outscraper** (official Google Maps commercial API)
- No Reddit dependency whatsoever
- No web scraping of any platform
- All data is public business listing data

**Messaging:**
> "Other tools built their house on someone else's land. We built on official APIs. Your pipeline won't vanish because a platform changed its terms."

**Future Diversification (Low Risk, High Moat):**
| Source | API Type | Use Case | Timeline |
|--------|----------|----------|----------|
| Google Maps | ✅ Official (Outscraper) | Local business discovery | Now |
| LinkedIn Sales Navigator | Official, paid | B2B prospecting | Q2 2026 |
| G2 / Capterra | Official | Software buyer intent | Q2 2026 |
| IndieHackers | Official, public | Founder pain points | Q3 2026 |
| Hacker News | Official, free | Tech community | Q3 2026 |
| Reddit | Official ONLY if commercial deal | Community monitoring | Only if official |

**Architecture:** Abstract `SearchProvider` interface. Add sources without rewriting core.

**Value:** Founders invest time building pipeline in your tool. That investment must be safe. LeadGen App guarantees it.

---

### Gap 6: "Founders using these tools still spend 2 to 3 hours per day on manual engagement"

**The Problem:**
Even with AI drafts and sequences, founders manually: choose who to contact, personalize each message, decide when to follow up, reply to responses, update spreadsheets.

**LeadGen App Solution: Smart Engagement Layer**

**What Already Exists:**
- ✅ AI email drafting (personalized subject + body)
- ✅ BullMQ sequences with delays
- ✅ Bulk actions in pipeline
- ✅ Reply classification (interested / question / objection / not_now / not_interested)
- ✅ Auto-pause sequences on reply
- ✅ Follow-up date scheduling

**What Makes It "Smart":**

**1. Auto-Enroll by Intent**
- User sets rule: "Auto-enroll all 'Ready to Buy' leads in 'Immediate Outreach' sequence"
- When search result hits criteria → auto-enrolled (with notify-first or auto-send toggle)
- Backend: Inngest `evaluateSequenceRules` on lead update

**2. Context-Aware Templates**
| Stage + Intent | Template Type | Example |
|----------------|--------------|---------|
| Contacted + Evaluating | Resource-sharing | "Saw your reviews — here's a guide on booking systems for plumbers" |
| Replied + Question | FAQ answer | "Yes, we can integrate with your existing calendar. Here's how..." |
| Interested + 7+ days silent | Gentle check-in | "Quick follow-up — still thinking about the website update?" |
| Ready to Buy + Any | Direct offer | "Ready when you are. Let's get your booking system live this week." |

**3. Daily Digest (One-Click Actions)**
Morning notification:
```
📬 5 leads need attention today

1. Mike's Plumbing — Replied "How much?"
   [Reply with Quote] [Snooze 3 days] [Mark Lost]

2. Sarah's Salon — Intent: Ready to Buy, no contact in 5 days
   [Send Follow-Up] [Skip] [Add Note]

3. Dave's Electrical — New reply: "Not right now"
   [Schedule 30-day Re-engage] [Archive]
```
All actions = one click → Inngest processes async.

**4. Adaptive Sequences**
- Email opened but no reply → Different follow-up vs. no-open
- Lead's website updated since last contact → Trigger "Saw you updated your site..."
- Competitor activity detected in market → Urgency bump

**Feature Spec:**
- **Backend:** Inngest functions for rule evaluation, adaptive sequencing
- **Frontend:** `/daily-digest` page + email notification template
- **Database:** `sequence_rules` table (user_id, trigger_condition, action, sequence_id)

**Value:** 2-3 hours → 15 minutes. Founder reviews, clicks, moves on. Platform runs the outreach.

---

### Gap 7: "A firehose of posts with no framework to make sense of them"

**The Problem:**
50-500 search results. No patterns. No "what's the #1 problem in this market?" No "are things getting better or worse?" Just a list.

**LeadGen App Solution: Market Intelligence Dashboard**

**For Any Saved Search or Filter Set:**

**1. Pain Theme Cloud**
```
Top Problems in "Plumbers London" (from 87 businesses analyzed):

🔴 No online booking — 31% (27 businesses)
🟠 Slow response time — 23% (20 businesses)
🟡 Outdated website — 18% (16 businesses)
🟢 No Google reviews — 12% (10 businesses)
🔵 Wrong business hours online — 9% (8 businesses)
```

**2. Readiness Distribution**
Pie chart: Venting 15% | Researching 35% | Evaluating 40% | Ready to Buy 10%

**3. Channel Gap Analysis**
```
Of 87 plumbers:
- 47% have NO website
- 62% have NO email listed publicly
- 89% have NO LinkedIn presence
- 23% have broken/outdated contact info
```

**4. Geographic Heatmap**
Map view: Density of high-intent leads by area. "Hackney has 12 Ready to Buy plumbers — focus here."

**5. Trend Detection (Advanced)**
Track same query over time:
```
"Plumbers London" — % with no website:
Jan: 30% → Mar: 25% → Jun: 22%
Trend: Market is slowly digitizing. Urgency INCREASING for laggards.
```

**Data Sources (All Existing):**
- `review_summary.pain_points` — aggregated and counted
- `intent_verdict` — distribution across result set
- `readiness_flags` — channel gap percentages
- `hot_score` / `intent_dimensions` — geographic clustering

**Feature Spec:**
- **Backend:** Aggregate function + LLM clustering for themes. Cache in `market_intelligence_cache` table.
- **Frontend:** `/analytics/market` page with Tremor/Chart.js components
- **Refresh:** Weekly auto-refresh for saved searches

---

## The Ultimate Close: Attribution & ROI Engine (Gap 7 Extended)

The final question every founder asks: **"Did any of this make money?"**

**LeadGen App Attribution:**
```
Search Query: "plumbers London"
├─ Leads Discovered: 87
├─ Added to Pipeline: 12
├─ Contacted: 8
├─ Replied: 3
├─ Interested: 2
├─ Converted: 1
│  └─ Deal Value: £5,000
│
└─ ROI: £5,000 revenue / £47 credits spent = 106x return
```

**Per-Channel Comparison:**
| Source | Leads | Contacted | Converted | Revenue | ROI |
|--------|-------|-----------|-----------|---------|-----|
| Google Maps (Plumbers) | 87 | 8 | 1 | £5,000 | 106x |
| Google Maps (Electricians) | 64 | 5 | 0 | £0 | 0x |
| LinkedIn (B2B SaaS) | 42 | 12 | 2 | £12,000 | 200x |

**Value:** Founder sees exactly which searches, which markets, which approaches make money. Double down on what works. Kill what doesn't.

---

## The Narrative: LeadGen App Owns All 4 Steps

**Current tools:**
- Apollo / ZoomInfo → Step 2 only (Monitor)
- Outreach / Reply.io → Step 3 only (Engage — needs imported lists)
- HubSpot / Pipedrive → Step 4 only (Convert — needs leads fed in)
- GummySearch → Dead (Step 2 with platform risk)

**LeadGen App:**

| Step | Feature | Status |
|------|---------|--------|
| **1. Research** | Market Language Scanner | 🔧 Build |
| **2. Monitor** | Live Search + Enrichment | ✅ Exists |
| **3. Engage** | Intent-Aware Outreach | 🔧 Enhance |
| **4. Convert** | Attribution Pipeline | 🔧 Enhance |

**The pitch:**
> "We don't give you a firehose of posts. We tell you what your market actually wants, who specifically is ready to buy right now, why they're a good fit, exactly what to say, and how much money you made from it."

---

## Implementation Priority

### Sprint 1 (Immediate — High Impact, Low Risk)
1. **Intent Snapshot Cards** (Gap 2) — Surface existing `ai_bio` + `review_summary` as "Why This Lead" card in drawer
2. **Search → Pipeline Bridge** (Gap 4) — Add "Add to Pipeline" button to search results with pre-populated stage

### Sprint 2
3. **4-Axis Intent Scoring** (Gap 3) — Replace hot score with verdict badge + dimension bars
4. **Market Intelligence Dashboard** (Gap 7) — Aggregate review insights + intent distribution

### Sprint 3
5. **Smart Engagement Layer** (Gap 6) — Auto-enroll rules, daily digest, adaptive sequences
6. **Market Language Scanner** (Gap 1) — Reverse-search pain phrases from live data

### Sprint 4
7. **Attribution & ROI Engine** (Gap 7 extended) — Per-search revenue tracking
8. **Source Diversification** (Gap 5) — LinkedIn, G2 providers (official APIs only)

---

*Ready to scope Sprint 1 into detailed PRDs.*
