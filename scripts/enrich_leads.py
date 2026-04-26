#!/usr/bin/env python3
"""
Free Lead Enrichment Pipeline for LeadGen
Input:  CSV with First Name, Last Name, Email, Company (500 leads max recommended)
Output: Enriched CSV with Priority, ICP Match, Personalization Note, Email Opener
Cost:   $0 (uses DuckDuckGo search + website scraping + Fireworks LLM)

Requirements:
  pip install requests beautifulsoup4 duckduckgo-search python-dotenv

Usage:
  export FIREWORKS_API_KEY=your_key
  python scripts/enrich_leads.py input.csv output.csv --batch 50
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.parse
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

# Optional: duckduckgo-search for free web search
try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

load_dotenv()

# ── Configuration ────────────────────────────────────────────────────────────

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions"
FIREWORKS_MODEL = os.getenv("FIREWORKS_MODEL", "accounts/fireworks/models/minimax-m2p7")

# Delays to avoid rate limits
DELAY_WEB = 1.5          # seconds between website scrapes
DELAY_SEARCH = 2.0       # seconds between DDG searches
DELAY_LLM = 1.0          # seconds between LLM calls

# Output columns
ENRICHED_COLUMNS = [
    "Priority",
    "ICP_Match_Score",
    "Personalization_Note",
    "Email_Opener",
    "Why_Match",
    "Website_Title",
    "Website_Description",
    "Detected_Tech",
    "LinkedIn_URL",
    "Company_Size_Signal",
    "Enrichment_Status",
]

# ── Helpers ─────────────────────────────────────────────────────────────────


def extract_domain(email: str) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.split("@")[-1].strip().lower()


def fetch_website_signals(domain: str) -> dict:
    """Scrape company website for title, meta, and tech stack hints."""
    result = {
        "title": "",
        "description": "",
        "tech": [],
        "status": "not_attempted",
    }
    if not domain or domain in ("gmail.com", "outlook.com", "yahoo.com", "hotmail.com",
                                 "icloud.com", "protonmail.com", "aol.com"):
        result["status"] = "skipped_personal_domain"
        return result

    url = f"https://{domain}"
    try:
        resp = requests.get(url, timeout=12, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        title_tag = soup.find("title")
        result["title"] = title_tag.get_text(strip=True) if title_tag else ""

        meta_desc = soup.find("meta", attrs={"name": "description"})
        if not meta_desc:
            meta_desc = soup.find("meta", attrs={"property": "og:description"})
        result["description"] = meta_desc.get("content", "").strip() if meta_desc else ""

        text_lower = resp.text.lower()
        tech_signals = {
            "WordPress": "wp-content" in text_lower or "wp-includes" in text_lower,
            "Shopify": "myshopify.com" in text_lower or "cdn.shopify.com" in text_lower,
            "Wix": "wix.com" in text_lower or "wixstatic.com" in text_lower,
            "Webflow": "webflow.com" in text_lower or "data-wf-page" in text_lower,
            "Squarespace": "squarespace.com" in text_lower or "static1.squarespace.com" in text_lower,
            "React/Next.js": "__next" in text_lower or "data-nextjs-page" in text_lower,
            "HubSpot": "hs-scripts.com" in text_lower or "hubspot" in text_lower,
            "Framer": "framerusercontent.com" in text_lower,
        }
        result["tech"] = [k for k, v in tech_signals.items() if v]
        result["status"] = "ok"
    except requests.exceptions.RequestException as e:
        result["status"] = f"error:{type(e).__name__}"

    return result


def search_linkedin(first_name: str, last_name: str, company: str) -> Optional[str]:
    """Use DuckDuckGo to find LinkedIn profile URL."""
    if DDGS is None:
        return None
    query = f'"{first_name} {last_name}" {company} linkedin.com/in'
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=3))
            for r in results:
                url = r.get("href", "")
                if "linkedin.com/in/" in url:
                    # Clean tracking params
                    clean = url.split("?")[0]
                    return clean
    except Exception:
        pass
    return None


def search_company_signals(company: str) -> list:
    """Search for recent company signals (hiring, web design, marketing)."""
    if DDGS is None:
        return []
    queries = [
        f'"{company}" hiring web designer OR SEO OR marketing',
        f'"{company}" freelance OR agency OR portfolio',
    ]
    signals = []
    for q in queries:
        try:
            with DDGS() as ddgs:
                results = list(ddgs.text(q, max_results=2))
                for r in results:
                    signals.append(f"{r.get('title','')}: {r.get('body','')}")
        except Exception:
            continue
    return signals[:4]  # cap at 4 snippets


def call_llm_enrichment(lead_data: dict) -> dict:
    """Call Fireworks LLM to score and personalize."""
    if not FIREWORKS_API_KEY:
        print("WARNING: FIREWORKS_API_KEY not set. Skipping LLM enrichment.")
        return {
            "Priority": "3",
            "ICP_Match_Score": "0",
            "Personalization_Note": "",
            "Email_Opener": "",
            "Why_Match": "",
            "Company_Size_Signal": "",
            "Enrichment_Status": "missing_api_key",
        }

    system_prompt = (
        "You are a lead generation analyst. Analyze the lead data and return ONLY a valid JSON object. "
        "No markdown, no explanation, no code fences, no thinking aloud. "
        "Your entire response must be valid parseable JSON starting with { and ending with }."
    )

    user_prompt = f"""Analyze this lead for a web design / SEO / marketing agency ICP.

Lead Data:
- Name: {lead_data.get('first_name','')} {lead_data.get('last_name','')}
- Email: {lead_data.get('email','')}
- Company: {lead_data.get('company','')}
- Website Title: {lead_data.get('website_title','')}
- Website Description: {lead_data.get('website_description','')}
- Detected Tech: {', '.join(lead_data.get('detected_tech', []))}
- LinkedIn URL: {lead_data.get('linkedin_url','')}
- Web Search Signals: {' | '.join(lead_data.get('search_signals', []))}

Scoring Rules:
- Priority 1 = Freelancer/small agency (<10 people), personal email domain, website mentions web design/SEO/marketing, WordPress/Webflow/Shopify stack, recent hiring signals
- Priority 2 = Small business (10-50 people), custom domain, generic title, some tech match
- Priority 3 = Enterprise feel, no website, big tech stack (Sitecore/Adobe), no signals
- ICP Match Score = 0-100. 80+ means very strong fit.

Return EXACTLY this JSON structure with no extra text:
{{
  "Priority": "1|2|3",
  "ICP_Match_Score": "0-100",
  "Personalization_Note": "One sentence referencing something specific from their profile/site for a cold call or email",
  "Email_Opener": "2-sentence personalized cold email opener. Mention one specific thing. No generic flattery.",
  "Why_Match": "Brief reason they fit the ICP",
  "Company_Size_Signal": "freelancer|small_business|mid_size|enterprise|unknown"
}}"""

    try:
        resp = requests.post(
            FIREWORKS_ENDPOINT,
            headers={
                "Authorization": f"Bearer {FIREWORKS_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": FIREWORKS_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 800,
            },
            timeout=45,
        )
        resp.raise_for_status()
        data = resp.json()
        content = data["choices"][0]["message"]["content"]

        # Extract JSON from possible markdown fences or thinking text
        json_match = re.search(r"\{.*\}", content, re.DOTALL)
        if json_match:
            content = json_match.group(0)
        parsed = json.loads(content)

        # Normalize keys
        return {
            "Priority": parsed.get("Priority", "3"),
            "ICP_Match_Score": str(parsed.get("ICP_Match_Score", "0")),
            "Personalization_Note": parsed.get("Personalization_Note", ""),
            "Email_Opener": parsed.get("Email_Opener", ""),
            "Why_Match": parsed.get("Why_Match", ""),
            "Company_Size_Signal": parsed.get("Company_Size_Signal", "unknown"),
            "Enrichment_Status": "enriched",
        }
    except json.JSONDecodeError:
        return {
            "Priority": "3", "ICP_Match_Score": "0",
            "Personalization_Note": "", "Email_Opener": "",
            "Why_Match": "", "Company_Size_Signal": "unknown",
            "Enrichment_Status": "llm_json_parse_error",
        }
    except Exception as e:
        return {
            "Priority": "3", "ICP_Match_Score": "0",
            "Personalization_Note": "", "Email_Opener": "",
            "Why_Match": "", "Company_Size_Signal": "unknown",
            "Enrichment_Status": f"llm_error:{type(e).__name__}",
        }


# ── Main Pipeline ───────────────────────────────────────────────────────────


def process_batch(rows: list[dict], start_idx: int, total: int) -> list[dict]:
    enriched = []
    for i, row in enumerate(rows):
        idx = start_idx + i
        name = f"{row.get('First Name','')} {row.get('Last Name','')}".strip()
        print(f"[{idx+1}/{total}] Enriching: {name}")

        email = row.get("Email", "").strip()
        company = row.get("Company", "").strip()
        domain = extract_domain(email)

        # 1. Website signals
        print(f"  -> Scraping website: {domain or 'N/A'}")
        web = fetch_website_signals(domain) if domain else {"status": "no_domain"}
        time.sleep(DELAY_WEB)

        # 2. LinkedIn search
        print(f"  -> Searching LinkedIn...")
        linkedin = search_linkedin(
            row.get("First Name", ""),
            row.get("Last Name", ""),
            company,
        )
        time.sleep(DELAY_SEARCH)

        # 3. Company signals
        print(f"  -> Searching company signals...")
        signals = search_company_signals(company) if company else []
        time.sleep(DELAY_SEARCH)

        # 4. LLM enrichment
        lead_data = {
            "first_name": row.get("First Name", ""),
            "last_name": row.get("Last Name", ""),
            "email": email,
            "company": company,
            "website_title": web["title"],
            "website_description": web["description"],
            "detected_tech": web["tech"],
            "linkedin_url": linkedin or "",
            "search_signals": signals,
        }
        print(f"  -> Calling LLM...")
        llm_result = call_llm_enrichment(lead_data)
        time.sleep(DELAY_LLM)

        # Merge
        enriched_row = {
            **row,
            "Priority": llm_result["Priority"],
            "ICP_Match_Score": llm_result["ICP_Match_Score"],
            "Personalization_Note": llm_result["Personalization_Note"],
            "Email_Opener": llm_result["Email_Opener"],
            "Why_Match": llm_result["Why_Match"],
            "Website_Title": web["title"],
            "Website_Description": web["description"],
            "Detected_Tech": ", ".join(web["tech"]),
            "LinkedIn_URL": linkedin or "",
            "Company_Size_Signal": llm_result["Company_Size_Signal"],
            "Enrichment_Status": llm_result["Enrichment_Status"],
        }
        enriched.append(enriched_row)

        print(f"  -> Done. Priority={llm_result['Priority']} Score={llm_result['ICP_Match_Score']}")
        print()

    return enriched


def main():
    parser = argparse.ArgumentParser(description="Free lead enrichment pipeline")
    parser.add_argument("input", help="Input CSV path")
    parser.add_argument("output", help="Output CSV path")
    parser.add_argument("--batch", type=int, default=500, help="Max leads to process")
    parser.add_argument("--resume", action="store_true", help="Resume from partial output")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"ERROR: Input file not found: {input_path}")
        sys.exit(1)

    # Read input
    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    if not all_rows:
        print("ERROR: Input CSV is empty.")
        sys.exit(1)

    # Check required columns
    first = all_rows[0]
    required = {"First Name", "Last Name", "Email", "Company"}
    lower_to_actual = {k.lower(): k for k in first.keys()}
    col_map = {}
    for req in required:
        if req.lower() in lower_to_actual:
            col_map[req] = lower_to_actual[req.lower()]

    if len(col_map) == len(required):
        for row in all_rows:
            for standard, actual in col_map.items():
                if actual != standard and actual in row:
                    row[standard] = row.pop(actual)
        first = all_rows[0]
        missing = set()
    else:
        missing = required - set(col_map.keys())

    if missing:
        print(f"ERROR: Input CSV missing required columns: {missing}")
        print(f"Found columns: {list(first.keys())}")
        sys.exit(1)

    rows = all_rows[:args.batch]
    total = len(rows)
    print(f"Processing {total} leads from {input_path}")
    print(f"Output will be written to {output_path}")
    print()

    # Resume logic
    processed_emails = set()
    if args.resume and output_path.exists():
        with open(output_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                processed_emails.add(r.get("Email", "").strip().lower())
        print(f"Resuming: {len(processed_emails)} leads already enriched.")
        rows = [r for r in rows if r.get("Email", "").strip().lower() not in processed_emails]
        print(f"Remaining to process: {len(rows)}")
        print()

    if not rows:
        print("Nothing to process.")
        sys.exit(0)

    # Determine fieldnames
    fieldnames = list(first.keys()) + ENRICHED_COLUMNS

    # Write headers if new file
    write_mode = "a" if args.resume and output_path.exists() else "w"
    with open(output_path, write_mode, encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_mode == "w":
            writer.writeheader()

        # Process in chunks
        enriched = process_batch(rows, 0, len(rows))
        for r in enriched:
            writer.writerow(r)

    print(f"\nDone. Enriched {len(enriched)} leads -> {output_path}")

    # Summary
    p1 = sum(1 for r in enriched if r.get("Priority") == "1")
    p2 = sum(1 for r in enriched if r.get("Priority") == "2")
    p3 = sum(1 for r in enriched if r.get("Priority") == "3")
    print(f"Priority breakdown: 1={p1} | 2={p2} | 3={p3}")


if __name__ == "__main__":
    main()
