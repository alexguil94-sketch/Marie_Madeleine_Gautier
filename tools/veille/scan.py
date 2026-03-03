#!/usr/bin/env python3
# -*- coding: utf-8 -*-

from __future__ import annotations

import argparse
import json
import os
import re
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Set, Tuple
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MMG-Veille/1.0"

REQUEST_TIMEOUT_S = 25
MAX_LINKS_PER_SOURCE = 1500
LIMIT_ITEMS = 140

STRICT_FILTER = True


BLOCKLIST_SUBSTRINGS = [
    "login",
    "sign-in",
    "signin",
    "sign up",
    "signup",
    "register",
    "account",
    "privacy",
    "cookies",
    "terms",
    "mentions-legales",
    "legal",
    "gdpr",
    "contact",
    "about",
    "faq",
    "help",
    "support",
    "sitemap",
    "newsletter",
    "subscribe",
    "donate",
    "shop",
    "cart",
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "tiktok.com",
    "pinterest.com",
]

OPPORTUNITY_HINTS = [
    "open call",
    "call for",
    "opportunity",
    "opportunities",
    "rfq",
    "rfp",
    "rfc",
    "request for qualifications",
    "request for proposals",
    "commission",
    "public art",
    "artist fee",
    "honorarium",
    "budget",
    "apply",
    "application",
    "deadline",
    "submission",
    "submit",
    "residency",
    "residence",
    "exhibition",
    "symposium",
    "appel",
    "candidature",
    "date limite",
]

BLOCKED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".mp4", ".mov", ".zip", ".pdf"}


MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}

TLD_TO_REGION = {
    ".fr": "France",
    ".uk": "UK",
    ".gb": "UK",
    ".de": "Germany",
    ".nl": "Netherlands",
    ".be": "Belgium",
    ".ch": "Switzerland",
    ".it": "Italy",
    ".es": "Spain",
    ".pt": "Portugal",
    ".ie": "Ireland",
    ".se": "Sweden",
    ".no": "Norway",
    ".dk": "Denmark",
    ".fi": "Finland",
    ".pl": "Poland",
    ".at": "Austria",
    ".cz": "Czechia",
    ".ca": "Canada",
    ".us": "USA",
    ".au": "Australia",
    ".nz": "New Zealand",
}

COUNTRY_WORDS = [
    "france",
    "usa",
    "united states",
    "canada",
    "australia",
    "uk",
    "united kingdom",
    "germany",
    "netherlands",
    "belgium",
    "switzerland",
    "italy",
    "spain",
    "portugal",
    "ireland",
    "europe",
    "international",
    "worldwide",
    "global",
]


@dataclass(frozen=True)
class AutoItem:
    source_url: str
    title: str
    url: str
    matched_keywords: List[str]
    score: int
    country_or_region: str
    deadline: str
    detected_at: str
    context: str
    image_url: str


def load_lines(path: Path) -> List[str]:
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return []
    lines = []
    for line in raw.splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        lines.append(s)
    return lines


def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "")).strip().lower()


def refine_title(title: str, context: str) -> str:
    t = re.sub(r"\s+", " ", (title or "")).strip()
    t = re.sub(r"\s+Report this\?\s*$", "", t, flags=re.IGNORECASE).strip()

    is_generic = (not t) or (t.lower() in ("lien", "link")) or (len(t) < 2)
    is_pager = bool(re.fullmatch(r"[<>«»]+", t)) or bool(re.fullmatch(r"\d{1,3}", t))

    if is_generic or is_pager:
        c = re.sub(r"\s+", " ", (context or "")).strip()
        c = re.split(r"Report this\?", c, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        c = re.split(r"\b(Deadline|Date limite)\b\s*[:：]?", c, maxsplit=1, flags=re.IGNORECASE)[0].strip()
        c = c.strip(" -|•\t")
        if len(c) >= 3:
            t = c

    if not t:
        return "Lien"
    if len(t) > 140:
        return t[:140].rstrip() + "…"
    return t


def safe_domain(url: str) -> str:
    try:
        return urlparse(url).netloc.lower()
    except Exception:
        return ""


def fetch_html(url: str, *, timeout_s: int, user_agent: str) -> str:
    headers = {"User-Agent": user_agent}
    r = requests.get(url, headers=headers, timeout=timeout_s)
    r.raise_for_status()
    return r.text


def extract_links_with_context(source_url: str, html: str, *, max_links: int) -> List[Tuple[str, str, str, str]]:
    soup = BeautifulSoup(html, "html.parser")
    out: List[Tuple[str, str, str, str]] = []

    for a in soup.find_all("a", href=True):
        href = (a.get("href") or "").strip()
        if not href:
            continue

        abs_url = urljoin(source_url, href)
        if abs_url.startswith(("mailto:", "tel:", "javascript:")):
            continue

        title = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).strip()
        if not title:
            title = ((a.get("aria-label") or "") or (a.get("title") or "")).strip()
        if not title:
            img_title = a.find("img")
            title = (img_title.get("alt") or "").strip() if img_title is not None else ""

        parent = a.parent
        context = parent.get_text(" ", strip=True) if parent else title
        context = re.sub(r"\s+", " ", context).strip()
        if len(context) > 520:
            context = context[:520] + "…"

        title = refine_title(title, context)

        # Try to capture a nearby image (optional)
        image_url = ""
        img = a.find("img")
        if img is None and parent is not None:
            img = parent.find("img")
        if img is not None:
            src = (img.get("src") or img.get("data-src") or img.get("data-lazy-src") or "").strip()
            if src:
                image_url = urljoin(source_url, src)

        out.append((abs_url, title, context, image_url))
        if len(out) >= max_links:
            break

    return out


def looks_like_noise(url: str, title: str, context: str) -> bool:
    u = normalize_text(url)
    t = normalize_text(title)
    c = normalize_text(context)

    if url.strip().endswith("#"):
        return True

    parsed = urlparse(url)
    path = parsed.path.lower()
    if any(path.endswith(ext) for ext in BLOCKED_EXTENSIONS):
        return True
    if path.startswith("/report") or "/report/" in path:
        return True

    hay = f"{u} {t} {c}"
    return any(bad in hay for bad in BLOCKLIST_SUBSTRINGS)


def looks_like_opportunity(url: str, title: str, context: str) -> bool:
    hay = normalize_text(f"{url} {title} {context}")
    return any(h in hay for h in OPPORTUNITY_HINTS)


def keyword_matches(keywords: List[str], title: str, url: str, context: str) -> List[str]:
    t = normalize_text(title)
    try:
        p = urlparse(url)
        u = normalize_text(f"{p.path} {p.query} {p.fragment}")
    except Exception:
        u = normalize_text(url)
    c = normalize_text(context)

    matched = []
    for kw in keywords:
        k = normalize_text(kw)
        if k and (k in t or k in u or k in c):
            matched.append(kw)

    seen = set()
    out = []
    for m in matched:
        ml = m.lower()
        if ml not in seen:
            seen.add(ml)
            out.append(m)
    return out


def compute_score(matched: List[str], title: str, url: str, context: str) -> int:
    score = 25 + (len(matched) * 10)
    boost_terms = ["public art", "rfq", "rfp", "commission", "apply", "deadline", "budget", "honorarium"]
    hay = normalize_text(f"{title} {url} {context}")
    score += sum(8 for bt in boost_terms if bt in hay)
    return max(0, min(100, score))


def extract_deadline_iso(text: str) -> str:
    t = normalize_text(text)

    # yyyy-mm-dd
    m = re.search(r"\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b", t)
    if m:
        yyyy = int(m.group(1))
        mm = int(m.group(2))
        dd = int(m.group(3))
        return f"{yyyy:04d}-{mm:02d}-{dd:02d}"

    # dd/mm/yyyy
    m = re.search(r"\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b", t)
    if m:
        dd = int(m.group(1))
        mm = int(m.group(2))
        yyyy = int(m.group(3))
        return f"{yyyy:04d}-{mm:02d}-{dd:02d}"

    # dd month yyyy
    m = re.search(r"\b(0?[1-9]|[12]\d|3[01])\s+([a-zéûîôàç]+)\s+(20\d{2})\b", t, re.IGNORECASE)
    if m:
        dd = int(m.group(1))
        mon = m.group(2).lower()
        yyyy = int(m.group(3))
        if mon in MONTHS:
            mm = MONTHS[mon]
            return f"{yyyy:04d}-{mm:02d}-{dd:02d}"

    # month dd, yyyy
    m = re.search(r"\b([a-zéûîôàç]+)\s+(0?[1-9]|[12]\d|3[01])[, ]+\s*(20\d{2})\b", t, re.IGNORECASE)
    if m:
        mon = m.group(1).lower()
        dd = int(m.group(2))
        yyyy = int(m.group(3))
        if mon in MONTHS:
            mm = MONTHS[mon]
            return f"{yyyy:04d}-{mm:02d}-{dd:02d}"

    return ""


def detect_country_or_region(url: str, context: str) -> str:
    host = safe_domain(url)
    for tld, region in TLD_TO_REGION.items():
        if host.endswith(tld):
            return region

    c = normalize_text(context)
    for w in COUNTRY_WORDS:
        if w in c:
            if w in ("united states", "usa"):
                return "USA"
            if w in ("united kingdom", "uk"):
                return "UK"
            if w in ("international", "worldwide", "global"):
                return "International"
            return w.title()

    return "—"


def scan_sources(
    sources: List[str],
    keywords: List[str],
    *,
    strict_filter: bool,
    max_links_per_source: int,
    limit_items: int,
    timeout_s: int,
    user_agent: str,
) -> List[AutoItem]:
    detected_at = datetime.now().isoformat(timespec="seconds")
    out: List[AutoItem] = []
    seen_urls: Set[str] = set()

    for source_url in sources:
        try:
            html = fetch_html(source_url, timeout_s=timeout_s, user_agent=user_agent)
            links = extract_links_with_context(source_url, html, max_links=max_links_per_source)

            for abs_url, title, context, image_url in links:
                if strict_filter and looks_like_noise(abs_url, title, context):
                    continue
                if strict_filter and not looks_like_opportunity(abs_url, title, context):
                    continue
                if abs_url in seen_urls:
                    continue

                matched = keyword_matches(keywords, title, abs_url, context)
                if not matched:
                    continue

                context_pack = f"{title} {context}"
                deadline = extract_deadline_iso(context_pack)
                country = detect_country_or_region(abs_url, context_pack)
                score = compute_score(matched, title, abs_url, context_pack)

                out.append(
                    AutoItem(
                        source_url=source_url,
                        title=title,
                        url=abs_url,
                        matched_keywords=matched,
                        score=score,
                        country_or_region=country,
                        deadline=deadline,
                        detected_at=detected_at,
                        context=context,
                        image_url=image_url,
                    )
                )
                seen_urls.add(abs_url)

                if limit_items and len(out) >= limit_items:
                    return out

        except Exception as e:
            print(f"[ERR] {source_url} -> {e}")

    return out


def save_results(path: Path, items: List[AutoItem]) -> None:
    payload = {
        "version": 1,
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "items": [asdict(i) for i in items],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_args() -> argparse.Namespace:
    root = Path(__file__).resolve().parents[2]
    default_sources = Path(__file__).resolve().parent / "sources.txt"
    default_keywords = Path(__file__).resolve().parent / "keywords.txt"
    default_out = root / "data" / "veille-auto.json"

    p = argparse.ArgumentParser(description="Scan web sources and generate data/veille-auto.json for the Veille page.")
    p.add_argument("--sources", type=Path, default=default_sources, help="Path to sources.txt")
    p.add_argument("--keywords", type=Path, default=default_keywords, help="Path to keywords.txt")
    p.add_argument("--out", type=Path, default=default_out, help="Output JSON path (served by the website)")
    p.add_argument("--timeout", type=int, default=REQUEST_TIMEOUT_S, help="Request timeout (seconds)")
    p.add_argument("--max-links", type=int, default=MAX_LINKS_PER_SOURCE, help="Max links per source page")
    p.add_argument("--limit-items", type=int, default=LIMIT_ITEMS, help="Hard limit on total items")
    p.add_argument("--user-agent", type=str, default=os.getenv("MMG_VEILLE_UA", DEFAULT_USER_AGENT))
    p.add_argument(
        "--no-strict",
        action="store_true",
        help="Disable the opportunity/noise strict filter (more results, more noise).",
    )
    return p.parse_args()


def main() -> int:
    args = parse_args()
    sources = load_lines(args.sources)
    keywords = load_lines(args.keywords)

    items = scan_sources(
        sources,
        keywords,
        strict_filter=not args.no_strict and STRICT_FILTER,
        max_links_per_source=int(args.max_links),
        limit_items=int(args.limit_items),
        timeout_s=int(args.timeout),
        user_agent=str(args.user_agent),
    )

    save_results(args.out, items)
    print(f"[OK] wrote {args.out} (items: {len(items)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
