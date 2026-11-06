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
7. [#17](https://github.com/PatchworkMD/open-app-catalog/pull/17): kind-safe browsing, shared rank and rating rules, strict refresh JSON, verified-only source links, accessible-name tests.
8. [#18](https://github.com/PatchworkMD/open-app-catalog/pull/18): oversized JSON integers are rejected at Snapshot and Apple intake instead of aborting.
9. `push/20261106-quality-10-r5`: this status correction only.

## CI evidence

As of 2026-11-06, GitHub Actions runs on this repo. PR #18 head `17ce8a4aec5dfadc2ead34e29e0f5ac29ca578b7` passed Validate catalog twice:
[run 42299500515](https://github.com/PatchworkMD/open-app-catalog/actions/runs/42299500515) (push) and [run 42299508740](https://github.com/PatchworkMD/open-app-catalog/actions/runs/42299508740) (pull request), 92 tests passed with 0 failures (Python 40, Node 52). CodeRabbit skipped and has not reviewed the stack.

## Gates for Austin

These are decisions, not done. No agent may implement them before Austin answers.

| Gate                                              | Decided? | Recommended option                                                                                           | Alternative                                                                                        |
| ------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Show the `#flows` route as **Collections**        | No       | **Yes, A:** change the visible nav label and copy only; keep `#flows`, `flows:` board keys and export fields | B: keep **Flows** as an accepted visible alias and record its meaning in GLOSSARY.md               |
| Durable triage mechanism                          | No       | **Yes, A:** create `needs-triage`, `needs-info`, `ready-for-agent` and `ready-for-human` on GitHub           | B: approve another durable, queryable mechanism and update `docs/agents/triage-labels.md` to match |
| Keep PRs #4 to #7 open as cloud-release reference | No       | **Yes**, keep them open                                                                                      | Archive the branches, with Austin's approval                                                       |

Release handoff:

- Review and merge the stack in order (#11 → #19), then watch the first Update catalog run. Merging into `master` starts the production workflow.
