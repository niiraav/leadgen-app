#!/usr/bin/env python3
"""
Lead Enrichment Pipeline v2 — Deep social + contact enrichment
Input:  CSV with First Name, Last Name, Email, Company
Output: Enriched CSV with social URLs, phone, domain age, LinkedIn bio, scoring
Cost:   $0 (DuckDuckGo + website scraping + Fireworks LLM)

Requirements:
  pip install requests beautifulsoup4 duckduckgo-search python-dotenv python-whois dnspython

Usage:
  export FIREWORKS_API_KEY=***
  python scripts/enrich_leads_v2.py input.csv output.csv --batch 50
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import socket
import urllib.parse
from pathlib import Path
from typing import Optional

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

try:
    import whois
except ImportError:
    whois = None

try:
    import dns.resolver
except ImportError:
    dns = None

try:
    from duckduckgo_search import DDGS
except ImportError:
    DDGS = None

load_dotenv()

# ── Config ──────────────────────────────────────────────────────────────────

FIREWORKS_API_KEY = os.getenv("FIREWORKS_API_KEY")
FIREWORKS_ENDPOINT = "https://api.fireworks.ai/inference/v1/chat/completions"
FIREWORKS_MODEL = os.getenv("FIREWORKS_MODEL", "accounts/fireworks/models/minimax-m2p7")

DELAY_WEB = 1.5
DELAY_SEARCH = 2.0
DELAY_LLM = 1.0

ENRICHED_COLUMNS = [
    "Priority",
    "ICP_Match_Score",
    "Personalization_Note",
    "Email_Opener",
    "Why_Match",
    "Company_Size_Signal",
    "Enrichment_Status",
    "Website_Title",
    "Website_Description",
    "Detected_Tech",
    "Website_Social_LinkedIn",
    "Website_Social_Twitter",
    "Website_Social_Instagram",
    "Website_Phone",
    "LinkedIn_URL",
    "LinkedIn_Headline",
    "LinkedIn_Bio_Snippet",
    "Twitter_URL",
    "Instagram_URL",
    "Phone_Found",
    "Domain_Age_Years",
    "MX_Provider",
    "Email_Prefix_Role",
    "Is_Personal_Email",
    "Search_Signals",
]

PERSONAL_DOMAINS = {
    "gmail.com","outlook.com","yahoo.com","hotmail.com","icloud.com",
    "protonmail.com","aol.com","live.com","msn.com","me.com","ymail.com",
    "fastmail.com","zoho.com","gmx.com","mail.com","hey.com"
}

# ── Helpers ─────────────────────────────────────────────────────────────────


def extract_domain(email: str) -> Optional[str]:
    if not email or "@" not in email:
        return None
    return email.split("@")[-1].strip().lower()


def infer_role_from_prefix(email: str) -> str:
    prefix = email.split("@")[0].lower() if "@" in email else ""
    role_map = {
        "sales": "Sales", "marketing": "Marketing", "support": "Support",
        "info": "General", "hello": "General", "contact": "General",
        "admin": "Admin", "office": "Admin", "accounts": "Finance",
        "billing": "Finance", "finance": "Finance", "hr": "HR",
        "jobs": "HR", "careers": "HR", "enquiries": "General",
        "enquiry": "General", "help": "Support", "service": "Support",
        "bookings": "Operations", "orders": "Operations",
        "shop": "Ecommerce", "store": "Ecommerce", "team": "General",
        "studio": "Creative", "design": "Creative", "dev": "Tech",
        "web": "Tech", "tech": "Tech", "it": "Tech", "media": "Creative",
        "press": "PR", "pr": "PR", "founder": "Founder", "ceo": "CEO",
        "director": "Director", "manager": "Manager", "owner": "Owner",
        "coordinator": "Coordinator", "assistant": "Assistant",
    }
    for k, v in role_map.items():
        if k in prefix:
            return v
    if "." in prefix or "_" in prefix or "-" in prefix:
        return "Person"  # first.last pattern
    return "Unknown"


def fetch_website_deep(domain: str) -> dict:
    """Scrape homepage + contact page for title, meta, tech, socials, phone."""
    result = {
        "title": "", "description": "", "tech": [],
        "social_linkedin": "", "social_twitter": "", "social_instagram": "",
        "phone": "", "status": "not_attempted",
    }
    if not domain or domain in PERSONAL_DOMAINS:
        result["status"] = "skipped_personal_domain"
        return result

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

    # 1. Homepage
    try:
        resp = requests.get(f"https://{domain}", timeout=12, headers=headers)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        title = soup.find("title")
        result["title"] = title.get_text(strip=True) if title else ""

        meta = soup.find("meta", attrs={"name": "description"})
        if not meta:
            meta = soup.find("meta", attrs={"property": "og:description"})
        result["description"] = meta.get("content", "").strip() if meta else ""

        # Social links in page
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "linkedin.com/" in href and not href.endswith("linkedin.com/"):
                result["social_linkedin"] = href.split("?")[0]
            if "twitter.com/" in href or "x.com/" in href:
                result["social_twitter"] = href.split("?")[0]
            if "instagram.com/" in href:
                result["social_instagram"] = href.split("?")[0]
            if href.startswith("tel:"):
                result["phone"] = href.replace("tel:", "").strip()

        # Tech detection
        txt = resp.text.lower()
        tech = {
            "WordPress": "wp-content" in txt or "wp-includes" in txt,
            "Shopify": "myshopify.com" in txt or "cdn.shopify.com" in txt,
            "Wix": "wix.com" in txt or "wixstatic.com" in txt,
            "Webflow": "webflow.com" in txt or "data-wf-page" in txt,
            "Squarespace": "squarespace.com" in txt or "static1.squarespace.com" in txt,
            "React/Next.js": "__next" in txt or "data-nextjs-page" in txt,
            "HubSpot": "hs-scripts.com" in txt or "hubspot" in txt,
            "Framer": "framerusercontent.com" in txt,
            "WordPress": "wordpress" in txt or "wp-json" in txt,
            "Joomla": "joomla" in txt,
            "Drupal": "drupal" in txt,
            "Magento": "magento" in txt,
            "BigCommerce": "bigcommerce" in txt,
            "WooCommerce": "woocommerce" in txt,
        }
        result["tech"] = [k for k, v in tech.items() if v]
        result["status"] = "ok"
    except Exception as e:
        result["status"] = f"error:{type(e).__name__}"
        return result

    # 2. Contact page (common paths)
    contact_paths = ["/contact", "/contact-us", "/about", "/about-us", "/team"]
    for path in contact_paths:
        if result["phone"]:
            break
        try:
            cr = requests.get(f"https://{domain}{path}", timeout=8, headers=headers)
            if cr.status_code == 200:
                csoup = BeautifulSoup(cr.text, "html.parser")
                # Look for tel: links
                for a in csoup.find_all("a", href=True):
                    if a["href"].startswith("tel:"):
                        result["phone"] = a["href"].replace("tel:", "").strip()
                        break
                # Regex phone hunt if no tel: found
                if not result["phone"]:
                    text = csoup.get_text()
                    # UK phone pattern
                    uk = re.search(r'\+?44[\s\d\-\(\)]{7,20}', text)
                    if uk:
                        result["phone"] = uk.group(0).strip()
                        break
                    # Generic international
                    gen = re.search(r'\+\d[\s\d\-\(\)\.]{6,18}', text)
                    if gen:
                        result["phone"] = gen.group(0).strip()
                        break
        except Exception:
            continue

    return result


def get_domain_age(domain: str) -> str:
    if not domain or not whois:
        return ""
    try:
        w = whois.whois(domain)
        creation = w.creation_date
        if isinstance(creation, list):
            creation = creation[0]
        if creation:
            from datetime import datetime
            age = (datetime.now() - creation).days / 365.25
            return f"{age:.1f}"
    except Exception:
        pass
    return ""


def get_mx_provider(domain: str) -> str:
    if not domain or not dns:
        return ""
    try:
        answers = dns.resolver.resolve(domain, "MX")
        mx = str(answers[0].exchange).lower()
        providers = {
            "google": "Google Workspace", "googlemail": "Google Workspace",
            "outlook": "Microsoft 365", "hotmail": "Microsoft 365",
            "zoho": "Zoho Mail", "protonmail": "ProtonMail",
            "fastmail": "Fastmail", "mailgun": "Mailgun",
            "sendgrid": "SendGrid", "amazonses": "Amazon SES",
            "mxroute": "MXRoute", "namecheap": "Namecheap",
            "dreamhost": "DreamHost", "bluehost": "BlueHost",
            "siteground": "SiteGround", "one.com": "One.com",
        }
        for k, v in providers.items():
            if k in mx:
                return v
        return mx.split(".")[0] if "." in mx else mx
    except Exception:
        return ""


def ddgs_search(query: str, max_results: int = 3) -> list:
    if not DDGS:
        return []
    try:
        with DDGS() as ddgs:
            return list(ddgs.text(query, max_results=max_results))
    except Exception:
        return []


def search_social_url(first_name: str, last_name: str, company: str, platform: str) -> Optional[str]:
    """Find Instagram or Twitter URL for a person."""
    name = f"{first_name} {last_name}".strip()
    if platform == "instagram":
        queries = [
            f'"{name}" instagram.com',
            f'"{name}" {company} instagram',
            f'{name.replace(" ", "")} instagram',
        ]
        for q in queries:
            for r in ddgs_search(q, max_results=3):
                url = r.get("href", "")
                if "instagram.com/" in url:
                    clean = url.split("?")[0].rstrip("/")
                    if not clean.endswith("instagram.com/"):
                        return clean
            time.sleep(1)
    elif platform == "twitter":
        queries = [
            f'"{name}" twitter.com OR x.com',
            f'"{name}" {company} twitter',
            f'{name.replace(" ", "")} twitter',
        ]
        for q in queries:
            for r in ddgs_search(q, max_results=3):
                url = r.get("href", "")
                for prefix in ["twitter.com/", "x.com/"]:
                    if prefix in url:
                        clean = url.split("?")[0].rstrip("/")
                        if not clean.endswith(prefix):
                            return clean
            time.sleep(1)
    return None


def search_linkedin_url(first_name: str, last_name: str, company: str) -> Optional[str]:
    name = f"{first_name} {last_name}".strip()
    queries = [
        f'"{name}" {company} linkedin.com/in',
        f'"{name}" linkedin.com/in',
    ]
    for q in queries:
        for r in ddgs_search(q, max_results=3):
            url = r.get("href", "")
            if "linkedin.com/in/" in url:
                return url.split("?")[0].rstrip("/")
        time.sleep(1)
    return None


def scrape_linkedin_public(url: str) -> dict:
    """Scrape public LinkedIn profile for headline and bio snippet."""
    result = {"headline": "", "bio": "", "status": "not_attempted"}
    if not url:
        result["status"] = "no_url"
        return result
    try:
        resp = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        # Try common meta tags
        title = soup.find("title")
        if title:
            text = title.get_text(strip=True)
            # LinkedIn titles are often "Name | LinkedIn"
            parts = text.split("|")
            if len(parts) > 1 and "linkedin" in parts[-1].lower():
                result["headline"] = parts[0].strip()

        # Meta description often contains headline + company
        meta = soup.find("meta", attrs={"name": "description"})
        if meta:
            desc = meta.get("content", "")
            result["bio"] = desc[:300]

        # Try og:description
        og = soup.find("meta", attrs={"property": "og:description"})
        if og and not result["bio"]:
            result["bio"] = og.get("content", "")[:300]

        result["status"] = "ok"
    except Exception as e:
        result["status"] = f"error:{type(e).__name__}"
    return result


def search_company_signals(company: str) -> list:
    if not company:
        return []
    queries = [
        f'"{company}" hiring web designer OR SEO OR marketing',
        f'"{company}" freelance OR agency OR portfolio OR rebrand',
        f'"{company}" new website OR website redesign',
    ]
    signals = []
    for q in queries:
        for r in ddgs_search(q, max_results=2):
            signals.append(f"{r.get('title','')}: {r.get('body','')}")
        time.sleep(1)
    return signals[:6]


def call_llm_enrichment(lead_data: dict) -> dict:
    if not FIREWORKS_API_KEY:
        return {
            "Priority": "3", "ICP_Match_Score": "0",
            "Personalization_Note": "", "Email_Opener": "",
            "Why_Match": "", "Company_Size_Signal": "",
            "Enrichment_Status": "missing_api_key",
        }

    system = (
        "You are a lead generation analyst. Return ONLY valid JSON. "
        "No markdown, no explanation, no thinking aloud. "
        "Your entire response must be valid parseable JSON starting with { and ending with }."
    )

    user = f"""Analyze this lead for a web design / SEO / marketing agency ICP.

Lead:
- Name: {lead_data.get('first_name','')} {lead_data.get('last_name','')}
- Email: {lead_data.get('email','')}
- Company: {lead_data.get('company','')}
- Personal email? {lead_data.get('is_personal','No')}
- Email role signal: {lead_data.get('email_role','Unknown')}
- Website Title: {lead_data.get('website_title','')}
- Website Description: {lead_data.get('website_description','')}
- Detected Tech: {', '.join(lead_data.get('detected_tech', []))}
- LinkedIn Headline: {lead_data.get('linkedin_headline','')}
- LinkedIn Bio: {lead_data.get('linkedin_bio','')}
- Instagram: {lead_data.get('instagram_url','')}
- Twitter: {lead_data.get('twitter_url','')}
- Phone Found: {lead_data.get('phone_found','')}
- Domain Age: {lead_data.get('domain_age','')} years
- MX Provider: {lead_data.get('mx_provider','')}
- Web Signals: {' | '.join(lead_data.get('search_signals', []))}

Scoring Rules:
- Priority 1 = Freelancer/small agency (<10), personal email, website mentions web/SEO/marketing, modern stack (WordPress/Webflow/Shopify/Framer), founder/owner email prefix, <3 year domain
- Priority 2 = Small business (10-50), custom domain, some tech match, generic role
- Priority 3 = Enterprise, gov, no website, legacy stack, role-based email at big org
- ICP Score 0-100, 80+ = very strong

Return EXACTLY:
{{
  "Priority": "1|2|3",
  "ICP_Match_Score": "0-100",
  "Personalization_Note": "One specific sentence for cold outreach referencing a real detail",
  "Email_Opener": "2-sentence cold email opener. No generic flattery. Ask one question.",
  "Why_Match": "Brief reason they fit or don't fit the ICP",
  "Company_Size_Signal": "freelancer|small_business|mid_size|enterprise|unknown"
}}"""

    try:
        resp = requests.post(
            FIREWORKS_ENDPOINT,
            headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": FIREWORKS_MODEL,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "temperature": 0.2, "max_tokens": 800,
            },
            timeout=45,
        )
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]

        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            content = m.group(0)
        parsed = json.loads(content)

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


# ── Main ─────────────────────────────────────────────────────────────────────


def process_batch(rows: list[dict], start_idx: int, total: int) -> list[dict]:
    enriched = []
    for i, row in enumerate(rows):
        idx = start_idx + i
        name = f"{row.get('First Name','')} {row.get('Last Name','')}".strip()
        print(f"\n[{idx+1}/{total}] {name}")

        email = row.get("Email", "").strip()
        company = row.get("Company", "").strip()
        domain = extract_domain(email)
        is_personal = domain in PERSONAL_DOMAINS if domain else False
        email_role = infer_role_from_prefix(email)

        # 1. Deep website scrape
        print(f"  -> Website scrape: {domain or 'N/A'}")
        web = fetch_website_deep(domain) if domain else {"status": "no_domain"}
        time.sleep(DELAY_WEB)

        # 2. Domain metadata
        print(f"  -> Domain age + MX...")
        domain_age = get_domain_age(domain) if domain else ""
        mx_provider = get_mx_provider(domain) if domain else ""
        time.sleep(0.5)

        # 3. LinkedIn
        print(f"  -> LinkedIn search...")
        linkedin_url = search_linkedin_url(
            row.get("First Name", ""), row.get("Last Name", ""), company
        )
        time.sleep(DELAY_SEARCH)

        # 4. LinkedIn scrape
        linkedin_data = {"headline": "", "bio": "", "status": "skipped"}
        if linkedin_url:
            print(f"  -> LinkedIn scrape: {linkedin_url}")
            linkedin_data = scrape_linkedin_public(linkedin_url)
            time.sleep(DELAY_WEB)

        # 5. Instagram
        print(f"  -> Instagram search...")
        instagram_url = search_social_url(
            row.get("First Name", ""), row.get("Last Name", ""), company, "instagram"
        )
        time.sleep(DELAY_SEARCH)

        # 6. Twitter
        print(f"  -> Twitter search...")
        twitter_url = search_social_url(
            row.get("First Name", ""), row.get("Last Name", ""), company, "twitter"
        )
        time.sleep(DELAY_SEARCH)

        # 7. Company signals
        print(f"  -> Company signals...")
        signals = search_company_signals(company)

        # 8. LLM enrichment
        lead_data = {
            "first_name": row.get("First Name", ""),
            "last_name": row.get("Last Name", ""),
            "email": email,
            "company": company,
            "is_personal": "Yes" if is_personal else "No",
            "email_role": email_role,
            "website_title": web["title"],
            "website_description": web["description"],
            "detected_tech": web["tech"],
            "linkedin_headline": linkedin_data["headline"],
            "linkedin_bio": linkedin_data["bio"],
            "instagram_url": instagram_url or web["social_instagram"] or "",
            "twitter_url": twitter_url or web["social_twitter"] or "",
            "phone_found": web["phone"],
            "domain_age": domain_age,
            "mx_provider": mx_provider,
            "search_signals": signals,
        }
        print(f"  -> LLM scoring...")
        llm = call_llm_enrichment(lead_data)
        time.sleep(DELAY_LLM)

        enriched_row = {
            **row,
            "Priority": llm["Priority"],
            "ICP_Match_Score": llm["ICP_Match_Score"],
            "Personalization_Note": llm["Personalization_Note"],
            "Email_Opener": llm["Email_Opener"],
            "Why_Match": llm["Why_Match"],
            "Company_Size_Signal": llm["Company_Size_Signal"],
            "Enrichment_Status": llm["Enrichment_Status"],
            "Website_Title": web["title"],
            "Website_Description": web["description"],
            "Detected_Tech": ", ".join(web["tech"]),
            "Website_Social_LinkedIn": web["social_linkedin"],
            "Website_Social_Twitter": web["social_twitter"],
            "Website_Social_Instagram": web["social_instagram"],
            "Website_Phone": web["phone"],
            "LinkedIn_URL": linkedin_url or "",
            "LinkedIn_Headline": linkedin_data["headline"],
            "LinkedIn_Bio_Snippet": linkedin_data["bio"],
            "Twitter_URL": twitter_url or web["social_twitter"] or "",
            "Instagram_URL": instagram_url or web["social_instagram"] or "",
            "Phone_Found": web["phone"],
            "Domain_Age_Years": domain_age,
            "MX_Provider": mx_provider,
            "Email_Prefix_Role": email_role,
            "Is_Personal_Email": "Yes" if is_personal else "No",
            "Search_Signals": " | ".join(signals),
        }
        enriched.append(enriched_row)
        print(f"  -> Priority={llm['Priority']} Score={llm['ICP_Match_Score']} Status={llm['Enrichment_Status']}")

    return enriched


def main():
    parser = argparse.ArgumentParser(description="Deep lead enrichment v2")
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

    with open(input_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        all_rows = list(reader)

    if not all_rows:
        print("ERROR: Input CSV is empty.")
        sys.exit(1)

    # Column normalization
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
        print(f"ERROR: Missing required columns: {missing}")
        print(f"Found: {list(first.keys())}")
        sys.exit(1)

    rows = all_rows[:args.batch]
    total = len(rows)
    print(f"Processing {total} leads from {input_path}")
    print(f"Output -> {output_path}")
    print()

    # Resume logic
    processed_emails = set()
    if args.resume and output_path.exists():
        with open(output_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                processed_emails.add(r.get("Email", "").strip().lower())
        rows = [r for r in rows if r.get("Email", "").strip().lower() not in processed_emails]
        print(f"Resuming: {len(processed_emails)} done, {len(rows)} remaining")

    if not rows:
        print("Nothing to process.")
        sys.exit(0)

    fieldnames = list(first.keys()) + ENRICHED_COLUMNS
    write_mode = "a" if args.resume and output_path.exists() else "w"

    with open(output_path, write_mode, encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if write_mode == "w":
            writer.writeheader()
        enriched = process_batch(rows, 0, len(rows))
        for r in enriched:
            writer.writerow(r)

    print(f"\nDone. Enriched {len(enriched)} leads -> {output_path}")
    p1 = sum(1 for r in enriched if r.get("Priority") == "1")
    p2 = sum(1 for r in enriched if r.get("Priority") == "2")
    p3 = sum(1 for r in enriched if r.get("Priority") == "3")
    print(f"Priority breakdown: 1={p1} | 2={p2} | 3={p3}")


if __name__ == "__main__":
    main()
