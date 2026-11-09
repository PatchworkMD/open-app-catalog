# Hugging App status, 2026-11-06

## Scope

Austin approved the local-first release on 2026-11-05 (ADR-0001): the public catalog built from Apple's public feeds, with boards saved on the visitor's device. Cloud accounts and shared boards need their own reviewed release. Routes, storage keys, export fields and reference IDs stay stable.

## Delivery stack

Merge in this order. Each PR's base is the one before it. Nothing is merged or deployed. Merging into `master` starts the production Update catalog workflow.

1. [#11](https://github.com/PatchworkMD/open-app-catalog/pull/11): mobile layout fix and read-only PR validation.
2. [#12](https://github.com/PatchworkMD/open-app-catalog/pull/12): local-first release page.
3. [#13](https://github.com/PatchworkMD/open-app-catalog/pull/13): CONTEXT, GLOSSARY, ADR-0001, agent guide.
4. [#14](https://github.com/PatchworkMD/open-app-catalog/pull/14): one `verify` command, pre-commit hook, fixture-backed browser tests.
5. [#15](https://github.com/PatchworkMD/open-app-catalog/pull/15): shared Snapshot rules, Board module, accessibility fixes.
6. [#16](https://github.com/PatchworkMD/open-app-catalog/pull/16): validated Snapshot intake, typed browser modules, publication policy, Apple response validation, product fixes, format and git guards.
7. `push/20261106-quality-10-r3`: kind-safe browsing, shared rank and rating rules, strict refresh JSON, verified-only source links, accessible-name tests.

## Gates for Austin

Product decisions (each blocks one withheld quality point; no agent may decide them):

1. Visible name for the `#flows` route. **A. Collections (recommended):** change the nav label and copy only; `#flows`, `flows:` board keys and export fields stay. **B. Flows:** keep it as an accepted visible alias and record that in GLOSSARY.md.
2. Triage roles on GitHub. **A. Create `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human` (recommended).** **B. Approve another durable mechanism**, and update `docs/agents/triage-labels.md` to match.
3. PRs #4 to #7. **Keep open as reference for the cloud release (recommended).**

Release handoff:

- Review and merge the stack in order (#11 → #17), then watch the first Update catalog run.
