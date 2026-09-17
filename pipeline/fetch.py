#!/usr/bin/env python3
"""Build data/apps.json from Apple's public App Store APIs only.

Sources (all free, public, no auth, no scraping of any third-party
compiled dataset):
  - RSS top-charts feed: https://itunes.apple.com/{cc}/rss/topfreeapplications/...
  - Lookup API: https://itunes.apple.com/lookup?id=...
  - Per-app screenshotUrls returned by the Lookup API (each developer's own
    public App Store listing images, served by Apple).

Revenue is never scraped; it is a transparent, documented estimate derived
from chart rank + category, so it is always labeled "estimated".
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "site"
ASSETS_DIR = SITE_DIR / "assets"
STORE = "us"
CHART_LIMIT = 200
SCREENSHOTS_PER_APP = 4
USER_AGENT = "open-app-catalog/0.1 (+https://github.com/PatchworkMD/open-app-catalog)"

# genre id -> (label, rough monthly-ARPU-per-rank-1 estimate in USD, used only
# as a documented, adjustable heuristic; see README "Revenue estimate" section)
GENRES = {
    "6005": ("Social Networking", 900000),
    "6012": ("Lifestyle", 400000),
    "6013": ("Health & Fitness", 500000),
    "6017": ("Education", 350000),
    "6007": ("Productivity", 450000),
    "6008": ("Photo & Video", 400000),
    "6016": ("Entertainment", 350000),
    "6002": ("Utilities", 300000),
}


def http_json(url: str, retries: int = 3) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def http_bytes(url: str, retries: int = 3) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def fetch_chart_ids(genre_id: str) -> list[str]:
    url = (
        f"https://itunes.apple.com/{STORE}/rss/topfreeapplications/"
        f"limit={CHART_LIMIT}/genre={genre_id}/json"
    )
    payload = http_json(url)
    entries = payload.get("feed", {}).get("entry", [])
    ids = []
    for entry in entries:
        app_id = entry.get("id", {}).get("attributes", {}).get("im:id")
        if app_id:
            ids.append(app_id)
    return ids


def lookup_apps(app_ids: list[str]) -> list[dict]:
    results = []
    for i in range(0, len(app_ids), 150):
        chunk = app_ids[i : i + 150]
        url = f"https://itunes.apple.com/lookup?id={','.join(chunk)}&country={STORE}"
        payload = http_json(url)
        results.extend(payload.get("results", []))
        time.sleep(1)
    return results


def estimate_revenue(rank: int, genre_label: str) -> str:
    base = next((v for label, v in GENRES.values() if label == genre_label), 200000)
    # simple documented decay curve: rank 1 = base, halves every 5 ranks
    estimate = base / (2 ** ((rank - 1) / 5))
    if estimate >= 1000:
        return f"~${estimate / 1000:.0f}K/mo (estimated)"
    return f"~${estimate:.0f}/mo (estimated)"


def save_image(url: str) -> dict | None:
    try:
        raw = http_bytes(url)
    except Exception as exc:  # noqa: BLE001 - keep pipeline running on single failures
        print(f"  image failed: {url}: {exc}", file=sys.stderr)
        return None
    digest = hashlib.sha256(raw).hexdigest()
    ext = "jpg" if url.lower().endswith((".jpg", ".jpeg")) else "png"
    path = ASSETS_DIR / f"{digest}.{ext}"
    if not path.exists():
        path.write_bytes(raw)
    return {"id": digest, "kind": "image", "path": f"assets/{digest}.{ext}"}


save_screenshot = save_image


def build() -> dict:
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    apps: list[dict] = []
    screens: list[dict] = []
    seen_ids: set[str] = set()

    for genre_id, (label, _arpu) in GENRES.items():
        print(f"charts: {label}")
        chart_ids = [i for i in fetch_chart_ids(genre_id) if i not in seen_ids]
        seen_ids.update(chart_ids)
        if not chart_ids:
            continue
        details = lookup_apps(chart_ids)
        rank_by_id = {app_id: rank + 1 for rank, app_id in enumerate(chart_ids)}
        for d in details:
            app_id = str(d.get("trackId", ""))
            if not app_id:
                continue
            rank = rank_by_id.get(app_id, CHART_LIMIT)
            asset_ids = []
            for shot_url in (d.get("screenshotUrls") or [])[:SCREENSHOTS_PER_APP]:
                saved = save_screenshot(shot_url)
                if not saved:
                    continue
                asset_ids.append(saved["id"])
                screens.append(
                    {
                        "id": saved["id"],
                        "title": d.get("trackName", "Screen reference"),
                        "category": label,
                        "kind": "image",
                        "path": saved["path"],
                        "sourceUrl": d.get("trackViewUrl"),
                    }
                )
            icon_url = d.get("artworkUrl512") or d.get("artworkUrl100") or d.get("artworkUrl60")
            saved_icon = save_image(icon_url) if icon_url else None
            apps.append(
                {
                    "id": app_id,
                    "name": d.get("trackName", "Unknown"),
                    "nameBasis": "App Store Lookup API",
                    "url": d.get("trackViewUrl"),
                    "category": label,
                    "chartRank": rank,
                    "rating": d.get("averageUserRating"),
                    "ratingCount": d.get("userRatingCount"),
                    "assetIds": asset_ids,
                    "iconPath": saved_icon["path"] if saved_icon else None,
                    "revenueLabel": estimate_revenue(rank, label),
                }
            )
        time.sleep(1)

    coverage = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": "Apple iTunes Search/RSS public APIs only",
        "apps": len(apps),
        "screens": len(screens),
        "note": "Revenue figures are heuristic estimates from public chart rank, "
        "not verified sales. See README for the formula.",
    }
    return {"apps": apps, "screens": screens, "flows": [], "elements": [], "coverage": coverage}


def main() -> None:
    SITE_DIR.mkdir(parents=True, exist_ok=True)
    data = build()
    out = SITE_DIR / "data.json"
    out.write_text(json.dumps(data, indent=2, sort_keys=True))
    print(f"wrote {out} ({len(data['apps'])} apps, {len(data['screens'])} screens)")


if __name__ == "__main__":
    main()
