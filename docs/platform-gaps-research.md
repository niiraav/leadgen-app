# LeadGen App: Platform Gap Analysis & Solution Mapping

## Research Date: 2026-04-25
## Author: AI Research Agent
## Status: Ready for Review

---

## Executive Summary

The LeadGen App currently operates as a **Step 2 tool** (Monitor) with partial Step 3 capabilities (Engage). The research below maps each of the 7 identified market gaps to either **existing features we can leverage** or **new capabilities we can build** — all within the existing monorepo architecture (Turborepo + Next.js + Hono + Supabase + Outscraper + BullMQ + Inngest).

**The shift:** From "search and save leads" to **"research → monitor → engage → convert with attribution"**.

---

## Gap-by-Gap Analysis

### Gap 1: Keywords come from website copy, not market language

**The Problem:**
Founders search for "digital marketing agency" but their market says "my website is dead" or "no one finds me on Google." Current tools force users to guess keywords. No feedback loop exists to discover *how prospects actually describe their pain*.

**Current State:**
- Search uses Outscraper Google Maps API with user-provided `query` + `location`
- No keyword suggestion, analysis, or market-language discovery exists
- Search history is stored but not analyzed (`search_history` table has raw queries)

**Proposed Solution: Market Language Scanner**

Leverage the existing AI bio generation route (`POST /leads/:id/bio`) and LLM pipeline to build a research layer:

1. **New Endpoint:** `POST /research/market-language`
   - Input: User's product description (e.g., "I build websites for tradespeople")
   - Process: Use Outscraper to pull 50-100 business listings in a target area, then run an LLM analysis on their descriptions, categories, and review themes
   - Output: `{ phrases: string[], pain_themes: string[], confidence_scores: number[] }`
   - Example output: `["website is broken", "no online presence", "customers can't find me", "need more leads"]`

2. **Frontend Page:** `/research`
   - Simple input: "Describe what you do"
   - Output: ranked list of phrases with usage frequency from real business data
   - CTA: "Search using this phrase" → one-click populates the search form

3. **Data Flow:**
   ```
   User Input → Outscraper Search → LLM Analysis (Fireworks.ai) → Stored Research Result
   ```

4. **Database Addition:**
   - New table `market_research` (id, user_id, input_description, discovered_phrases_jsonb, created_at)
   - Ties into existing `search_history` via `research_id` foreign key

5. **Pricing:**
   - Count as 1 "search credit" since it calls Outscraper
   - Free plan: 3 market language scans/month
   - Paid plans: unlimited

**Why This Works:**
- Uses 100% existing infra (Outscraper + Fireworks.ai + Supabase)
- No new vendors or APIs needed
- Creates a true Step 1 capability no competitor has
- Feeds directly into Step 2 (Monitor) by giving users better search terms

---

### Gap 2: Reply drafts generated but no "WHY this person"

**The Problem:**
AI generates a cold email, but the user doesn't understand *why* this specific lead is worth contacting *right now*. Context is missing: what triggered the outreach? What situation is this business in?

**Current State:**
- AI bio exists (`ai_bio` column on leads) — generated on demand, cached
- Bio is used "invisibly" for email personalization but not displayed prominently
- Enrichment pulls owner names, titles, social links
- Review insights exist (`review_summary`) but not surfaced in outreach context
- Hot score + readiness flags exist but are generic (`no_website`, `low_rating`)

**Proposed Solution: Intent Snapshot Cards**

Transform the existing `ai_bio` + `review_summary` + `readiness_flags` into a visible "Why Now" context layer:

1. **Backend Enhancement:**
   - Expand the bio generation prompt to include:
     - Review sentiment analysis (from `review_summary.pain_points`)
     - Readiness flag explanations (not just flags, but *why*)
     - Business situation assessment (e.g., "This plumber has 50+ reviews but no website — they're clearly busy but losing digital leads")
   - Store as structured JSONB in a new column `outreach_context` (or reuse `metadata`)

2. **Structured Context Schema:**
   ```json
   {
     "trigger": "no_website + high_rating",
     "situation": "Busy local business with strong reputation but zero digital presence",
     "why_now": "Competitors with websites are capturing after-hours inquiries",
     "personalization_hook": "Mention their 4.8-star rating and that customers can't book online",
     "risk_factor": "May be resistant to 'tech' solutions — frame as 'more customers' not 'better website'",
     "recommended_approach": "Friendly, not salesy. Lead with a specific observation about their reviews."
   }
   ```

3. **Frontend: Context Card in LeadQuickDrawer**
   - Add a "Why This Lead" section above the email draft
   - Display: trigger badge (colored), situation summary (2 lines), personalization hook (copyable)
   - Include a "Why Now?" score (0-100) combining hot_score + recency + situation urgency

4. **Search Results Enhancement:**
   - In search results table, add a "Context" column with one-line summary:
     - "No website, 4.5★, 30 reviews — losing online bookings"
     - "Has website but no contact form — leads bouncing"

**Why This Works:**
- Leverages existing `ai_bio`, `review_summary`, `readiness_flags`
- Only requires: prompt engineering + one JSONB column + UI update
- Transforms generic leads into "situation-aware prospects"
- Closes the gap between "here's a list" and "here's why THIS person"

---

### Gap 3: Intent scoring can't distinguish venting from buying intent

**The Problem:**
Current hot score (0-100) is based on *business attributes* (has website, rating, reviews) not *buying signals*. A business with "no website" scores high but might be "I don't need one, I'm fine" vs "I desperately need one but don't know where to start."

**Current State:**
- Hot score formula: base 40 + signals (no website +25, low rating -15, no reviews +15, etc.)
- Readiness flags: `no_website`, `no_phone`, `low_rating` — binary labels
- No semantic intent analysis
- Reply classifier exists (`classifyReplyIntent`) but only for inbound replies, not discovery

**Proposed Solution: Multi-Axis Intent Scoring**

Replace the single `hot_score` with a **4-dimension intent matrix**:

| Axis | Question | Signals |
|------|----------|---------|
| **Problem Awareness** | Do they know they have a problem? | No website + has reviews = aware of reputation but missing digital channel |
| **Urgency** | How soon do they need a solution? | Recent negative review mentioning "can't find online", seasonal business peak |
| **Budget Fit** | Can they afford the solution? | Business size (review count proxy), price range, category typical spend |
| **Accessibility** | Can we reach them effectively? | Has email? Phone? Website? Socials? Owner name known? |

1. **Backend: Enhanced Scoring Engine**
   - New function `computeIntentScore(lead)` that returns:
     ```typescript
     interface IntentProfile {
       overall: number;           // 0-100 composite
       dimensions: {
         awareness: number;       // 0-100
         urgency: number;         // 0-100
         budget_fit: number;      // 0-100
         accessibility: number;   // 0-100
       };
       verdict: 'venting' | 'researching' | 'evaluating' | 'ready_to_buy';
       explanation: string;       // One-line rationale
     }
     ```
   - Compute using:
     - Outscraper data (rating, reviews, website presence, category)
     - Review sentiment (via existing `reviewSummary` LLM extraction)
     - Enrichment quality (do we have owner name, email, phone?)
     - Temporal signals (business age proxy from first review date if available)

2. **Frontend: Intent Badge System**
   - Replace single "Hot" badge with color-coded intent pill:
     - 🔴 Venting (low awareness + high complaint) → "Not Ready — Monitor Only"
     - 🟡 Researching (aware but comparing) → "Nurture with Content"
     - 🟢 Evaluating (has need + some signals) → "Warm Outreach"
     - 🔵 Ready to Buy (urgency + accessibility + fit) → "Contact Immediately"
   - Show dimension bars in drawer (mini horizontal bar chart)

3. **Pipeline Filtering:**
   - Add "Intent Verdict" filter to pipeline list view
   - Default view: only show "Evaluating" + "Ready to Buy"
   - Let users create custom filters (e.g., "High Urgency + Low Awareness = Education Opportunity")

**Why This Works:**
- Builds on existing scoring + review insights + enrichment data
- No new data sources needed
- Makes the platform opinionated: "Don't just spray and pray — understand where they are"
- Creates a true competitive moat: no other tool scores *intent* from discovery data

---

### Gap 4: No pipeline after discovery

**The Problem:**
Users discover leads, send an email, then... nothing. No system tracks what happened next. A Slack ping or spreadsheet row isn't a sales system. Leads fall through the cracks.

**Current State:**
- ✅ **Pipeline exists** — Kanban board with 8 stages (new → contacted → replied → interested → qualified → proposal_sent → converted → lost)
- ✅ **Pipeline list view** — Table view with Name, Stage, Email, Phone, Category, Last Activity, Replies
- ✅ **Activities tracked** — `lead_activities` table logs created, updated, enriched, emailed, replied, status_changed
- ✅ **Reply detection** — Inngest pipeline classifies replies, updates lead status, pauses sequences
- ✅ **Follow-up dates** — `follow_up_date` + `follow_up_source` columns
- ✅ **Reply drawer** — Shows latest reply with intent classification
- ✅ **Bulk actions** — Bulk move, bulk follow-up, bulk mark as lost
- ⚠️ **Missing:** One-click "Add to Pipeline" from search results with pre-populated context

**Proposed Solution: Search-to-Pipeline Bridge**

The pipeline EXISTS and is sophisticated. The gap is *connecting discovery to pipeline* seamlessly:

1. **Search Results: "Add to Pipeline" Button**
   - Currently: Save lead → goes to Saved Leads table → user must manually move to pipeline
   - New: Two actions per search result:
     - "Save" → Saved Leads (existing)
     - "Add to Pipeline" → Creates pipeline position in `Awareness` stage with:
       - Original search query as `source` tag
       - Intent snapshot pre-computed
       - AI first-touch draft pre-generated
       - Due date auto-set (e.g., +3 days for first outreach)

2. **Auto-Stage Rules (Optional Enhancement):**
   - If intent verdict = "Ready to Buy" → Stage = `Interested` (skip Awareness)
   - If no email and no phone → Stage = `Needs Enrichment` (new sub-stage or tag)
   - If duplicate of existing pipeline lead → Alert + merge option

3. **Pipeline Dashboard Widget:**
   - On search page, show: "You have 12 leads in pipeline from this search query"
   - Quick filter: "Show only pipeline leads" in search results

4. **Attribution Tracking (See Gap 7):**
   - Every pipeline lead stores `discovery_source` metadata:
     - Search query string
     - Platform (Google Maps = Outscraper)
     - Date discovered
   - This enables ROI per search query later

**Why This Works:**
- Uses 100% existing pipeline infra (board, list, activities, Inngest)
- Just adds a button + pre-population logic
- The hard work (pipeline system, reply handling, activity tracking) is DONE
- Gap is UI/UX, not architecture

---

### Gap 5: Reddit WILL ban you (platform risk)

**The Problem:**
GummySearch (135K users) shut down Nov 2025 after Reddit killed their API deal. Building on one platform's scraped data is a single point of failure. Current Reddit-based tools face existential risk.

**Current State:**
- LeadGen App uses **Outscraper Google Maps API** (official commercial API)
- No Reddit dependency whatsoever
- No web scraping of any social platform
- Data source is Google Maps business listings (public business data)
- Enrichment via Outscraper contact API + email verification via ZeroBounce

**Proposed Solution: Source Diversification Roadmap**

LeadGen is ALREADY not at risk for Reddit bans. But we should *communicate this* and add more official APIs:

1. **Immediate: Messaging Update**
   - On homepage/pricing: "Built on official APIs — no scraping, no ban risk"
   - Competitive differentiation: "We don't rely on Reddit. Your data pipeline won't vanish overnight."
   - Blog post: "Why GummySearch Died and What We Learned"

2. **Phase 1: Add Official Platform Feeds (Q2 2026)**
   - **LinkedIn Sales Navigator API** (official, paid) — B2B lead discovery
   - **G2/Capterra API** (official) — Software buyer intent data
   - **Crunchbase API** (official) — Startup/tech company discovery
   - **Yelp Fusion API** (official) — US local business + reviews

3. **Phase 2: Community Monitoring (Q3 2026)**
   - **IndieHackers API** (official, public) — Founder pain points
   - **Hacker News API** (official, free) — Tech community discussions
   - **Product Hunt API** (official) — Early adopter discovery
   - **Reddit API** (official, IF commercial deal is reached — not scraping)

4. **Architecture for Multi-Source:**
   - Abstract search into `SearchProvider` interface:
     ```typescript
     interface SearchProvider {
       name: string;
       search(query: string, location: string, maxResults: number): Promise<RawLead[]>;
       enrich(lead: RawLead): Promise<EnrichmentResult>;
     }
     ```
   - Current: `GoogleMapsProvider` (Outscraper)
   - Future: `LinkedInProvider`, `G2Provider`, `IndieHackersProvider`
   - Frontend: Source selector in search form (dropdown: "Google Maps", "LinkedIn", "G2")

5. **Credit System Adaptation:**
   - Different sources cost different credits (LinkedIn = 2 credits/search)
   - Display source-specific limits in billing dashboard

**Why This Works:**
- We're already safe from Reddit bans
- Diversification builds long-term moat
- Official APIs = sustainable, legal, enterprise-friendly
- Abstract provider architecture = easy to add sources without rewriting core

---

### Gap 6: Still 2-3 hours/day manual engagement

**The Problem:**
Even with tool assistance, founders spend hours manually: drafting individual replies, choosing who to contact, copying context between tools, following up at the right time.

**Current State:**
- ✅ **AI email drafting** — `POST /leads/:id/email` generates personalized subject + body
- ✅ **Sequence automation** — BullMQ-powered email sequences with delays
- ✅ **Bulk actions** — Bulk move, bulk follow-up in pipeline
- ✅ **Reply classification** — AI classifies replies as interested/question/objection/not_now/not_interested
- ✅ **Auto-pause sequences** — On reply, sequence auto-pauses
- ✅ **Follow-up scheduling** — `follow_up_date` auto-set based on reply intent
- ⚠️ **Missing:** True "set it and forget it" smart engagement

**Proposed Solution: Smart Engagement Layer**

Add three automation features that cut manual time from 2-3 hours to 15 minutes:

1. **Auto-Enroll by Intent (Sequence Rules)**
   - User sets rules: "Auto-enroll 'Ready to Buy' leads in 'Immediate Outreach' sequence"
   - System watches pipeline stage + intent verdict
   - When lead hits criteria → auto-enrolled in sequence (with user's approval setting: auto or notify-first)
   - Backend: Inngest function `evaluateSequenceRules` triggered on lead update

2. **Context-Aware Reply Templates**
   - Currently: Generic templates + AI draft
   - New: Reply templates that adapt to *intent* + *stage*:
     - If stage = `contacted` + intent = `evaluating` → "Resource-sharing" template
     - If stage = `replied` + reply intent = `question` → "FAQ answer" template
     - If stage = `interested` + days since last contact > 7 → "Gentle check-in" template
   - AI pre-fills template with lead-specific context (bio, review summary, business details)

3. **Daily Digest + One-Click Actions**
   - Morning email/notification: "5 leads need attention today"
   - Each item: Lead name → One-line context → 3 action buttons:
     - "Send Follow-Up" (pre-drafted, one-click send)
     - "Skip for Now" (snooze 3 days)
     - "Mark as Lost" (with reason picker)
   - All actions processed via Inngest async (no waiting)

4. **Smart Follow-Up Orchestration**
   - Current: Fixed sequence steps (Day 1, Day 3, Day 7)
   - New: Adaptive sequences based on signals:
     - Lead opened email but didn't reply → Send different follow-up vs. no-open
     - Lead's website was updated since last contact → Trigger "Saw you updated your site..." message
     - Competitor activity detected → Urgency bump

**Why This Works:**
- Builds on existing sequences + Inngest + reply classification
- Uses existing LLM pipeline for context-aware personalization
- One-click actions = massive time savings
- Smart rules = platform becomes truly autonomous, not just a database

---

### Gap 7: Firehose of posts with no sense-making framework

**The Problem:**
Users get 50-500 search results and no way to understand *patterns* across them. What's the #1 pain point in this market? What percentage lack websites? Are there seasonal trends? No analytics = no strategy.

**Current State:**
- ✅ **Search results** — Raw list with sortable columns
- ✅ **Saved filters** — Users can save filter combinations
- ✅ **Hot score** — Individual lead scoring
- ✅ **Review insights** — Per-lead AI-extracted pain points (`review_summary.pain_points`)
- ⚠️ **Missing:** Aggregate analytics, pattern detection, market intelligence
- ⚠️ **Missing:** Attribution from discovery → pipeline → revenue

**Proposed Solution: Market Intelligence Dashboard + Attribution Engine**

Build two new capabilities that transform raw data into actionable strategy:

1. **Market Intelligence Dashboard** (`/analytics/market`)

   For any saved search or filter set, show:
   - **Pain Theme Cloud:** Aggregated from review insights (e.g., "slow response" = 23% of businesses, "no online booking" = 31%)
   - **Opportunity Matrix:**
     - X-axis: Problem severity (from review sentiment)
     - Y-axis: Market size (count of businesses with this problem)
     - Bubble size: Average deal value potential
   - **Readiness Distribution:** Pie chart of intent verdicts across the result set
   - **Channel Gaps:** "47% have no website, 62% have no email listed, 89% have no LinkedIn"
   - **Geographic Heatmap:** Map view showing density of high-intent leads

   Implementation:
   - Aggregate `review_summary.pain_points[]` across leads with same search origin
   - Use LLM to cluster themes (standard NLP clustering or semantic grouping)
   - Cache results in `market_intelligence_cache` table (refreshed weekly)

2. **Attribution & ROI Engine** (`/analytics/attribution`)

   Close the loop from discovery to revenue:
   - **Search Query Attribution:**
     - "Search: 'plumbers London' → 45 leads saved → 12 contacted → 3 replied → 1 converted → £5,000 revenue"
     - Per-query ROI: Revenue / (Search Credits + Enrichment Credits + Sequence Credits)
   - **Channel Attribution:**
     - Compare Google Maps vs. future LinkedIn vs. G2 sources
   - **Time-to-Convert Analytics:**
     - Average days from discovery to first contact to conversion
     - Identify bottlenecks (e.g., "Leads in 'Replied' stage sit for avg 9 days")

   Implementation:
   - `discovery_metadata` JSONB on leads (search query, source platform, date)
   - `converted_at` timestamp already exists in schema
   - `deal_value` already exists
   - New Supabase view: `attribution_summary` that joins leads + activities + sequences
   - Frontend: Chart.js or Tremor dashboard components

3. **Trend Detection (Advanced):**
   - Track the same search query over time:
     - "'plumbers London' in Jan: 30% no-website → Mar: 25% no-website → trend: improving"
     - Alert: "Your target market is getting more digital — urgency increasing"
   - Seasonal patterns from review timestamps (if available)

**Why This Works:**
- Uses existing data (reviews, scores, stages, activities)
- Only requires aggregation + visualization — no new data collection
- Creates "stickiness": users return to see market trends, not just manage leads
- Attribution = justify subscription cost with hard ROI numbers

---

## Implementation Priority Matrix

| Gap | Solution | Effort | Impact | Dependencies | Recommended Sprint |
|-----|----------|--------|--------|--------------|-------------------|
| 4 | Search-to-Pipeline Bridge | Low | High | None | Sprint 1 (Next) |
| 2 | Intent Snapshot Cards | Low | High | AI bio + review_summary | Sprint 1 (Next) |
| 3 | Multi-Axis Intent Scoring | Medium | High | Review insights + enrichment | Sprint 2 |
| 7 | Market Intelligence Dashboard | Medium | High | Review aggregation + charts | Sprint 2 |
| 6 | Smart Engagement Layer | Medium | Very High | Sequences + Inngest | Sprint 3 |
| 1 | Market Language Scanner | Medium | Medium | Outscraper + LLM | Sprint 3 |
| 5 | Source Diversification | High | Medium | Provider abstraction | Q3 2026 |
| 7 | Attribution & ROI Engine | Medium | Very High | deal_value + converted_at | Sprint 4 |

---

## Architecture Additions Summary

### New Database Tables
```sql
-- Market Research (Gap 1)
CREATE TABLE market_research (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  input_description TEXT NOT NULL,
  discovered_phrases JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market Intelligence Cache (Gap 7)
CREATE TABLE market_intelligence_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  search_query TEXT NOT NULL,
  pain_themes JSONB DEFAULT '[]',
  readiness_distribution JSONB DEFAULT '{}',
  channel_gaps JSONB DEFAULT '{}',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  refreshed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### New API Routes
```
POST /research/market-language        → Gap 1
GET  /research/:id/phrases            → Gap 1
GET  /leads/:id/intent-profile        → Gap 3 (enhanced scoring)
POST /pipeline/search-to-pipeline     → Gap 4
GET  /analytics/market/:searchId      → Gap 7
GET  /analytics/attribution             → Gap 7
POST /sequences/auto-enroll-rules     → Gap 6
GET  /daily-digest                    → Gap 6
```

### New Frontend Pages
```
/research              → Market Language Scanner (Gap 1)
/analytics/market      → Market Intelligence (Gap 7)
/analytics/attribution → ROI Dashboard (Gap 7)
/daily-digest          → One-click actions (Gap 6)
```

---

## Competitive Positioning

**Current tools:**
- **Apollo, ZoomInfo:** Step 2 (Monitor) only — massive databases, no context, no pipeline
- **GummySearch (dead):** Reddit-only monitoring — platform risk, no engagement tools
- **Reply.io, Outreach:** Step 3 (Engage) only — need imported lists, no discovery
- **HubSpot, Pipedrive:** Step 4 (Convert) only — need leads fed in, no discovery

**LeadGen App becomes:**
> "The only platform that researches how your market talks, discovers the right businesses, scores their real buying intent, engages them with context-aware personalization, and proves ROI — all in one system."

**The moat:** Intent scoring + market language discovery + attribution no one else has.

---

## Next Steps

1. **Review this document** — Flag any gaps that don't match your product vision
2. **Prioritize** — Confirm or reorder the sprint recommendations
3. **Scope Sprint 1** — I can generate detailed PRDs for:
   - Search-to-Pipeline Bridge (Gap 4)
   - Intent Snapshot Cards (Gap 2)
4. **Validate Market Language Scanner** — Quick prototype: run Outscraper + LLM on 3 test queries to see if discovered phrases are genuinely useful

---

*End of Research Document*
