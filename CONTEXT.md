# Hugging App context

Hugging App (repo `open-app-catalog`) is a free, open-source catalog of iOS App Store listings for design research. It is published by PatchworkMD at https://catalog.patchworkmd.dev/.

## Audience

Designers and independent developers who want to study how top free-chart iOS apps present themselves: their listing screenshots, visible UI patterns and curated collections. They save and compare screenshots, export a board, and hand that export to an agent or teammate.

## Brand

- Name: **Hugging App**. The companion **Hugging App plugin** lives in `PatchworkMD/app-design-research` and has its own release.
- Voice: plain, specific and honest about limits. Every claim names its source. Copy never presents a heuristic as intelligence.
- Look: dark surfaces, a single blue accent (`--accent`), Bricolage Grotesque headings and Archivo body text, all self-hosted.

## Decisions that shape the product

- **Apple public sources only.** Data comes from Apple's RSS charts and the iTunes Lookup API. No scraping, and no third-party datasets.
- **No revenue intelligence.** The legacy `revenueLabel` is a labelled estimate. The interface does not show it as data.
- **Collections are not flows.** Listing screenshots are not interaction recordings, so collection order is marked unverified. The `#flows` route and `flows` keys keep their names so links, saved boards and exports keep working.
- **Local-first release** ([ADR-0001](docs/adr/0001-local-first-release.md)). Boards stay on the visitor's device. Cloud accounts are deferred.
- **Dedicated Firebase project** for the later account release ([decision record](docs/decisions/2026-09-23-dedicated-firebase-project.md)).

## Where to look

- Domain terms: [GLOSSARY.md](GLOSSARY.md)
- Decisions: [docs/adr/](docs/adr/README.md)
- Agent setup: [AGENTS.md](AGENTS.md)
