# Agent guide

Read [CONTEXT.md](CONTEXT.md) and [GLOSSARY.md](GLOSSARY.md) first, and use the glossary's terms in code, tests, issues and PRs.

## Entry points

| Area                     | Start here                                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| Browser app              | `site/index.html`, `site/app.js`, `site/style.css`                                                    |
| Media and static serving | `worker/index.js` (Cloudflare Worker, R2 `/assets/*`)                                                 |
| Catalog refresh          | `pipeline/fetch.py` (Apple feeds, writes `site/data.json`)                                            |
| Reference pages          | `pipeline/build_search_pages.py`                                                                      |
| Deployment check         | `pipeline/verify_deployment.py`                                                                       |
| Reviewed library         | `site/curation.json`                                                                                  |
| Deferred cloud boards    | `site/cloud-boards.mjs`, `firestore.rules` (not loaded by the public page, see ADR-0001)              |
| Tests                    | `pipeline/test_*.py`, `tests/*.test.cjs`                                                              |
| CI                       | `.github/workflows/validate.yml` (PRs), `.github/workflows/update.yml` (refresh and deploy on master) |

## Verify

```sh
npm ci
npx playwright install chromium-headless-shell
sudo npx playwright install-deps chromium-headless-shell   # system libraries; needs root
PLAYWRIGHT_CHANNEL=chromium-headless-shell npm run verify
```

Without root on Debian bookworm (amd64), replace the `install-deps` line with `npm run setup:browser-libs`. It unpacks the same libraries from deb.debian.org into the gitignored `.cache/browser-libs/`, and the test launcher picks them up automatically.

The pre-commit hook runs `npm run verify:fast` (format check, syntax, types, pipeline and unit tests). The pre-push hook refuses pushes to `master`/`main`, branch deletions and force pushes.

## Rules

- Branches and PRs only. Never merge, deploy, push to `master` or run the Update catalog workflow.
- Never close issues or PRs without Austin's decision.
- Never change credentials, Firebase or Cloudflare configuration.
- Keep routes, storage keys, export fields and reference IDs stable.
- Test with synthetic data. Never commit a refreshed `site/data.json` by hand.

## Agent skills

### Issue tracker

GitHub Issues on `PatchworkMD/open-app-catalog`, through `gh`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md`, `GLOSSARY.md` and `docs/adr/` at the root. See `docs/agents/domain.md`.
