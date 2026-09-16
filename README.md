# Open App Catalog

An open-source, auto-updated App Store chart catalog. Rebuilt on a schedule
directly from Apple's free public APIs — no third-party dataset is scraped,
copied, or redistributed.

**Live site:** deployed via GitHub Actions → Cloudflare Pages (see below).

## Why this exists

Commercial "app intelligence" libraries curate App Store data and gate most
of it behind a paywall. This project rebuilds the same *category* of insight
— top-chart apps, categories, ratings, screenshots, a rough revenue estimate
— straight from primary sources, on a schedule, fully open.

## Sources (all free, public, no auth)

| Data | Source |
|---|---|
| Chart rankings | [iTunes RSS top-charts feed](https://rss.marketingtools.apple.com/) |
| App metadata, ratings, screenshots | [iTunes Lookup API](https://performance-partners.apple.com/search-api) |
| Screenshots | Each developer's own public App Store listing images, served by Apple |

Revenue is **never** scraped from anywhere — it doesn't exist as public data.
`pipeline/fetch.py` computes a transparent, documented estimate from chart
rank and category (a simple rank-decay heuristic, see `estimate_revenue()`),
and every figure is labeled `(estimated)` in the UI and data.

## Run it yourself

```sh
python3 pipeline/fetch.py   # stdlib only, no dependencies
python3 -m http.server 8000 --directory site
```

Rewrites `site/data.json` and `site/assets/*`. Takes a few minutes; add more
genre IDs in `pipeline/fetch.py` to widen coverage.

## Auto-update

`.github/workflows/update.yml` runs the pipeline on a schedule, commits the
refreshed `site/data.json` and `site/assets/`, and (when Cloudflare secrets
are configured) redeploys the site — no manual step required.

## License

MIT for the code (see [LICENSE](LICENSE)). Fetched App Store metadata,
screenshots, and trademarks remain the property of their respective owners.
