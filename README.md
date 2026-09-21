# Hugging App

An open-source, auto-updated App Store chart catalog. Rebuilt on a schedule
directly from Apple's free public APIs — no third-party dataset is scraped,
copied, or redistributed.

**Live site:** [catalog.patchworkmd.dev](https://catalog.patchworkmd.dev/).
Cloudflare Worker `open-app-catalog` serves the site; R2 serves cached previews and icons. Sharp screenshot variants are loaded from Apple’s image CDN.

## Why this exists

Commercial "app intelligence" libraries curate App Store data and gate most
of it behind a paywall. This project rebuilds the same *category* of insight
— top-chart apps, categories, ratings, and screenshots
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
and each legacy value is labeled `(estimated)` in exported data. The interface
does not present these heuristics as business intelligence.

## Run it yourself

```sh
python3 pipeline/fetch.py   # stdlib only, no dependencies
python3 -m http.server 8000 --directory site
```

Rewrites `site/data.json` and `site/assets/*`. Takes a few minutes; add more
genre IDs in `pipeline/fetch.py` to widen coverage.

## Auto-update

`.github/workflows/update.yml` runs the pipeline on a schedule, commits the
refreshed `site/data.json`, and redeploys the Worker. Media uploads to R2 before
the dataset is replaced. A failed upload stops the job and preserves the prior
dataset. The workflow requires the repository secret `CLOUDFLARE_API_TOKEN`;
configure it through GitHub Actions secret settings, never in source.
The token must authorize this account’s Worker deployments, R2 object writes,
and the existing zone route. Missing credentials fail the preflight.

The schedule is configured; that alone does not prove a successful update.
Check the Actions run and the public snapshot date. The companion plugin is Hugging App; its release status is tracked in its own repository.

## Design research

Browse apps or screens, select up to four screenshots to compare, and save a
board in this browser. Exports include the currently filtered references and
the snapshot metadata. The companion [Hugging App plugin](https://github.com/PatchworkMD/app-design-research)
reviews supplied evidence; it does not fetch this catalog automatically.
Existing saved-board keys and plugin identifiers are preserved.

Category ranks are shown only for datasets produced with the corrected
original-feed rank marker. Older snapshots retain their data without displaying
potentially compressed ranks.

## Local app research

The research pipeline keeps a separate SQLite evidence database outside the
public site. It stores listing text, source URLs, snapshot dates, and shared
screenshot relationships, with full-text search. It does not infer revenue.

```sh
python3 pipeline/enrich_research.py
python3 pipeline/research_db.py import --catalog research/catalog.json --db research/catalog.sqlite
python3 pipeline/research_db.py search --db research/catalog.sqlite --query 'habit OR scanner' --limit 10
python3 pipeline/classify_apps.py --input research/catalog.json
```

The last command is a dry run with no model requests. TypeSafe Jev classification
requires `TYPESAFE_API_KEY` in the environment and explicit execution:

```sh
python3 pipeline/classify_apps.py --input research/catalog.json --db research/classifications.sqlite3 --execute --max-apps 10
```

Start with a small reviewed sample before processing the catalog. Jev classifies
the advertised purpose and interaction from listing text, not verified in-app
behavior. Results retain source evidence, probabilities, model information, and
usage. Low-probability or unknown results need review; the 0.8 threshold is
provisional, not an accuracy guarantee. Cached evidence avoids repeat requests.
This integration has offline tests; live inference requires configured access.
Neither database is deployed or exposed by the website.

## Local checks

```sh
python3 -m unittest discover -s pipeline -p 'test_*.py'
node --check site/app.js
python3 -m http.server 8765 --bind 127.0.0.1 --directory site
# In another terminal, with Playwright and Chrome available:
node tests/site.test.cjs
```

The browser check covers keyboard access, filters, routes, board persistence,
exports, comparison state, mobile layout, and load/storage failures. It uses
an isolated browser profile. It does not mutate the live site.

## License

MIT for the code (see [LICENSE](LICENSE)). Fetched App Store metadata,
screenshots, and trademarks remain the property of their respective owners.

## Media storage

Screenshots and icons live in the `open-app-catalog-assets` R2 bucket, not in
this repo and not in the deploy. `worker/index.js` serves `/assets/*` from that
bucket on the catalog's own domain; `site/.assetsignore` keeps the local copies
out of the Worker upload, which is what keeps deploys to a few seconds.

`site/assets/` is gitignored: `pipeline/fetch.py` rebuilds it from Apple on
every run. To push a run's new media to R2:

```
CLOUDFLARE_ACCOUNT_ID=<account owning the bucket> CATALOG_R2_UPLOAD=1 python3 pipeline/fetch.py
```

Wrangler's `r2` subcommands default to a different account than `wrangler.jsonc`
targets, so `CLOUDFLARE_ACCOUNT_ID` must be set explicitly for them.

## Curated interface references

`site/curation.json` contains visually reviewed UI patterns and editorial screenshot
collections. Each record references an existing screenshot by its content hash.
The browser excludes missing references after a catalog refresh. Collections are
not recorded interaction flows; the interface labels their order as unverified.
Review source images before adding tags. Keep the source URL and review date.

The initial library includes 7 collections and 25 UI elements from 7 apps.
These are manual visual annotations, not Jev classification output.

## Search reference pages

Run `python3 pipeline/build_search_pages.py` after refreshing the catalog. CI
runs it before each deploy. It builds HTML app references, an app directory,
reviewed-pattern and collection pages, source FAQs, sitemap.xml, robots.txt,
and llms.txt from the current snapshot. Generated pages are not committed.
The interactive hash routes remain available; crawlable pages use stable paths.

## Automatic additions and refreshes

The existing GitHub Actions **Update catalog** workflow runs daily (scheduled for 06:17 UTC; GitHub may start it later). It pulls up to 100 free-chart entries for each of the eight categories in `pipeline/fetch.py` → `GENRES`. An app newly entering a tracked chart is added on the next successful refresh. Apps leaving those charts leave the current chart catalog. This is a US free-app chart catalog, not a revenue ranking.

The importer retains up to ten available iPhone listing screenshots per app, records actual per-category feed counts and added/removed app IDs in `coverage`, uploads only media hashes absent from the previous published snapshot to R2, and only then replaces the snapshot. Empty chart or metadata responses abort the refresh. Reviewed element/collection images are pinned in `site/curation.json`, so changing App Store images does not silently erase that research.

To update now, run **Actions → Update catalog → Run workflow**, leaving **Refresh Apple catalog before deployment** enabled. To track another category, add its Apple genre ID and label to the existing `GENRES` mapping, then run that same workflow. No second scheduler or separate upload tool is required. Review the run result and public snapshot timestamp; a configured schedule alone does not prove a successful update.

Apple listing screenshots are not recordings of app interaction. Adding a real flow requires independently captured, reviewed screens and an evidenced sequence; refreshing chart data cannot manufacture that coverage. Accounts, cloud board sync, and shared boards are not implemented in the current static catalog.

### Screenshot resolution

The viewer requests Apple’s 1290 × 2796 bounding-box variant, while Retina grids request a smaller 640 × 1386 variant. Apple preserves each source image’s proportions and available resolution. Cached R2 previews remain the fallback. New imports retain `fullSizeUrl`; `site/image-sources.json` maps verified historical screenshot hashes to the same Apple source asset without changing saved reference IDs.
