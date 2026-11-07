<!-- AUTO-GENERATED from gyrum-labs/devtools docs/shared/README.md. Do not edit directly. Run scripts/update-docs.sh to refresh. -->

# docs/shared

This directory holds source-of-truth snippets that are meant to be pulled into every repository bootstrapped by `gyrum-setup`. Editing a file here, once, is how every consuming project gets the same correction at the same time.

## Why this directory exists

Every gyrum project needs to explain the same handful of things to a new reader: what the gate stack is, how the pull-request workflow runs, what the review panel does. Letting each project write its own version of those explanations sounds harmless at first, but it drifts. A paragraph gets copied into a new repo, the original is updated, and six months later the copy is subtly wrong in ways that only reveal themselves when someone joins the team and believes the stale version. Centralising the shared content fixes that at the source: there is exactly one file per topic, the canonical one lives here, and every consuming repo reads from the same place. The criterion for putting a file here is therefore strict — the content must be valuable in every project and identical across all of them. Documents that describe a particular repository's architecture or domain model stay in that repository; they are not shared truth.

## How the content reaches consumers

The delivery mechanism is `scripts/update-docs.sh`, a thin wrapper `gyrum-setup` drops into every consuming project. Running it copies the files in this directory into the project's own `docs/shared/` with an `AUTO-GENERATED` header pointing back to source, and regenerates `docs-viewer/_index.json` so the sidebar reflects what actually lives under `docs/`. A `--check` flag runs the same work against a staging dir and exits non-zero if any target file would change — suitable for CI or a pre-push hook that wants to catch hand-edits of generated files.

The copy is one-way and periodic: consumers re-run the script to pick up updates, so edits to a file in this directory propagate only on the next refresh in each consuming repo. An edit here, merged to devtools' `main`, is effectively an announcement — every consuming project sees the same correction the next time anyone in that project runs `scripts/update-docs.sh`.

## What is in here

Five peer files sit alongside this README. Each is written as a standalone reader-onboarding document, so a newcomer can open any one of them on its own and leave understanding the topic.

| File | Purpose |
|------|---------|
| `check-stack.md` | Explains the full four-layer bug-catching stack — pre-push hooks, AI review panel, contract tests, and fleet E2E — and how to pick the right layer for a new test. Start here. |
| `gate-stack.md` | Deep dive on layers 1 and 2 of the check stack (structural checks and AI review panel) and how branch protection combines them into a single merge rule. |
| `fleet-standards.md` | The version-badge contract every product implements — `/api/version` endpoint, UI footer, and `<meta name="gyrum-sha">` tags. |
| `workflow-boilerplate.md` | Explains the three-command developer loop (`gyrum-start-work` → code → `gyrum-review-pr` → `gyrum-complete-pr`) that every gyrum project uses. |
| `doc-standards.md` | Defines the structural contract every markdown file under `docs/` must satisfy — index registration, frontmatter, heading progression, links, placeholder content — plus the stylistic conventions (square-aspect mermaid, alert callouts, case studies, TL;DR blocks, quick-reference tables, "see also" footers) that make a gyrum doc read like a computer-studies textbook. |

## How to edit

Treat these files the way you would treat any other gyrum source file. Open a branch with `gyrum-start-work`, make the edit, push, and run `gyrum-review-pr`. The review panel — Priya, Marcus, Lin, and Dana — will read the change. Dana in particular is the reviewer to watch for documentation edits, because her remit is reader onboarding and explanatory prose; her advisory verdict gates the local review script even though it does not count toward GitHub's formal approval threshold. The viewer-validator (see `gate-stack.md`) runs before the panel and blocks on any structural violation of `doc-standards.md`, so edits here must themselves conform to the contract. Once the PR has cleared the gate, merge with `gyrum-complete-pr`. Every consuming project will pick up the change on its next run of `scripts/update-docs.sh`.

## What does not belong here

The test is simple: if the content would read differently in two projects that use it, it does not belong in `docs/shared/`. A gate-stack explanation belongs here, because every gyrum project runs the same gate and the explanation is identical in all of them. An architecture document for a specific experiment runner does not belong here, because it is unique to that project and pulling it into an unrelated repository would add noise rather than value. Content with a short shelf life — release notes, incident write-ups, ongoing-work logs — also does not belong here; put it somewhere more ephemeral where becoming stale is expected. The rule of thumb is that a file in this directory should be something a reader of any gyrum project would want to read, phrased so that they can read it without knowing which project they are working in.
