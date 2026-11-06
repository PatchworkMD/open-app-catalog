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
6. `push/20261106-quality-10-r2`: validated Snapshot intake, typed browser modules, publication policy, Apple response validation, product fixes, format and git guards.

## Gates for Austin

Product decisions:

- Rename the visible **Flows** label to **Collections**? Recommended: yes, label only; `#flows`, `flows:` keys and export fields stay.
- Create the four missing triage labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`) on GitHub? Recommended: yes. Only `wontfix` exists today.
- Keep PRs #4 to #7 open as reference for the cloud release? Recommended: yes.

Release handoff:

- Review and merge the stack above in order, then watch the first Update catalog run.
